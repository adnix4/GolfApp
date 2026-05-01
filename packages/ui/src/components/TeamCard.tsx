/**
 * TeamCard — Player Roster, Starting Hole, Tee Time, Check-In Status
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a team's complete information card used on:
 *   • Admin Registration Panel (team list with check-in controls)
 *   • Free Agent Board (team cards on the right side of the kanban)
 *   • Check-In Screen (team expanded view after QR scan)
 *
 * RULE: No Platform.OS checks.  StyleSheet.create() only.
 *
 * NOTE: This is the foundational structure.  Phase 1 implementation will
 * flesh out the full check-in interaction and invite link controls.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TeamDTO } from '@gfp/shared-types';
import { useTheme } from './ThemeProvider';

interface TeamCardProps {
  team: TeamDTO;
  /** If true, shows the QR scan button for individual player check-in */
  showCheckIn?: boolean;
}

export function TeamCard({ team, showCheckIn: _showCheckIn = false }: TeamCardProps) {
  const theme = useTheme();

  /**
   * checkInColor — reflects the team's overall check-in progress.
   *   complete    → green (all players scanned)
   *   checked_in  → amber (some players scanned)
   *   pending     → grey  (no one has scanned yet)
   */
  const checkInColor =
    team.checkInStatus === 'complete'    ? '#27ae60' :
    team.checkInStatus === 'checked_in'  ? '#f39c12' :
                                           '#95a5a6';

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent }]}>
      {/* ── TEAM HEADER ── */}
      <View style={styles.header}>
        <Text style={[styles.teamName, { color: theme.colors.primary }]} numberOfLines={1}>
          {team.name}
        </Text>
        {/* Check-in status dot */}
        <View style={[styles.statusDot, { backgroundColor: checkInColor }]} />
      </View>

      {/* ── START INFO ── */}
      <View style={styles.startInfo}>
        {team.startingHole && (
          <Text style={[styles.infoText, { color: theme.colors.action }]}>
            Hole {team.startingHole}
          </Text>
        )}
        {team.teeTime && (
          <Text style={[styles.infoText, { color: theme.colors.action }]}>
            {new Date(team.teeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        <Text style={[styles.infoText, { color: theme.colors.accent }]}>
          {team.players.length}/{team.maxPlayers} players
        </Text>
      </View>

      {/* ── PLAYER LIST ── */}
      {team.players.map((player) => (
        <View key={player.id} style={styles.playerRow}>
          <Text style={[styles.playerName, { color: theme.colors.primary }]}>
            {player.firstName} {player.lastName}
          </Text>
          <View style={[
            styles.playerStatus,
            { backgroundColor: player.checkInStatus === 'checked_in' ? '#eafaf1' : '#f8f9fa' }
          ]}>
            <Text style={{ fontSize: 11, color: player.checkInStatus === 'checked_in' ? '#27ae60' : '#95a5a6' }}>
              {player.checkInStatus === 'checked_in' ? '✓ In' : 'Pending'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamName: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 8,
  },
  startInfo: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eeeeee',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '500',
  },
  playerStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
});
