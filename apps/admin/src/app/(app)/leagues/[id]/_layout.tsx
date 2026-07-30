import { createContext, useContext, useEffect, useState } from 'react';
import { Slot, useLocalSearchParams } from 'expo-router';
import { leagueApi } from '@/lib/api';

// Shares the league name down to the detail + season screens so each can build
// its own "<league name> - <page>" browser tab title. Fetched once here and
// kept while navigating between the league's child routes.
const LeagueNameContext = createContext<string | null>(null);
export const useLeagueName = () => useContext(LeagueNameContext);

export default function LeagueLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    leagueApi.list()
      .then(leagues => setName(leagues.find(l => l.id === id)?.name ?? null))
      .catch(() => {});
  }, [id]);

  return (
    <LeagueNameContext.Provider value={name}>
      <Slot />
    </LeagueNameContext.Provider>
  );
}
