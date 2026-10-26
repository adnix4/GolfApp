import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import type { ChallengeCacheDto } from '@/lib/api';

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
            <Text style={[styles.challengeSponsor, { color: theme.mutedText }]}>
              {holeChallenge.sponsorName}
            </Text>
          )}
          <Text style={[styles.challengeDesc, { color: theme.colors.primary }]}>
            {holeChallenge.description}
          </Text>
          {holeChallenge.prizeDescription && (
            <Text style={[styles.challengePrize, { color: theme.mutedText }]}>
              🏆 {holeChallenge.prizeDescription}
            </Text>
          )}
        </View>
      )}

      {/* ── CONFLICT / PENDING-APPROVAL NOTICE ── */}
      {holeConflict && (
        <View style={[styles.conflictNotice, { backgroundColor: '#fff7e6', borderColor: '#f0a500' }]}>
          <Text style={styles.conflictNoticeText}>
            ⚠ Your score for this hole is waiting for admin approval. The score shown is the
            organizer's current record.
          </Text>
        </View>
      )}

      {/* ── EDITING AN ORGANIZER-ENTERED HOLE ── */}
      {organizerEditHole === currentHoleNumber && !isCurrentHoleDone && scoringEnabled && (
        <View style={[styles.conflictNotice, { backgroundColor: '#fff7e6', borderColor: '#f0a500' }]}>
          <Text style={styles.conflictNoticeText}>
            This hole was scored by the organizer. When you tap Complete Hole, your change is
            sent to them to approve.
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
    borderWidth: 1, borderRadius: 10,
    padding: 12, marginBottom: 12, alignItems: 'center',
  },
  readOnlyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  conflictNotice: {
    borderWidth: 1, borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  conflictNoticeText: { fontSize: 13, lineHeight: 18, color: '#a67100', fontWeight: '600' },
  challengeBadge: {
    borderWidth: 1, borderRadius: 10,
    padding: 10, marginBottom: 12, gap: 3,
  },
  challengeSponsor: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  challengeDesc:    { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  challengePrize:   { fontSize: 12, fontWeight: '600' },
});
