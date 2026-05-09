import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@gfp/ui';
import { useResponsive } from '@/lib/responsive';

// ── Content ───────────────────────────────────────────────────────────────────

const LIFECYCLE = [
  {
    step: 1, status: 'Draft', color: '#95a5a6',
    title: 'Draft — Set Up Your Event',
    items: [
      'Create the event from the Events list (name, format, start type, holes).',
      'On the Overview tab, set a Start Date & Time — this is required before golfers can register.',
      'Optionally attach a Course (required before you go Active on event day).',
      'Pre-load teams and players via the Teams tab at any time.',
      'Configure Sponsors, Challenges, and Auction Items while in Draft.',
      'Click "Open Registration" on the Overview tab when ready.',
    ],
  },
  {
    step: 2, status: 'Registration', color: '#3498db',
    title: 'Registration — Golfers Join',
    items: [
      'Your tournament appears in the mobile app event picker.',
      'Golfers enter their email to join — it matches against your pre-registered player list.',
      'Share your event code from the Print Kit so golfers can find the event manually.',
      'Track sign-ups in real time on the Teams tab.',
      'You can still add teams and players from the admin Teams tab.',
      'On event day, attach a Course (if not done), then click "Go Active".',
    ],
  },
  {
    step: 3, status: 'Active', color: '#2ecc71',
    title: 'Active — Day of Event',
    items: [
      'Use the Registration tab to check in teams as they arrive at the course.',
      'For Shotgun Start: open the Shotgun tab, assign holes manually or use Auto-Assign.',
      'Confirm all teams are checked in and starting holes are set before play begins.',
      'Click "Open Scoring" when the round starts.',
    ],
  },
  {
    step: 4, status: 'Scoring', color: '#f39c12',
    title: 'Scoring — Round in Progress',
    items: [
      'Golfers enter scores hole-by-hole on their mobile Scorecard tab.',
      'Scores sync automatically when online; stored locally if offline.',
      'Monitor live progress on the admin Scoring and Leaderboard tabs.',
      'Use QR Import to scan paper scorecards as a backup.',
      'Run a Live Auction session from the Live Auction tab at any point.',
      'Click "Mark Complete" once all teams have finished.',
    ],
  },
  {
    step: 5, status: 'Completed', color: '#27ae60',
    title: 'Completed — Wrap Up',
    items: [
      'Final leaderboard is locked and published to the public.',
      'View the Fundraising dashboard for a full revenue breakdown.',
      'Results are available for download or sharing.',
    ],
  },
];

const TAB_GROUPS = [
  {
    id: 'overview', label: 'Overview', color: '#3498db',
    desc: 'Event summary, status progression, and core configuration.',
    tabs: [
      {
        name: 'Overview',
        desc: 'Central command for your event. Shows the setup checklist while in Draft, or status context after. Edit event name, format, start date, and hole count here. Advance the event status (Draft → Registration → Active → Scoring → Completed) from this tab.',
      },
    ],
  },
  {
    id: 'players', label: 'Players', color: '#9b59b6',
    desc: 'Manage every person in the event.',
    tabs: [
      { name: 'Teams',        desc: 'View all registered teams and their players. Add new teams manually. Each team shows its status: pending, checked-in, or complete. Admins can add teams in any event status.' },
      { name: 'Registration', desc: 'Day-of check-in screen. Mark teams as checked-in as they arrive at the course. Use the filter to quickly see who is still pending.' },
      { name: 'Free Agents',  desc: 'Players who registered via the mobile app but were not matched to a team (walk-ups or unrecognized emails). Assign them to an existing team or create a new team for them.' },
    ],
  },
  {
    id: 'scoring', label: 'Scoring', color: '#f39c12',
    desc: 'Track and review round scores.',
    tabs: [
      { name: 'Scoring',     desc: 'Manual score entry grid — enter hole-by-hole scores for any team. Use this as a backup when mobile sync is unavailable or a team loses their phone.' },
      { name: 'Leaderboard', desc: 'Live standings ranked by score-to-par. Updates automatically as mobile scores sync in. Medal icons (🥇🥈🥉) mark the top three positions.' },
      { name: 'Shotgun',     desc: 'For Shotgun Start format only. Assign each team a starting hole (1–18). Use Auto-Assign to randomly fill remaining holes. Prevents duplicate assignments.' },
      { name: 'QR Import',   desc: 'At the end of the round, golfers show a QR code on their phone. Point this scanner at it to import their full scorecard directly — no manual entry needed.' },
    ],
  },
  {
    id: 'fundraising', label: 'Fundraising', color: '#e74c3c',
    desc: 'Revenue tools, sponsorships, and auctions.',
    tabs: [
      { name: 'Fundraising',   desc: 'Live revenue dashboard showing total proceeds broken down by source: auction bids, donations, and sponsor contributions.' },
      { name: 'Sponsors',      desc: 'Add sponsors with logos and assign each to a tier (Title, Gold, Silver, Bronze). Title and Gold sponsors can be assigned to specific holes for hole sponsorship recognition.' },
      { name: 'Challenges',    desc: 'Set up hole contests: Closest-to-Pin, Longest Drive, or custom prize. Optionally attach a sponsor name to each challenge.' },
      { name: 'Auction Items', desc: 'Create silent or live auction items with photos, description, starting bid, bid increment, and closing time. Fixed-amount donation opportunities are also created here.' },
      { name: 'Live Auction',  desc: 'Real-time auctioneer control panel. Select the current item, call bids, and manage the session. Golfers see the live bid on their mobile Auction tab.' },
    ],
  },
  {
    id: 'tools', label: 'Tools', color: '#27ae60',
    desc: 'Communication, print materials, and branding.',
    tabs: [
      { name: 'Print Kit',      desc: 'Generate a printable PDF packet containing the event QR code (for golfer sign-in), starting hole assignments, and scorecard sheets for each team.' },
      { name: 'Email Builder',  desc: 'Build a custom event email with drag-and-drop sections: header, event details, mission statement, call-to-action, QR code, sponsor logos, and footer. Preview before sending.' },
      { name: 'Settings',       desc: 'Customize the event color theme — primary, action, accent, highlight, and surface colors. The theme applies to the mobile app and the public leaderboard page.' },
    ],
  },
];

