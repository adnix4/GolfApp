import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';

// ── Content ───────────────────────────────────────────────────────────────────

const TABS = [
  {
    name: 'Scorecard',
    icon: '⛳',
    color: '#2ecc71',
    desc: 'Enter your team\'s score for each hole. Tap a hole row to open the score entry panel — enter the gross score and optional putts. Scores are saved instantly to your device.',
    tips: [
      'You can score in any order — holes don\'t need to be entered sequentially.',
      'The score indicator shows your running total and difference from par.',
      'If playing individual stroke: enter each player\'s strokes separately.',
      'Your scores sync to the server automatically when you have a connection.',
    ],
  },
  {
    name: 'Standings',
    icon: '🏆',
    color: '#f39c12',
    desc: 'Live leaderboard showing all teams ranked by score relative to par. Your team is highlighted. The leaderboard refreshes every 30 seconds when online.',
    tips: [
      'Scores shown here may lag behind mobile entries by up to 30 seconds.',
      'An "E" means even par; negative numbers are under par (better).',
      'Teams are shown as incomplete until all holes are scored.',
    ],
  },
  {
    name: 'Team',
    icon: '👥',
    color: '#3498db',
    desc: 'Shows everyone on your team for this event — names, and which hole each player is currently on.',
    tips: [
      'Your player is highlighted in the list.',
      'Contact your team captain if your name appears incorrectly.',
    ],
  },
  {
    name: 'Auction',
    icon: '🎁',
    color: '#9b59b6',
    desc: 'Browse silent auction items and place bids. The Live tab shows the current live auction item being called by the auctioneer. My Bids shows your bidding history.',
    tips: [
      'Silent auction items have a closing time — bids accepted until then.',
      'Live auction: watch for the current item and bid before the auctioneer closes.',
      'Bids placed offline are queued and submitted when you reconnect.',
      'You\'ll be notified if you\'re outbid on a silent item (if push notifications are enabled).',
    ],
  },
  {
    name: 'League',
    icon: '📊',
    color: '#e74c3c',
    desc: 'Shows your season statistics for this league event: handicap index, standings, total points, and round history. Only visible when the event is part of a league season.',
    tips: [
      'Your handicap is updated automatically after each round is completed.',
      'Points are calculated using Stableford scoring based on handicap.',
    ],
  },
];

const END_OF_ROUND = [
  {
    step: 'QR Transfer',
    icon: '📱',
    color: '#3498db',
    desc: 'Navigate to the QR Transfer screen after your last hole. A QR code containing your full scorecard is generated on-device. Show it to the event staff to scan and import your scores instantly.',
    tips: [
      'Maximize screen brightness for the easiest scan.',
      'This works even if you had no internet during the round.',
      'QR Transfer is the fastest way to submit scores at a big event.',
    ],
  },
  {
    step: 'Sync Scores',
    icon: '☁️',
    color: '#2ecc71',
    desc: 'If your device has a connection, the Sync screen lets you review your scores and confirm submission directly to the server. Any conflicts (scores entered by a different device for the same hole) are shown for review.',
    tips: [
      'Sync happens automatically in the background when online.',
      'If a conflict is shown, the admin will resolve it from the dashboard.',
      'After sync, your scores are locked on the server.',
    ],
  },
];

const OFFLINE_TIPS = [
  'All scores are saved to your device instantly — no connection needed.',
  'A red "No connection" banner appears at the top when offline.',
  'Scores sync automatically the moment your connection returns.',
  'You can complete an entire round offline and sync at the end.',
  'Auction bids placed offline are queued and sent when you reconnect.',
  'If you lose your phone, your admin can enter scores manually from the admin dashboard.',
];

// ── Components ────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children, defaultOpen = true }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <Pressable style={styles.cardHeader} onPress={() => setOpen(o => !o)}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>{title}</Text>
          {subtitle && <Text style={[styles.cardSubtitle, { color: theme.colors.accent }]}>{subtitle}</Text>}
        </View>
        <Text style={[styles.chevron, { color: theme.colors.accent }]}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && <View style={styles.cardBody}>{children}</View>}
    </View>
  );
}

