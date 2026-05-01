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
       (id, event_id, team_id, hole_number, gross_score, putts, player_shots,
        created_at, synced_at, sync_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
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
  }>(
    `SELECT hole_number, gross_score, putts, player_shots, created_at
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
      WHERE event_id = ? AND team_id = ? AND synced_at IS NULL
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
      WHERE event_id = ? AND team_id = ? AND synced_at IS NULL`,
    [eventId, teamId],
  );
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
