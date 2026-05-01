/**
 * ScoreCard — Per-Hole Gross Score Entry Component
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS COMPONENT EXISTS:
 *   Score entry is the most frequently touched UI element during a round.
 *   It must work identically on:
 *     • An admin's tablet running apps/admin (Expo Router web)
 *     • A golfer's phone running apps/mobile (React Native iOS/Android)
 *
 *   The spec (§7.2) mandates 56pt minimum touch targets for accessibility and
 *   fat-finger usability on a golf course.  This component enforces that.
 *
 * RULE: No Platform.OS checks.  StyleSheet.create() only.
 *
 * USAGE:
 *   <ScoreCard
 *     holeNumber={7}
 *     par={4}
 *     score={score}          // current gross score value (or null if not entered)
 *     onScoreChange={(n) => saveScore(7, n)}
 *     isConflicted={false}   // true = show conflict warning (two devices disagree)
 *   />
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from './ThemeProvider';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

/**
 * MIN_TOUCH_TARGET — 56pt minimum touch target per spec §7.2.
 * ADA/Apple HIG minimum is 44pt, but the spec bumps it to 56pt for gloved
 * or wet hands on a golf course.
 */
const MIN_TOUCH_TARGET = 56;

/**
 * Score bounds — prevent absurd values without blocking all input.
 * A scramble team on a par 5 shouldn't need more than 12 strokes.
 */
const SCORE_MIN = 1;
const SCORE_MAX = 20;

// ── PROPS ─────────────────────────────────────────────────────────────────────

interface ScoreCardProps {
  /** Hole number 1–18 displayed as the card label */
  holeNumber: number;
  /** Par for this hole — used to show relative-to-par display */
  par: number;
  /** Current gross score, or null if not yet entered */
  score: number | null;
  /** Called when the user presses + or − */
  onScoreChange: (newScore: number) => void;
  /** If true, renders a conflict indicator (two devices submitted different scores) */
  isConflicted?: boolean;
  /** If true, disables all input (round is complete or user lacks permission) */
  disabled?: boolean;
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export function ScoreCard({
  holeNumber,
  par,
  score,
  onScoreChange,
  isConflicted = false,
  disabled = false,
}: ScoreCardProps) {
  const theme = useTheme();

  /**
   * handleDecrement — subtract 1 from the score, respecting SCORE_MIN.
   * useCallback prevents new function references on every render,
   * keeping child Pressable re-renders minimal.
   */
  const handleDecrement = useCallback(() => {
    if (disabled) return;
    const current = score ?? par; // default to par if no score entered yet
    if (current > SCORE_MIN) {
      onScoreChange(current - 1);
    }
  }, [score, par, disabled, onScoreChange]);

  /**
   * handleIncrement — add 1 to the score, respecting SCORE_MAX.
   */
  const handleIncrement = useCallback(() => {
    if (disabled) return;
    const current = score ?? par;
    if (current < SCORE_MAX) {
      onScoreChange(current + 1);
    }
  }, [score, par, disabled, onScoreChange]);

  /**
   * relativeScore — score relative to par.
   * Negative = under par (good), Positive = over par.
   * Displayed as "−1", "E" (even), "+2", etc.
   */
  const relativeScore = score !== null ? score - par : null;
  const relativeLabel = relativeScore === null
    ? '—'
    : relativeScore === 0
      ? 'E'
      : relativeScore > 0
        ? `+${relativeScore}`
        : `${relativeScore}`; // already has − sign

  /**
   * Dynamic border color:
   *   - Conflict: warning orange
   *   - Score entered: theme action (green)
   *   - No score yet: neutral grey
   */
  const borderColor = isConflicted
    ? '#e67e22'
    : score !== null
      ? theme.colors.action
      : '#cccccc';

  return (
    <View
      style={[styles.card, { borderColor, backgroundColor: theme.colors.surface }]}
      /**
       * accessibilityLabel tells screen readers what this card is.
       * Accessibility is not optional on a public-facing golf app.
       */
      accessibilityLabel={`Hole ${holeNumber}, par ${par}${score !== null ? `, score ${score}` : ', not yet entered'}`}
      accessibilityRole="none"
    >
      {/* ── HOLE HEADER ── */}
      <View style={styles.header}>
        <Text style={[styles.holeLabel, { color: theme.colors.primary }]}>
          Hole {holeNumber}
        </Text>
        <Text style={[styles.parLabel, { color: theme.buttonBackground }]}>
          Par {par}
        </Text>
      </View>

      {/* ── CONFLICT INDICATOR ── */}
      {isConflicted && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictText}>⚠ Score conflict — please verify</Text>
        </View>
      )}

      {/* ── SCORE CONTROLS ── */}
      <View style={styles.controls}>
        {/*
          * DECREMENT BUTTON
          * minWidth/minHeight enforce the 56pt touch target requirement.
          * The hitSlop prop extends the pressable area beyond the visual bounds
          * — important when buttons are placed close together.
          */}
        <Pressable
          onPress={handleDecrement}
          disabled={disabled || (score !== null && score <= SCORE_MIN)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
            (disabled) && styles.buttonDisabled,
          ]}
          accessibilityLabel={`Decrease score for hole ${holeNumber}`}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.colors.surface }]}>−</Text>
        </Pressable>

        {/* ── SCORE DISPLAY ── */}
        <View style={styles.scoreDisplay}>
          <Text
            style={[styles.scoreValue, { color: theme.colors.primary }]}
            accessibilityLiveRegion="polite" // announce score changes to screen readers
          >
            {score !== null ? score : '—'}
          </Text>
          <Text
            style={[
              styles.relativeScore,
              {
                color: relativeScore !== null && relativeScore < 0
                  ? '#27ae60' // under par: green
                  : relativeScore !== null && relativeScore > 0
                    ? '#e74c3c' // over par: red
                    : theme.colors.accent, // even or no score: accent
              },
            ]}
          >
            {relativeLabel}
          </Text>
        </View>

        {/* ── INCREMENT BUTTON ── */}
        <Pressable
          onPress={handleIncrement}
          disabled={disabled || (score !== null && score >= SCORE_MAX)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
            disabled && styles.buttonDisabled,
          ]}
          accessibilityLabel={`Increase score for hole ${holeNumber}`}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.colors.surface }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  holeLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  parLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  conflictBanner: {
    backgroundColor: '#fdf2e3',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  conflictText: {
    fontSize: 12,
    color: '#e67e22',
    fontWeight: '600',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    /**
     * minWidth and minHeight enforce the 56pt touch target from the spec.
     * justifyContent/alignItems center the ± glyph within the touch area.
     */
    minWidth:        MIN_TOUCH_TARGET,
    minHeight:       MIN_TOUCH_TARGET,
    borderRadius:    MIN_TOUCH_TARGET / 2,
    justifyContent:  'center',
    alignItems:      'center',
  },
  buttonText: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  scoreDisplay: {
    alignItems: 'center',
    minWidth: 72,
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
  },
  relativeScore: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
});
