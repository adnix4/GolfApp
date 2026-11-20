import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, Heading } from '@gfp/ui';
import { teamHolePar } from '@gfp/shared-types';
import type {
  ChallengeCacheDto, HoleCacheDto, JoinEventResponse, PendingScore, SponsorCacheDto, TeamCacheDto,
} from '@/lib/api';
import { strokesByPlayer } from '@/lib/holeUtils';
import { ChallengeDetailModal, SponsorModal } from '@/components/scorecardComponents';
import { screenStyles } from './scorecardStyles';
import { ColumnHeader, ColumnTip, useColumnTip } from './ColumnTip';
import { fontSize, spacing, status } from '@gfp/theme';

/**
 * Pre-scoring summary: the whole course as one table, shown in place of the
 * per-hole sheets until the organizer opens scoring (and after the round).
 */
export function ScorecardSummary({
  session, team, pendingScores, holeByNumber, challengeMap, holeSponsorMap,
  selectedSponsor, onSelectSponsor,
}: {
  session:         JoinEventResponse;
  team:            TeamCacheDto;
  pendingScores:   PendingScore[];
  holeByNumber:    Map<number, HoleCacheDto>;
  challengeMap:    Map<number, ChallengeCacheDto>;
  holeSponsorMap:  Map<number, SponsorCacheDto>;
  /** Owned by the screen: the scoring view opens the same sponsor modal. */
  selectedSponsor: SponsorCacheDto | null;
  onSelectSponsor: (sponsor: SponsorCacheDto | null) => void;
}) {
  const theme = useTheme();
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeCacheDto | null>(null);
  const columnTip = useColumnTip();


  const allHoles = Array.from({ length: session.event.holes }, (_, i) => i + 1);

  return (
    <SafeAreaView edges={['left', 'right']} style={[screenStyles.page, { backgroundColor: theme.pageBackground }]}>
      {/* Header: event name + hosted by course */}
      <View style={[screenStyles.header, { backgroundColor: theme.colors.primary }]}>
        <Heading level={1} style={[styles.headerEventName, { color: theme.highlightText }]} numberOfLines={2}>
          {session.event.name}
        </Heading>
        {session.course ? (
          <Text style={[styles.headerHostedBy, { color: theme.highlightText }]} numberOfLines={1}>
            Hosted by {session.course.name}
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[screenStyles.scroll, { paddingBottom: spacing[10] }]}>

        {/* [Team]'s Scorecard */}
        <Heading level={2} style={[styles.summaryTitle, { color: theme.colors.primary }]}>
          {team.name}'s Scorecard
        </Heading>

        {/* Table header — tap any abbreviation for the full label */}
        <View style={[styles.summaryTableHeader, { backgroundColor: theme.colors.primary }]}>
          <ColumnHeader abbr="#" name="Hole Number" style={[summaryCol.hole, styles.summaryTh]} onTip={columnTip.show} />
          <ColumnHeader abbr="Yds" name="Yardage" style={[summaryCol.yds, styles.summaryTh]} onTip={columnTip.show} />
          <ColumnHeader abbr="Par" name="Par" style={[summaryCol.par, styles.summaryTh]} onTip={columnTip.show} />
          <ColumnHeader abbr="Scr" name="Strokes" style={[summaryCol.scr, styles.summaryTh]} onTip={columnTip.show} />
          <ColumnHeader abbr="+/−" name="Score vs. Par" style={[summaryCol.rel, styles.summaryTh]} onTip={columnTip.show} />
          <ColumnHeader abbr="Spon" name="Hole Sponsor" style={[summaryCol.spon, styles.summaryTh]} onTip={columnTip.show} />
          <ColumnHeader abbr="Chal" name="Hole Challenge" style={[summaryCol.chal, styles.summaryTh]} onTip={columnTip.show} />
        </View>
        <ColumnTip tip={columnTip.message} />

        {allHoles.map((holeNum, idx) => {
          const holeData  = holeByNumber.get(holeNum);
          const par       = holeData?.par ?? 4;
          const challenge = challengeMap.get(holeNum);
          const sponsor   = holeSponsorMap.get(holeNum);
          const yardage   = holeData?.yardageWhite ?? holeData?.yardageBlue ?? holeData?.yardageRed;
          const rowBg     = idx % 2 === 0 ? theme.colors.surface : theme.colors.highlight + 'cc';

          // Show pending score if it exists (e.g. from a draft/test run)
          const pending   = pendingScores.find(s => s.holeNumber === holeNum);
          const hasScore  = !!pending;
          const gross     = pending?.grossScore ?? 0;
          // An aggregate Stroke/Stableford row holds every golfer's ball (U8).
          const rowPar    = teamHolePar(session.event.format, strokesByPlayer(pending?.playerShots), par);
          const relative  = hasScore ? gross - rowPar : null;
          const relLabel  =
            relative === null ? '—' :
            relative === 0    ? 'E' :
            relative > 0      ? `+${relative}` : `${relative}`;
          const relColor =
            relative === null ? theme.mutedText :
            relative < 0      ? '#27ae60' :
            relative > 0      ? '#e74c3c' : theme.mutedText;

          return (
            <View key={holeNum} style={styles.summaryHoleBlock}>
              <View style={[summaryCol.row, { backgroundColor: rowBg }]}>
                <Text style={[summaryCol.hole, styles.summaryCell, { color: theme.colors.primary, fontWeight: '700' }]}>
                  {holeNum}
                </Text>
                <Text style={[summaryCol.yds, styles.summaryCell, { color: theme.mutedText }]}>
                  {yardage != null ? `${yardage}` : '—'}
                </Text>
                <Text style={[summaryCol.par, styles.summaryCell, { color: theme.mutedText }]}>
                  {par}
                </Text>
                <Text style={[summaryCol.scr, styles.summaryCell, { color: theme.colors.primary, opacity: hasScore ? 1 : 0.3, fontWeight: hasScore ? '700' : '400' }]}>
                  {hasScore ? gross : '—'}
                </Text>
                <Text style={[summaryCol.rel, styles.summaryCell, { color: relColor, fontWeight: '600' }]}>
                  {relLabel}
                </Text>
                {sponsor ? (
                  <Pressable
                    style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => onSelectSponsor(sponsor)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${sponsor.name} sponsor info`}
                  >
                    <Text style={[styles.summaryCell, { color: theme.colors.primary, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline' }]} numberOfLines={1}>
                      {sponsor.name}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={[summaryCol.spon, styles.summaryCellDash, { color: theme.mutedText }]}>—</Text>
                )}
                {challenge ? (
                  <Pressable
                    style={summaryCol.chal}
                    onPress={() => setSelectedChallenge(challenge)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`View challenge for hole ${holeNum}`}
                  >
                    <Text style={styles.summaryChallengeIcon}>🏆</Text>
                  </Pressable>
                ) : (
                  <Text style={[summaryCol.chal, styles.summaryCellDash, { color: theme.mutedText }]}>—</Text>
                )}
              </View>
              {pending?.conflict && (
                <View style={styles.summarySubRow}>
                  <Text style={[styles.summarySubText, { color: status.warningText }]}>
                    ⚠ Your score is waiting for admin approval
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <ChallengeDetailModal
        challenge={selectedChallenge}
        onDismiss={() => setSelectedChallenge(null)}
      />
      <SponsorModal
        sponsor={selectedSponsor}
        onDismiss={() => onSelectSponsor(null)}
      />
    </SafeAreaView>
  );
}

const summaryCol = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], paddingHorizontal: spacing[2] },
  hole: { flex: 1,   textAlign: 'center' },   // "#"   — up to "18"
  yds:  { flex: 1.5, textAlign: 'center' },   // "Yds" — 3-digit yardage
  par:  { flex: 1,   textAlign: 'center' },   // "Par" — single digit
  scr:  { flex: 1.5, textAlign: 'center' },   // "Scr" — up to 2 digits
  rel:  { flex: 1.5, textAlign: 'center' },   // "+/−" — up to "+10"
  spon: { flex: 3,   textAlign: 'center' },   // "Spon" — absorbs remaining space
  chal: { flex: 1.5, alignItems: 'center' },  // "Chal" — 🏆 or —
});

const styles = StyleSheet.create({
  headerEventName: { fontSize: fontSize.xxl, fontWeight: '800', textAlign: 'center' },
  headerHostedBy:  { fontSize: fontSize.sm, fontWeight: '500', marginTop: spacing[1], textAlign: 'center', opacity: 0.8 },
  summaryTitle: {
    fontSize: fontSize.xl, fontWeight: '800',
    marginTop: spacing[4], marginBottom: spacing[2], paddingHorizontal: spacing[3],
  },
  summaryTableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  summaryTh:            { fontSize: fontSize.xxs, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  summaryHoleBlock:     {},
  summaryCell:          { fontSize: fontSize.md },
  summaryCellDash:      { textAlign: 'center', fontSize: fontSize.md },
  summaryChallengeIcon: { fontSize: fontSize.xl },
  summarySubRow:        { paddingHorizontal: spacing[3], paddingBottom: spacing[2] },
  summarySubText:       { fontSize: fontSize.xxs, fontWeight: '500' },
  // Column-label tooltip (tap a header abbreviation to reveal full name)
});