const LEAGUE_ITEMS = [
  'Create a League from the Leagues navigation item.',
  'Add Seasons to the league, then enroll members (players with handicaps).',
  'Create League Rounds — each round is an independent scoring event.',
  'The Season Dashboard tracks handicap history, standings, skins, and round results.',
  'Handicap indexes are recalculated automatically after each round.',
  'League events appear separately from fundraising tournaments and are not visible in the mobile event picker.',
];

const SETTINGS_ITEMS = [
  'Update your organization name and branding colors from the Settings nav item.',
  'The org-level theme is the default for all events; individual event Settings tabs override it per-event.',
  'Super Admins can view all organizations and their events from the Organizations panel.',
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

function LifecycleStep({ step, color, title, items }: typeof LIFECYCLE[0]) {
  const theme = useTheme();
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepBadge, { backgroundColor: color }]}>
        <Text style={styles.stepNum}>{step}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={[styles.stepTitle, { color: theme.colors.primary }]}>{title}</Text>
        {items.map((item, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={[styles.bulletDot, { color: color }]}>•</Text>
            <Text style={[styles.bulletText, { color: theme.colors.accent }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TabGroupSection({ group }: { group: typeof TAB_GROUPS[0] }) {
  const theme = useTheme();
  return (
    <View style={styles.tabGroup}>
      <View style={styles.tabGroupHeader}>
        <View style={[styles.groupDot, { backgroundColor: group.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupLabel, { color: theme.colors.primary }]}>{group.label}</Text>
          <Text style={[styles.groupDesc, { color: theme.colors.accent }]}>{group.desc}</Text>
        </View>
      </View>
      {group.tabs.map(tab => (
        <View key={tab.name} style={styles.tabItem}>
          <Text style={[styles.tabName, { color: theme.colors.primary }]}>{tab.name}</Text>
          <Text style={[styles.tabDesc, { color: theme.colors.accent }]}>{tab.desc}</Text>
        </View>
      ))}
    </View>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {items.map((item, i) => (
        <View key={i} style={styles.bullet}>
          <Text style={[styles.bulletDot, { color }]}>•</Text>
          <Text style={[styles.bulletText, { color: theme.colors.accent }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const theme = useTheme();
  const { pagePadding } = useResponsive();

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { padding: pagePadding }]}>
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: theme.colors.primary }]}>Help & Guide</Text>
        <Text style={[styles.pageSubtitle, { color: theme.colors.accent }]}>
          Everything you need to plan, run, and wrap up a fundraising tournament.
        </Text>
      </View>

      <Section title="How to Run an Event" subtitle="Step-by-step from creation to completion">
        <View style={{ gap: 20 }}>
          {LIFECYCLE.map(step => <LifecycleStep key={step.step} {...step} />)}
        </View>
      </Section>

      <Section title="Event Management Tabs" subtitle="What each tab is for and when to use it">
        <View style={{ gap: 20 }}>
          {TAB_GROUPS.map(group => <TabGroupSection key={group.id} group={group} />)}
        </View>
      </Section>

      <Section title="Leagues" subtitle="Season-long competitive play with handicap tracking" defaultOpen={false}>
        <BulletList items={LEAGUE_ITEMS} color={theme.colors.primary} />
      </Section>

      <Section title="Organization & Settings" subtitle="Branding and account management" defaultOpen={false}>
        <BulletList items={SETTINGS_ITEMS} color={theme.colors.primary} />
      </Section>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:    { flex: 1 },
  content: { gap: 16, paddingBottom: 40 },

  pageHeader:   { marginBottom: 4 },
  pageTitle:    { fontSize: 24, fontWeight: '800' },
  pageSubtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },

  card:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  cardTitle:  { fontSize: 16, fontWeight: '800' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
  chevron:    { fontSize: 11, marginTop: 3 },
  cardBody:   { paddingHorizontal: 16, paddingBottom: 18, gap: 12 },

  stepRow:   { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stepBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNum:   { fontSize: 15, fontWeight: '900', color: '#fff' },
  stepBody:  { flex: 1, gap: 6 },
  stepTitle: { fontSize: 14, fontWeight: '800' },

  bullet:     { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletDot:  { fontSize: 14, lineHeight: 20, width: 12 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19 },

  tabGroup:       { gap: 10 },
  tabGroupHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  groupDot:       { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  groupLabel:     { fontSize: 14, fontWeight: '700' },
  groupDesc:      { fontSize: 12, marginTop: 1 },
  tabItem:        { marginLeft: 20, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: '#e8e8e8', gap: 2 },
  tabName:        { fontSize: 13, fontWeight: '700' },
  tabDesc:        { fontSize: 13, lineHeight: 18 },
});
