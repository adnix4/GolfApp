/**
 * The event shared by every screen under events/[id]/.
 *
 * The layout (events/[id]/_layout.tsx) loads the event once and owns it: it
 * themes the tabs from themeJson, titles them, and shows the test-mode bar.
 * Screens read it with useEventDetail() instead of fetching their own copy,
 * and push changes back so the layout updates immediately:
 *
 *   - a mutation that returns the updated EventDetail → setEvent(updated)
 *   - a mutation that doesn't (seed/clear test data, logo upload) → refresh()
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { eventsApi, type EventDetail } from '@/lib/api';

export interface EventContextValue {
  event: EventDetail;
  /** Re-fetch the event (always a new request; call it after a mutation). */
  refresh: () => Promise<EventDetail>;
  /** Publish an EventDetail a mutation already returned. */
  setEvent: (event: EventDetail) => void;
}

const EventContext = createContext<EventContextValue | null>(null);

export const EventProvider = EventContext.Provider;

export function useEventDetail(): EventContextValue {
  const value = useContext(EventContext);
  if (!value) throw new Error('useEventDetail() must be used inside events/[id]/_layout');
  return value;
}

/**
 * The layout's side: load `id`, re-fetch silently whenever `refreshKey`
 * changes (the tab path) and when the browser tab regains focus, and expose
 * refresh/setEvent for the provider.
 */
export function useEventLoader(id: string, refreshKey: string) {
  const [event, setEventState] = useState<EventDetail | null>(null);
  const [error, setError]      = useState<string | null>(null);

  const idRef   = useRef(id);
  idRef.current = id;
  // Every fetch and setEvent takes the next sequence number; state only moves
  // forward. A fetch that started before a newer result (a background refresh
  // racing a Save) is dropped on arrival instead of undoing the Save.
  const seq     = useRef(0);
  const applied = useRef(0);
  const background = useRef<Promise<unknown> | null>(null);

  const fetchNow = useCallback((): Promise<EventDetail> => {
    const mine = ++seq.current;
    return eventsApi.get(id).then(fresh => {
      if (idRef.current === id && mine > applied.current) {
        applied.current = mine;
        setEventState(fresh);
        setError(null);
      }
      return fresh;
    });
  }, [id]);

  // Background refreshes (tab change, focus) share one request. refresh()
  // always starts a new one: it follows a mutation, so a request already in
  // flight may predate it.
  const refreshInBackground = useCallback(() => {
    if (background.current) return;
    background.current = fetchNow().catch(() => {}).finally(() => { background.current = null; });
  }, [fetchNow]);

  const setEvent = useCallback((fresh: EventDetail) => {
    if (fresh.id !== idRef.current) return;
    applied.current = ++seq.current;
    setEventState(fresh);
  }, []);

  // First load (blocking: the layout shows a spinner until it lands).
  useEffect(() => {
    setEventState(null);
    setError(null);
    fetchNow().catch((e: unknown) => setError((e as Error)?.message ?? 'Failed to load event.'));
  }, [fetchNow]);

  // Silent refresh on tab navigation: keeps the test-record count and status
  // current after changes screens don't report (team/player adds).
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) { firstKey.current = false; return; }
    refreshInBackground();
  }, [refreshKey, refreshInBackground]);

  // Silent refresh when the organizer comes back to this browser tab, so
  // edits made on another device or tab show up.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = () => { if (document.visibilityState === 'visible') refreshInBackground(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshInBackground]);

  const refresh = fetchNow;

  const retry = useCallback(() => {
    setError(null);
    fetchNow().catch((e: unknown) => setError((e as Error)?.message ?? 'Failed to load event.'));
  }, [fetchNow]);

  return { event, error, refresh, setEvent, retry };
}
