/**
 * Presentational sub-components for the scorecard screen.
 *
 * Hoisted out of scorecard.tsx (was 1199 LOC) so each piece sits next to
 * its own styles. The main file keeps only screen-level orchestration:
 * state management, hole-order/sponsor/challenge map construction, layout,
 * and routing.
 *
 * All components below are pure — they read theme through useTheme() so
 * the call sites stay terse and parents don't have to thread theme through.
 */

import { useEffect, useRef } from 'react';
import {
  Animated, Linking, Modal, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { AdaptiveLogoFrame, useTheme } from '@gfp/ui';
import type { ThemeContextValue } from '@gfp/ui';
import type { ChallengeCacheDto, HoleCacheDto, SponsorCacheDto } from '@/lib/api';
import { formatToPar, toParColor } from '@/lib/toPar';

// ── HOLE INFO CHIP ────────────────────────────────────────────────────────────

export function HoleInfoChip({ label, value, toPar }: {
  label: string;
  value: string;
  /**
   * Strokes relative to par, rendered as a subscript beside the value the same
   * way ScoreChip does. Used by the Round total; omitted by Par/HCP/yardages,
   * which aren't scores.
   */
  toPar?: number | null;
}) {
  const theme = useTheme();
  const showToPar = toPar !== undefined;

  return (
    <View style={[infoChipStyles.chip, { backgroundColor: theme.colors.surface }]}>
      <Text style={[infoChipStyles.label, { color: theme.mutedText }]}>{label}</Text>
      <View style={infoChipStyles.valueRow}>
        <Text style={[infoChipStyles.value, { color: theme.colors.primary }]}>{value}</Text>
        {showToPar && (
          <Text style={[infoChipStyles.rel, { color: toParColor(toPar ?? null, theme.mutedText) }]}>
            {formatToPar(toPar ?? null)}
          </Text>
        )}
      </View>
    </View>
  );
}

const infoChipStyles = StyleSheet.create({
  chip:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  label:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  value:    { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  rel:      { fontSize: 11, fontWeight: '700', marginLeft: 3, lineHeight: 15 },
});

// ── SCORE CHIP ────────────────────────────────────────────────────────────────

export function ScoreChip({ grossScore, par }: { grossScore: number | null; par: number }) {
  const theme = useTheme();
  const rel      = grossScore !== null ? grossScore - par : null;
  const relLabel = formatToPar(rel);
  const relColor = toParColor(rel, theme.mutedText);

  return (
    <View style={[scoreChipStyles.chip, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '40' }]}>
      <Text style={[scoreChipStyles.label, { color: theme.mutedText }]}>Score</Text>
      {/* To-par rides beside the number on its baseline, the way a scoreboard
          reads it — and one line shorter than stacking it underneath. */}
      <View style={scoreChipStyles.valueRow}>
        <Text style={[scoreChipStyles.value, { color: theme.colors.primary }]}>
          {grossScore !== null ? grossScore : '—'}
        </Text>
        <Text style={[scoreChipStyles.rel, { color: relColor }]}>{relLabel}</Text>
      </View>
    </View>
  );
}

const scoreChipStyles = StyleSheet.create({
  chip:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  value:    { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  rel:      { fontSize: 13, fontWeight: '700', marginLeft: 3, lineHeight: 18 },
});

// ── HOLE-IN-ONE CELEBRATION MODAL ────────────────────────────────────────────

export function HoleInOneModal({ visible, holeName, onDismiss }: {
  visible:   boolean;
  holeName:  string;
  onDismiss: () => void;
}) {
  const scale   = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 18 }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.3);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Pressable style={hioStyles.backdrop} onPress={onDismiss} accessibilityLabel="Dismiss" accessibilityRole="button">
        <Animated.View style={[hioStyles.card, { opacity, transform: [{ scale }] }]}>
          <Text style={hioStyles.emoji}>⛳</Text>
          <Text style={hioStyles.headline}>HOLE IN ONE!</Text>
          <Text style={hioStyles.sub}>{holeName}</Text>
          <Text style={hioStyles.hint}>Tap anywhere to dismiss</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const hioStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a2e', borderRadius: 24, padding: 40,
    alignItems: 'center', marginHorizontal: 32,
    borderWidth: 3, borderColor: '#f1c40f',
    boxShadow: '0px 0px 20px rgba(241, 196, 15, 0.6)', elevation: 20,
  },
  emoji:    { fontSize: 64, marginBottom: 12 },
  headline: { fontSize: 34, fontWeight: '900', color: '#f1c40f', letterSpacing: 2, textAlign: 'center' },
  sub:      { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 8, textAlign: 'center' },
  hint:     { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 20 },
});

