/**
 * SponsorBanner — Sponsor Logo + Tier Badge Display
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a sponsor's logo and tier badge.  Used in:
 *   • Score entry screens (hole sponsor shown while entering scores for that hole)
 *   • Public leaderboard (sponsor strip between leaderboard sections)
 *   • Admin dashboard sponsor panel (preview of how sponsor appears)
 *
 * SPONSOR TIER DISPLAY SIZES (spec placement tiers):
 *   title  — largest, full-width banner
 *   gold   — prominent row
 *   hole   — compact inline badge
 *   silver — medium row
 *   bronze — small footer listing
 *
 * RULE: No Platform.OS checks.  StyleSheet.create() only.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { SponsorDTO } from '@gfp/shared-types';
import { useTheme } from './ThemeProvider';

interface SponsorBannerProps {
  sponsor: SponsorDTO;
  /**
   * variant — controls the visual weight of the banner.
   *   'full'    → wide banner with logo + tagline (for title/gold sponsors)
   *   'compact' → small inline badge (for hole sponsors on score entry screen)
   */
  variant?: 'full' | 'compact';
}

export function SponsorBanner({ sponsor, variant = 'full' }: SponsorBannerProps) {
  const theme = useTheme();

  /**
   * tierLabel — human-readable tier name for accessibility and display.
   * Maps from the DB enum value to a display string.
   */
  const tierLabel: Record<SponsorDTO['tier'], string> = {
    title:  'Presenting Sponsor',
    gold:   'Gold Sponsor',
    hole:   'Hole Sponsor',
    silver: 'Silver Sponsor',
    bronze: 'Bronze Sponsor',
  };

  if (variant === 'compact') {
    return (
      <View style={[styles.compactContainer, { backgroundColor: theme.colors.accent }]}>
        {sponsor.logoUrl ? (
          <Image
            source={{ uri: sponsor.logoUrl }}
            style={styles.compactLogo}
            resizeMode="contain"
            accessibilityLabel={`${sponsor.name} — ${tierLabel[sponsor.tier]}`}
          />
        ) : (
          <Text style={[styles.compactText, { color: theme.colors.surface }]}>
            {sponsor.name}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View
      style={[styles.fullContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.highlight }]}
      accessibilityLabel={`${tierLabel[sponsor.tier]}: ${sponsor.name}${sponsor.tagline ? '. ' + sponsor.tagline : ''}`}
    >
      {/* Tier badge in top-right corner */}
      <View style={[styles.tierBadge, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.tierText, { color: theme.colors.highlight }]}>
          {tierLabel[sponsor.tier]}
        </Text>
      </View>

      {/* Logo */}
      {sponsor.logoUrl ? (
        <Image
          source={{ uri: sponsor.logoUrl }}
          style={styles.fullLogo}
          resizeMode="contain"
          accessibilityLabel={sponsor.name}
        />
      ) : (
        <Text style={[styles.fallbackName, { color: theme.colors.primary }]}>
          {sponsor.name}
        </Text>
      )}

      {/* Tagline */}
      {sponsor.tagline && (
        <Text style={[styles.tagline, { color: theme.colors.accent }]} numberOfLines={2}>
          {sponsor.tagline}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Full variant
  fullContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginVertical: 8,
    position: 'relative',
  },
  tierBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fullLogo: {
    width: 160,
    height: 60,
    marginBottom: 10,
  },
  fallbackName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  tagline: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Compact variant
  compactContainer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactLogo: {
    width: 72,
    height: 24,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
