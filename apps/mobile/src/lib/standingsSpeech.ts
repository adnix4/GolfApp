/**
 * What a screen reader says for one leaderboard row.
 *
 * Read cell by cell, a row came out of TalkBack as "0, Timing Crew, capital E,
 * Em dash, Em dash, Em dash, 0" (heard in its speech log on an Android 16
 * emulator): the column names live in a header the golfer has long scrolled
 * past, even par is a letter, and every empty cell is a punctuation mark. Each
 * row is now one sentence that names its own numbers.
 *
 * Pure and out of the screen so the wording is testable — same reasoning as
 * toPar.ts and leaderboardState.ts.
 */
import type { PublicIndividualEntry, PublicLeaderboardEntry } from './api';
import { spokenToPar } from './toPar';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function progress(holesComplete: number, isComplete: boolean): string {
  return isComplete ? 'finished' : `through ${plural(holesComplete, 'hole')}`;
}

/** A rank of 0 means "not ranked yet" (no holes scored) — never say "0th". */
const place = (rank: number) => (rank > 0 ? `${ordinal(rank)}, ` : '');

export function teamRowLabel(e: PublicLeaderboardEntry, stableford: boolean): string {
  if (e.holesComplete === 0) return `${e.teamName}, no holes scored yet`;
  const parts = [
    `${place(e.rank)}${e.teamName}`,
    stableford ? plural(e.stablefordPoints, 'point') : spokenToPar(e.toPar),
    progress(e.holesComplete, e.isComplete),
  ];
  if (e.strokesBack > 0) parts.push(`${plural(e.strokesBack, 'stroke')} back`);
  if (e.bestHole != null && e.bestHoleScore != null) {
    parts.push(`best hole ${e.bestHole}, scored ${e.bestHoleScore}`);
  }
  return parts.join(', ');
}

export function golferRowLabel(e: PublicIndividualEntry): string {
  const who = `${e.playerName} of ${e.teamName}`;
  if (e.holesComplete === 0) return `${who}, no holes scored yet`;
  const parts = [
    `${place(e.rank)}${who}`,
    spokenToPar(e.toPar),
    `${plural(e.grossTotal, 'stroke')} total`,
    progress(e.holesComplete, e.isComplete),
  ];
  if (e.strokesBack > 0) parts.push(`${plural(e.strokesBack, 'stroke')} back`);
  return parts.join(', ');
}
