import type { SponsorPlacements } from './api';

/**
 * Builds the placements object the sponsor form saves.
 *
 * The form only edits hole numbers, but the API replaces the sponsor's whole
 * placements object on every save. Starting from the existing placements keeps
 * the settings the form does not show, such as `landingPage: false` (the opt-out
 * that hides a sponsor from the public page and ticker). Overwriting the object
 * here would silently undo that opt-out on the next save (problemList U7(b)).
 */
export function mergeSponsorPlacements(
  existing: SponsorPlacements | null | undefined,
  holeNumbers: number[],
): SponsorPlacements {
  return { ...(existing ?? {}), holeNumbers };
}
