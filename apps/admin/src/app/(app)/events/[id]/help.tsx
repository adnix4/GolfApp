import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@gfp/ui';
import { useResponsive } from '@/lib/responsive';

// ── Content ───────────────────────────────────────────────────────────────────

const STATUS_FLOW = [
  {
    status: 'Draft',       color: '#95a5a6',
    next: 'Open Registration',
    req:  'Set a Start Date & Time on the Overview tab.',
    what: 'Build your event: set date, attach course, add teams, configure sponsors and auction.',
  },
  {
    status: 'Registration', color: '#3498db',
    next: 'Go Active',
    req:  'Attach a Course on the Overview tab.',
    what: 'Golfers find and join via the mobile app. Monitor sign-ups on the Teams tab.',
  },
  {
    status: 'Active',       color: '#2ecc71',
    next: 'Open Scoring',
    req:  'All teams checked in (recommended).',
    what: 'Check in teams (Registration tab). Assign starting holes (Shotgun tab). Run Live Auction.',
  },
  {
    status: 'Scoring',      color: '#f39c12',
    next: 'Mark Complete',
    req:  'All teams have finished their round.',
    what: 'Golfers enter scores on mobile. Monitor Leaderboard. Run Live Auction. QR Import backups.',
  },
  {
    status: 'Completed',    color: '#27ae60',
    next: null,
    req:  null,
    what: 'Final results published. Fundraising summary available.',
  },
];

