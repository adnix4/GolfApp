import { getDb } from './db';
import type { JoinEventResponse, PendingScore } from './api';

const DEVICE_KEY  = 'gfp:deviceId';
const SESSION_KEY = 'gfp:session';

// ── Device ID ──────────────────────────────────────────────────────────────

export async function getDeviceId(): Promise<string> {
  const db  = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM event_cache WHERE key = ?', [DEVICE_KEY],
  );
  if (row) return row.value;
  const id = `mob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.runAsync(
    'INSERT INTO event_cache (key, value) VALUES (?, ?)', [DEVICE_KEY, id],
  );
  return id;
}

// ── Session ────────────────────────────────────────────────────────────────

export async function saveSession(data: JoinEventResponse): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO event_cache (key, value) VALUES (?, ?)',
    [SESSION_KEY, JSON.stringify(data)],
  );
}

export async function loadSession(): Promise<JoinEventResponse | null> {
  const db  = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM event_cache WHERE key = ?', [SESSION_KEY],
  );
  return row ? JSON.parse(row.value) : null;
}

export async function clearSession(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM event_cache WHERE key = ?', [SESSION_KEY]);
}

// ── Pending Scores ─────────────────────────────────────────────────────────

// One row per hole per team — id is deterministic so INSERT OR REPLACE is
// always a clean upsert without manual delete logic.
export async function upsertPendingScore(
  eventId: string,
  teamId:  string,
  score:   PendingScore,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO pending_scores
       (id, event_id, team_id, hole_number, gross_score, putts,
        player_shots, created_at, synced_at, sync_attempts, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)`,
    [
      `${teamId}:${score.holeNumber}`,
      eventId,
      teamId,
      score.holeNumber,
      score.grossScore,
      score.putts ?? null,
      score.playerShots && Object.keys(score.playerShots).length > 0
        ? JSON.stringify(score.playerShots)
        : null,
      new Date(score.clientTimestampMs).toISOString(),
    ],
  );
}

export async function loadPendingScores(
  eventId: string,
  teamId:  string,
): Promise<PendingScore[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<{
    hole_number:  number;
    gross_score:  number;
    putts:        number | null;
    player_shots: string | null;
    created_at:   string;
    conflict:     number | null;
  }>(
    `SELECT hole_number, gross_score, putts, player_shots, created_at, conflict
       FROM pending_scores
      WHERE event_id = ? AND team_id = ?
      ORDER BY hole_number`,
    [eventId, teamId],
  );
  return rows.map(r => ({
    holeNumber:        r.hole_number,
    grossScore:        r.gross_score,
    putts:             r.putts,
    playerShots:       r.player_shots ? JSON.parse(r.player_shots) : undefined,
    clientTimestampMs: new Date(r.created_at).getTime(),
    conflict:          r.conflict === 1,
  }));
}

// Returns only scores not yet confirmed by the server (synced_at IS NULL).
// Used by the background sync task to avoid re-sending already-accepted holes.
export async function loadUnsyncedScores(
  eventId: string,
  teamId:  string,
): Promise<PendingScore[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<{
    hole_number:  number;
    gross_score:  number;
    putts:        number | null;
    player_shots: string | null;
    created_at:   string;
  }>(
    `SELECT hole_number, gross_score, putts, player_shots, created_at
       FROM pending_scores
      WHERE event_id = ? AND team_id = ? AND completed_at IS NOT NULL AND synced_at IS NULL
      ORDER BY hole_number`,
    [eventId, teamId],
  );
  return rows.map(r => ({
    holeNumber:        r.hole_number,
    grossScore:        r.gross_score,
    putts:             r.putts,
    playerShots:       r.player_shots ? JSON.parse(r.player_shots) : undefined,
    clientTimestampMs: new Date(r.created_at).getTime(),
  }));
}

// Increments sync_attempts on all unsynced rows — used by background task
// to track total retry count per hole (visible in debug/support queries).
export async function incrementSyncAttempts(
  eventId: string,
  teamId:  string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE pending_scores
        SET sync_attempts = sync_attempts + 1
      WHERE event_id = ? AND team_id = ? AND completed_at IS NOT NULL AND synced_at IS NULL`,
    [eventId, teamId],
  );
}

// Marks a single hole as complete, making it eligible for sync and leaderboard release.
export async function markHoleComplete(
  eventId:    string,
  teamId:     string,
  holeNumber: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE pending_scores SET completed_at = ?
      WHERE event_id = ? AND team_id = ? AND hole_number = ?`,
    [new Date().toISOString(), eventId, teamId, holeNumber],
  );
}

// Returns hole numbers that have been marked complete (regardless of sync state).
export async function loadCompletedHoleNumbers(
  eventId: string,
  teamId:  string,
): Promise<number[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<{ hole_number: number }>(
    `SELECT hole_number FROM pending_scores
      WHERE event_id = ? AND team_id = ? AND completed_at IS NOT NULL
      ORDER BY hole_number`,
    [eventId, teamId],
  );
  return rows.map(r => r.hole_number);
}

// Called after a successful batch sync so the background task (1D) knows
// which holes have already been confirmed by the server.
export async function markScoresSynced(
  eventId: string,
  teamId:  string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE pending_scores SET synced_at = ?
      WHERE event_id = ? AND team_id = ?`,
    [new Date().toISOString(), eventId, teamId],
  );
}

// Merges authoritative server scores (admin corrections / resolved conflicts)
// into the local pending_scores table.
//
// Reconciliation rule: a hole with an unsynced local edit (synced_at IS NULL)
// is left untouched so the golfer never loses a score they just entered — the
// push sync sends it up and the server's conflict detection takes over. Every
// other hole adopts the server's value, marked synced + completed, with the
// conflict flag tracking whether the golfer's proposed value awaits approval.
// Returns true when at least one local row changed (so callers can refresh UI).
export async function mergeServerScores(
  eventId: string,
  teamId:  string,
  holes:   { holeNumber: number; grossScore: number; putts: number | null; isConflicted: boolean }[],
): Promise<boolean> {
  const db = await getDb();
  let changed = false;

  for (const h of holes) {
    const id = `${teamId}:${h.holeNumber}`;
    const existing = await db.getFirstAsync<{
      gross_score: number;
      conflict:    number | null;
      synced_at:   string | null;
    }>(
      'SELECT gross_score, conflict, synced_at FROM pending_scores WHERE id = ?',
      [id],
    );

    // Protect an unpushed local edit — keep the golfer's value.
    if (existing && existing.synced_at === null) continue;

    const newConflict = h.isConflicted ? 1 : 0;
    // Already in sync — nothing to write.
    if (existing && existing.gross_score === h.grossScore && (existing.conflict ?? 0) === newConflict) {
      continue;
    }

    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO pending_scores
         (id, event_id, team_id, hole_number, gross_score, putts,
          drive_shots, approach_shots, player_shots,
          created_at, synced_at, sync_attempts, completed_at, conflict)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 0, ?, ?)`,
      [id, eventId, teamId, h.holeNumber, h.grossScore, h.putts ?? null, now, now, now, newConflict],
    );
    changed = true;
  }

  return changed;
}

export async function clearPendingScores(
  eventId: string,
  teamId:  string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM pending_scores WHERE event_id = ? AND team_id = ?',
    [eventId, teamId],
  );
}
