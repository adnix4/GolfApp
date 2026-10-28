import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme, useClasses } from '@gfp/ui';
import { useResponsive } from '@/lib/responsive';
import { fontSize, radius, spacing, status } from '@gfp/theme';

// ── Content ───────────────────────────────────────────────────────────────────

const LIFECYCLE = [
  {
    step: 1, status: 'Draft', color: '#95a5a6',
    title: 'Draft — Set Up Your Event',
    items: [
      'Create the event from the Events list (name, format, start type, holes).',
      'On the Overview tab, set a Start Date & Time — this is required before golfers can register.',
      'Attach a Course (required before you go Active on event day), and set the entry fee if there is one.',
      'Pre-load teams and players via the Teams tab at any time.',
      'Configure Sponsors, Challenges, and Auction Items while in Draft.',
      'Optionally use Seed Test Data to preview the event. Golfers can join a Draft event only with its event code.',
      'Click "Open Registration" on the Overview tab when ready.',
    ],
  },
  {
    step: 2, status: 'Registration', color: '#3498db',
    title: 'Registration — Golfers Join',
    items: [
      'Your tournament appears in the mobile app event picker and on the public event site.',
      'Golfers can register themselves: start a team, join one with a captain\'s invite link, or sign up with no team yet (a free agent).',
      'To join the scoring app, golfers enter their email and then a 6-digit code emailed to them.',
      'Share your event code from the Print Kit so golfers can find the event manually.',
      'Track sign-ups on the Teams tab, and assign free agents on the Free Agents tab.',
      'On event day, attach a Course (if not done), then click "Go Active". Without a course you\'ll get a warning and a shortcut to add one.',
    ],
  },
  {
    step: 3, status: 'Active', color: '#2ecc71',
    title: 'Active — Day of Event',
    items: [
      'Use the Registration tab to check in golfers as they arrive and take entry fees.',
      'For Shotgun Start: open the Shotgun tab to set starting holes. Any team without a hole got one automatically when the event went Active.',
      '"Open Scoring" unlocks once every team is checked in. "Open Scoring anyway →" lets you start without a missing team; they can check in late.',
    ],
  },
  {
    step: 4, status: 'Scoring', color: status.warning,
    title: 'Scoring — Round in Progress',
    items: [
      'Golfers enter scores hole by hole on their mobile Scorecard tab.',
      'Scores sync automatically when online; they are saved on the phone if offline.',
      'Monitor progress on the admin Scoring and Leaderboard tabs; late arrivals can still check in.',
      'Use QR Import or the Scoring tab to enter scores from a golfer\'s phone or a paper card.',
      'Run a Live Auction session from the Live Auction tab at any point.',
      'Click "Mark Complete" once all teams have finished.',
    ],
  },
  {
    step: 5, status: 'Completed', color: status.success,
    title: 'Completed — Wrap Up',
    items: [
      'Scoring closes and the final leaderboard is published on the public event page.',
      'Print the final leaderboard from the Print Kit for the trophy presentation.',
      'The auction can keep running into the banquet. Settle up with winners on the Checkout tab.',
      'View the Fundraising tab for a full revenue breakdown.',
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
        desc: 'Central command for your event. Shows the setup checklist while in Draft, or the current status after. Edit the event name, format, start date, holes and entry fee here, and advance the event status (Draft → Registration → Active → Scoring → Completed).',
      },
    ],
  },
  {
    id: 'players', label: 'Players', color: '#9b59b6',
    desc: 'Manage every person in the event.',
    tabs: [
      { name: 'Teams',        desc: 'View all registered teams and their players. Add teams with "+ Register Team", edit or remove teams and players, and check in a team or a single golfer. Admins can add teams in any event status.' },
      { name: 'Registration', desc: 'The day-of check-in desk, open while the event is Active or Scoring. Check in golfers, take entry fees, see who has a card on file, register walk-ups, and check in guests. Use the filter to see who is still pending.' },
      { name: 'Free Agents',  desc: 'Golfers who registered without a team, or were added here by hand. Assign each to a team before scoring opens.' },
    ],
  },
  {
    id: 'scoring', label: 'Scoring', color: status.warning,
    desc: 'Track and review round scores.',
    tabs: [
      { name: 'Scoring',     desc: 'Manual score entry for any team, hole by hole — a backup when a phone is lost or for paper cards. Also where you resolve score conflicts and confirm holes-in-one.' },
      { name: 'Leaderboard', desc: 'Standings by golfer or by team, ranked by score to par (points for Stableford). Click Refresh for the latest scores.' },
      { name: 'Shotgun',     desc: 'For Shotgun Start events only. Give each team a starting hole. Auto-Assign gives every team without a hole a random one and keeps the holes you set. Duplicate holes are flagged.' },
      { name: 'QR Import',   desc: 'Import a golfer\'s whole scorecard from the QR code on their phone — scan it with a USB barcode scanner or paste the code. No manual entry needed.' },
    ],
  },
  {
    id: 'fundraising', label: 'Fundraising', color: status.danger,
    desc: 'Revenue tools, sponsorships, and auctions.',
    tabs: [
      { name: 'Fundraising',   desc: 'Revenue dashboard: total raised, broken down into entry fees, donations, sponsors, hole challenges and auction. Re-charge or waive a failed auction charge, and clear test data.' },
      { name: 'Sponsors',      desc: 'Add sponsors with logos and assign a tier (Title, Gold, Hole, Silver, Bronze). Any sponsor can be placed on holes, where it appears on the mobile scorecard.' },
      { name: 'Challenges',    desc: 'Set up hole contests: Closest to Pin, Longest Drive, Longest Putt, or your own. Optionally attach a prize and a sponsor to each challenge.' },
      { name: 'Auction Items', desc: 'Create silent or live auction lots with photos, description, starting bid, bid increment, buy-now price and closing time. Fund-a-Need donation items are also created here.' },
      { name: 'Live Auction',  desc: 'Auctioneer control panel. Step through items, update the called amount, and award each item to its winner. Golfers see the live item and price on their mobile Auction tab.' },
      { name: 'Checkout',      desc: 'Winners and pledgers settle up here: charge the card on file or record cash or a check, then mark items as handed over. Nothing is charged automatically when lots close.' },
    ],
  },
  {
    id: 'tools', label: 'Tools', color: status.success,
    desc: 'Communication, print materials, and branding.',
    tabs: [
      { name: 'Print Kit',      desc: 'Print team scorecards, the leaderboard, a sponsor sheet, and the tee time schedule.' },
      { name: 'Email Builder',  desc: 'Build an event email from sections — hero banner, where & when, mission statement, pricing & register, registration QR, sponsor showcase, and footer. Send it, print it as a PDF, or export the HTML.' },
      { name: 'Settings',       desc: 'Event branding (logo, mission statement, colors, or brand from your website) and event options: Offline Event Mode, free-agent sign-up and walk-up registration. The theme applies to the mobile app and the public event pages.' },
    ],
  },
];

