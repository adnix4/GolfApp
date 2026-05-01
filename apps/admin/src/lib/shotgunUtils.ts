export interface ShotgunTeam {
  id:   string;
  name: string;
}

/**
 * Distributes teams evenly across holes 1..totalHoles in alphabetical order.
 * Returns a map of teamId → hole number string (ready for controlled input state).
 */
export function autoAssignHoles(
  teams: ShotgunTeam[],
  totalHoles: number,
): Record<string, string> {
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  const result: Record<string, string> = {};
  sorted.forEach((t, i) => {
    result[t.id] = String((i % totalHoles) + 1);
  });
  return result;
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
