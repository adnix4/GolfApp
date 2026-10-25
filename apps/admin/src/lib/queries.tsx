/**
 * Shared server data for the event tabs (TanStack Query).
 *
 * The event tabs mount under a <Slot />, so every tab switch remounts the
 * screen. Before this, each one refetched with a full-page spinner. Through
 * the query cache a tab that comes back shows what it last had at once and
 * refreshes behind it; two screens that need the same list share one request.
 *
 * The event itself still lives in eventContext.tsx (the layout owns it and
 * orders background refreshes against Saves); this covers the per-event lists.
 *
 * After a mutation, invalidate the key it changed (e.g. a score save →
 * eventKeys.leaderboard(id)) instead of patching local state.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import {
  eventsApi, teamsApi, playersApi, challengesApi, sponsorsApi, auctionApi,
  type LeaderboardEntry, type IndividualLeaderboardEntry, type Team, type Player,
  type HoleChallenge, type Sponsor, type AuctionItem, type AuctionSession,
  type FundraisingTotals, type FailedCharge,
} from '@/lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Scores move all round, so cached data is only a placeholder: a screen
      // that mounts after 10 s refetches behind what it shows.
      staleTime: 10_000,
      // request() already refreshes an expired token; a second failure is real.
      retry: 1,
    },
  },
});

export const eventKeys = {
  all:         (eventId: string) => ['event', eventId] as const,
  leaderboard: (eventId: string) => ['event', eventId, 'leaderboard'] as const,
  individuals: (eventId: string) => ['event', eventId, 'leaderboard', 'individuals'] as const,
  teams:       (eventId: string) => ['event', eventId, 'teams'] as const,
  players:     (eventId: string) => ['event', eventId, 'players'] as const,
  freeAgents:  (eventId: string) => ['event', eventId, 'players', 'free-agents'] as const,
  sponsors:    (eventId: string) => ['event', eventId, 'sponsors'] as const,
  challenges:  (eventId: string) => ['event', eventId, 'challenges'] as const,
  auctionItems:   (eventId: string) => ['event', eventId, 'auction', 'items'] as const,
  auctionSession: (eventId: string) => ['event', eventId, 'auction', 'session'] as const,
  failedCharges:  (eventId: string) => ['event', eventId, 'auction', 'failed-charges'] as const,
  fundraising:    (eventId: string) => ['event', eventId, 'fundraising'] as const,
};

/** A list setter with useState's shape, written through to the cache. */
export type SetList<T> = (next: T[] | ((prev: T[]) => T[])) => void;

/**
 * A cached list a screen edits after its own mutations (check-in, add,
 * remove). The setter writes into the cache, so every other tab reading the
 * same key sees the change without a refetch. It also marks the event's
 * other lists stale: rosters overlap (a player moved onto a team leaves the
 * free-agent list; a new team joins the leaderboard), and refetching them on
 * the next visit is cheaper than tracking which edit touches which list.
 */
function useEditableList<T>(eventId: string, queryKey: readonly unknown[], queryFn: () => Promise<T[]>) {
  const query = useQuery<T[]>({ queryKey, queryFn });
  const client = useQueryClient();
  const keyId  = JSON.stringify(queryKey);
  const setItems = useCallback<SetList<T>>(next => {
    client.setQueryData<T[]>(JSON.parse(keyId), prev =>
      typeof next === 'function' ? next(prev ?? []) : next);
    client.invalidateQueries({
      queryKey:  eventKeys.all(eventId),
      predicate: q => JSON.stringify(q.queryKey) !== keyId,
    });
  }, [client, keyId, eventId]);
  return {
    items:   query.data ?? [],
    setItems,
    loading: query.isPending,
    error:   query.error,
    refetch: query.refetch,
  };
}

export function useTeamList(eventId: string) {
  return useEditableList<Team>(eventId, eventKeys.teams(eventId), () => teamsApi.list(eventId));
}

export function usePlayerList(eventId: string) {
  return useEditableList<Player>(eventId, eventKeys.players(eventId), () => playersApi.list(eventId));
}

export function useFreeAgentList(eventId: string) {
  return useEditableList<Player>(eventId, eventKeys.freeAgents(eventId), () => playersApi.listFreeAgents(eventId));
}

export function useSponsorList(eventId: string) {
  return useEditableList<Sponsor>(eventId, eventKeys.sponsors(eventId), () => sponsorsApi.list(eventId));
}

/** Every lot, all types: Auction Items lists them, Live Auction filters to Live. */
export function useAuctionItemList(eventId: string) {
  return useEditableList<AuctionItem>(eventId, eventKeys.auctionItems(eventId), () => auctionApi.getItems(eventId));
}

/** The live session, or null when none is running. A failed lookup also reads as none, as the screen always treated it. */
export function useAuctionSession(eventId: string) {
  return useQuery<AuctionSession | null>({
    queryKey: eventKeys.auctionSession(eventId),
    queryFn:  () => auctionApi.getActiveSession(eventId).catch(() => null),
  });
}

// Money totals move from screens that don't share this cache (Checkout, the
// golfers' own bids and donations), so these always refetch on mount: a
// revisit shows the last numbers at once and corrects them behind.

export function useFundraising(eventId: string) {
  return useQuery<FundraisingTotals>({
    queryKey:  eventKeys.fundraising(eventId),
    queryFn:   () => eventsApi.getFundraising(eventId),
    staleTime: 0,
  });
}

/** Auction winners whose charge failed. A failed lookup reads as none, as the screen always treated it. */
export function useFailedCharges(eventId: string) {
  return useQuery<FailedCharge[]>({
    queryKey:  eventKeys.failedCharges(eventId),
    queryFn:   () => auctionApi.getFailedCharges(eventId).catch(() => [] as FailedCharge[]),
    staleTime: 0,
  });
}

export function useLeaderboard(eventId: string) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: eventKeys.leaderboard(eventId),
    queryFn:  () => eventsApi.getLeaderboard(eventId),
  });
}

export function useIndividualLeaderboard(eventId: string) {
  return useQuery<IndividualLeaderboardEntry[]>({
    queryKey: eventKeys.individuals(eventId),
    queryFn:  () => eventsApi.getIndividualLeaderboard(eventId),
  });
}

export function useTeams(eventId: string) {
  return useQuery<Team[]>({
    queryKey: eventKeys.teams(eventId),
    queryFn:  () => teamsApi.list(eventId),
  });
}

export function useChallenges(eventId: string) {
  return useQuery<HoleChallenge[]>({
    queryKey: eventKeys.challenges(eventId),
    queryFn:  () => challengesApi.list(eventId),
  });
}

/**
 * Provides the client and empties it whenever the signed-in user changes, so
 * one organizer's cached rosters never render for the next one on a shared
 * desk machine.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId   = user ? `${user.orgId}:${user.email}` : null;
  const previous = useRef(userId);
  useEffect(() => {
    if (previous.current !== userId) queryClient.clear();
    previous.current = userId;
  }, [userId]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
