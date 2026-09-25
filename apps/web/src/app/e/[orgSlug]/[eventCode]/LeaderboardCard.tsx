import { s } from './eventPageStyles';
import type { PublicIndividualEntry, PublicLeaderboard } from '@/lib/api';

/**
 * Section wrapping the public leaderboard table.
 *
 * Renders three flavors:
 * - `showLeaderboard=false` → "coming soon" placeholder card
 * - `showLeaderboard=true` with empty standings → "No scores submitted yet."
 * - otherwise → the LeaderboardTable
 *
 * The Watch Live link shows for active/scoring, the Final badge for completed.
 */
export default function LeaderboardCard({
  showLeaderboard,
  leaderboard,
  status,
  orgSlug,
  eventCode,
}: {
  showLeaderboard: boolean;
  leaderboard:     PublicLeaderboard | null;
  status:          string;
  orgSlug:         string;
  eventCode:       string;
}) {
  if (!showLeaderboard) {
    return (
      <section style={{ ...s.card, textAlign: 'center', padding: '2.5rem' }}>
        <p style={{ fontSize: '2rem' }}>🏆</p>
        <h2 style={{ ...s.cardTitle, marginTop: '0.5rem' }}>Leaderboard</h2>
        <p style={s.placeholder}>Scores will appear here once the tournament begins.</p>
      </section>
    );
  }

  return (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <h2 style={s.cardTitle}>Leaderboard</h2>
        <div style={s.cardHeaderRight}>
          {status === 'completed' && (
            <span style={s.completedBadge}>Final</span>
          )}
          {['active', 'scoring'].includes(status) && (
            <a href={`/e/${orgSlug}/${eventCode}/scores`} style={s.liveLink}>
              Watch Live →
            </a>
          )}
        </div>
      </div>
      {leaderboard && leaderboard.standings.length > 0 ? (
        // Stroke Play is individual (Rule 3.3, U8): the golfers are the board.
        leaderboard.format === 'Stroke' && leaderboard.individuals
          ? <GolferTable golfers={leaderboard.individuals} />
          : <LeaderboardTable leaderboard={leaderboard} />
      ) : (
        <p style={s.placeholder}>No scores submitted yet.</p>
      )}
    </section>
  );
}

function fmtToPar(toPar: number): string {
  return toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function toParColor(toPar: number): string {
  return toPar < 0 ? '#27ae60' : toPar > 0 ? '#e74c3c' : 'var(--color-primary)';
}

function GolferTable({ golfers }: { golfers: PublicIndividualEntry[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.table}>
        <thead>
          <tr style={{ backgroundColor: 'var(--color-highlight)' }}>
            <th style={{ ...s.th, width: 40, textAlign: 'center' }}>#</th>
            <th style={{ ...s.th, textAlign: 'left' }}>Golfer</th>
            <th style={{ ...s.th, textAlign: 'left' }}>Team</th>
            <th style={{ ...s.th, width: 70, textAlign: 'right' }}>To Par</th>
            <th style={{ ...s.th, width: 60, textAlign: 'right' }}>Back</th>
            <th style={{ ...s.th, width: 60, textAlign: 'right' }}>Thru</th>
          </tr>
        </thead>
        <tbody>
          {golfers.map((g, i) => {
            const scored = g.holesComplete > 0;
            return (
              <tr key={g.playerId} style={{ borderBottom: '1px solid #eee', backgroundColor: i % 2 === 0 ? '#fff' : 'var(--color-surface)' }}>
                <td style={{ ...s.td, textAlign: 'center', fontWeight: 700 }}>{g.rank || '—'}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{g.playerName}</td>
                <td style={{ ...s.td, color: '#4b5563' }}>{g.teamName}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: toParColor(g.toPar) }}>{scored ? fmtToPar(g.toPar) : '—'}</td>
                <td style={{ ...s.td, textAlign: 'right', color: 'var(--color-primary)' }}>{!scored || g.strokesBack === 0 ? '—' : g.strokesBack}</td>
                <td style={{ ...s.td, textAlign: 'right', color: '#4b5563' }}>{!scored ? '—' : g.isComplete ? 'F' : g.holesComplete}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardTable({ leaderboard }: { leaderboard: PublicLeaderboard }) {
  // Stableford ranks on points, scored per golfer and summed (U8).
  const stableford = leaderboard.format === 'Stableford';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.table}>
        <thead>
          <tr style={{ backgroundColor: 'var(--color-highlight)' }}>
            <th style={{ ...s.th, width: 40, textAlign: 'center' }}>#</th>
            <th style={{ ...s.th, textAlign: 'left' }}>Team</th>
            <th style={{ ...s.th, width: 70, textAlign: 'right' }}>{stableford ? 'Points' : 'To Par'}</th>
            <th style={{ ...s.th, width: 60, textAlign: 'right' }}>Back</th>
            <th style={{ ...s.th, width: 70, textAlign: 'right' }}>Best Hole</th>
            <th style={{ ...s.th, width: 70, textAlign: 'right' }}>Best Score</th>
            <th style={{ ...s.th, width: 60, textAlign: 'right' }}>Thru</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.standings.map((entry, i) => {
            const toParLabel = stableford ? String(entry.stablefordPoints) : fmtToPar(entry.toPar);
            const scoreColor = stableford ? 'var(--color-primary)' : toParColor(entry.toPar);
            const thru = entry.isComplete ? 'F' : String(entry.holesComplete);
            const back = entry.holesComplete === 0 || entry.strokesBack === 0 ? '—' : String(entry.strokesBack);
            const bestHole = entry.bestHole == null ? '—' : String(entry.bestHole);
            const bestScore = entry.bestHoleScore == null ? '—' : String(entry.bestHoleScore);
            return (
              <tr key={i} style={{ borderBottom: '1px solid #eee', backgroundColor: i % 2 === 0 ? '#fff' : 'var(--color-surface)' }}>
                <td style={{ ...s.td, textAlign: 'center', fontWeight: 700 }}>{entry.rank}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{entry.teamName}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: scoreColor }}>{toParLabel}</td>
                <td style={{ ...s.td, textAlign: 'right', color: 'var(--color-primary)' }}>{back}</td>
                <td style={{ ...s.td, textAlign: 'right', color: 'var(--color-primary)' }}>{bestHole}</td>
                <td style={{ ...s.td, textAlign: 'right', color: 'var(--color-primary)' }}>{bestScore}</td>
                <td style={{ ...s.td, textAlign: 'right', color: '#4b5563' }}>{thru}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
