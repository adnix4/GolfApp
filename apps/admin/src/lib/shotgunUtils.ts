export interface ShotgunTeam {
  id:   string;
  name: string;
}

/**
 * Gives each team without a hole a random starting hole from 1..totalHoles.
 * Teams in `existing` with a valid hole keep it — the organizer set those.
 * Free holes are drawn first, so no two teams share one until there are more
 * teams than holes (validateShotgunAssignments then flags the doubles).
 * Returns a map of teamId → hole number string (ready for controlled input state).
 * `random` is injectable so tests can pin the draw.
 */
export function autoAssignHoles(
  teams: ShotgunTeam[],
  totalHoles: number,
  existing: Record<string, string> = {},
  random: () => number = Math.random,
): Record<string, string> {
  const result: Record<string, string> = {};
  const taken  = new Set<number>();
  const open: ShotgunTeam[] = [];

  teams.forEach(t => {
    const n = parseInt(existing[t.id] ?? '', 10);
    if (!isNaN(n) && n >= 1 && n <= totalHoles) {
      result[t.id] = String(n);
      taken.add(n);
    } else {
      open.push(t);
    }
  });

  const all  = Array.from({ length: totalHoles }, (_, i) => i + 1);
  const free = shuffle(all.filter(h => !taken.has(h)), random);
  // Past the free holes, doubling up is unavoidable — spread it over all holes.
  const overflow = shuffle([...all], random);
  shuffle(open, random).forEach((t, i) => {
    const hole = i < free.length ? free[i] : overflow[(i - free.length) % totalHoles];
    result[t.id] = String(hole);
  });
  return result;
}

/** Fisher–Yates, in place. */
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Validates shotgun hole assignments.
 * Rules:
 *   - Assigned holes must be integers within [1, totalHoles]
 *   - No two teams may share the same starting hole
 *
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateShotgunAssignments(
  teams: ShotgunTeam[],
  assignments: Record<string, string>,
  totalHoles: number,
): string[] {
  const errs: string[] = [];
  const used = new Map<number, string>();

  teams.forEach(t => {
    const raw = assignments[t.id] ?? '';
    if (!raw) return; // blank = intentionally unassigned, skip

    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > totalHoles) {
      errs.push(`${t.name}: hole must be 1–${totalHoles}`);
    } else if (used.has(n)) {
      errs.push(`Hole ${n} assigned to both ${used.get(n)} and ${t.name}`);
    } else {
      used.set(n, t.name);
    }
  });

  return errs;
}
