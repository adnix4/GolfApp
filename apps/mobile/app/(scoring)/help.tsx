import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme, useClasses } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { LeaveEventButton } from '@/components/LeaveEventButton';
import { fontSize, radius, spacing, status } from '@gfp/theme';

// ── Content ───────────────────────────────────────────────────────────────────

const TABS = [
  {
    name: 'Scorecard',
    icon: '⛳',
    color: '#2ecc71',
    desc: 'Score one hole at a time. For each golfer, tap + and − to count their Drive, Approach and Putt strokes, then tap Complete Hole. Use Prev and Next to move between holes. Scores are saved on your device instantly.',
    tips: [
      'The chips at the top show the hole\'s par, your score, handicap, yardages, and your round so far.',
      'Your team score follows the event\'s format — for example, a scramble adds the shots used, best ball takes the lowest score.',
      'Made a mistake? Go back to the hole and tap ✎ Edit Score.',
      'Hole sponsors and hole challenges show on the holes they belong to — tap a sponsor for details.',
      'The scorecard is read-only until the organizer opens scoring.',
    ],
  },
  {
    name: 'Standings',
    icon: '🏆',
    color: status.warning,
    desc: 'Live leaderboard ranked by score relative to par — or by points in a Stableford event. Teams are ranked together, or golfers individually in a stroke play event. It updates as scores come in.',
    tips: [
      'An "E" means even par; negative numbers are under par (better).',
      'The Thru column shows how many holes a team has finished; "F" means finished.',
      'With no connection — or when the organizer has turned on Offline Event Mode — live updates pause, and the screen shows when it was last updated.',
    ],
  },
  {
    name: 'Team',
    icon: '👥',
    color: '#3498db',
    desc: 'Your team for this event: the format, your starting hole or tee time, the course, and the roster.',
    tips: [
      'Tap the edit button on your own row to update your name or phone.',
      'Use Invite a Teammate to share a link that adds someone to your team.',
      'Contact your event organizer if a teammate\'s name appears incorrectly.',
    ],
  },
  {
    name: 'Auction',
    icon: '🎁',
    color: '#9b59b6',
    desc: 'Browse auction items and place bids. The Live tab shows the item the auctioneer is calling right now. My Bids shows your bidding history.',
    tips: [
      'To bid, save a card or check in at the registration desk.',
      'Silent items use a maximum bid: enter the most you\'ll pay and the app bids for you, one step at a time, up to that amount.',
      'Silent items have a closing time and may extend if a bid comes in at the last moment.',
      'You\'ll be notified if you\'re outbid (if notifications are enabled).',
      'Won something? Tap the banner at the top to check out and pay.',
    ],
  },
  {
    name: 'League',
    icon: '📊',
    color: status.danger,
    desc: 'A preview of league play. Season stats will appear here when your organizer runs a league.',
    tips: [],
  },
];

const END_OF_ROUND = [
  {
    step: 'Round Summary',
    icon: '☁️',
    color: '#2ecc71',
    desc: 'After your last hole, the Round Summary shows your totals and every hole. Tap "Sync scores to server" to make sure the organizer has your latest results.',
    tips: [
      'Scores also sync automatically in the background whenever you\'re online.',
      'Tap a hole number to open it on the scorecard and change it.',
      'If the organizer entered a hole\'s score, your change is sent to them to approve.',
      'Any score conflicts are listed here — contact the event organizer to resolve them.',
    ],
  },
  {
    step: 'Scorecard QR',
    icon: '📱',
    color: '#3498db',
    desc: 'On the Round Summary, tap "Generate Scorecard QR" to show your whole scorecard as a QR code. Event staff can scan it to import your scores.',
    tips: [
      'Maximize screen brightness for the easiest scan.',
      'This works even if you had no internet during the round.',
      'The QR option is available while scoring is open.',
    ],
  },
];

const OFFLINE_TIPS = [
  'All scores are saved to your device instantly — no connection needed.',
  'A "No connection — scores saved locally" banner appears at the top when offline.',
  'Scores sync automatically the moment your connection returns.',
  'No signal at the course? Tap "Start Offline" on the pre-flight check to begin anyway.',
  'Bids on silent items and silent pledges made offline are queued and sent when you reconnect. If one can\'t be sent within 30 minutes, it\'s dropped.',
  'Live auction bidding needs a connection.',
  'If you lose your phone, the organizer can enter your scores from the admin dashboard.',
];

