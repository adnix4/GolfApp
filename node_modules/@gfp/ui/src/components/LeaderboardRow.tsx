/**
 * LeaderboardRow — Team Standings Display Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays one row of the leaderboard: rank, team name, to-par score,
 * holes completed ("thru"), and an optional sponsor badge.
 *
 * USED BY:
 *   • apps/admin — admin-only leaderboard (Phase 1)
 *   • apps/web   — public Next.js leaderboard via react-native-web (Phase 2+)
 *   • apps/mobile — in-round leaderboard view (Phase 2+)
 *
 * RULE: No Platform.OS checks.  StyleSheet.create() only.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { LeaderboardEntryDTO } from '@gfp/shared-types';
import { useTheme } from './ThemeProvider';

// ── PROPS ─────────────────────────────────────────────────────────────────────

interface LeaderboardRowProps {
  entry: LeaderboardEntryDTO;
  /** Highlight this row — used when displaying the current user's team */
  isCurrentTeam?: boolean;
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export function LeaderboardRow({ entry, isCurrentTeam = false }: LeaderboardRowProps) {
  const theme = useTheme();

  /**
   * toParLabel — format the integer toPar value for display.
   *   -4  → "−4"  (under par, displayed in green)
   *    0  → "E"   (even par)
   *   +3  → "+3"  (over par, displayed in red)
   */
  const toParLabel =
    entry.toPar === 0
      ? 'E'
      : entry.toPar > 0
        ? `+${entry.toPar}`
        : `${entry.toPar}`;

  /**
   * toParColor — semantic color for score relative to par.
   * Under par = good = green.  Over par = red.  Even = neutral primary.
   */
  const toParColor =
    entry.toPar < 0
      ? '#27ae60'
      : entry.toPar > 0
        ? '#e74c3c'
        : theme.colors.primary;

  /**
   * thruLabel — how many holes the team has completed.
   * Shows "F" (finished) if all holes are done.
   */
  const thruLabel = entry.isComplete ? 'F' : `${entry.holesComplete}`;

  /**
   * Row background — highlighted (lime) for the current user's team,
   * alternating surface white otherwise.
   */
  const rowBackground = isCurrentTeam
    ? theme.colors.highlight
    : theme.colors.surface;

  return (
    <View
      style={[styles.row, { backgroundColor: rowBackground }]}
      accessibilityLabel={
        `Rank ${entry.rank}, ${entry.teamName}, ` +
        `${toParLabel === 'E' ? 'even par' : `${entry.toPar} to par`}, ` +
        `through ${entry.holesComplete} holes`
      }
      accessibilityRole="none"
    >
      {/* ── RANK ── */}
      <Text style={[styles.rank, { color: theme.colors.primary }]}>
        {entry.rank}
      </Text>

      {/* ── TEAM NAME + SPONSOR BADGE ── */}
      <View style={styles.teamNameWrapper}>
        <Text
          style={[styles.teamName, { color: theme.colors.primary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {entry.teamName}
        </Text>

        {/*
          * Sponsor badge — shown if this team's hole sponsor wants logo placement
          * on the leaderboard.  The SponsorBadgeDTO contains name + logoUrl.
          */}
        {entry.sponsorBadge && (
          <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
            {entry.sponsorBadge.logoUrl ? (
              <Image
                source={{ uri: entry.sponsorBadge.logoUrl }}
                style={styles.badgeLogo}
                accessibilityLabel={`Sponsored by ${entry.sponsorBadge.name}`}
              />
            ) : (
              <Text style={styles.badgeText} numberOfLines={1}>
                {entry.sponsorBadge.name}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── TO PAR ── */}
      <Text style={[styles.toPar, { color: toParColor }]}>
        {toParLabel}
      </Text>

      {/* ── THRU (holes completed) ── */}
      <Text style={[styles.thru, { color: theme.colors.accent }]}>
        {thruLabel}
      </Text>
    </View>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  rank: {
    width: 32,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  teamNameWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  teamName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    maxWidth: 80,
  },
  badgeLogo: {
    width: 48,
    height: 18,
    resizeMode: 'contain',
  },
  badgeText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
  },
  toPar: {
    width: 44,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  thru: {
    width: 36,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    marginLeft: 8,
  },
});
