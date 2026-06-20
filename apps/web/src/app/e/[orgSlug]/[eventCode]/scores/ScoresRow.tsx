'use client';

import { memo } from 'react';
import type { PublicLeaderboardEntry } from '@/lib/api';
import { tvRowStyles, tvCellStyles, nmRowStyles, nmCellStyles } from './scoresPollerStyles';

/**
 * One leaderboard row, memoized with a custom equality check on the fields
 * actually rendered.
 *
 * Why a custom comparator: SignalR broadcasts replace the full standings
 * array on every tick, so the entry prop is a fresh object reference even
 * when nothing changed. Default referential equality would never skip a
 * render. A field-level comparator lets most rows skip their render and
 * only the team that scored repaints.
 */

interface RowProps {
  entry:  PublicLeaderboardEntry;
  index:  number;
  tvMode: boolean;
}

const rowEqual = (a: RowProps, b: RowProps) =>
  a.tvMode              === b.tvMode &&
  a.index               === b.index &&
  a.entry.rank          === b.entry.rank &&
  a.entry.teamName      === b.entry.teamName &&
  a.entry.toPar         === b.entry.toPar &&
  a.entry.grossTotal    === b.entry.grossTotal &&
  a.entry.holesComplete === b.entry.holesComplete &&
  a.entry.isComplete    === b.entry.isComplete &&
  a.entry.strokesBack   === b.entry.strokesBack &&
  a.entry.bestHole      === b.entry.bestHole &&
  a.entry.bestHoleScore === b.entry.bestHoleScore;

export const ScoresRow = memo(function ScoresRow({ entry, index, tvMode }: RowProps) {
  const toParLabel = entry.toPar === 0 ? 'E' : entry.toPar > 0 ? `+${entry.toPar}` : `${entry.toPar}`;
  const toParColor = entry.toPar < 0
    ? (tvMode ? '#3fb950' : '#27ae60')
    : entry.toPar > 0
      ? (tvMode ? '#f85149' : '#e74c3c')
      : (tvMode ? '#e6edf3' : '#1a1a2e');
  const thru      = entry.isComplete ? 'F' : String(entry.holesComplete || '—');
  const back      = entry.holesComplete === 0 || entry.strokesBack === 0 ? '—' : String(entry.strokesBack);
  const bestHole  = entry.bestHole == null ? '—' : String(entry.bestHole);
  const bestScore = entry.bestHoleScore == null ? '—' : String(entry.bestHoleScore);

  if (tvMode) {
    const rowStyle = index % 2 === 0 ? tvRowStyles.even : tvRowStyles.odd;
    return (
      <tr style={rowStyle}>
        <td style={tvCellStyles.rank}>{entry.rank}</td>
        <td style={tvCellStyles.team}>{entry.teamName}</td>
        <td style={{ ...tvCellStyles.toParBase, color: toParColor }}>{toParLabel}</td>
        <td style={tvCellStyles.rightMuted}>{back}</td>
        <td style={tvCellStyles.rightMuted}>{bestHole}</td>
        <td style={tvCellStyles.rightMuted}>{bestScore}</td>
        <td style={tvCellStyles.rightMuted}>{entry.grossTotal || '—'}</td>
        <td style={tvCellStyles.rightMuted}>{thru}</td>
      </tr>
    );
  }

  const rowStyle = index % 2 === 0 ? nmRowStyles.even : nmRowStyles.odd;
  return (
    <tr style={rowStyle}>
      <td style={nmCellStyles.rank}>{entry.rank}</td>
      <td style={nmCellStyles.team}>{entry.teamName}</td>
      <td style={{ ...nmCellStyles.toParBase, color: toParColor }}>{toParLabel}</td>
      <td style={nmCellStyles.rightMuted}>{back}</td>
      <td style={nmCellStyles.rightMuted}>{bestHole}</td>
      <td style={nmCellStyles.rightMuted}>{bestScore}</td>
      <td style={nmCellStyles.rightMuted}>{entry.grossTotal || '—'}</td>
      <td style={nmCellStyles.rightMutedAlt}>{thru}</td>
    </tr>
  );
}, rowEqual);
