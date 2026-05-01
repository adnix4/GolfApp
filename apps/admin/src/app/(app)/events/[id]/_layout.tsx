import { Slot, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@gfp/ui';

const TABS = [
  { label: 'Overview',     path: ''             },
  { label: 'Teams',        path: 'teams'        },
  { label: 'Registration', path: 'registration' },
  { label: 'Free Agents',  path: 'free-agents'  },
  { label: 'Scoring',      path: 'scoring'      },
  { label: 'Leaderboard',  path: 'leaderboard'  },
  { label: 'Shotgun',      path: 'shotgun'      },
  { label: 'QR Import',    path: 'qr-import'    },
  { label: 'Challenges',   path: 'challenges'   },
  { label: 'Sponsors',     path: 'sponsors'     },
  { label: 'Fundraising',  path: 'fundraising'  },
  { label: 'Print Kit',    path: 'print'        },
];

export default function EventLayout() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const pathname = usePathname();
  const router   = useRouter();
  const theme    = useTheme();

  // pathname is like "/events/abc123" or "/events/abc123/teams"
  const pathSuffix = pathname.replace(/.*\/events\/[^/]+\/?/, '');

  function tabHref(path: string) {
    return `/(app)/events/${id}${path ? `/${path}` : ''}` as const;
  }

  return (
    <View style={styles.container}>
      {/* Horizontal tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: '#e0e0e0', backgroundColor: '#fff' }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {TABS.map(tab => {
            const isActive = tab.path === pathSuffix || (tab.path === '' && pathSuffix === '');
            return (
              <Pressable
                key={tab.path}
                style={[
                  styles.tab,
                  isActive && { borderBottomColor: theme.colors.primary },
                ]}
                onPress={() => router.push(tabHref(tab.path) as any)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? theme.colors.primary : theme.colors.accent },
                    isActive && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Screen content */}
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    borderBottomWidth: 1,
  },
  tabScroll: {
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginRight: 4,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelActive: {
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
});
