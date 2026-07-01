import React, {
  createContext, useCallback, useContext, useRef,
  useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { JoinEventResponse, PendingScore, BatchSyncResponse, SponsorCacheDto } from './api';
import { batchSync, fetchTeamScores, fetchEventStatus, fetchPublicSponsors } from './api';
import { loadSession, saveSession, clearSession, loadPendingScores, loadUnsyncedScores, upsertPendingScore, markScoresSynced, markHoleComplete, loadCompletedHoleNumbers, clearPendingScores, mergeServerScores, getDeviceId } from './store';
import { attemptSync } from './backgroundSync';
import { useNetworkTier, POLL_INTERVAL_MS, type NetworkTier } from './useNetworkTier';

interface SessionContextValue {
  session:            JoinEventResponse | null;
  deviceId:           string;
  loading:            boolean;
  pendingScores:      PendingScore[];
  completedHoles:     Set<number>;
  syncStatus:         'idle' | 'syncing' | 'error' | 'synced';
  networkTier:        NetworkTier;
  setSession:         (data: JoinEventResponse) => Promise<void>;
  clearSession:       () => Promise<void>;
  upsertScore:        (score: PendingScore) => Promise<void>;
  completeHole:       (holeNumber: number) => Promise<void>;
  syncScores:         () => Promise<BatchSyncResponse | null>;
  refreshFromServer:  () => Promise<void>;
  updateEventStatus:  (status: string, themeJson?: string | null) => void;
  updateSponsors:     (sponsors: SponsorCacheDto[]) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session,         setSessionState]    = useState<JoinEventResponse | null>(null);
  const [deviceId,        setDeviceId]        = useState('');
  const [loading,         setLoading]         = useState(true);
  const [pendingScores,   setPendingScores]   = useState<PendingScore[]>([]);
  const [completedHoles,  setCompletedHoles]  = useState<Set<number>>(new Set());
  const [syncStatus,      setSyncStatus]      = useState<'idle' | 'syncing' | 'error' | 'synced'>('idle');
  const networkTier = useNetworkTier();

  // Last SponsorsVersion the foreground poll has seen. Seeded (no refetch) on
  // the first poll after a session loads; a later change triggers one sponsor
  // refetch. null means "not yet observed this session".
  const lastSponsorsVersion = useRef<number | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [id, saved] = await Promise.all([getDeviceId(), loadSession()]);
        setDeviceId(id);
        if (saved) {
          setSessionState(saved);
          if (saved.team) {
            const [scores, completedNums] = await Promise.all([
              loadPendingScores(saved.event.id, saved.team.id),
              loadCompletedHoleNumbers(saved.event.id, saved.team.id),
            ]);
            setPendingScores(scores);
            setCompletedHoles(new Set(completedNums));
          }
        }
      } catch {
        // Storage unavailable — start fresh with no session
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Adaptive foreground polling — interval shrinks/stops based on network tier.
  // Piggybacks on the same backoff/mutex as the OS background task.
  useEffect(() => {
    if (!session || !session.team || networkTier === 'offline') return;
    let cancelled = false;
    const poll = async () => {
      const synced = await attemptSync();
      // Pull authoritative server scores so admin corrections / resolved
      // conflicts flow back into the local scorecard (preserving unsynced edits).
      const sc     = await fetchTeamScores(session.event.eventCode, session.team!.id);
      const merged = sc ? await mergeServerScores(session.event.id, session.team!.id, sc.holes) : false;
      if (cancelled) return;
      if (synced || merged) {
        const [updated, completedNums] = await Promise.all([
          loadPendingScores(session.event.id, session.team!.id),
          loadCompletedHoleNumbers(session.event.id, session.team!.id),
        ]);
        setPendingScores(updated);
        setCompletedHoles(new Set(completedNums));
        setSyncStatus('synced');
      }

      // Sponsor refresh — cheap version check on the same tick; refetch the
      // full list only when it changed, so a sponsor added mid-event reaches
      // the scorecard without a rejoin. Seeds silently on the first observation.
      try {
        const { sponsorsVersion } = await fetchEventStatus(session.event.eventCode);
        if (cancelled) return;
        if (lastSponsorsVersion.current === null) {
          lastSponsorsVersion.current = sponsorsVersion;
        } else if (sponsorsVersion !== lastSponsorsVersion.current) {
          const fresh = await fetchPublicSponsors(session.event.eventCode);
          if (cancelled) return;
          if (fresh) {
            lastSponsorsVersion.current = sponsorsVersion;
            await updateSponsors(fresh);
          }
        }
      } catch { /* ignore — retry next tick */ }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS[networkTier]);
    return () => { cancelled = true; clearInterval(id); };
  // deps are intentionally limited: poll/POLL_INTERVAL_MS are stable and excluding them avoids restarting the interval on every render
  }, [session?.event.id, session?.team?.id, networkTier]);

  const setSession = useCallback(async (data: JoinEventResponse) => {
    lastSponsorsVersion.current = null;   // new event → re-seed on next poll
    try {
      await saveSession(data);
      const scores = data.team
        ? await loadPendingScores(data.event.id, data.team.id)
        : [];
      setSessionState(data);
      setPendingScores(scores);
      setSyncStatus('idle');
    } catch {
      // Persist the session in-memory even if SQLite write fails
      setSessionState(data);
      setPendingScores([]);
      setSyncStatus('idle');
    }
  }, []);

  const clear = useCallback(async () => {
    lastSponsorsVersion.current = null;
    try {
      if (session?.team) await clearPendingScores(session.event.id, session.team.id);
      await clearSession();
    } catch { /* ignore DB errors on clear — we still reset in-memory state */ }
    setSessionState(null);
    setPendingScores([]);
    setSyncStatus('idle');
  }, [session]);

  // Swap the cached sponsor list (in-memory + SQLite) after a mid-event change.
  // The scorecard reads session.sponsors directly, so this repaints it; saving
  // keeps the new list across app restarts until the next join overwrites it.
  const updateSponsors = useCallback(async (sponsors: SponsorCacheDto[]) => {
    let toSave: JoinEventResponse | null = null;
    setSessionState(prev => {
      if (!prev) return prev;
      toSave = { ...prev, sponsors };
      return toSave;
    });
    if (toSave) {
      try { await saveSession(toSave); } catch { /* keep in-memory update on DB failure */ }
    }
  }, []);

  const upsertScore = useCallback(async (score: PendingScore) => {
    if (!session?.team) return;
    const updated = [
      ...pendingScores.filter(s => s.holeNumber !== score.holeNumber),
      score,
    ].sort((a, b) => a.holeNumber - b.holeNumber);
    setPendingScores(updated);
    setSyncStatus('idle');
    // Re-entering shots un-completes the hole (INSERT OR REPLACE resets completed_at in DB)
    if (completedHoles.has(score.holeNumber)) {
      setCompletedHoles(prev => { const n = new Set(prev); n.delete(score.holeNumber); return n; });
    }
    try {
      await upsertPendingScore(session.event.id, session.team!.id, score);
    } catch {
      // Score stays in-memory; backgroundSync will retry DB write on next poll
    }
  }, [session, pendingScores, completedHoles]);

  // Merge a polled status/theme into the session. Both are guarded on change so
  // an unchanged poll tick returns the same object and triggers no re-render.
  // `themeJson === undefined` means "not provided" (leave as-is); an explicit
  // null is a real value (branding cleared → fall back to org default).
  const updateEventStatus = useCallback((status: string, themeJson?: string | null) => {
    setSessionState(prev => {
      if (!prev) return null;
      const statusChanged = status !== prev.event.status;
      const themeChanged  = themeJson !== undefined && themeJson !== prev.event.themeJson;
      if (!statusChanged && !themeChanged) return prev;
      return {
        ...prev,
        event: {
          ...prev.event,
          status:    statusChanged ? status    : prev.event.status,
          themeJson: themeChanged  ? themeJson! : prev.event.themeJson,
        },
      };
    });
  }, []);

  const syncScores = useCallback(async (): Promise<BatchSyncResponse | null> => {
    if (!session?.team) return null;
    setSyncStatus('syncing');
    try {
      const unsynced = await loadUnsyncedScores(session.event.id, session.team.id);
      if (unsynced.length === 0) { setSyncStatus('synced'); return null; }
      const result = await batchSync(
        session.event.id, session.team.id, deviceId, unsynced, session.sessionToken);
      await markScoresSynced(session.event.id, session.team.id);
      setSyncStatus('synced');
      return result;
    } catch {
      setSyncStatus('error');
      return null;
    }
  }, [session, deviceId]);

  // Pull the team's authoritative scorecard from the server and merge admin
  // corrections / resolved conflicts in. Called on a focus from the scorecard
  // screen for an immediate refresh (the foreground poll covers the rest).
  const refreshFromServer = useCallback(async (): Promise<void> => {
    if (!session?.team) return;
    const { event, team } = session;
    const sc = await fetchTeamScores(event.eventCode, team.id);
    if (!sc) return;
    const changed = await mergeServerScores(event.id, team.id, sc.holes);
    if (!changed) return;
    const [updated, completedNums] = await Promise.all([
      loadPendingScores(event.id, team.id),
      loadCompletedHoleNumbers(event.id, team.id),
    ]);
    setPendingScores(updated);
    setCompletedHoles(new Set(completedNums));
  }, [session]);

  const completeHole = useCallback(async (holeNumber: number): Promise<void> => {
    if (!session?.team) return;
    await markHoleComplete(session.event.id, session.team.id, holeNumber);
    setCompletedHoles(prev => new Set([...prev, holeNumber]));
    syncScores(); // release to leaderboard immediately
  }, [session, syncScores]);

  // Memoize the context value so consumers only re-render when one of these
  // slots actually changes. Without this, every render of SessionProvider
  // (the foreground poll fires every 10–30s) re-runs every useSession() caller.
  const value = useMemo<SessionContextValue>(() => ({
    session, deviceId, loading, pendingScores, completedHoles, syncStatus, networkTier,
    setSession, clearSession: clear, upsertScore, completeHole, syncScores, refreshFromServer, updateEventStatus, updateSponsors,
  }), [
    session, deviceId, loading, pendingScores, completedHoles, syncStatus, networkTier,
    setSession, clear, upsertScore, completeHole, syncScores, refreshFromServer, updateEventStatus, updateSponsors,
  ]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be inside SessionProvider');
  return ctx;
}

export { getHoleOrder } from './holeUtils';
