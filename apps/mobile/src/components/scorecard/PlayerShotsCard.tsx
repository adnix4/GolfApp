import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import type { PlayerCacheDto, PlayerShotEntry } from '@/lib/api';
import { isAdminTotal, shotTotal, toBreakdown } from '@/lib/holeUtils';
import type { ScorecardLayout } from '@/lib/scorecardLayout';
import { ShotColumn, type ShotColumnSize } from '@/components/scorecardComponents';
import { fontSize, radius, spacing } from '@gfp/theme';

export type ShotType = 'drive' | 'approach' | 'putt';

/**
 * Per-golfer Drive / Approach / Putt steppers for the current hole. A golfer
 * whose strokes the organizer typed on the admin scorecard has a total but no
 * split: their row shows that total, an "Admin" tag and an Edit button that
 * opens it as steppers.
 */
export function PlayerShotsCard({
  layout, teamPlayers, playerBreakdown, scoringEnabled, isCurrentHoleDone,
  activePlayerId, shotSize, onExpand, onChangeShots, onEditAdminTotal,
}: {
  layout:            ScorecardLayout;
  teamPlayers:       PlayerCacheDto[];
  playerBreakdown:   Record<string, PlayerShotEntry>;
  scoringEnabled:    boolean;
  isCurrentHoleDone: boolean;
  /** Whose controls are open when the layout collapses the others. */
  activePlayerId:    string | undefined;
  shotSize:          ShotColumnSize;
  onExpand:          (playerId: string) => void;
  onChangeShots:     (playerId: string, type: ShotType, delta: number) => void;
  /** Edit on an organizer-entered golfer: reopen the hole with that total as steppers. */
  onEditAdminTotal:  (playerId: string) => void;
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
        const entry       = playerBreakdown[player.id];
        const adminTotal  = isAdminTotal(entry);
        const shots       = toBreakdown(entry);
        const initials    = `${player.firstName[0]}${player.lastName[0]}`;
        const playerTotal = shotTotal(entry);
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
              {adminTotal && (
                <Text style={[styles.adminTag, { color: theme.mutedText }]}>Admin</Text>
              )}
              <Text style={[styles.collapsedTotal, { color: playerTotal > 0 ? theme.colors.primary : theme.mutedText }]}>
                {playerTotal > 0 ? `${playerTotal}` : '—'}
              </Text>
            </Pressable>
          );
        }

        // Shots the organizer typed in admin are one number with no split.
        // Shown as that number in a highlight box straddling the Drive and
        // Approach columns (it belongs to neither), then the Admin tag and
        // Edit, which turns it into steppers holding the same total.
        const adminCols = adminTotal && (
          <View style={styles.playerCols}>
            <View style={styles.adminTotalSlot}>
              <View
                style={[
                  styles.adminTotalBox,
                  {
                    backgroundColor: theme.colors.highlight,
                    minWidth:        layout.shotButton * 1.5,
                    height:          layout.shotButton * 1.5,
                  },
                ]}
                accessibilityLabel={`${playerTotal} strokes, entered by the organizer`}
              >
                <Text style={[styles.adminTotalText, { color: theme.colors.primary, fontSize: shotSize.valueFont }]}>
                  {playerTotal}
                </Text>
              </View>
            </View>
            <View style={styles.adminActions}>
              <Text style={[styles.adminTag, { color: theme.mutedText }]}>Admin</Text>
              {scoringEnabled && (
                <Pressable
                  onPress={() => onEditAdminTotal(player.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  style={({ pressed }) => [
                    styles.adminEditBtn,
                    { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${player.firstName}'s shots on this hole`}
                >
                  <Text style={[styles.adminEditText, { color: theme.buttonLabel }]}>Edit</Text>
                </Pressable>
              )}
            </View>
          </View>
        );

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
              {playerTotal > 0 && !adminTotal && (
                <Text style={[styles.playerTotal, { color: theme.mutedText }]}>
                  {playerTotal}
                </Text>
              )}
            </View>

            {adminCols || <View style={styles.playerCols}>
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
            </View>}
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
  // Spans the Drive + Approach columns and the divider between them, so the
  // centred box sits on the line between Drive and Approach.
  adminTotalSlot: {
    flex: 2, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing[1] * 2 + 1,
  },
  adminTotalBox: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing[2], borderRadius: radius.md,
  },
  adminTotalText: { fontWeight: '800' },
  adminActions: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing[1],
  },
  adminTag: {
    fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
    marginRight: spacing[1],
  },
  adminEditBtn: {
    paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radius.full,
  },
  adminEditText: { fontSize: fontSize.sm, fontWeight: '700' },
});
