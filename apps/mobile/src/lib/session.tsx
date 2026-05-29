import React, {
  createContext, useCallback, useContext,
  useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { JoinEventResponse, PendingScore, BatchSyncResponse } from './api';
import { batchSync } from './api';
import { loadSession, saveSession, clearSession, loadPendingScores, loadUnsyncedScores, upsertPendingScore, markScoresSynced, markHoleComplete, loadCompletedHoleNumbers, clearPendingScores, getDeviceId } from './store';
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
  updateEventStatus:  (status: string) => void;
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
      if (synced && !cancelled) {
        const updated = await loadPendingScores(session.event.id, session.team!.id);
        setPendingScores(updated);
        setSyncStatus('synced');
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS[networkTier]);
    return () => { cancelled = true; clearInterval(id); };
  // deps are intentionally limited: poll/POLL_INTERVAL_MS are stable and excluding them avoids restarting the interval on every render
  }, [session?.event.id, session?.team?.id, networkTier]);

  const setSession = useCallback(async (data: JoinEventResponse) => {
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
    try {
      if (session?.team) await clearPendingScores(session.event.id, session.team.id);
      await clearSession();
    } catch { /* ignore DB errors on clear — we still reset in-memory state */ }
    setSessionState(null);
    setPendingScores([]);
    setSyncStatus('idle');
  }, [session]);

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

  const updateEventStatus = useCallback((status: string) => {
    setSessionState(prev => prev ? { ...prev, event: { ...prev.event, status } } : null);
  }, []);

  const syncScores = useCallback(async (): Promise<BatchSyncResponse | null> => {
    if (!session?.team) return null;
    setSyncStatus('syncing');
    try {
      const unsynced = await loadUnsyncedScores(session.event.id, session.team.id);
      if (unsynced.length === 0) { setSyncStatus('synced'); return null; }
      const result = await batchSync(session.event.id, session.team.id, deviceId, unsynced);
      await markScoresSynced(session.event.id, session.team.id);
      setSyncStatus('synced');
      return result;
    } catch {
      setSyncStatus('error');
      return null;
    }
  }, [session, deviceId]);

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
    setSession, clearSession: clear, upsertScore, completeHole, syncScores, updateEventStatus,
  }), [
    session, deviceId, loading, pendingScores, completedHoles, syncStatus, networkTier,
    setSession, clear, upsertScore, completeHole, syncScores, updateEventStatus,
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
