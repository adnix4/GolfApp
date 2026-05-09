import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';

export default function ScoringLayout() {
  const theme       = useTheme();
  const { networkTier } = useSession();

  return (
    <View style={styles.root}>
      {networkTier === 'offline' && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>No connection — scores saved locally</Text>
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor:   theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.accent,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor:  '#e0e0e0',
            borderTopWidth:  1,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="scorecard"   options={{ title: 'Scorecard', tabBarLabel: 'Scorecard' }} />
        <Tabs.Screen name="leaderboard" options={{ title: 'Standings', tabBarLabel: 'Standings' }} />
        <Tabs.Screen name="team"        options={{ title: 'Team',      tabBarLabel: 'Team'      }} />
        <Tabs.Screen name="auction"     options={{ title: 'Auction',   tabBarLabel: 'Auction'   }} />
        <Tabs.Screen name="league"      options={{ title: 'League',    tabBarLabel: 'League'    }} />
        <Tabs.Screen name="help"        options={{ title: 'Help',      tabBarLabel: 'Help'      }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  offlineBanner: {
    backgroundColor: '#e74c3c',
    paddingVertical: 6,
    alignItems: 'center',
  },
  offlineText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
