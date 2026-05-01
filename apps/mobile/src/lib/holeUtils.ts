/**
 * Returns the ordered list of hole numbers for a round, accounting for
 * shotgun starts that begin mid-course.
 *
 * Example: startingHole=10, totalHoles=18 → [10,11,...,18,1,2,...,9]
 */
export function getHoleOrder(startingHole: number | null, totalHoles: number): number[] {
  if (!startingHole) return Array.from({ length: totalHoles }, (_, i) => i + 1);
  return Array.from({ length: totalHoles }, (_, i) => ((startingHole - 1 + i) % totalHoles) + 1);
}
