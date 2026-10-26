import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '@gfp/ui';

/** Prev / Complete Hole (or Edit Score) / Next. */
export function HoleNavBar({
  isFirstHole, isLastHole, isCurrentHoleDone, scoringEnabled, hasShots, completing,
  currentHoleNumber, onPrev, onNext, onComplete, onEdit,
}: {
  isFirstHole:       boolean;
  isLastHole:        boolean;
  isCurrentHoleDone: boolean;
  scoringEnabled:    boolean;
  hasShots:          boolean;
  completing:        boolean;
  currentHoleNumber: number;
  onPrev:            () => void;
  onNext:            () => void;
  onComplete:        () => void;
  onEdit:            () => Promise<void>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.navBar, { backgroundColor: theme.colors.surface, borderTopColor: '#e0e0e0' }]}>
      {/* Button row */}
      <View style={styles.btnRow}>
        <Pressable
          onPress={onPrev}
          disabled={isFirstHole}
          style={({ pressed }) => [
            styles.navBtn,
            {
              backgroundColor: pressed ? theme.colors.accent : theme.colors.primary,
              opacity: isFirstHole ? 0.3 : 1,
            },
          ]}
          accessibilityLabel="Previous hole"
          accessibilityRole="button"
        >
          <Text style={[styles.navBtnText, { color: theme.buttonLabel }]}>← Prev</Text>
        </Pressable>

        {/* Complete Hole button */}
        {isCurrentHoleDone ? (
          scoringEnabled ? (
            <Pressable
              onPress={() => { void onEdit(); }}
              style={({ pressed }) => [styles.completedBtn, pressed && { opacity: 0.75 }]}
              accessibilityLabel={`Edit score for hole ${currentHoleNumber}`}
              accessibilityRole="button"
            >
              <Text style={styles.completedBtnText}>✎ Edit Score</Text>
            </Pressable>
          ) : (
            <View style={styles.completedBtn}>
              <Text style={styles.completedBtnText}>✓ Done</Text>
            </View>
          )
        ) : (
          <Pressable
            onPress={onComplete}
            disabled={!hasShots || !scoringEnabled || completing}
            style={({ pressed }) => [
              styles.completeBtn,
              { backgroundColor: pressed ? '#1e8449' : '#27ae60' },
              (!hasShots || !scoringEnabled || completing) && styles.completeBtnDisabled,
            ]}
            accessibilityLabel="Complete hole"
            accessibilityRole="button"
          >
            {completing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.completeBtnText}>Complete Hole</Text>}
          </Pressable>
        )}

        <Pressable
          onPress={onNext}
          style={({ pressed }) => [
            styles.navBtn,
            {
              backgroundColor: pressed
                ? theme.colors.accent
                : isLastHole ? theme.colors.action : theme.colors.primary,
            },
          ]}
          accessibilityLabel={isLastHole ? 'Finish round' : 'Next hole'}
          accessibilityRole="button"
        >
          <Text style={[styles.navBtnText, { color: isLastHole ? theme.ctaLabel : theme.buttonLabel }]}>{isLastHole ? 'Finish ✓' : 'Next →'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  btnRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  },
  navBtn: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, minWidth: 80, alignItems: 'center',
  },
  navBtnText: { fontSize: 14, fontWeight: '700' },
  completeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  completeBtnDisabled: { opacity: 0.4 },
  completeBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
  completedBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', backgroundColor: '#27ae60' + '22',
    borderWidth: 1, borderColor: '#27ae60',
  },
  completedBtnText: { fontSize: 14, fontWeight: '700', color: '#27ae60' },
});
