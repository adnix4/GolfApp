import React, {
  createContext, useCallback, useContext,
  useEffect, useState, type ReactNode,
} from 'react';
import type { JoinEventResponse, PendingScore, BatchSyncResponse } from './api';
import { batchSync } from './api';
import { loadSession, saveSession, clearSession, loadPendingScores, savePendingScores, clearPendingScores, getDeviceId } from './store';

interface SessionContextValue {
  session:       JoinEventResponse | null;
  deviceId:      string;
  loading:       boolean;
  pendingScores: PendingScore[];
  syncStatus:    'idle' | 'syncing' | 'error' | 'synced';
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

  useEffect(() => {
    async function init() {
      const [id, saved] = await Promise.all([getDeviceId(), loadSession()]);
      setDeviceId(id);
      if (saved) {
        setSessionState(saved);
        const scores = await loadPendingScores(saved.event.id, saved.team.id);
        setPendingScores(scores);
      }
      setLoading(false);
    }
    init();
  }, []);

  const setSession = useCallback(async (data: JoinEventResponse) => {
    await saveSession(data);
    const scores = await loadPendingScores(data.event.id, data.team.id);
    setSessionState(data);
    setPendingScores(scores);
    setSyncStatus('idle');
  }, []);

  const clear = useCallback(async () => {
    if (session) await clearPendingScores(session.event.id, session.team.id);
    await clearSession();
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
    setPendingScores(updated);
    await savePendingScores(session.event.id, session.team.id, updated);
    setSyncStatus('idle');
  }, [session, pendingScores]);

  const syncScores = useCallback(async (): Promise<BatchSyncResponse | null> => {
    if (!session || pendingScores.length === 0) return null;
    setSyncStatus('syncing');
    try {
      const result = await batchSync(session.event.id, session.team.id, deviceId, pendingScores);
      setSyncStatus('synced');
      return result;
    } catch {
      setSyncStatus('error');
      return null;
    }
  }, [session, pendingScores, deviceId]);

  return (
    <SessionContext.Provider value={{
      session, deviceId, loading, pendingScores, syncStatus,
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

export function getHoleOrder(startingHole: number | null, totalHoles: number): number[] {
  if (!startingHole) return Array.from({ length: totalHoles }, (_, i) => i + 1);
  return Array.from({ length: totalHoles }, (_, i) => ((startingHole - 1 + i) % totalHoles) + 1);
}
