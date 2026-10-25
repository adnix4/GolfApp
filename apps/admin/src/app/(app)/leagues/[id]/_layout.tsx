import { createContext, useContext } from 'react';
import { Slot, useLocalSearchParams } from 'expo-router';
import { useLeagueList } from '@/lib/queries';

// Shares the league name down to the detail + season screens so each can build
// its own "<league name> - <page>" browser tab title. Read from the cached
// league list, so coming from the Leagues screen costs no request.
const LeagueNameContext = createContext<string | null>(null);
export const useLeagueName = () => useContext(LeagueNameContext);

export default function LeagueLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: leagues } = useLeagueList();
  const name = leagues?.find(l => l.id === id)?.name ?? null;

  return (
    <LeagueNameContext.Provider value={name}>
      <Slot />
    </LeagueNameContext.Provider>
  );
}