const JOIN_STEPS = [
  'From the main screen, select your tournament from the event list — or tap "Have a different event code?" and enter the code from your organizer.',
  'Enter the email address you registered with, then the 6-digit code we email you.',
  'Not registered yet? Tap "Not registered yet? Sign up" to start a team, join one with your captain\'s invite link, or sign up with no team yet.',
  'With no team yet, you\'ll wait on a "Check Again" screen until the organizer places you on a team.',
  'Guests who aren\'t golfing go straight to the Auction — there\'s no scorecard for guests.',
  'If you\'re on the wrong team, contact your event organizer to reassign you.',
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
          {subtitle && <Text style={[styles.cardSubtitle, { color: theme.mutedText }]}>{subtitle}</Text>}
        </View>
        <Text style={[styles.chevron, { color: theme.mutedText }]}>{open ? '▲' : '▼'}</Text>
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
      <Text style={[styles.tabDesc, { color: theme.mutedText }]}>{tab.desc}</Text>
      <View style={styles.tips}>
        {tab.tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Text style={[styles.tipDot, { color: tab.color }]}>•</Text>
            <Text style={[styles.tipText, { color: theme.mutedText }]}>{tip}</Text>
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
      <Text style={[styles.tabDesc, { color: theme.mutedText }]}>{step.desc}</Text>
      <View style={styles.tips}>
        {step.tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Text style={[styles.tipDot, { color: step.color }]}>→</Text>
            <Text style={[styles.tipText, { color: theme.mutedText }]}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const theme = useTheme();
  const c = useClasses();
  const { session } = useSession();

  return (
    <ScrollView
      style={[c.page, { backgroundColor: theme.colors.surface }]}
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
          <View style={{ gap: spacing[4] }}>
            {TABS.map(tab => <TabCard key={tab.name} tab={tab} />)}
          </View>
        </Section>

        <Section title="End of Round" subtitle="How to submit your scorecard when you finish" defaultOpen>
          <View style={{ gap: spacing[4] }}>
            {END_OF_ROUND.map(step => <EndStep key={step.step} step={step} />)}
          </View>
        </Section>

        <Section title="Playing Offline" subtitle="What happens when you lose your connection" defaultOpen={false}>
          <View style={{ gap: spacing[3] }}>
            {OFFLINE_TIPS.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={[styles.tipDot, { color: theme.colors.primary }]}>•</Text>
                <Text style={[styles.tipText, { color: theme.mutedText }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="How to Join an Event" subtitle="Signing up, joining, and switching events" defaultOpen={false}>
          <View style={{ gap: spacing[3] }}>
            {JOIN_STEPS.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={[styles.tipDot, { color: theme.colors.primary }]}>•</Text>
                <Text style={[styles.tipText, { color: theme.mutedText }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </Section>

        <LeaveEventButton />
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { paddingBottom: spacing[10] },

  header:      { paddingTop: spacing[4], paddingBottom: spacing[4], paddingHorizontal: spacing[5] },
  headerTitle: { fontSize: fontSize.title, fontWeight: '800', color: '#fff' },
  headerEvent: { fontSize: fontSize.sm, marginTop: spacing[0.5] },

  sections: { padding: spacing[4], gap: spacing[4] },

  card:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: radius.lg, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing[4], gap: spacing[3] },
  cardTitle:  { fontSize: fontSize.lg, fontWeight: '800' },
  cardSubtitle: { fontSize: fontSize.xs, marginTop: spacing[0.5] },
  chevron:    { fontSize: fontSize.xxs, marginTop: spacing[0.5] },
  cardBody:   { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },

  tabCard:    { borderLeftWidth: 3, borderLeftColor: '#ccc', paddingLeft: spacing[3], gap: spacing[2] },
  endCard:    { borderLeftWidth: 3, borderLeftColor: '#ccc', paddingLeft: spacing[3], gap: spacing[2] },
  tabCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  endCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  tabIcon:    { fontSize: fontSize.xl },
  tabName:    { fontSize: fontSize.lg, fontWeight: '800' },
  tabDesc:    { fontSize: fontSize.sm, lineHeight: 19 },
  tips:       { gap: spacing[2] },
  tipRow:     { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  tipDot:     { fontSize: fontSize.md, width: 14, lineHeight: 19 },
  tipText:    { flex: 1, fontSize: fontSize.sm, lineHeight: 19 },
});
