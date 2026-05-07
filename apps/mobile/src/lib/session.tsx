import React, {
  createContext, useCallback, useContext,
  useEffect, useState, type ReactNode,
} from 'react';
import type { JoinEventResponse, PendingScore, BatchSyncResponse } from './api';
import { batchSync } from './api';
import { loadSession, saveSession, clearSession, loadPendingScores, loadUnsyncedScores, upsertPendingScore, markScoresSynced, clearPendingScores, getDeviceId } from './store';
import { attemptSync } from './backgroundSync';
import { useNetworkTier, POLL_INTERVAL_MS, type NetworkTier } from './useNetworkTier';

interface SessionContextValue {
  session:       JoinEventResponse | null;
  deviceId:      string;
  loading:       boolean;
  pendingScores: PendingScore[];
  syncStatus:    'idle' | 'syncing' | 'error' | 'synced';
  networkTier:   NetworkTier;
  setSession:    (data: JoinEventResponse) => Promise<void>;
  clearSession:  () => Promise<void>;
  upsertScore:   (score: PendingScore) => Promise<void>;
  syncScores:    () => Promise<BatchSyncResponse | null>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session,       setSessionState]    = useState<JoinEventResponse | null>(null);
  const [deviceId,      setDeviceId]        = useState('');
  const [loading,       setLoading]         = useState(true);
  const [pendingScores, setPendingScores]   = useState<PendingScore[]>([]);
  const [syncStatus,    setSyncStatus]      = useState<'idle' | 'syncing' | 'error' | 'synced'>('idle');
  const networkTier = useNetworkTier();

  useEffect(() => {
    async function init() {
      try {
        const [id, saved] = await Promise.all([getDeviceId(), loadSession()]);
        setDeviceId(id);
        if (saved) {
          setSessionState(saved);
          const scores = await loadPendingScores(saved.event.id, saved.team.id);
          setPendingScores(scores);
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
    if (!session || networkTier === 'offline') return;
    let cancelled = false;
    const poll = async () => {
      const synced = await attemptSync();
      if (synced && !cancelled) {
        const updated = await loadPendingScores(session.event.id, session.team.id);
        setPendingScores(updated);
        setSyncStatus('synced');
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS[networkTier]);
    return () => { cancelled = true; clearInterval(id); };
  // deps are intentionally limited: poll/POLL_INTERVAL_MS are stable and excluding them avoids restarting the interval on every render
  }, [session?.event.id, session?.team.id, networkTier]);

  const setSession = useCallback(async (data: JoinEventResponse) => {
    try {
      await saveSession(data);
      const scores = await loadPendingScores(data.event.id, data.team.id);
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
      if (session) await clearPendingScores(session.event.id, session.team.id);
      await clearSession();
    } catch { /* ignore DB errors on clear — we still reset in-memory state */ }
    setSessionState(null);
    setPendingScores([]);
    setSyncStatus('idle');
  }, [session]);

  const upsertScore = useCallback(async (score: PendingScore) => {
    if (!session) return;
    const updated = [
      ...pendingScores.filter(s => s.holeNumber !== score.holeNumber),
      score,
    ].sort((a, b) => a.holeNumber - b.holeNumber);
    // Update in-memory state immediately so the UI is responsive
    setPendingScores(updated);
    setSyncStatus('idle');
    try {
      await upsertPendingScore(session.event.id, session.team.id, score);
    } catch {
      // Score stays in-memory; backgroundSync will retry DB write on next poll
    }
  }, [session, pendingScores]);

  const syncScores = useCallback(async (): Promise<BatchSyncResponse | null> => {
    if (!session) return null;
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

  return (
    <SessionContext.Provider value={{
      session, deviceId, loading, pendingScores, syncStatus, networkTier,
      setSession, clearSession: clear, upsertScore, syncScores,
    }}>
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
