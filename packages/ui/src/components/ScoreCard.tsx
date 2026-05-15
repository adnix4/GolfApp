import React, { useCallback } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from './ThemeProvider';

const MIN_TOUCH_TARGET         = 56;
const MIN_TOUCH_TARGET_COMPACT = 44;

const SCORE_MIN = 1;
const SCORE_MAX = 20;

export interface ScoreCardChallenge {
  description:    string;
  sponsorName?:   string | null;
  sponsorLogoUrl?: string | null;
  prizeDescription?: string | null;
}

interface ScoreCardProps {
  holeNumber:    number;
  par:           number;
  score:         number | null;
  onScoreChange: (newScore: number) => void;
  isConflicted?: boolean;
  disabled?:     boolean;
  /** Renders smaller buttons (44pt) so the card fits inside tight grid cells */
  compact?:      boolean;
  /** Hole challenge / contest to show inside the card header */
  challenge?:    ScoreCardChallenge | null;
}

export function ScoreCard({
  holeNumber,
  par,
  score,
  onScoreChange,
  isConflicted = false,
  disabled = false,
  compact = false,
  challenge = null,
}: ScoreCardProps) {
  const theme = useTheme();

  const handleDecrement = useCallback(() => {
    if (disabled) return;
    const current = score ?? par;
    if (current > SCORE_MIN) onScoreChange(current - 1);
  }, [score, par, disabled, onScoreChange]);

  const handleIncrement = useCallback(() => {
    if (disabled) return;
    const current = score ?? par;
    if (current < SCORE_MAX) onScoreChange(current + 1);
  }, [score, par, disabled, onScoreChange]);

  const relativeScore = score !== null ? score - par : null;
  const relativeLabel = relativeScore === null
    ? '—'
    : relativeScore === 0
      ? 'E'
      : relativeScore > 0
        ? `+${relativeScore}`
        : `${relativeScore}`;

  const borderColor = isConflicted
    ? '#e67e22'
    : score !== null
      ? theme.colors.action
      : '#cccccc';

  const touchTarget = compact ? MIN_TOUCH_TARGET_COMPACT : MIN_TOUCH_TARGET;
  const cardPadding = compact ? 12 : 16;

  return (
    <View
      style={[
        styles.card,
        { borderColor, backgroundColor: theme.colors.surface, padding: cardPadding },
      ]}
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

      {/* ── HOLE CHALLENGE BADGE ── */}
      {challenge && (
        <View style={[styles.challengeBadge, { backgroundColor: theme.colors.highlight, borderColor: theme.colors.accent + '44' }]}>
          {challenge.sponsorLogoUrl ? (
            <Image
              source={{ uri: challenge.sponsorLogoUrl }}
              style={styles.challengeSponsorLogo}
              resizeMode="contain"
              accessibilityLabel={challenge.sponsorName ?? 'Sponsor'}
            />
          ) : challenge.sponsorName ? (
            <Text style={[styles.challengeSponsor, { color: theme.colors.accent }]} numberOfLines={1}>
              {challenge.sponsorName}
            </Text>
          ) : null}
          <Text style={[styles.challengeDesc, { color: theme.colors.primary }]} numberOfLines={compact ? 1 : 2}>
            {challenge.description}
          </Text>
          {challenge.prizeDescription && (
            <Text style={[styles.challengePrize, { color: theme.colors.accent }]} numberOfLines={1}>
              🏆 {challenge.prizeDescription}
            </Text>
          )}
        </View>
      )}

      {/* ── CONFLICT INDICATOR ── */}
      {isConflicted && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictText}>⚠ Score conflict — please verify</Text>
        </View>
      )}

      {/* ── SCORE CONTROLS ── */}
      <View style={styles.controls}>
        <Pressable
          onPress={handleDecrement}
          disabled={disabled || (score !== null && score <= SCORE_MIN)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: pressed ? theme.colors.accent : theme.colors.primary,
              minWidth:  touchTarget,
              minHeight: touchTarget,
              borderRadius: touchTarget / 2,
            },
            disabled && styles.buttonDisabled,
          ]}
          accessibilityLabel={`Decrease score for hole ${holeNumber}`}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.colors.surface, fontSize: compact ? 24 : 28 }]}>−</Text>
        </Pressable>

        {/* ── SCORE DISPLAY ── */}
        <View style={styles.scoreDisplay}>
          <Text
            style={[styles.scoreValue, { color: theme.colors.primary, fontSize: compact ? 32 : 40 }]}
            accessibilityLiveRegion="polite"
          >
            {score !== null ? score : '—'}
          </Text>
          <Text
            style={[
              styles.relativeScore,
              {
                color: relativeScore !== null && relativeScore < 0
                  ? '#27ae60'
                  : relativeScore !== null && relativeScore > 0
                    ? '#e74c3c'
                    : theme.colors.accent,
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
            {
              backgroundColor: pressed ? theme.colors.accent : theme.colors.primary,
              minWidth:  touchTarget,
              minHeight: touchTarget,
              borderRadius: touchTarget / 2,
            },
            disabled && styles.buttonDisabled,
          ]}
          accessibilityLabel={`Increase score for hole ${holeNumber}`}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.colors.surface, fontSize: compact ? 24 : 28 }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: 12,
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
  challengeBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
    gap: 2,
  },
  challengeSponsorLogo: {
    width: '100%',
    height: 24,
    marginBottom: 2,
  },
  challengeSponsor: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  challengeDesc: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  challengePrize: {
    fontSize: 10,
    fontWeight: '600',
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
    justifyContent: 'center',
    alignItems:     'center',
  },
  buttonText: {
    fontWeight: '300',
    lineHeight: 32,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  scoreDisplay: {
    alignItems: 'center',
    minWidth: 60,
  },
  scoreValue: {
    fontWeight: '800',
    lineHeight: 44,
  },
  relativeScore: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
});