function TabCard({ tab }: { tab: typeof TABS[0] }) {
  const theme = useTheme();
  return (
    <View style={[styles.tabCard, { borderLeftColor: tab.color }]}>
      <View style={styles.tabCardTop}>
        <Text style={styles.tabIcon}>{tab.icon}</Text>
        <Text style={[styles.tabName, { color: theme.colors.primary }]}>{tab.name}</Text>
      </View>
      <Text style={[styles.tabDesc, { color: theme.colors.accent }]}>{tab.desc}</Text>
      <View style={styles.tips}>
        {tab.tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Text style={[styles.tipDot, { color: tab.color }]}>•</Text>
            <Text style={[styles.tipText, { color: theme.colors.accent }]}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EndStep({ step }: { step: typeof END_OF_ROUND[0] }) {
  const theme = useTheme();
  return (
    <View style={[styles.endCard, { borderLeftColor: step.color }]}>
      <View style={styles.endCardTop}>
        <Text style={styles.tabIcon}>{step.icon}</Text>
        <Text style={[styles.tabName, { color: theme.colors.primary }]}>{step.step}</Text>
      </View>
      <Text style={[styles.tabDesc, { color: theme.colors.accent }]}>{step.desc}</Text>
      <View style={styles.tips}>
        {step.tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Text style={[styles.tipDot, { color: step.color }]}>→</Text>
            <Text style={[styles.tipText, { color: theme.colors.accent }]}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const theme = useTheme();
  const { session } = useSession();

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.colors.surface }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={styles.headerTitle}>Help</Text>
        {session?.event && (
          <Text style={[styles.headerEvent, { color: 'rgba(255,255,255,0.75)' }]} numberOfLines={1}>
            {session.event.name}
          </Text>
        )}
      </View>

      <View style={styles.sections}>
        <Section title="Tabs" subtitle="What each tab does during your round">
          <View style={{ gap: 14 }}>
            {TABS.map(tab => <TabCard key={tab.name} tab={tab} />)}
          </View>
        </Section>

        <Section title="End of Round" subtitle="How to submit your scorecard when you finish" defaultOpen>
          <View style={{ gap: 14 }}>
            {END_OF_ROUND.map(step => <EndStep key={step.step} step={step} />)}
          </View>
        </Section>

        <Section title="Playing Offline" subtitle="What happens when you lose your connection" defaultOpen={false}>
          <View style={{ gap: 10 }}>
            {OFFLINE_TIPS.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={[styles.tipDot, { color: theme.colors.primary }]}>•</Text>
                <Text style={[styles.tipText, { color: theme.colors.accent }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="How to Join an Event" subtitle="If you need to re-enter or switch events" defaultOpen={false}>
          <View style={{ gap: 10 }}>
            {[
              'From the main screen, select your tournament from the event list.',
              'Enter the email address you registered with — your team assignment is automatic.',
              'If your event isn\'t listed, ask your event organizer for the event code and enter it manually.',
              'If you\'re on the wrong team, contact your event admin to reassign you.',
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={[styles.tipDot, { color: theme.colors.primary }]}>•</Text>
                <Text style={[styles.tipText, { color: theme.colors.accent }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </Section>
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:    { flex: 1 },
  content: { paddingBottom: 40 },

  header:      { paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerEvent: { fontSize: 13, marginTop: 2 },

  sections: { padding: 16, gap: 14 },

  card:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  cardTitle:  { fontSize: 15, fontWeight: '800' },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  chevron:    { fontSize: 11, marginTop: 2 },
  cardBody:   { paddingHorizontal: 14, paddingBottom: 16 },

  tabCard:    { borderLeftWidth: 3, borderLeftColor: '#ccc', paddingLeft: 12, gap: 8 },
  endCard:    { borderLeftWidth: 3, borderLeftColor: '#ccc', paddingLeft: 12, gap: 8 },
  tabCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  endCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabIcon:    { fontSize: 18 },
  tabName:    { fontSize: 15, fontWeight: '800' },
  tabDesc:    { fontSize: 13, lineHeight: 19 },
  tips:       { gap: 6 },
  tipRow:     { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tipDot:     { fontSize: 14, width: 14, lineHeight: 19 },
  tipText:    { flex: 1, fontSize: 13, lineHeight: 19 },
});
