import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, StatusPill } from '@gfp/ui';
import { fmtAgeGroup, fmtPhone, formatTime } from '@gfp/shared-types';
import type { Team, Player } from '@/lib/api';
import { confirmAction } from '@/lib/confirmAction';
import {
  isCheckedIn as statusIsCheckedIn, checkInLabel, checkInColor,
  checkInConfirmCopy, cardlessHint, canCheckInWholeTeam, golfersWithoutCard,
} from '@/lib/checkIn';
import { fontSize, radius, spacing } from '@gfp/theme';

// ── Team row (memoized) ───────────────────────────────────────────────────────
// Hoisted out of the FlatList renderItem so the closure doesn't recreate the
// row tree on every parent render. The handler refs are stable thanks to
// useCallback in the parent, so a row only re-renders when its own Team or
// eventStatus actually changes.

interface TeamRowProps {
  team:           Team;
  eventStatus:    string | null;
  onEditTeam:     (team: Team) => void;
  onRemoveTeam:   (team: Team) => void;
  onCheckIn:      (teamId: string) => void;
  onCheckInPlayer:(player: Player) => void;
  onEditPlayer:   (player: Player, team: Team) => void;
  onRemovePlayer: (teamId: string, playerId: string) => void;
  onAddPlayer:    (team: Team) => void;
}