// ── CHALLENGE DETAIL MODAL ────────────────────────────────────────────────────

const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  ClosestToPin: '📍 Closest to the Pin',
  LongestDrive: '💨 Longest Drive',
  LongestPutt:  '⛳ Longest Putt',
  KP:           '🎯 KP Challenge',
  HoleInOne:    '🎰 Hole in One',
};

export function ChallengeDetailModal({
  challenge,
  onDismiss,
}: {
  challenge: ChallengeCacheDto | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  if (!challenge) return null;

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={chalModalStyles.backdrop}>
        {/* Dismiss layer behind the card — a sibling, not a parent, so the
            card's buttons aren't nested inside another Pressable (invalid
            <button>-in-<button> on web). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Close challenge detail"
          accessibilityRole="button"
        />
        <View style={[chalModalStyles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={[chalModalStyles.header, { backgroundColor: theme.colors.primary }]}>
            <Text style={chalModalStyles.headerText}>
              {challenge.holeNumber != null
                ? `Hole ${challenge.holeNumber} Challenge`
                : 'Event Challenge'}
            </Text>
          </View>
          <View style={chalModalStyles.body}>
            {challenge.challengeType ? (
              <Text style={[chalModalStyles.typeLabel, { color: theme.mutedText }]}>
                {CHALLENGE_TYPE_LABELS[challenge.challengeType] ?? challenge.challengeType}
              </Text>
            ) : null}
            <Text style={[chalModalStyles.description, { color: theme.colors.primary }]}>
              {challenge.description}
            </Text>
            {challenge.prizeDescription ? (
              <View style={[chalModalStyles.prizeBox, { backgroundColor: '#fffbf0', borderColor: '#f39c12' }]}>
                <Text style={chalModalStyles.prizeLabel}>🏆 Prize</Text>
                <Text style={chalModalStyles.prizeText}>{challenge.prizeDescription}</Text>
              </View>
            ) : null}
            {challenge.sponsorName ? (
              <Text style={[chalModalStyles.sponsorText, { color: theme.mutedText }]}>
                Presented by {challenge.sponsorName}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={[chalModalStyles.closeBtn, { backgroundColor: theme.colors.primary }]}
            onPress={onDismiss}
            accessibilityRole="button"
          >
            <Text style={chalModalStyles.closeBtnText}>Got It</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const chalModalStyles = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header:       { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  headerText:   { color: '#fff', fontSize: 17, fontWeight: '800' },
  body:         { padding: 20, gap: 10 },
  typeLabel:    { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  description:  { fontSize: 16, lineHeight: 24 },
  prizeBox:     { borderWidth: 1, borderRadius: 10, padding: 12 },
  prizeLabel:   { fontSize: 12, fontWeight: '700', color: '#b7770d', marginBottom: 4 },
  prizeText:    { fontSize: 14, color: '#7d6608', lineHeight: 20 },
  sponsorText:  { fontSize: 13, textAlign: 'center' },
  closeBtn:     { margin: 20, marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── HOLE INFO MODAL ───────────────────────────────────────────────────────────

/**
 * Par, handicap and every tee yardage for one hole.
 *
 * Shown when the chips row can't fit them inline — a course carrying
 * white/blue/red yardages plus the round totals is eight chips, which wraps to a
 * second row and overruns the scorecard's vertical budget (see lib/chipsFit.ts).
 * Collapsing them behind a "Hole N" button keeps the row to one line without
 * dropping any information.
 */
export function HoleInfoModal({ hole, onDismiss }: {
  hole:      HoleCacheDto | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  if (!hole) return null;

  const rows: { label: string; value: string }[] = [
    { label: 'Par', value: String(hole.par) },
    { label: 'Handicap', value: String(hole.handicapIndex) },
  ];
  if (hole.yardageWhite != null) rows.push({ label: 'White tees', value: `${hole.yardageWhite} yds` });
  if (hole.yardageBlue  != null) rows.push({ label: 'Blue tees',  value: `${hole.yardageBlue} yds` });
  if (hole.yardageRed   != null) rows.push({ label: 'Red tees',   value: `${hole.yardageRed} yds` });

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onDismiss}>
      <View style={holeInfoStyles.backdrop}>
        {/* Dismiss layer as a sibling, not a parent — same reason as the
            challenge modal: nesting the close button inside another Pressable
            is an invalid <button>-in-<button> on web. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Close hole detail"
          accessibilityRole="button"
        />
        <View style={[holeInfoStyles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={[holeInfoStyles.header, { backgroundColor: theme.colors.primary }]}>
            <Text style={[holeInfoStyles.headerText, { color: theme.buttonLabel }]}>
              Hole {hole.holeNumber}
            </Text>
          </View>

          <View style={holeInfoStyles.body}>
            {rows.map((r, i) => (
              <View
                key={r.label}
                style={[
                  holeInfoStyles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.accent + '33' },
                ]}
              >
                <Text style={[holeInfoStyles.rowLabel, { color: theme.mutedText }]}>{r.label}</Text>
                <Text style={[holeInfoStyles.rowValue, { color: theme.colors.primary }]}>{r.value}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={[holeInfoStyles.closeBtn, { backgroundColor: theme.colors.primary }]}
            onPress={onDismiss}
            accessibilityRole="button"
          >
            <Text style={[holeInfoStyles.closeBtnText, { color: theme.buttonLabel }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const holeInfoStyles = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header:       { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  headerText:   { fontSize: 17, fontWeight: '800' },
  body:         { paddingHorizontal: 20, paddingVertical: 6 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  rowLabel:     { fontSize: 14, fontWeight: '600' },
  rowValue:     { fontSize: 16, fontWeight: '800' },
  closeBtn:     { margin: 20, marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { fontSize: 16, fontWeight: '700' },
});

// ── SPONSOR MODAL ────────────────────────────────────────────────────────────

export function SponsorModal({
  sponsor,
  onDismiss,
}: {
  sponsor:   SponsorCacheDto | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();

  if (!sponsor) return null;

  function openWebsite() {
    if (sponsor!.websiteUrl) Linking.openURL(sponsor!.websiteUrl);
  }

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={sponModalStyles.backdrop}>
        {/*
          Full-screen dismiss layer rendered as a sibling *behind* the card —
          not a parent of it. The card's own buttons must not be nested inside
          another Pressable, since RN-web renders Pressable as <button> and a
          <button> inside a <button> is invalid DOM.
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Close sponsor info"
          accessibilityRole="button"
        />
        {/*
          Two-layer approach:
          • cardShell  — outer View owns the visible border + shadow (not clipped)
          • card       — inner View uses overflow:hidden to clip the header bg
                         neatly to the top rounded corners
        */}
        <View
          style={[
            sponModalStyles.cardShell,
            {
              borderColor: theme.colors.primary,
              boxShadow: `0px -6px 14px ${theme.colors.primary}73`,
            },
          ]}
        >
          <View style={[sponModalStyles.card, { backgroundColor: '#ffffff' }]}>
            {/* Header */}
            <View style={[sponModalStyles.header, { backgroundColor: theme.colors.primary }]}>
              <Text style={sponModalStyles.headerText}>🤝 Hole Sponsor</Text>
            </View>

            <View style={sponModalStyles.body}>
              {/* Logo or name — AdaptiveLogoFrame picks bg colour automatically */}
              {sponsor.logoUrl ? (
                <AdaptiveLogoFrame
                  uri={sponsor.logoUrl}
                  width={200} height={70}
                  primaryColor={theme.colors.primary}
                  borderColor={theme.colors.primary}
                  borderWidth={2}
                  borderRadius={12}
                  padding={12}
                  accessibilityLabel={`${sponsor.name} logo`}
                />
              ) : (
                <Text style={[sponModalStyles.sponsorName, { color: theme.colors.primary }]}>
                  {sponsor.name}
                </Text>
              )}

              {/* Tagline — always on white card body, so always primary */}
              {sponsor.tagline ? (
                <Text style={[sponModalStyles.tagline, { color: theme.colors.primary }]}>
                  {sponsor.tagline}
                </Text>
              ) : null}

              {/* Thank-you statement */}
              <Text style={sponModalStyles.thankYou}>
                Thank you to{' '}
                <Text style={{ fontWeight: '800' }}>{sponsor.name}</Text>
                {' '}for generously sponsoring this hole and supporting our event!
              </Text>

              {/* Website button — only shown when a URL is set */}
              {sponsor.websiteUrl ? (
                <Pressable
                  onPress={openWebsite}
                  style={({ pressed }) => [
                    sponModalStyles.websiteBtn,
                    { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 },
                  ]}
                  accessibilityRole="link"
                  accessibilityLabel={`Visit ${sponsor.name} website`}
                >
                  <Text style={sponModalStyles.websiteBtnText}>
                    Visit {sponsor.name} →
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Close */}
            <Pressable
              style={[sponModalStyles.closeBtn, { backgroundColor: theme.colors.primary }]}
              onPress={onDismiss}
              accessibilityRole="button"
            >
              <Text style={sponModalStyles.closeBtnText}>Got It</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const sponModalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.80)', justifyContent: 'flex-end' },

  // cardShell — outer wrapper that owns the visible 3 px border and drop shadow.
  // Must NOT have overflow:hidden so the border is fully painted.
  cardShell: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 3,
    borderBottomWidth: 0,
    // boxShadow is set inline — its colour comes from the event theme.
    elevation: 18,
  },

  // card — inner View with overflow:hidden so the coloured header is
  // clipped cleanly to the rounded top corners. Slightly smaller radius so
  // it sits flush inside the shell border.
  card: {
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    overflow: 'hidden',
  },

  header:     { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  headerText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  body:       { padding: 24, alignItems: 'center', gap: 14 },

  sponsorName: { fontSize: 22, fontWeight: '800', textAlign: 'center' },

  // Tagline under logo — uses primary for max readability on white
  tagline: {
    fontSize: 15,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 21,
  },
  thankYou:   { fontSize: 15, color: '#222', textAlign: 'center', lineHeight: 22 },
  websiteBtn: {
    paddingVertical: 12, paddingHorizontal: 28,
    borderRadius: 10, alignItems: 'center', marginTop: 4,
  },
  websiteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  closeBtn:   { marginHorizontal: 20, marginBottom: 24, marginTop: 4, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── SHOT COUNTER COLUMN ───────────────────────────────────────────────────────

/**
 * Sizes come from useScorecardLayout so the column can tighten on short screens.
 * Defaults reproduce the original fixed layout, so callers that don't measure
 * anything are unaffected. `button` is never below 44 — see scorecardLayout.ts.
 */
export interface ShotColumnSize {
  button:    number;
  gap:       number;
  labelFont: number;
  valueFont: number;
}

const DEFAULT_SHOT_SIZE: ShotColumnSize = {
  button: 44, gap: 6, labelFont: 11, valueFont: 28,
};

export function ShotColumn({
  label, value, onDecrement, onIncrement, disabled, theme, size = DEFAULT_SHOT_SIZE,
  showLabel = true,
}: {
  label:       string;
  value:       number;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled:    boolean;
  theme:       ThemeContextValue;
  size?:       ShotColumnSize;
  /**
   * When false the caller renders one shared header row of labels above all the
   * golfers instead of repeating them per player — the same information for
   * ~16px per golfer less, which is what lets a foursome stay expanded.
   */
  showLabel?:  boolean;
}) {
  const btnStyle = {
    width: size.button, height: size.button, borderRadius: size.button / 2,
  };
  const btnTextStyle = { fontSize: Math.round(size.button * 0.55), lineHeight: Math.round(size.button * 0.64) };

  return (
    <View style={[shotColStyles.col, { gap: size.gap }]}>
      {showLabel && (
        <Text style={[shotColStyles.label, { color: theme.mutedText, fontSize: size.labelFont }]}>{label}</Text>
      )}
      <Pressable
        onPress={onIncrement}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          shotColStyles.btn,
          btnStyle,
          { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
          disabled && shotColStyles.btnDisabled,
        ]}
        accessibilityLabel={`Increase ${label}`}
        accessibilityRole="button"
      >
        <Text style={[shotColStyles.btnText, btnTextStyle]}>+</Text>
      </Pressable>
      <Text style={[
        shotColStyles.value,
        { color: theme.colors.primary, fontSize: size.valueFont, lineHeight: Math.round(size.valueFont * 1.15) },
      ]}>
        {value > 0 ? value : '—'}
      </Text>
      <Pressable
        onPress={onDecrement}
        disabled={disabled || value <= 0}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          shotColStyles.btn,
          btnStyle,
          { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
          (disabled || value <= 0) && shotColStyles.btnDisabled,
        ]}
        accessibilityLabel={`Decrease ${label}`}
        accessibilityRole="button"
      >
        <Text style={[shotColStyles.btnText, btnTextStyle]}>−</Text>
      </Pressable>
    </View>
  );
}

const shotColStyles = StyleSheet.create({
  // Dimensions that adapt live in ShotColumnSize; what stays here is the part
  // that never varies with density.
  col:        { alignItems: 'center', flex: 1 },
  label:      { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  btn:        { alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.3 },
  btnText:    { fontWeight: '300', color: '#fff' },
  value:      { fontWeight: '800', minWidth: 36, textAlign: 'center' },
});
