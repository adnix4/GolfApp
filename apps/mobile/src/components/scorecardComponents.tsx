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
  ActivityIndicator, Animated, Linking, Modal, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { AdaptiveLogoFrame, useTheme } from '@gfp/ui';
import type { ThemeContextValue } from '@gfp/ui';
import type { ChallengeCacheDto, SponsorCacheDto } from '@/lib/api';

// ── HOLE INFO CHIP ────────────────────────────────────────────────────────────

export function HoleInfoChip({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[infoChipStyles.chip, { backgroundColor: theme.colors.surface }]}>
      <Text style={[infoChipStyles.label, { color: theme.colors.accent }]}>{label}</Text>
      <Text style={[infoChipStyles.value, { color: theme.colors.primary }]}>{value}</Text>
    </View>
  );
}

const infoChipStyles = StyleSheet.create({
  chip:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '700', marginTop: 2 },
});

// ── SCORE CHIP ────────────────────────────────────────────────────────────────

export function ScoreChip({ grossScore, par }: { grossScore: number | null; par: number }) {
  const theme = useTheme();
  const rel   = grossScore !== null ? grossScore - par : null;
  const relLabel =
    rel === null ? '—' : rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `${rel}`;
  const relColor =
    rel === null ? theme.colors.accent :
    rel < 0      ? '#27ae60' :
    rel > 0      ? '#e74c3c' : theme.colors.accent;

  return (
    <View style={[scoreChipStyles.chip, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '40' }]}>
      <Text style={[scoreChipStyles.label, { color: theme.colors.accent }]}>Score</Text>
      <Text style={[scoreChipStyles.value, { color: theme.colors.primary }]}>
        {grossScore !== null ? grossScore : '—'}
      </Text>
      <Text style={[scoreChipStyles.rel, { color: relColor }]}>{relLabel}</Text>
    </View>
  );
}

const scoreChipStyles = StyleSheet.create({
  chip:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 22, fontWeight: '800', marginTop: 2, lineHeight: 26 },
  rel:   { fontSize: 13, fontWeight: '700', marginTop: 1 },
});

// ── SYNC STATUS BAR ───────────────────────────────────────────────────────────

/**
 * Takes `theme` as a prop instead of calling useTheme() — the main scorecard
 * screen already reads theme once and passing it through here keeps the
 * component compatible with the existing call site.
 */
export function SyncStatusBar({
  status, pendingCount, onSync, theme,
}: {
  status:       'idle' | 'syncing' | 'error' | 'synced';
  pendingCount: number;
  onSync:       () => void;
  theme:        ThemeContextValue;
}) {
  if (pendingCount === 0) return null;

  const label =
    status === 'syncing' ? 'Syncing…' :
    status === 'synced'  ? `${pendingCount} hole(s) synced` :
    status === 'error'   ? 'Sync failed — tap to retry' :
                           `${pendingCount} hole(s) saved locally`;

  const barColor =
    status === 'error'  ? '#fdf2f2' :
    status === 'synced' ? '#f0faf4' : '#fffbf0';

  const textColor =
    status === 'error'  ? '#c0392b' :
    status === 'synced' ? '#27ae60' : '#7d6608';

  return (
    <Pressable
      onPress={onSync}
      disabled={status === 'syncing'}
      style={[syncStyles.bar, { backgroundColor: barColor }]}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      {status === 'syncing'
        ? <ActivityIndicator size="small" color={theme.colors.primary} style={syncStyles.spinner} />
        : null}
      <Text style={[syncStyles.text, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const syncStyles = StyleSheet.create({
  bar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, marginTop: 12 },
  spinner: { marginRight: 8 },
  text:    { fontSize: 13, fontWeight: '600' },
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
              <Text style={[chalModalStyles.typeLabel, { color: theme.colors.accent }]}>
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
              <Text style={[chalModalStyles.sponsorText, { color: theme.colors.accent }]}>
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
              shadowColor: theme.colors.primary,
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
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
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

export function ShotColumn({
  label, value, onDecrement, onIncrement, disabled, theme,
}: {
  label:       string;
  value:       number;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled:    boolean;
  theme:       ThemeContextValue;
}) {
  return (
    <View style={shotColStyles.col}>
      <Text style={[shotColStyles.label, { color: theme.colors.accent }]}>{label}</Text>
      <Pressable
        onPress={onIncrement}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          shotColStyles.btn,
          { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
          disabled && shotColStyles.btnDisabled,
        ]}
        accessibilityLabel={`Increase ${label}`}
        accessibilityRole="button"
      >
        <Text style={shotColStyles.btnText}>+</Text>
      </Pressable>
      <Text style={[shotColStyles.value, { color: theme.colors.primary }]}>
        {value > 0 ? value : '—'}
      </Text>
      <Pressable
        onPress={onDecrement}
        disabled={disabled || value <= 0}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          shotColStyles.btn,
          { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
          (disabled || value <= 0) && shotColStyles.btnDisabled,
        ]}
        accessibilityLabel={`Decrease ${label}`}
        accessibilityRole="button"
      >
        <Text style={shotColStyles.btnText}>−</Text>
      </Pressable>
    </View>
  );
}

const shotColStyles = StyleSheet.create({
  col:        { alignItems: 'center', flex: 1, gap: 6 },
  label:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText:    { fontSize: 24, fontWeight: '300', color: '#fff', lineHeight: 28 },
  value:      { fontSize: 28, fontWeight: '800', lineHeight: 32, minWidth: 36, textAlign: 'center' },
});
