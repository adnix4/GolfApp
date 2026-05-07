import { Slot, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@gfp/ui';

type SubTab = { label: string; path: string };
type Group  = { label: string; tabs: SubTab[] };

const GROUPS: Group[] = [
  {
    label: 'Overview',
    tabs: [{ label: 'Overview', path: '' }],
  },
  {
    label: 'Players',
    tabs: [
      { label: 'Teams',        path: 'teams'        },
      { label: 'Registration', path: 'registration' },
      { label: 'Free Agents',  path: 'free-agents'  },
    ],
  },
  {
    label: 'Scoring',
    tabs: [
      { label: 'Scoring',     path: 'scoring'     },
      { label: 'Leaderboard', path: 'leaderboard' },
      { label: 'Shotgun',     path: 'shotgun'     },
      { label: 'QR Import',   path: 'qr-import'   },
    ],
  },
  {
    label: 'Fundraising',
    tabs: [
      { label: 'Fundraising',  path: 'fundraising' },
      { label: 'Sponsors',     path: 'sponsors'    },
      { label: 'Challenges',   path: 'challenges'  },
      { label: 'Auction Items',path: 'auction'     },
      { label: 'Live Auction', path: 'live-auction'},
    ],
  },
  {
    label: 'Tools',
    tabs: [
      { label: 'Print Kit',    path: 'print'         },
      { label: 'Email Builder',path: 'email-builder' },
      { label: 'Settings',     path: 'settings'      },
    ],
  },
];

export default function EventLayout() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const pathname = usePathname();
  const router   = useRouter();
  const theme    = useTheme();

  const pathSuffix = pathname.replace(/.*\/events\/[^/]+\/?/, '');

  const activeGroup = GROUPS.find(g => g.tabs.some(t => t.path === pathSuffix)) ?? GROUPS[0];
  const showSubRow  = activeGroup.tabs.length > 1;

  function tabHref(path: string) {
    return `/(app)/events/${id}${path ? `/${path}` : ''}` as const;
  }

  return (
    <View style={styles.container}>

      {/* ── Primary group row ───────────────────────────────────────────── */}
      <View style={[
        styles.primaryBar,
        { backgroundColor: '#fff', borderBottomColor: showSubRow ? '#f0f0f0' : '#e0e0e0' },
      ]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {GROUPS.map(group => {
            const isActive = group === activeGroup;
            return (
              <Pressable
                key={group.label}
                style={[styles.primaryTab, isActive && { borderBottomColor: theme.colors.primary }]}
                onPress={() => router.push(tabHref(group.tabs[0].path) as any)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[
                  styles.primaryLabel,
                  { color: isActive ? theme.colors.primary : theme.colors.accent },
                  isActive && styles.primaryLabelActive,
                ]}>
                  {group.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Sub-tab row (hidden for Overview) ───────────────────────────── */}
      {showSubRow && (
        <View style={[styles.subBar, { backgroundColor: '#fafafa', borderBottomColor: '#e0e0e0' }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {activeGroup.tabs.map(tab => {
              const isActive = tab.path === pathSuffix;
              return (
                <Pressable
                  key={tab.path}
                  style={[styles.subTab, isActive && { borderBottomColor: theme.colors.action }]}
                  onPress={() => router.push(tabHref(tab.path) as any)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[
                    styles.subLabel,
                    { color: isActive ? theme.colors.action : '#888' },
                    isActive && styles.subLabelActive,
                  ]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Screen content ───────────────────────────────────────────────── */}
      <View style={styles.content}>
        <Slot />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  primaryBar: { borderBottomWidth: 1 },
  scroll:     { flexDirection: 'row', paddingHorizontal: 20 },

  primaryTab: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginRight: 4,
  },
  primaryLabel:       { fontSize: 14, fontWeight: '600' },
  primaryLabelActive: { fontWeight: '800' },

  subBar: { borderBottomWidth: 1 },
  subTab: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 2,
  },
  subLabel:       { fontSize: 12, fontWeight: '500' },
  subLabelActive: { fontWeight: '700' },

  content: { flex: 1 },
});
