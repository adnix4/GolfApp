import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import type { HoleCacheDto } from '@/lib/api';
import type { ChipSpec, ChipsRowLayout } from '@/lib/chipsFit';
import { HoleInfoChip, ScoreChip } from '@/components/scorecardComponents';

export function HoleChipsRow({
  hole, chipsRow, displayScore, par, roundChips, roundToPar, currentHoleNumber,
  onWidth, onOpenHoleInfo,
}: {
  hole:              HoleCacheDto;
  chipsRow:          ChipsRowLayout;
  displayScore:      number | null;
  par:               number;
  roundChips:        ChipSpec[];
  roundToPar:        number | null;
  currentHoleNumber: number;
  /** The row's measured width; the screen resolves the arrangement from it. */
  onWidth:           (width: number) => void;
  onOpenHoleInfo:    () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.infoRow} onLayout={e => onWidth(e.nativeEvent.layout.width)}>
      {chipsRow.showYardagesButton && (
        <Pressable
          onPress={onOpenHoleInfo}
          style={({ pressed }) => [
            styles.holeInfoBtn,
            { borderColor: theme.colors.primary, backgroundColor: pressed ? theme.colors.primary + '18' : theme.colors.surface },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Yardages and handicap for hole ${currentHoleNumber}`}
        >
          <Text style={[styles.holeInfoBtnText, { color: theme.colors.primary }]}>
            Yardages
          </Text>
          <Text style={[styles.holeInfoBtnChevron, { color: theme.colors.primary }]}>›</Text>
        </Pressable>
      )}

      <ScoreChip grossScore={displayScore} par={par} />

      {chipsRow.showHcp && (
        <HoleInfoChip label="HCP" value={String(hole.handicapIndex)} />
      )}

      {!chipsRow.showYardagesButton && (
        <>
          {hole.yardageWhite != null && <HoleInfoChip label="White" value={`${hole.yardageWhite}y`} />}
          {hole.yardageBlue  != null && <HoleInfoChip label="Blue"  value={`${hole.yardageBlue}y`} />}
          {hole.yardageRed   != null && <HoleInfoChip label="Red"   value={`${hole.yardageRed}y`} />}
        </>
      )}

      {roundChips.map(c => (
        <HoleInfoChip
          key={c.label}
          label={c.label}
          value={c.value}
          {...(c.label === 'Round' ? { toPar: roundToPar } : {})}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Stand-in for Par/HCP/yardages when they won't fit on one line.
  holeInfoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 10,
  },
  // Sizes are mirrored by the BUTTON_* constants in lib/chipsFit — "Yardages"
  // is far wider than the old "Hole 13", and the collapsed row has no further
  // fallback if it overflows.
  holeInfoBtnText:    { fontSize: 13, fontWeight: '800' },
  holeInfoBtnChevron: { fontSize: 18, fontWeight: '400', lineHeight: 20 },
  infoRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    justifyContent: 'center', marginBottom: 12,
    alignItems: 'flex-start',
  },
});
