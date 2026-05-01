import { View, Text, StyleSheet, ScrollView, SafeAreaView, Platform } from 'react-native';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import type { PlayerCacheDto } from '@/lib/api';

// ── PLAYER ROW ────────────────────────────────────────────────────────────────

function PlayerRow({
  player, isYou, theme,
}: {
  player: PlayerCacheDto;
  isYou:  boolean;
  theme:  ReturnType<typeof useTheme>;
}) {
  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.avatar, { backgroundColor: theme.colors.highlight }]}>
        <Text style={[rowStyles.initials, { color: theme.colors.primary }]}>
          {player.firstName[0]}{player.lastName[0]}
        </Text>
      </View>
      <View style={rowStyles.info}>
        <View style={rowStyles.nameRow}>
          <Text style={[rowStyles.name, { color: theme.colors.primary }]}>
            {player.firstName} {player.lastName}
          </Text>
          {isYou && (
            <View style={[rowStyles.youBadge, { backgroundColor: theme.colors.action }]}>
              <Text style={rowStyles.youText}>You</Text>
            </View>
          )}
        </View>
        <Text style={[rowStyles.email, { color: theme.colors.accent }]} numberOfLines={1}>
          {player.email}
        </Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  avatar:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  initials: { fontSize: 16, fontWeight: '800' },
  info:     { flex: 1 },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:     { fontSize: 15, fontWeight: '700' },
  email:    { fontSize: 13, marginTop: 2 },
  youBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  youText:  { fontSize: 11, fontWeight: '700', color: '#fff' },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function TeamScreen() {
  const theme   = useTheme();
  const { session } = useSession();

  if (!session) return null;

  const { team, player: me, event, course } = session;

  const startInfo =
    team.startingHole != null
      ? `Hole ${team.startingHole} (Shotgun Start)`
      : team.teeTime != null
        ? `Tee Time: ${new Date(team.teeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Start assignment pending';

  const formatLabel = event.format
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── TEAM HEADER ── */}
        <View style={[styles.teamCard, { backgroundColor: theme.colors.primary }]}>
          <Text style={[styles.teamName,  { color: theme.colors.highlight }]} numberOfLines={2}>
            {team.name}
          </Text>
          <Text style={[styles.eventName, { color: theme.colors.highlight }]} numberOfLines={1}>
            {event.name}
          </Text>
        </View>

        {/* ── EVENT INFO ── */}
        <View style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
          <InfoRow icon="⛳" label="Format"  value={formatLabel} theme={theme} />
          <InfoRow icon="📍" label="Start"   value={startInfo}   theme={theme} />
          {course && (
            <InfoRow icon="🏌" label="Course" value={`${course.name} · ${course.city}, ${course.state}`} theme={theme} />
          )}
          <InfoRow icon="🕳" label="Holes"   value={String(event.holes)} theme={theme} />
        </View>

        {/* ── ROSTER ── */}
        <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          Roster ({team.players.length})
        </Text>
        <View style={[styles.rosterCard, { backgroundColor: '#fff' }]}>
          {team.players.map(p => (
            <PlayerRow
              key={p.id}
              player={p}
              isYou={p.id === me.id}
              theme={theme}
            />
          ))}
          {team.players.length === 0 && (
            <Text style={[styles.emptyRoster, { color: theme.colors.accent }]}>
              No players loaded. Rejoin the event to refresh.
            </Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── INFO ROW ──────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, theme }: {
  icon:  string;
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.icon}>{icon}</Text>
      <View style={infoRowStyles.body}>
        <Text style={[infoRowStyles.label, { color: theme.colors.accent }]}>{label}</Text>
        <Text style={[infoRowStyles.value, { color: theme.colors.primary }]}>{value}</Text>
      </View>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  icon:  { fontSize: 18, marginRight: 12, marginTop: 2 },
  body:  { flex: 1 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 14, fontWeight: '600', marginTop: 2 },
});

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:   { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },

  teamCard: {
    borderRadius: 16, padding: 24, marginBottom: 12,
    alignItems: 'center',
  },
  teamName:  { fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  eventName: { fontSize: 14, fontWeight: '500', opacity: 0.85, textAlign: 'center' },

  infoCard: {
    borderRadius: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4,
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 10,
  },
  rosterCard: {
    borderRadius: 14, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  emptyRoster: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
});