export const TeamRow = memo(function TeamRow({
  team, eventStatus,
  onEditTeam, onRemoveTeam, onCheckIn, onCheckInPlayer,
  onEditPlayer, onRemovePlayer, onAddPlayer,
}: TeamRowProps) {
  const theme = useTheme();
  // Whole-team check-in is the risk-free fast path only; a roster with any
  // cardless golfer is checked in one at a time so each warning is accepted.
  const teamIsIn      = statusIsCheckedIn(team.checkInStatus);
  const cardless      = golfersWithoutCard(team.players);
  const canCheckInAll = canCheckInWholeTeam(team.players);
  return (
    <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
      {/* Team header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.teamName, { color: theme.colors.primary }]}>{team.name}</Text>
          <Text style={[styles.meta, { color: theme.mutedText }]}>
            {team.players.length}/{team.maxPlayers} players
            {team.startingHole ? ` · Hole ${team.startingHole}` : ''}
            {team.teeTime ? ` · ${formatTime(team.teeTime)}` : ''}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <StatusPill
            color={checkInColor(team.checkInStatus)}
            label={checkInLabel(team.checkInStatus)}
            size="sm"
          />
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.editBtn, { borderColor: theme.colors.accent }]}
              onPress={() => onEditTeam(team)}
            >
              <Text style={[styles.editBtnText, { color: theme.mutedText }]}>Edit</Text>
            </Pressable>
            {team.players.length === 0 && (
              <Pressable
                style={[styles.editBtn, { borderColor: '#e74c3c' }]}
                onPress={() => onRemoveTeam(team)}
              >
                <Text style={[styles.editBtnText, { color: '#e74c3c' }]}>Remove</Text>
              </Pressable>
            )}
            {!teamIsIn && canCheckInAll && eventStatus === 'Active' && (
              <Pressable
                style={[styles.checkInBtn, { backgroundColor: theme.colors.action }]}
                onPress={() => onCheckIn(team.id)}
              >
                <Text style={[styles.checkInText, { color: theme.ctaLabel }]}>Check In Team</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Why there is no team button here — the fast path is withheld, not broken */}
      {!teamIsIn && !canCheckInAll && eventStatus === 'Active' && team.players.length > 0 && (
        <Text style={[styles.cardlessHint, { color: theme.mutedText }]}>
          {cardlessHint(cardless.length, team.players.length)}
        </Text>
      )}

      {/* Players */}
      {team.players.length > 0 && (
        <View style={styles.players}>
          {team.players.map(p => (
            <View key={p.id} style={styles.playerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.playerName, { color: theme.colors.primary }]}>
                  {p.firstName} {p.lastName}
                </Text>
                {!!p.email && (
                  <Text style={[styles.playerMeta, { color: theme.mutedText }]}>{p.email}</Text>
                )}
                {!!p.phone && (
                  <Text style={[styles.playerMeta, { color: theme.mutedText }]}>{fmtPhone(p.phone)}</Text>
                )}
                {(p.handicapIndex != null || p.skillLevel || p.ageGroup) && (
                  <Text style={[styles.playerMeta, { color: theme.mutedText }]}>
                    {[
                      p.handicapIndex != null ? `HCP ${p.handicapIndex}` : null,
                      p.skillLevel ?? null,
                      fmtAgeGroup(p.ageGroup),
                    ].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {!!p.pairingNote && (
                  <Text style={[styles.playerNote, { color: theme.mutedText }]}>
                    Note: {p.pairingNote}
                  </Text>
                )}
              </View>
              <View style={styles.playerActions}>
                {eventStatus === 'Active' && (
                  statusIsCheckedIn(p.checkInStatus) ? (
                    <Text style={[styles.golferDone, { color: '#27ae60' }]}>✓ In</Text>
                  ) : (
                    <Pressable
                      style={[styles.smallBtn, { borderColor: theme.colors.action }]}
                      onPress={() => {
                        const c = checkInConfirmCopy(
                          `${p.firstName} ${p.lastName}`.trim(), p.hasPaymentMethod);
                        confirmAction(c.title, c.message, () => onCheckInPlayer(p), c.confirmText, c.dialog);
                      }}
                    >
                      <Text style={[styles.smallBtnText, { color: theme.colors.action }]}>Check In</Text>
                    </Pressable>
                  )
                )}
                <Pressable
                  style={[styles.smallBtn, { borderColor: theme.colors.accent }]}
                  onPress={() => onEditPlayer(p, team)}
                >
                  <Text style={[styles.smallBtnText, { color: theme.mutedText }]}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.smallBtn, { borderColor: '#e74c3c' }]}
                  onPress={() => confirmAction(
                    'Remove Player',
                    `Remove ${p.firstName} ${p.lastName} from this team?`,
                    () => onRemovePlayer(team.id, p.id),
                    'Remove',
                    { destructive: true },
                  )}
                >
                  <Text style={[styles.smallBtnText, { color: '#e74c3c' }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add player row */}
      <View style={styles.cardFooter}>
        <Text style={[styles.feePill, {
          color: team.entryFeePaid ? '#27ae60' : '#e74c3c',
          borderColor: team.entryFeePaid ? '#27ae60' : '#e74c3c',
        }]}>
          {team.entryFeePaid ? 'Fee Paid' : 'Fee Unpaid'}
        </Text>
        {team.players.length < team.maxPlayers && (
          <Pressable
            style={[styles.addPlayerBtn, { borderColor: theme.colors.action }]}
            onPress={() => onAddPlayer(team)}
          >
            <Text style={[styles.addPlayerBtnText, { color: theme.colors.action }]}>+ Add Player</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[4],
    backgroundColor: '#fff',
    gap: spacing[3],
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  teamName: { fontSize: fontSize.xl, fontWeight: '700' },
  meta: { fontSize: fontSize.sm, marginTop: spacing[0.5] },
  cardRight: { alignItems: 'flex-end', gap: spacing[2] },
  actionBtns: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
  editBtn: { paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radius.sm, borderWidth: 1 },
  editBtnText: { fontSize: fontSize.xs, fontWeight: '600' },
  checkInBtn: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.sm },
  checkInText: { fontSize: fontSize.xs, fontWeight: '700' },
  cardlessHint: { fontSize: fontSize.xs, marginTop: spacing[2], fontStyle: 'italic' },
  golferDone: { fontSize: fontSize.xs, fontWeight: '700' },
  players: { gap: spacing[2], paddingTop: spacing[1], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  playerName: { fontSize: fontSize.md, fontWeight: '600' },
  playerMeta: { fontSize: fontSize.xs },
  playerNote: { fontSize: fontSize.xxs, marginTop: spacing[0.5], fontStyle: 'italic' },
  playerActions: { flexDirection: 'row', gap: spacing[2] },
  smallBtn: { paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radius.sm, borderWidth: 1 },
  smallBtnText: { fontSize: fontSize.xxs, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feePill: { fontSize: fontSize.xs, fontWeight: '600', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  addPlayerBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  addPlayerBtnText: { fontSize: fontSize.xs, fontWeight: '600' },
});
