import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useClasses } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { LeaveEventButton } from '@/components/LeaveEventButton';
import { InviteTeammateButton } from '@/components/InviteTeammateButton';
import type { PlayerCacheDto } from '@/lib/api';
import { formatTime } from '@gfp/shared-types';
import { fontSize, radius, spacing } from '@gfp/theme';

// ── PLAYER ROW ────────────────────────────────────────────────────────────────

function PlayerRow({
  player, isYou, theme, onEdit,
}: {
  player:  PlayerCacheDto;
  isYou:   boolean;
  theme:   ReturnType<typeof useTheme>;
  onEdit?: () => void;
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
              <Text style={[rowStyles.youText, { color: theme.ctaLabel }]}>You</Text>
            </View>
          )}
        </View>
        <Text style={[rowStyles.email, { color: theme.mutedText }]} numberOfLines={1}>
          {player.email}
        </Text>
      </View>
      {isYou && onEdit && (
        <Pressable
          onPress={onEdit}
          style={rowStyles.editBtn}
          accessibilityLabel="Edit your profile"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  avatar:   { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginRight: spacing[4] },
  initials: { fontSize: fontSize.xl, fontWeight: '800' },
  info:     { flex: 1 },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  name:     { fontSize: fontSize.lg, fontWeight: '700' },
  email:    { fontSize: fontSize.sm, marginTop: spacing[0.5] },
  youBadge: { paddingHorizontal: spacing[2], paddingVertical: spacing[0.5], borderRadius: radius.md },
  youText:  { fontSize: fontSize.xxs, fontWeight: '700' },
  editBtn:  { padding: spacing[2] },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function TeamScreen() {
  const theme   = useTheme();
  const c = useClasses();
  const router  = useRouter();
  const { session } = useSession();

  if (!session?.team) return null;

  const { team, player: me, event, course } = session;

  const startInfo =
    team.startingHole != null
      ? `Hole ${team.startingHole} (Shotgun Start)`
      : team.teeTime != null
        ? `Tee Time: ${formatTime(team.teeTime)}`
        : 'Start assignment pending';

  const formatLabel = event.format
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <SafeAreaView edges={['left', 'right']} style={c.screen}>
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
              onEdit={() => router.push('/edit-profile')}
            />
          ))}
          {team.players.length === 0 && (
            <Text style={[styles.emptyRoster, { color: theme.mutedText }]}>
              No players loaded. Rejoin the event to refresh.
            </Text>
          )}
        </View>

        <InviteTeammateButton />

        <LeaveEventButton />
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
        <Text style={[infoRowStyles.label, { color: theme.mutedText }]}>{label}</Text>
        <Text style={[infoRowStyles.value, { color: theme.colors.primary }]}>{value}</Text>
      </View>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  icon:  { fontSize: fontSize.xl, marginRight: spacing[3], marginTop: spacing[0.5] },
  body:  { flex: 1 },
  label: { fontSize: fontSize.xxs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: fontSize.md, fontWeight: '600', marginTop: spacing[0.5] },
});

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { padding: spacing[4], paddingBottom: spacing[10] },

  teamCard: {
    borderRadius: radius.xl, padding: spacing[6], marginBottom: spacing[3],
    alignItems: 'center',
  },
  teamName:  { fontSize: fontSize.display, fontWeight: '900', textAlign: 'center', marginBottom: spacing[1] },
  eventName: { fontSize: fontSize.md, fontWeight: '500', opacity: 0.85, textAlign: 'center' },

  infoCard: {
    borderRadius: radius.xl, paddingHorizontal: spacing[4], paddingTop: spacing[1], paddingBottom: spacing[1],
    marginBottom: spacing[5],
    boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.05)', elevation: 2,
  },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: spacing[3],
  },
  rosterCard: {
    borderRadius: radius.xl, paddingHorizontal: spacing[4],
    boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.05)', elevation: 2,
  },
  emptyRoster: { fontSize: fontSize.md, textAlign: 'center', paddingVertical: spacing[5] },
});
