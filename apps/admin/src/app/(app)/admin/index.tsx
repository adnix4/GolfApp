import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useTheme, StatusPill, useClasses } from '@gfp/ui';
import { useResponsive } from '@/lib/responsive';
import { useAllOrganizations, useAllEvents } from '@/lib/queries';
import { formatDate } from '@gfp/shared-types';
import { fontSize, radius, spacing } from '@gfp/theme';

// Super-admin uses a different palette than the organizer event view —
// here Completed is blue (legacy) and Archived is a real status.
const STATUS_COLOR: Record<string, string> = {
  Draft:     '#95a5a6',
  Active:    '#27ae60',
  Completed: '#2980b9',
  Archived:  '#7f8c8d',
};

function Badge({ status }: { status: string }) {
  return <StatusPill color={STATUS_COLOR[status] ?? '#95a5a6'} label={status} size="sm" />;
}

export default function SuperAdminDashboard() {
  const theme = useTheme();
  const c = useClasses();
  const { isMobile, pagePadding } = useResponsive();

  const orgList   = useAllOrganizations();
  const eventList = useAllEvents();
  const orgs      = orgList.data ?? [];
  const events    = eventList.data ?? [];
  const loading   = orgList.isPending || eventList.isPending;
  const error     = orgList.error || eventList.error
    ? 'Failed to load data. Please try again.' : null;
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState<'orgs' | 'events'>('orgs');

  async function refresh() {
    setRefreshing(true);
    await Promise.all([orgList.refetch(), eventList.refetch()]);
    setRefreshing(false);
  }

  const totalEvents  = events.length;
  const activeEvents = events.filter(e => e.status === 'Active').length;
  const totalTeams   = events.reduce((s, e) => s + e.teamCount, 0);

  if (loading) {
    return (
      <View style={c.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={c.screen}
      contentContainerStyle={{ padding: pagePadding, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {/* Header */}
      <Text style={[styles.pageTitle, { color: theme.colors.primary }]}>Platform Overview</Text>
      <Text style={[styles.pageSub,   { color: theme.mutedText }]}>
        All organizations and events across Golf Fundraiser Pro
      </Text>

      {error && (
        <View style={[c.errorBox, styles.errorBox]}>
          <Text style={c.errorText}>{error}</Text>
        </View>
      )}

      {/* Stats strip */}
      <View style={[styles.statsRow, isMobile && styles.statsRowWrap]}>
        {[
          { label: 'Organizations', value: orgs.length },
          { label: 'Total Events',  value: totalEvents },
          { label: 'Active Now',    value: activeEvents },
          { label: 'Total Teams',   value: totalTeams },
        ].map(s => (
          <View key={s.label} style={[styles.statCard, isMobile && styles.statCardMobile, { borderColor: theme.colors.accent + '44' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: theme.mutedText }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabs, { borderColor: theme.colors.accent + '33' }]}>
        <Pressable
          style={[styles.tab, tab === 'orgs' && { backgroundColor: theme.colors.primary }]}
          onPress={() => setTab('orgs')}
        >
          <Text style={[styles.tabText, { color: tab === 'orgs' ? '#fff' : theme.mutedText }]}>
            Organizations ({orgs.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'events' && { backgroundColor: theme.colors.primary }]}
          onPress={() => setTab('events')}
        >
          <Text style={[styles.tabText, { color: tab === 'events' ? '#fff' : theme.mutedText }]}>
            All Events ({totalEvents})
          </Text>
        </Pressable>
      </View>

      {/* Organizations table */}
      {tab === 'orgs' && (
        <View style={styles.tableWrap}>
          {/* Header row */}
          <View style={[styles.tableHeader, { backgroundColor: theme.colors.primary + '18' }]}>
            <Text style={[styles.thCell, styles.thName,   { color: theme.colors.primary }]}>Organization</Text>
            {!isMobile && <Text style={[styles.thCell, styles.thSlug, { color: theme.colors.primary }]}>Slug</Text>}
            <Text style={[styles.thCell, styles.thEvents, { color: theme.colors.primary }]}>Events</Text>
            <Text style={[styles.thCell, styles.th501,    { color: theme.colors.primary }]}>501(c)3</Text>
            {!isMobile && <Text style={[styles.thCell, styles.thDate,  { color: theme.colors.primary }]}>Joined</Text>}
          </View>

          {orgs.length === 0 && (
            <Text style={[styles.emptyMsg, { color: theme.mutedText }]}>No organizations yet.</Text>
          )}

          {orgs.map((org, i) => (
            <View
              key={org.id}
              style={[styles.tableRow, i % 2 === 1 && { backgroundColor: '#f8f9fa' }]}
            >
              <View style={styles.thName}>
                <Text style={[styles.cellPrimary, { color: theme.colors.primary }]} numberOfLines={1}>
                  {org.name}
                </Text>
                {isMobile && (
                  <Text style={[styles.cellSub, { color: theme.mutedText }]}>{org.slug}</Text>
                )}
              </View>
              {!isMobile && (
                <Text style={[styles.tdCell, styles.thSlug, { color: theme.mutedText }]} numberOfLines={1}>
                  {org.slug}
                </Text>
              )}
              <Text style={[styles.tdCell, styles.thEvents, { color: theme.colors.primary }]}>
                {org.eventCount}
              </Text>
              <Text style={[styles.tdCell, styles.th501, { color: org.is501c3 ? '#27ae60' : theme.mutedText }]}>
                {org.is501c3 ? '✓' : '—'}
              </Text>
              {!isMobile && (
                <Text style={[styles.tdCell, styles.thDate, { color: theme.mutedText }]}>
                  {formatDate(org.createdAt)}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* All events table */}
      {tab === 'events' && (
        <View style={styles.tableWrap}>
          <View style={[styles.tableHeader, { backgroundColor: theme.colors.primary + '18' }]}>
            <Text style={[styles.thCell, styles.thName,   { color: theme.colors.primary }]}>Event</Text>
            {!isMobile && <Text style={[styles.thCell, styles.thOrg,  { color: theme.colors.primary }]}>Organization</Text>}
            <Text style={[styles.thCell, styles.thStatus, { color: theme.colors.primary }]}>Status</Text>
            <Text style={[styles.thCell, styles.thTeams,  { color: theme.colors.primary }]}>Teams</Text>
            {!isMobile && <Text style={[styles.thCell, styles.thDate,  { color: theme.colors.primary }]}>Date</Text>}
          </View>

          {events.length === 0 && (
            <Text style={[styles.emptyMsg, { color: theme.mutedText }]}>No events yet.</Text>
          )}

          {events.map((ev, i) => (
            <View
              key={ev.id}
              style={[styles.tableRow, i % 2 === 1 && { backgroundColor: '#f8f9fa' }]}
            >
              <View style={styles.thName}>
                <Text style={[styles.cellPrimary, { color: theme.colors.primary }]} numberOfLines={1}>
                  {ev.name}
                </Text>
                {isMobile && (
                  <Text style={[styles.cellSub, { color: theme.mutedText }]}>{ev.orgName}</Text>
                )}
                <Text style={[styles.cellCode, { color: theme.mutedText }]}>{ev.eventCode}</Text>
              </View>
              {!isMobile && (
                <Text style={[styles.tdCell, styles.thOrg, { color: theme.mutedText }]} numberOfLines={1}>
                  {ev.orgName}
                </Text>
              )}
              <View style={[styles.thStatus]}>
                <Badge status={ev.status} />
              </View>
              <Text style={[styles.tdCell, styles.thTeams, { color: theme.colors.primary }]}>
                {ev.teamCount}
              </Text>
              {!isMobile && (
                <Text style={[styles.tdCell, styles.thDate, { color: theme.mutedText }]}>
                  {formatDate(ev.startAt) || '—'}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({

  pageTitle: { fontSize: fontSize.display, fontWeight: '900', marginBottom: spacing[1] },
  pageSub:   { fontSize: fontSize.md, marginBottom: spacing[5] },

  errorBox:  { marginBottom: spacing[4] },   // over c.errorBox

  statsRow:     { flexDirection: 'row', gap: spacing[3], marginBottom: spacing[6] },
  statsRowWrap: { flexWrap: 'wrap' },
  statCard:       { flex: 1, backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing[4], alignItems: 'center', borderWidth: 1 },
  statCardMobile: { flex: 0, width: '47%' },
  statValue: { fontSize: fontSize.display, fontWeight: '900' },
  statLabel: { fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing[0.5], textTransform: 'uppercase', letterSpacing: 0.5 },

  tabs:    { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing[4] },
  tab:     { flex: 1, paddingVertical: spacing[3], alignItems: 'center' },
  tabText: { fontSize: fontSize.md, fontWeight: '700' },

  tableWrap:   { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: '#e8e8e8', backgroundColor: '#fff' },
  tableHeader: { flexDirection: 'row', paddingVertical: spacing[3], paddingHorizontal: spacing[3], gap: spacing[2] },
  tableRow:    { flexDirection: 'row', paddingVertical: spacing[3], paddingHorizontal: spacing[3], gap: spacing[2], borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'center' },

  thCell:   { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  tdCell:   { fontSize: fontSize.md },
  thName:   { flex: 3 },
  thSlug:   { flex: 2 },
  thOrg:    { flex: 2 },
  thEvents: { flex: 1, textAlign: 'center' },
  thStatus: { flex: 1, alignItems: 'center' },
  th501:    { flex: 1, textAlign: 'center' },
  thTeams:  { flex: 1, textAlign: 'center' },
  thDate:   { flex: 2 },

  cellPrimary: { fontSize: fontSize.md, fontWeight: '700' },
  cellSub:     { fontSize: fontSize.xs, marginTop: spacing[0.5] },
  cellCode:    { fontSize: fontSize.xxs, fontFamily: 'monospace', marginTop: 1 },

  emptyMsg: { padding: spacing[6], textAlign: 'center', fontSize: fontSize.md },

});
