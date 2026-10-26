import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import { screenStyles } from './scorecardStyles';
import { fontSize, radius, spacing } from '@gfp/theme';

export function ScoringHeader({
  teamName, eventName, currentHoleNumber, par, isCurrentHoleDone, roundFullySynced,
}: {
  teamName:          string;
  eventName:         string;
  currentHoleNumber: number;
  par:               number;
  isCurrentHoleDone: boolean;
  roundFullySynced:  boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[screenStyles.header, { backgroundColor: theme.colors.primary }]}>
      <Text style={[styles.headerTeam, { color: theme.colors.highlight }]} numberOfLines={1}>
        {teamName}
      </Text>
      {/* Hole counter and sync state ride the event line rather than owning a
          row in the nav bar — same information, ~30px more scroll area. */}
      <View style={styles.headerMetaRow}>
        <Text style={[styles.headerEvent, { color: theme.colors.highlight }]} numberOfLines={1}>
          {eventName}
        </Text>
        {/* The hole the golfer is standing on, NOT their position in the
            round. getHoleOrder wraps for shotgun starts, so a team starting
            on 12 plays 12..18,1..11 — "Hole 1/18" there was flatly wrong, and
            contradicted the Hole N button and detail modal, which have always
            shown the real number. Progress is the Through chip's job. */}
        <Text style={[styles.headerHole, { color: theme.colors.highlight }]}>
          Hole {currentHoleNumber}
          <Text style={styles.headerPar}>  Par {par}</Text>
        </Text>
        {isCurrentHoleDone && (
          <View style={[styles.completedBadge, roundFullySynced ? styles.badgeSynced : styles.badgePending]}>
            <Text style={[styles.completedBadgeText, !roundFullySynced && styles.badgePendingText]}>
              {roundFullySynced ? '✓' : 'Pending sync'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerTeam:  { fontSize: fontSize.xl, fontWeight: '800' },
  headerEvent: { fontSize: fontSize.sm, fontWeight: '500', opacity: 0.85, flexShrink: 1 },
  headerMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing[2], marginTop: spacing[0.5],
  },
  headerHole: { fontSize: fontSize.sm, fontWeight: '700' },
  headerPar:  { fontSize: fontSize.sm, fontWeight: '500', opacity: 0.85 },
  completedBadge: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing[2], paddingVertical: spacing[0.5],
  },
  badgeSynced:  { backgroundColor: '#27ae60' },
  // Amber reads as "in flight", not "broken" — an unsynced hole is normal on a
  // course with patchy signal and resolves itself.
  badgePending: { backgroundColor: '#f0a500' },
  completedBadgeText:  { color: '#fff', fontSize: fontSize.xxs, fontWeight: '700' },
  badgePendingText:    { color: '#4a3300' },
});
