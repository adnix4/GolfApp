import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { useResponsive } from '@/lib/responsive';
import { superAdminApi, OrgSummary, AllEventSummary } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  Draft:     '#95a5a6',
  Active:    '#27ae60',
  Completed: '#2980b9',
  Archived:  '#7f8c8d',
};

function Badge({ status }: { status: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] ?? '#95a5a6' }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

export default function SuperAdminDashboard() {
  const theme = useTheme();
  const { isMobile, pagePadding } = useResponsive();

  const [orgs,       setOrgs]       = useState<OrgSummary[]>([]);
  const [events,     setEvents]     = useState<AllEventSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [tab,        setTab]        = useState<'orgs' | 'events'>('orgs');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [o, e] = await Promise.all([
        superAdminApi.listOrganizations(),
        superAdminApi.listAllEvents(),
      ]);
      setOrgs(o);
      setEvents(e);
    } catch {
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalEvents  = events.length;
  const activeEvents = events.filter(e => e.status === 'Active').length;
  const totalTeams   = events.reduce((s, e) => s + e.teamCount, 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.pageBackground }]}
      contentContainerStyle={{ padding: pagePadding, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {/* Header */}
      <Text style={[styles.pageTitle, { color: theme.colors.primary }]}>Platform Overview</Text>
      <Text style={[styles.pageSub,   { color: theme.colors.accent }]}>
        All organizations and events across Golf Fundraiser Pro
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
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
            <Text style={[styles.statLabel, { color: theme.colors.accent }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabs, { borderColor: theme.colors.accent + '33' }]}>
        <Pressable
          style={[styles.tab, tab === 'orgs' && { backgroundColor: theme.colors.primary }]}
          onPress={() => setTab('orgs')}
        >
          <Text style={[styles.tabText, { color: tab === 'orgs' ? '#fff' : theme.colors.accent }]}>
            Organizations ({orgs.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'events' && { backgroundColor: theme.colors.primary }]}
          onPress={() => setTab('events')}
        >
          <Text style={[styles.tabText, { color: tab === 'events' ? '#fff' : theme.colors.accent }]}>
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
            <Text style={[styles.emptyMsg, { color: theme.colors.accent }]}>No organizations yet.</Text>
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
                  <Text style={[styles.cellSub, { color: theme.colors.accent }]}>{org.slug}</Text>
                )}
              </View>
              {!isMobile && (
                <Text style={[styles.tdCell, styles.thSlug, { color: theme.colors.accent }]} numberOfLines={1}>
                  {org.slug}
                </Text>
              )}
              <Text style={[styles.tdCell, styles.thEvents, { color: theme.colors.primary }]}>
                {org.eventCount}
              </Text>
              <Text style={[styles.tdCell, styles.th501, { color: org.is501c3 ? '#27ae60' : theme.colors.accent }]}>
                {org.is501c3 ? '✓' : '—'}
              </Text>
              {!isMobile && (
                <Text style={[styles.tdCell, styles.thDate, { color: theme.colors.accent }]}>
                  {new Date(org.createdAt).toLocaleDateString()}
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
            <Text style={[styles.emptyMsg, { color: theme.colors.accent }]}>No events yet.</Text>
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
                  <Text style={[styles.cellSub, { color: theme.colors.accent }]}>{ev.orgName}</Text>
                )}
                <Text style={[styles.cellCode, { color: theme.colors.accent }]}>{ev.eventCode}</Text>
              </View>
              {!isMobile && (
                <Text style={[styles.tdCell, styles.thOrg, { color: theme.colors.accent }]} numberOfLines={1}>
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
                <Text style={[styles.tdCell, styles.thDate, { color: theme.colors.accent }]}>
                  {ev.startAt ? new Date(ev.startAt).toLocaleDateString() : '—'}
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
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  pageTitle: { fontSize: 26, fontWeight: '900', marginBottom: 4 },
  pageSub:   { fontSize: 14, marginBottom: 20 },

  errorBox:  { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },

  statsRow:     { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statsRowWrap: { flexWrap: 'wrap' },
  statCard:       { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1 },
  statCardMobile: { flex: 0, width: '47%' },
  statValue: { fontSize: 28, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  tabs:    { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginBottom: 16 },
  tab:     { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '700' },

  tableWrap:   { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e8e8e8', backgroundColor: '#fff' },
  tableHeader: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  tableRow:    { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'center' },

  thCell:   { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  tdCell:   { fontSize: 14 },
  thName:   { flex: 3 },
  thSlug:   { flex: 2 },
  thOrg:    { flex: 2 },
  thEvents: { flex: 1, textAlign: 'center' },
  thStatus: { flex: 1, alignItems: 'center' },
  th501:    { flex: 1, textAlign: 'center' },
  thTeams:  { flex: 1, textAlign: 'center' },
  thDate:   { flex: 2 },

  cellPrimary: { fontSize: 14, fontWeight: '700' },
  cellSub:     { fontSize: 12, marginTop: 2 },
  cellCode:    { fontSize: 11, fontFamily: 'monospace', marginTop: 1 },

  emptyMsg: { padding: 24, textAlign: 'center', fontSize: 14 },

  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
