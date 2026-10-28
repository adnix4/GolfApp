import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme, useClasses } from '@gfp/ui';
import { useResponsive } from '@/lib/responsive';
import { fontSize, radius, spacing, status } from '@gfp/theme';

// ── Content ───────────────────────────────────────────────────────────────────

const STATUS_FLOW = [
  {
    status: 'Draft',       color: '#95a5a6',
    next: 'Open Registration',
    req:  'Set a Start Date & Time on the Overview tab.',
    what: 'Build your event: set the date, attach a course, add teams, configure sponsors and the auction. Use Seed Test Data to preview the flow — golfers can join a Draft event only with its event code.',
  },
  {
    status: 'Registration', color: '#3498db',
    next: 'Go Active',
    req:  'Attach a Course and clear any test data.',
    what: 'Golfers find the event in the mobile app and on the public site, sign up, and join. Monitor sign-ups on the Teams tab.',
  },
  {
    status: 'Active',       color: '#2ecc71',
    next: 'Open Scoring',
    req:  'Every team checked in — or use "Open Scoring anyway".',
    what: 'Check in golfers (Registration tab), take entry fees, and confirm starting holes (Shotgun tab). The auction can run.',
  },
  {
    status: 'Scoring',      color: status.warning,
    next: 'Mark Complete',
    req:  'All teams have finished their round.',
    what: 'Golfers enter scores on mobile. Late arrivals can still check in. Monitor the Leaderboard and run the Live Auction.',
  },
  {
    status: 'Completed',    color: status.success,
    next: null,
    req:  null,
    what: 'Scoring is closed and final results are published. The auction can keep running into the banquet; settle up on the Checkout tab.',
  },
];

const TESTING_TIPS = [
  'In Draft, "Seed Test Data" on the Overview tab adds realistic test teams, scores and donations so you can walk through the event.',
  'During Registration, the Testing Mode switch on the Scoring tab turns test mode on or off.',
  'Golfers in a test event see a "Test Mode" banner, and their scores stay off the live leaderboard.',
  'Opening Registration clears test registrations and scores automatically.',
  'An event cannot go Active while test data remains — clear it with "Clear Test Data" on the Fundraising tab.',
];