const LEAGUE_ITEMS = [
  'Create a League from the Leagues navigation item.',
  'Add Seasons to the league, then add members with their handicaps.',
  'Add Rounds to a season. For each round: Generate Pairings, Open Scoring, then Close Round.',
  'Closing a round recalculates handicaps, updates the standings, and resolves skins.',
  'The Season Dashboard has Overview, Roster, Rounds, Handicaps, Standings, and Skins tabs, with printable pairings and a standings PDF.',
  'League rounds are separate from fundraising tournaments and are not listed in the mobile event picker.',
];

const SETTINGS_ITEMS = [
  'Update your organization profile — name, logo, and mission statement — and brand colors from the Settings nav item.',
  'The org-level theme is the default for all events; each event\'s Settings tab can override it.',
  'Invite other Organizers or Event Staff from Team Members on the Settings page.',
  'Super Admins see an Organizations panel listing every organization and its events.',
];

const STAFF_ITEMS = [
  'Event Staff accounts run the day: check-in, entry fees, score entry, QR import, and auction checkout.',
  'Staff see the Events list and Help, and every event tab except Settings.',
  'Leagues and organization Settings are for organizers only, so staff menus leave them out.',
  'Organizers invite staff from Settings → Team Members; the invite arrives by email.',
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
            <Text style={[styles.bulletText, { color: theme.mutedText }]}>{item}</Text>
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
          <Text style={[styles.groupDesc, { color: theme.mutedText }]}>{group.desc}</Text>
        </View>
      </View>
      {group.tabs.map(tab => (
        <View key={tab.name} style={styles.tabItem}>
          <Text style={[styles.tabName, { color: theme.colors.primary }]}>{tab.name}</Text>
          <Text style={[styles.tabDesc, { color: theme.mutedText }]}>{tab.desc}</Text>
        </View>
      ))}
    </View>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      {items.map((item, i) => (
        <View key={i} style={styles.bullet}>
          <Text style={[styles.bulletDot, { color }]}>•</Text>
          <Text style={[styles.bulletText, { color: theme.mutedText }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const theme = useTheme();
  const c = useClasses();
  const { pagePadding } = useResponsive();

  return (
    <ScrollView style={c.page} contentContainerStyle={[styles.content, { padding: pagePadding }]}>
      <View style={styles.pageHeader}>
        <Text style={c.title}>Help & Guide</Text>
        <Text style={[styles.pageSubtitle, { color: theme.mutedText }]}>
          Everything you need to plan, run, and wrap up a fundraising tournament.
        </Text>
      </View>

      <Section title="How to Run an Event" subtitle="Step-by-step from creation to completion">
        <View style={{ gap: spacing[5] }}>
          {LIFECYCLE.map(step => <LifecycleStep key={step.step} {...step} />)}
        </View>
      </Section>

      <Section title="Event Management Tabs" subtitle="What each tab is for and when to use it">
        <View style={{ gap: spacing[5] }}>
          {TAB_GROUPS.map(group => <TabGroupSection key={group.id} group={group} />)}
        </View>
      </Section>

      <Section title="Leagues" subtitle="Season-long competitive play with handicap tracking" defaultOpen={false}>
        <BulletList items={LEAGUE_ITEMS} color={theme.colors.primary} />
      </Section>

      <Section title="Organization & Settings" subtitle="Branding and account management" defaultOpen={false}>
        <BulletList items={SETTINGS_ITEMS} color={theme.colors.primary} />
      </Section>

      <Section title="Event Staff" subtitle="What staff accounts can do" defaultOpen={false}>
        <BulletList items={STAFF_ITEMS} color={theme.colors.primary} />
      </Section>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { gap: spacing[4], paddingBottom: spacing[10] },

  pageHeader:   { marginBottom: spacing[1] },
  pageSubtitle: { fontSize: fontSize.md, lineHeight: 20, marginTop: spacing[1] },

  card:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: radius.lg, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing[4], gap: spacing[3] },
  cardTitle:  { fontSize: fontSize.xl, fontWeight: '800' },
  cardSubtitle: { fontSize: fontSize.sm, marginTop: spacing[0.5] },
  chevron:    { fontSize: fontSize.xxs, marginTop: spacing[1] },
  cardBody:   { paddingHorizontal: spacing[4], paddingBottom: spacing[5], gap: spacing[3] },

  stepRow:   { flexDirection: 'row', gap: spacing[4], alignItems: 'flex-start' },
  stepBadge: { width: 32, height: 32, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNum:   { fontSize: fontSize.lg, fontWeight: '900', color: '#fff' },
  stepBody:  { flex: 1, gap: spacing[2] },
  stepTitle: { fontSize: fontSize.md, fontWeight: '800' },

  bullet:     { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  bulletDot:  { fontSize: fontSize.md, lineHeight: 20, width: 12 },
  bulletText: { flex: 1, fontSize: fontSize.sm, lineHeight: 19 },

  tabGroup:       { gap: spacing[3] },
  tabGroupHeader: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  groupDot:       { width: 10, height: 10, borderRadius: radius.sm, marginTop: spacing[1], flexShrink: 0 },
  groupLabel:     { fontSize: fontSize.md, fontWeight: '700' },
  groupDesc:      { fontSize: fontSize.xs, marginTop: 1 },
  tabItem:        { marginLeft: spacing[5], paddingLeft: spacing[3], borderLeftWidth: 2, borderLeftColor: '#e8e8e8', gap: spacing[0.5] },
  tabName:        { fontSize: fontSize.sm, fontWeight: '700' },
  tabDesc:        { fontSize: fontSize.sm, lineHeight: 18 },
});
