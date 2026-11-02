import type { FlightSummary, LeagueMember, LeagueScorecard, RoundAbsence } from './api';

/** Matches MaxGrossPerHole in LeagueService.cs. */
export const MAX_GROSS_PER_HOLE = 20;

export type HoleInputs = Record<number, string>;

export function holeInputsFrom(card: LeagueScorecard | undefined): HoleInputs {
  const inputs: HoleInputs = {};
  for (const h of card?.holes ?? []) inputs[h.holeNumber] = String(h.grossScore);
  return inputs;
}

/**
 * Validates the boxes and returns only the holes that differ from what is
 * saved. Blanks are fine on a card in progress, but the API has no delete, so
 * a saved hole can be corrected and not emptied.
 */
export function changedHoles(
  inputs: HoleInputs, card: LeagueScorecard | undefined, holeCount: number,
): { error?: string; changes: { holeNumber: number; grossScore: number }[] } {
  const saved = new Map((card?.holes ?? []).map(h => [h.holeNumber, h.grossScore]));
  const changes: { holeNumber: number; grossScore: number }[] = [];
  for (let hole = 1; hole <= holeCount; hole++) {
    const text = (inputs[hole] ?? '').trim();
    if (text === '') {
      if (saved.has(hole)) {
        return { error: `Hole ${hole} already has a score. Enter a corrected score instead of clearing it.`, changes: [] };
      }
      continue;
    }
    const gross = Number(text);
    if (!Number.isInteger(gross) || gross < 1 || gross > MAX_GROSS_PER_HOLE) {
      return { error: `Hole ${hole} needs a whole number from 1 to ${MAX_GROSS_PER_HOLE}.`, changes: [] };
    }
    if (saved.get(hole) !== gross) changes.push({ holeNumber: hole, grossScore: gross });
  }
  return { changes };
}

/** Everyone who can hold a card this round: active or a sub, not reported absent. */
export function scorableMembers(roster: LeagueMember[], absences: RoundAbsence[]): LeagueMember[] {
  const absent = new Set(absences.map(a => a.memberId));
  return roster
    .filter(m => (m.status === 'Active' || m.status === 'Sub') && !absent.has(m.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export interface FlightFields { name: string; minHandicap: string; maxHandicap: string }

export const EMPTY_FLIGHT: FlightFields = { name: '', minHandicap: '', maxHandicap: '' };

function parseHandicap(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function buildFlightPayload(fields: FlightFields): {
  error?: string;
  payload?: { name: string; minHandicap?: number; maxHandicap?: number };
} {
  const name = fields.name.trim();
  if (!name) return { error: 'Give the flight a name.' };
  const minHandicap = parseHandicap(fields.minHandicap);
  const maxHandicap = parseHandicap(fields.maxHandicap);
  if (minHandicap === null || maxHandicap === null) return { error: 'Handicaps must be numbers.' };
  if (minHandicap !== undefined && maxHandicap !== undefined && minHandicap > maxHandicap) {
    return { error: "The lowest handicap can't be above the highest." };
  }
  return { payload: { name, minHandicap, maxHandicap } };
}

export function flightRangeLabel(f: Pick<FlightSummary, 'minHandicap' | 'maxHandicap'>): string {
  if (f.minHandicap != null && f.maxHandicap != null) return `HC ${f.minHandicap}–${f.maxHandicap}`;
  if (f.minHandicap != null) return `HC ${f.minHandicap}+`;
  if (f.maxHandicap != null) return `HC up to ${f.maxHandicap}`;
  return '';
}
