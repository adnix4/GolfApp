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
import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import {
  eventsApi, teamsApi, challengesApi,
  type LeaderboardEntry, type IndividualLeaderboardEntry, type Team, type HoleChallenge,
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
  challenges:  (eventId: string) => ['event', eventId, 'challenges'] as const,
};

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
