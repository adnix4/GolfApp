import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import type { PlayerCacheDto, PlayerShotBreakdown } from '@/lib/api';
import type { ScorecardLayout } from '@/lib/scorecardLayout';
import { ShotColumn, type ShotColumnSize } from '@/components/scorecardComponents';
import { fontSize, radius, spacing } from '@gfp/theme';

export type ShotType = 'drive' | 'approach' | 'putt';

/** Per-golfer Drive / Approach / Putt steppers for the current hole. */
export function PlayerShotsCard({
  layout, teamPlayers, playerBreakdown, scoringEnabled, isCurrentHoleDone,
  activePlayerId, shotSize, onExpand, onChangeShots,
}: {
  layout:            ScorecardLayout;
  teamPlayers:       PlayerCacheDto[];
  playerBreakdown:   Record<string, PlayerShotBreakdown>;
  scoringEnabled:    boolean;
  isCurrentHoleDone: boolean;
  /** Whose controls are open when the layout collapses the others. */
  activePlayerId:    string | undefined;
  shotSize:          ShotColumnSize;
  onExpand:          (playerId: string) => void;
  onChangeShots:     (playerId: string, type: ShotType, delta: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[
      styles.playerCard,
      {
        backgroundColor: theme.colors.surface,
        paddingTop:      layout.cardPaddingTop,
        paddingBottom:   layout.cardPaddingBottom,
      },
    ]}>
      {layout.showCardTitle && (
        <Text style={[styles.playerCardTitle, { color: theme.colors.primary }]}>
          Player Shots
        </Text>
      )}

      {/* One shared header instead of repeating Drive/Approach/Putt under
          every golfer. Spacer matches the name block so the labels line up
          with the columns they title. */}
      {teamPlayers.length > 0 && (
        <View style={styles.colHeaderRow}>
          <View style={styles.playerNameBlock} />
          <View style={styles.playerCols}>
            {['Drive', 'Approach', 'Putt'].map((l, i) => (
              <React.Fragment key={l}>
                {i > 0 && <View style={styles.colHeaderSpacer} />}
                <Text
                  style={[styles.colHeaderText, { color: theme.mutedText, fontSize: layout.shotLabelFont }]}
                  numberOfLines={1}
                >
                  {l}
                </Text>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {teamPlayers.length === 0 && (
        <Text style={[styles.noPlayersText, { color: theme.mutedText }]}>
          No players on this team.
        </Text>
      )}

      {teamPlayers.map((player, idx) => {
        const shots       = playerBreakdown[player.id] ?? { drive: 0, approach: 0, putt: 0 };
        const initials    = `${player.firstName[0]}${player.lastName[0]}`;
        const playerTotal = shots.drive + shots.approach + shots.putt;
        const isFirst     = idx === 0;
        // Shot entry is disabled when the hole is marked complete
        const shotDisabled = !scoringEnabled || isCurrentHoleDone;

        // A foursome's expanded controls exceed every phone viewport, so on
        // short screens only the golfer being scored is expanded and the
        // rest sit as one-line rows you tap to open.
        const isExpanded = !layout.collapseInactivePlayers || activePlayerId === player.id;

        if (!isExpanded) {
          return (
            <Pressable
              key={player.id}
              onPress={() => onExpand(player.id)}
              style={[
                styles.collapsedRow,
                !isFirst && { borderTopColor: theme.colors.accent + '22', borderTopWidth: StyleSheet.hairlineWidth },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Enter shots for ${player.firstName} ${player.lastName}`}
            >
              <Text style={[styles.collapsedName, { color: theme.colors.primary }]} numberOfLines={1}>
                {player.firstName} {player.lastName}
              </Text>
              <Text style={[styles.collapsedTotal, { color: playerTotal > 0 ? theme.colors.primary : theme.mutedText }]}>
                {playerTotal > 0 ? `${playerTotal}` : '—'}
              </Text>
            </Pressable>
          );
        }

        return (
          <View
            key={player.id}
            style={[
              styles.playerSection,
              { paddingTop: layout.sectionPaddingTop, paddingBottom: layout.sectionPaddingBottom },
              !isFirst && { borderTopColor: theme.colors.accent + '22', borderTopWidth: StyleSheet.hairlineWidth },
            ]}
          >
            {/* Name sits BESIDE the controls rather than above them. A
                separate name row cost ~30px per golfer — 120px across a
                foursome — which is most of what used to force the collapse. */}
            <View style={styles.playerNameBlock}>
              <View style={[
                styles.playerAvatar,
                {
                  backgroundColor: theme.colors.highlight,
                  width: layout.avatar, height: layout.avatar, borderRadius: layout.avatar / 2,
                },
              ]}>
                <Text style={[styles.playerInitials, { color: theme.colors.primary }]}>
                  {initials}
                </Text>
              </View>
              <Text
                style={[styles.playerName, { color: theme.colors.primary, fontSize: layout.nameFont }]}
                numberOfLines={1}
              >
                {player.firstName}
              </Text>
              {playerTotal > 0 && (
                <Text style={[styles.playerTotal, { color: theme.mutedText }]}>
                  {playerTotal}
                </Text>
              )}
            </View>

            <View style={styles.playerCols}>
              <ShotColumn
                label="Drive"
                value={shots.drive}
                onDecrement={() => onChangeShots(player.id, 'drive', -1)}
                onIncrement={() => onChangeShots(player.id, 'drive', 1)}
                disabled={shotDisabled}
                theme={theme}
                size={shotSize}
                showLabel={false}
              />
              <View style={[styles.colDivider, { backgroundColor: theme.colors.accent + '22', height: layout.shotButton * 1.8 }]} />
              <ShotColumn
                label="Approach"
                value={shots.approach}
                onDecrement={() => onChangeShots(player.id, 'approach', -1)}
                onIncrement={() => onChangeShots(player.id, 'approach', 1)}
                disabled={shotDisabled}
                theme={theme}
                size={shotSize}
                showLabel={false}
              />
              <View style={[styles.colDivider, { backgroundColor: theme.colors.accent + '22', height: layout.shotButton * 1.8 }]} />
              <ShotColumn
                label="Putt"
                value={shots.putt}
                onDecrement={() => onChangeShots(player.id, 'putt', -1)}
                onIncrement={() => onChangeShots(player.id, 'putt', 1)}
                disabled={shotDisabled}
                theme={theme}
                size={shotSize}
                showLabel={false}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Collapsed golfer on short screens: name + shot total, tap to expand.
  collapsedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing[2], paddingHorizontal: spacing[0.5],
  },
  collapsedName:  { flex: 1, fontSize: fontSize.md, fontWeight: '600' },
  collapsedTotal: { fontSize: fontSize.lg, fontWeight: '800', minWidth: 28, textAlign: 'right' },
  playerCard: {
    borderRadius: radius.xl,
    paddingTop: spacing[4],
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[2],
    marginBottom: spacing[2],
    boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.06)', elevation: 2,
  },
  playerCardTitle: { fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing[3] },
  noPlayersText:   { fontSize: fontSize.sm, paddingBottom: spacing[2] },
  playerSection: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
  },
  playerNameBlock: {
    width: 92, flexDirection: 'row', alignItems: 'center', gap: spacing[2],
  },
  colHeaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: spacing[1],
  },
  colHeaderText: {
    flex: 1, textAlign: 'center',
    fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  colHeaderSpacer: { width: 1, marginHorizontal: spacing[1] },
  playerAvatar:   { alignItems: 'center', justifyContent: 'center' },
  playerInitials: { fontSize: fontSize.xs, fontWeight: '800' },
  playerName:     { flex: 1, fontSize: fontSize.md, fontWeight: '600' },
  // (playerTotal now shows just the number — the name block is narrow)
  playerTotal:    { fontSize: fontSize.sm, fontWeight: '700' },
  playerCols: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colDivider: { width: 1, height: 80, marginHorizontal: spacing[1] },
});