const TAB_REFERENCE = [
  {
    group: 'Overview',
    groupColor: '#3498db',
    tabs: [
      {
        name: 'Overview',
        when: 'Anytime',
        desc: 'Shows the event setup checklist while in Draft — complete items here to unlock registration. After Draft, shows the current status and the button to advance. Edit the event name, format, start date, holes and entry fee with the Edit button.',
        tips: [
          'The "Open Registration" button is disabled until a Start Date is set.',
          'Clicking "Go Active" without a Course attached shows a warning — add the course from there, then go Active.',
          '"Open Scoring" stays disabled until every team is checked in. "Open Scoring anyway →" lists who is missing and lets you start; they can still check in late.',
          'Mark Complete warns you if teams are still on the course or auction lots are still open.',
          'You can cancel the event at any status before Completed. Cancelling cannot be undone.',
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
        when: 'Anytime',
        desc: 'View every registered team and its players. Add teams with "+ Register Team", edit or remove teams and players, and check in a whole team or one golfer at a time.',
        tips: [
          'Pre-loading teams before Registration opens is the recommended workflow.',
          'Golfers join the mobile app with the email on their player record, so get emails right.',
          'Golfers can also register themselves on mobile or the public site — start a team, join one with an invite link, or sign up with no team yet.',
        ],
      },
      {
        name: 'Registration',
        when: 'Active and Scoring',
        desc: 'The check-in desk. Check in teams or individual golfers as they arrive, take entry fees ("Take Fee", or "Mark All Paid" for a team), and see who has a card on file for the auction. Use the filter to see who is still pending. Guests — non-golfers there for the auction — are listed separately.',
        tips: [
          'Late arrivals can still be checked in after scoring opens.',
          'Checking in also lets a golfer without a saved card bid in the auction.',
          '"+ Walk-Up" registers a new team on the day once walk-ups are allowed (Settings tab).',
        ],
      },
      {
        name: 'Free Agents',
        when: 'Registration through Scoring',
        desc: 'Golfers who registered with "No team yet", or were added here by hand. Assign each to an existing team. Until they are assigned, they wait on a "Check Again" screen in the mobile app.',
        tips: [
          'Assign free agents before opening scoring — once the round starts, an unassigned golfer cannot join.',
          'Turn free-agent sign-up on or off in the Settings tab.',
        ],
      },
    ],
  },
  {
    group: 'Scoring',
    groupColor: status.warning,
    tabs: [
      {
        name: 'Scoring',
        when: 'Active through Scoring',
        desc: 'Manual score entry. Pick a team and enter strokes hole by hole — use it to transcribe paper cards, or when a phone is lost. Scores follow the event format. Resolve score conflicts and confirm holes-in-one here.',
        tips: [
          'Your scores win. If a golfer later changes a hole you entered, the change waits for your approval.',
          'Scores entered here appear on the Leaderboard after a refresh.',
        ],
      },
      {
        name: 'Leaderboard',
        when: 'Scoring through Completed',
        desc: 'Standings by golfer or by team (toggle at the top), ranked by score to par — or by points for Stableford. Use Refresh to pull the latest scores.',
        tips: [
          'For a screen at the event, use the public live-scores page — it updates on its own.',
          'The public event pages are available from Registration onward.',
        ],
      },
      {
        name: 'Shotgun',
        when: 'Before Go Active (Shotgun Start only)',
        desc: 'Give each team a starting hole. Auto-Assign gives every team without a hole a random one and keeps the holes you have already set. Two teams on the same hole are flagged and block saving.',
        tips: [
          'Only relevant for events with "Shotgun Start" as the start type.',
          'Any team still without a hole gets one automatically when the event goes Active.',
        ],
      },
      {
        name: 'QR Import',
        when: 'Scoring through Completed',
        desc: 'Golfers can show their scorecard as a QR code on their phone (Round Summary → Generate Scorecard QR, while scoring is open). Scan it with a USB barcode scanner — it types into the field like a keyboard — or paste the code, then click Import Scores.',
        tips: [
          'Increase screen brightness on the golfer\'s phone for easier scanning.',
          'Works even if the golfer had no internet connection during the round.',
        ],
      },
    ],
  },
  {
    group: 'Fundraising',
    groupColor: status.danger,
    tabs: [
      {
        name: 'Fundraising',
        when: 'Anytime',
        desc: 'Revenue dashboard: total raised, broken down into entry fees, donations, sponsors, hole challenges and auction, with entry-fee collection and donation details. Use Refresh for the latest numbers.',
        tips: [
          'A failed auction charge can be re-charged or waived from here.',
          '"Clear Test Data" removes all test records before the event goes Active.',
        ],
      },
      {
        name: 'Sponsors',
        when: 'Anytime',
        desc: 'Add sponsors with logos and assign a tier: Title, Gold, Hole, Silver or Bronze. Any sponsor can be placed on holes, so their name and logo appear on the mobile scorecard at those holes.',
        tips: [
          'Sponsor logos appear in event emails, the Print Kit sponsor sheet and the mobile app.',
        ],
      },
      {
        name: 'Challenges',
        when: 'Anytime — set up before play',
        desc: 'Set up hole contests such as Closest to Pin, Longest Drive or Longest Putt, or write your own. Each challenge is attached to a hole, with an optional prize and sponsor.',
        tips: [
          'Challenges appear on the mobile Scorecard at the relevant hole.',
          'No limit on the number of challenges per event.',
        ],
      },
      {
        name: 'Auction Items',
        when: 'Anytime',
        desc: 'Create silent and live auction lots and Fund-a-Need donation items. Set the starting bid, bid increment, optional buy-now price and closing time, and upload photos. "End Auction" closes every lot still open.',
        tips: [
          'Silent items close automatically at their set time, and extend if a bid lands at the last moment.',
          'Silent lots use proxy bidding: golfers enter a maximum and the app bids for them by the increment.',
          'Live auction items are controlled from the Live Auction tab.',
        ],
      },
      {
        name: 'Live Auction',
        when: 'Anytime — usually at the banquet',
        desc: 'Auctioneer control panel. Start the session, step through items with "Next Item", update the called amount as the room bids, and award each item to its winner by player ID. Golfers see the current item and price on their mobile Live tab.',
        tips: [
          'One live auction session runs per event at a time.',
          'Live bidding needs a connection — golfers can\'t queue live bids offline.',
        ],
      },
      {
        name: 'Checkout',
        when: 'After lots close',
        desc: 'Where winners and Fund-a-Need pledgers settle up. Nothing is charged when the auction closes: charge the card on file, or record cash or a check (with its number), then mark items as handed over.',
        tips: [
          'The totals at the top show who is still to settle, what is outstanding, and what has been collected.',
          'Search by name to find a winner quickly at the desk.',
        ],
      },
    ],
  },
  {
    group: 'Tools',
    groupColor: status.success,
    tabs: [
      {
        name: 'Print Kit',
        when: 'Before play begins',
        desc: 'Four printouts, each opened in a print-ready window: team scorecards, the leaderboard, a sponsor sheet grouped by tier, and the tee time schedule.',
        tips: [
          'Allow pop-ups for the dashboard so the print windows can open.',
          'Print the leaderboard at the end of the round for the trophy presentation.',
        ],
      },
      {
        name: 'Email Builder',
        when: 'Anytime — most useful before Registration',
        desc: 'Build an event email from sections you can add, remove and reorder: hero banner, where & when, mission statement, pricing & register, registration QR, sponsor showcase and footer. Send it, preview or print it as a PDF, or export the HTML.',
        tips: [
          'Include the Registration QR section so recipients can sign up straight from the email.',
          'The mission statement section is ideal for 501(c)(3) events.',
        ],
      },
      {
        name: 'Settings',
        when: 'Anytime (organizers only)',
        desc: 'Event branding — logo, mission statement and the five brand colors, or "Brand from Website" to pull them from your site — plus event options: Offline Event Mode, free-agent sign-up and walk-up registration. "Show dismissed warnings again" brings back any warnings you hid.',
        tips: [
          'Leave the colors on "Clear (use org)" to use your organization\'s theme.',
          'Contrast warnings appear if text will be hard to read on the chosen colors.',
          'Event Staff accounts don\'t see this tab.',
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
          {subtitle && <Text style={[styles.cardSubtitle, { color: theme.mutedText }]}>{subtitle}</Text>}
        </View>
        <Text style={[styles.chevron, { color: theme.mutedText }]}>{open ? '▲' : '▼'}</Text>
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
            <Text style={[styles.statusNextLabel, { color: theme.mutedText }]}>
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
          <Text style={[styles.tabDesc, { color: theme.mutedText }]}>{tab.desc}</Text>
          {tab.tips.length > 0 && (
            <View style={styles.tipsBox}>
              {tab.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={[styles.tipIcon, { color: group.groupColor }]}>→</Text>
                  <Text style={[styles.tipText, { color: theme.mutedText }]}>{tip}</Text>
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
  const c = useClasses();
  const { pagePadding } = useResponsive();

  return (
    <ScrollView style={c.page} contentContainerStyle={[styles.content, { padding: pagePadding }]}>
      <View style={styles.pageHeader}>
        <Text style={c.title}>Event Help</Text>
        <Text style={[styles.pageSubtitle, { color: theme.mutedText }]}>
          A reference guide for every tab and each stage of your event.
        </Text>
      </View>

      <Section title="Status Progression" subtitle="What each status means and how to advance">
        <View style={{ gap: spacing[4] }}>
          {STATUS_FLOW.map(item => <StatusStep key={item.status} item={item} />)}
        </View>
      </Section>

      <Section title="Testing Mode" subtitle="Preview the event with test data before golfers arrive" defaultOpen={false}>
        <View style={{ gap: spacing[2] }}>
          {TESTING_TIPS.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={[styles.tipIcon, { color: status.warning }]}>→</Text>
              <Text style={[styles.tipText, { color: theme.mutedText }]}>{tip}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Tab Reference" subtitle="When to use each tab and what you can do there" defaultOpen>
        <View style={{ gap: spacing[6] }}>
          {TAB_REFERENCE.map(group => <TabRefSection key={group.group} group={group} />)}
        </View>
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

  statusRow:       { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  statusBadge:     { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.lg, flexShrink: 0, marginTop: 1 },
  statusBadgeText: { fontSize: fontSize.xxs, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBody:      { flex: 1, gap: spacing[2] },
  statusWhat:      { fontSize: fontSize.sm, lineHeight: 19, fontWeight: '500' },
  statusNext:      { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[1] },
  statusNextLabel: { fontSize: fontSize.xs },
  statusNextReq:   { fontWeight: '700' },
  statusNextBtn:   { fontSize: fontSize.sm, fontWeight: '700' },

  tabGroup:    { gap: spacing[3] },
  groupHeader: { borderLeftWidth: 3, paddingLeft: spacing[3] },
  groupLabel:  { fontSize: fontSize.lg, fontWeight: '800' },

  tabCard:    { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: radius.lg, padding: spacing[4], gap: spacing[2] },
  tabCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flexWrap: 'wrap' },
  tabName:    { fontSize: fontSize.md, fontWeight: '800', flex: 1 },
  whenPill:   { paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radius.lg },
  whenText:   { fontSize: fontSize.xxs, fontWeight: '600' },
  tabDesc:    { fontSize: fontSize.sm, lineHeight: 19 },
  tipsBox:    { gap: spacing[1], borderTopWidth: 1, borderTopColor: '#e8e8e8', paddingTop: spacing[2] },
  tipRow:     { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  tipIcon:    { fontSize: fontSize.sm, fontWeight: '700', width: 14 },
  tipText:    { flex: 1, fontSize: fontSize.xs, lineHeight: 17 },
});