const TAB_REFERENCE = [
  {
    group: 'Overview',
    groupColor: '#3498db',
    tabs: [
      {
        name: 'Overview',
        when: 'Anytime',
        desc: 'Shows the event setup checklist while in Draft — complete items here to unlock registration. After Draft, shows the current status description and the button to advance. Edit event name, format, start date, and holes using the Edit button.',
        tips: [
          'The "Open Registration" button is disabled until a Start Date is set.',
          '"Go Active" is disabled until a Course is attached.',
          'You can cancel the event from this tab at any status.',
        ],
      },
    ],
  },
  {
    group: 'Players',
    groupColor: '#9b59b6',
    tabs: [
      {
        name: 'Teams',
        when: 'Draft through Scoring',
        desc: 'View all registered teams and their players. Add teams manually with the "+ Add Team" button. Each team card shows its status (pending, checked-in, complete) and player count.',
        tips: [
          'You can add teams in any event status — even Draft.',
          'Pre-loading teams before Registration opens is the recommended workflow.',
          'Player emails must match the pre-registered list for mobile self-registration to work.',
        ],
      },
      {
        name: 'Registration',
        when: 'Active (day of event)',
        desc: 'Check-in screen. Mark each team as "Checked In" as they arrive at the course. Use the filter tabs to quickly see who is still pending.',
        tips: [
          'Checked-in teams are highlighted so you can track arrival progress at a glance.',
          'Checking in is separate from scoring — it confirms the team is physically present.',
        ],
      },
      {
        name: 'Free Agents',
        when: 'Registration through Scoring',
        desc: 'Players who joined via the mobile app but could not be matched to a team. This happens with walk-up registrations or unrecognized emails. Assign them to an existing team or create a new one.',
        tips: [
          'Resolve free agents before Opening Scoring for clean team assignments.',
        ],
      },
    ],
  },
  {
    group: 'Scoring',
    groupColor: '#f39c12',
    tabs: [
      {
        name: 'Scoring',
        when: 'Scoring status',
        desc: 'Manual score entry grid. Use this to enter or correct scores for any team, hole-by-hole. Useful if a team loses their phone or mobile sync fails.',
        tips: [
          'Admin scores override conflicting mobile scores.',
          'Scores entered here appear immediately on the Leaderboard.',
        ],
      },
      {
        name: 'Leaderboard',
        when: 'Scoring through Completed',
        desc: 'Live standings ranked by total score relative to par. Updates automatically as mobile scores sync in. Medal icons mark the top three positions.',
        tips: [
          'Display this on a screen at your event for real-time excitement.',
          'The public leaderboard URL is available after the event is Active.',
        ],
      },
      {
        name: 'Shotgun',
        when: 'Active (Shotgun Start format only)',
        desc: 'Assign each team a starting hole (1–18). Use the Auto-Assign button to randomly distribute remaining unassigned teams. Prevents duplicate hole assignments.',
        tips: [
          'Only relevant for events with "Shotgun Start" selected as the start type.',
          'Assign holes before checking teams in so assignments are ready at arrival.',
        ],
      },
      {
        name: 'QR Import',
        when: 'Scoring through Completed',
        desc: 'At the end of the round, golfers show a QR code on their phone (End of Round → QR Transfer screen). Scan it here to import their full scorecard without manual entry.',
        tips: [
          'Increase screen brightness on the golfer\'s phone for easier scanning.',
          'Works even if the golfer had no internet connection during the round.',
        ],
      },
    ],
  },
  {
    group: 'Fundraising',
    groupColor: '#e74c3c',
    tabs: [
      {
        name: 'Fundraising',
        when: 'Anytime',
        desc: 'Live revenue dashboard. Shows total proceeds broken down by source: silent auction, live auction, donations, and sponsorships. Refreshes automatically.',
        tips: ['Set this up on a second monitor for real-time fundraising visibility.'],
      },
      {
        name: 'Sponsors',
        when: 'Draft through Completed',
        desc: 'Add sponsor organizations with logos and assign them to a tier (Title, Gold, Silver, Bronze). Title and Gold sponsors can be pinned to specific holes for hole sponsorship signs.',
        tips: [
          'Sponsor logos appear in event emails and the mobile app sponsor carousel.',
          'Hole sponsors appear on golfers\' scorecards at the assigned hole.',
        ],
      },
      {
        name: 'Challenges',
        when: 'Draft through Active',
        desc: 'Set up hole-specific contests: Closest-to-Pin, Longest Drive, or custom. Each challenge is attached to a specific hole number. Optionally assign a sponsor name for recognition.',
        tips: [
          'Challenges appear on the mobile Scorecard at the relevant hole.',
          'No limit on the number of challenges per event.',
        ],
      },
      {
        name: 'Auction Items',
        when: 'Draft through Scoring',
        desc: 'Create items for silent auction, live auction, or donation opportunities. Upload photos, set starting bid, bid increment, and closing time. Donations use fixed-amount buttons.',
        tips: [
          'Silent auction items close automatically at their set time.',
          'Live auction items are controlled manually from the Live Auction tab.',
          'Golfers can browse and bid on silent items from their mobile Auction tab.',
        ],
      },
      {
        name: 'Live Auction',
        when: 'Active or Scoring',
        desc: 'Auctioneer control panel. Start a session, select the current item, call a bid amount, and advance or close bidding. Golfers see the live bid update on their mobile app in real time.',
        tips: [
          'One live auction session can be active per event at a time.',
          'Pause and resume the session between items as needed.',
          'All bids are recorded even if a golfer is offline — they sync on reconnect.',
        ],
      },
    ],
  },
  {
    group: 'Tools',
    groupColor: '#27ae60',
    tabs: [
      {
        name: 'Print Kit',
        when: 'Active (before play begins)',
        desc: 'Generates a printable PDF packet: the event QR code for golfer sign-in, starting hole assignments for Shotgun format, and paper scorecards for each team.',
        tips: ['Print before golfers arrive so everything is ready at check-in.'],
      },
      {
        name: 'Email Builder',
        when: 'Draft through Registration',
        desc: 'Build a custom event announcement or invitation email. Add/remove sections: header, event details, mission statement, call-to-action, QR code, sponsor logos, and footer. Preview before sending.',
        tips: [
          'Include the QR code section so recipients can join directly from the email.',
          'The mission statement section is ideal for 501(c)(3) events.',
        ],
      },
      {
        name: 'Settings',
        when: 'Anytime',
        desc: 'Customize the event color theme — primary, action, accent, highlight, and surface colors. The theme is reflected in the mobile app (when the golfer joins this event) and on the public leaderboard page.',
        tips: [
          'Use your organization\'s brand colors for a cohesive look.',
          'Contrast warnings appear if text will be hard to read on the chosen background.',
        ],
      },
    ],
  },
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

function StatusStep({ item }: { item: typeof STATUS_FLOW[0] }) {
  const theme = useTheme();
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusBadge, { backgroundColor: item.color }]}>
        <Text style={styles.statusBadgeText}>{item.status}</Text>
      </View>
      <View style={styles.statusBody}>
        <Text style={[styles.statusWhat, { color: theme.colors.primary }]}>{item.what}</Text>
        {item.next && (
          <View style={[styles.statusNext, { borderColor: item.color + '55', backgroundColor: item.color + '11' }]}>
            <Text style={[styles.statusNextLabel, { color: theme.colors.accent }]}>
              To advance:{'  '}
              <Text style={[styles.statusNextReq, { color: theme.colors.primary }]}>{item.req}</Text>
            </Text>
            <Text style={[styles.statusNextBtn, { color: item.color }]}>Then click "{item.next}"</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TabRefSection({ group }: { group: typeof TAB_REFERENCE[0] }) {
  const theme = useTheme();
  return (
    <View style={styles.tabGroup}>
      <View style={[styles.groupHeader, { borderLeftColor: group.groupColor }]}>
        <Text style={[styles.groupLabel, { color: theme.colors.primary }]}>{group.group}</Text>
      </View>
      {group.tabs.map(tab => (
        <View key={tab.name} style={styles.tabCard}>
          <View style={styles.tabCardTop}>
            <Text style={[styles.tabName, { color: theme.colors.primary }]}>{tab.name}</Text>
            <View style={[styles.whenPill, { backgroundColor: theme.colors.primary + '15' }]}>
              <Text style={[styles.whenText, { color: theme.colors.primary }]}>{tab.when}</Text>
            </View>
          </View>
          <Text style={[styles.tabDesc, { color: theme.colors.accent }]}>{tab.desc}</Text>
          {tab.tips.length > 0 && (
            <View style={styles.tipsBox}>
              {tab.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={[styles.tipIcon, { color: group.groupColor }]}>→</Text>
                  <Text style={[styles.tipText, { color: theme.colors.accent }]}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EventHelpScreen() {
  const theme = useTheme();
  const { pagePadding } = useResponsive();

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { padding: pagePadding }]}>
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: theme.colors.primary }]}>Event Help</Text>
        <Text style={[styles.pageSubtitle, { color: theme.colors.accent }]}>
          A reference guide for every tab and each stage of your event.
        </Text>
      </View>

      <Section title="Status Progression" subtitle="What each status means and how to advance">
        <View style={{ gap: 16 }}>
          {STATUS_FLOW.map(item => <StatusStep key={item.status} item={item} />)}
        </View>
      </Section>

      <Section title="Tab Reference" subtitle="When to use each tab and what you can do there" defaultOpen>
        <View style={{ gap: 24 }}>
          {TAB_REFERENCE.map(group => <TabRefSection key={group.group} group={group} />)}
        </View>
      </Section>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:    { flex: 1 },
  content: { gap: 16, paddingBottom: 40 },

  pageHeader:   { marginBottom: 4 },
  pageTitle:    { fontSize: 22, fontWeight: '800' },
  pageSubtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },

  card:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  cardTitle:  { fontSize: 16, fontWeight: '800' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
  chevron:    { fontSize: 11, marginTop: 3 },
  cardBody:   { paddingHorizontal: 16, paddingBottom: 18, gap: 12 },

  statusRow:       { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, flexShrink: 0, marginTop: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBody:      { flex: 1, gap: 8 },
  statusWhat:      { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  statusNext:      { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
  statusNextLabel: { fontSize: 12 },
  statusNextReq:   { fontWeight: '700' },
  statusNextBtn:   { fontSize: 13, fontWeight: '700' },

  tabGroup:    { gap: 12 },
  groupHeader: { borderLeftWidth: 3, paddingLeft: 10 },
  groupLabel:  { fontSize: 15, fontWeight: '800' },

  tabCard:    { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 10, padding: 14, gap: 8 },
  tabCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tabName:    { fontSize: 14, fontWeight: '800', flex: 1 },
  whenPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  whenText:   { fontSize: 11, fontWeight: '600' },
  tabDesc:    { fontSize: 13, lineHeight: 19 },
  tipsBox:    { gap: 5, borderTopWidth: 1, borderTopColor: '#e8e8e8', paddingTop: 8 },
  tipRow:     { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  tipIcon:    { fontSize: 13, fontWeight: '700', width: 14 },
  tipText:    { flex: 1, fontSize: 12, lineHeight: 17 },
});
