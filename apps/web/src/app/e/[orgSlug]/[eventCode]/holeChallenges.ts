import type { PublicChallenge, PublicSponsorInfo } from '@/lib/api';

/** One line of the event page's Hole Challenges card. */
export interface HoleChallengeRow {
  key:         string;
  hole:        number | null;  // null = all-day challenge, listed last
  description: string | null;  // the contest, e.g. "Closest to the Pin"
  prize:       string | null;
  sponsorName: string | null;
}

/**
 * Merges the organizer's hole challenges with the hole sponsors into one list,
 * sorted by hole, all-day challenges last.
 *
 * - Every challenge gets a row. Its sponsor is the one linked on the challenge;
 *   if none is linked, the sponsors placed on that hole are credited instead.
 * - A sponsor placed on a hole that has no challenge still gets a plain row
 *   (hole + sponsor), which is all the card could show before challenges were
 *   fetched (problemList U7(d)).
 */
export function buildHoleChallengeRows(
  sponsors:   PublicSponsorInfo[],
  challenges: PublicChallenge[],
): HoleChallengeRow[] {
  const sponsorsByHole = new Map<number, string[]>();
  for (const s of sponsors) {
    for (const h of s.holeNumbers ?? []) {
      const names = sponsorsByHole.get(h) ?? [];
      if (!names.includes(s.name)) names.push(s.name);
      sponsorsByHole.set(h, names);
    }
  }

  const rows: HoleChallengeRow[] = challenges.map(c => {
    const holeSponsors = c.holeNumber == null ? [] : sponsorsByHole.get(c.holeNumber) ?? [];
    return {
      key:         `c-${c.id}`,
      hole:        c.holeNumber,
      description: c.description.trim() || null,
      prize:       c.prizeDescription?.trim() || null,
      sponsorName: c.sponsorName ?? (holeSponsors.length ? holeSponsors.join(', ') : null),
    };
  });

  const challengedHoles = new Set(challenges.map(c => c.holeNumber));
  for (const [hole, names] of sponsorsByHole) {
    if (challengedHoles.has(hole)) continue;
    for (const name of names) {
      rows.push({ key: `s-${hole}-${name}`, hole, description: null, prize: null, sponsorName: name });
    }
  }

  // Array.prototype.sort is stable, so rows on the same hole keep their order.
  return rows.sort((a, b) => (a.hole ?? Infinity) - (b.hole ?? Infinity));
}
