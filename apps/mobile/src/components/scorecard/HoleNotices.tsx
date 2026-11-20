import { View, Text, StyleSheet } from 'react-native';
import { useTheme, GlyphText } from '@gfp/ui';
import type { ChallengeCacheDto } from '@/lib/api';
import { fontSize, radius, spacing, status } from '@gfp/theme';

/** Challenge badge plus the conflict / organizer-edit / read-only notices. */
export function HoleNotices({
  holeChallenge, holeConflict, organizerEditHole, currentHoleNumber,
  isCurrentHoleDone, scoringEnabled, eventStatus,
}: {
  holeChallenge:     ChallengeCacheDto | null;
  holeConflict:      boolean;
  /** Hole reopened for editing whose score came from the organizer. */
  organizerEditHole: number | null;
  currentHoleNumber: number;
  isCurrentHoleDone: boolean;
  scoringEnabled:    boolean;
  eventStatus:       string;
}) {
  const theme = useTheme();
  return (
    <>
      {/* ── HOLE CHALLENGE BADGE ── */}
      {holeChallenge && (
        <View style={[styles.challengeBadge, { backgroundColor: theme.colors.highlight, borderColor: theme.colors.accent + '44' }]}>
          {holeChallenge.sponsorName && (
            <Text style={[styles.challengeSponsor, { color: theme.highlightMuted }]}>
              {holeChallenge.sponsorName}
            </Text>
          )}
          <Text style={[styles.challengeDesc, { color: theme.highlightLabel }]}>
            {holeChallenge.description}
          </Text>
          {holeChallenge.prizeDescription && (
            <GlyphText style={[styles.challengePrize, { color: theme.highlightMuted }]}>
              {`🏆 ${holeChallenge.prizeDescription}`}
            </GlyphText>
          )}
        </View>
      )}

      {/* ── CONFLICT / PENDING-APPROVAL NOTICE ── */}
      {holeConflict && (
        <View style={[styles.conflictNotice, { backgroundColor: '#fff7e6', borderColor: '#f0a500' }]}>
          <GlyphText style={styles.conflictNoticeText}>
            ⚠ Your score for this hole is waiting for admin approval. The score shown is the
            organizer's current record.
          </GlyphText>
        </View>
      )}

      {/* ── EDITING AN ORGANIZER-ENTERED HOLE ── */}
      {organizerEditHole === currentHoleNumber && !isCurrentHoleDone && scoringEnabled && (
        <View style={[styles.conflictNotice, { backgroundColor: '#fff7e6', borderColor: '#f0a500' }]}>
          <Text style={styles.conflictNoticeText}>
            This hole was scored by the organizer. When you tap Complete Hole, a change to
            the hole's score is sent to them to approve.
          </Text>
        </View>
      )}

      {/* ── READ-ONLY NOTICE ── */}
      {!scoringEnabled && (
        <View style={[styles.readOnlyNotice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent + '55' }]}>
          <Text style={[styles.readOnlyText, { color: theme.mutedText }]}>
            {eventStatus === 'Completed'
              ? 'Scorecard is read-only — the round is complete'
              : 'Scorecard is read-only — scoring opens when the organizer starts the round'}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  readOnlyNotice: {
    borderWidth: 1, borderRadius: radius.lg,
    padding: spacing[3], marginBottom: spacing[3], alignItems: 'center',
  },
  readOnlyText: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 18 },
  conflictNotice: {
    borderWidth: 1, borderRadius: radius.lg,
    padding: spacing[3], marginBottom: spacing[3],
  },
  conflictNoticeText: { fontSize: fontSize.sm, lineHeight: 18, color: status.warningText, fontWeight: '600' },
  challengeBadge: {
    borderWidth: 1, borderRadius: radius.lg,
    padding: spacing[3], marginBottom: spacing[3], gap: spacing[1],
  },
  challengeSponsor: { fontSize: fontSize.xxs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  challengeDesc:    { fontSize: fontSize.sm, fontWeight: '600', lineHeight: 18 },
  challengePrize:   { fontSize: fontSize.xs, fontWeight: '600' },
});
