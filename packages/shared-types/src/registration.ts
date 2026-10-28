/**
 * Tournament registration — the one definition of what every app asks a golfer
 * for, and how it is checked and sent.
 *
 * Mobile, web and admin each had their own copy, and they had drifted: web and
 * admin sent `handicap` where the API reads `handicapIndex` (so every handicap
 * typed there was silently dropped), web never asked for a phone, and admin let
 * email be blank although the API requires it. Building the payload through
 * toPlayerInput() keeps the field names in one place.
 *
 * The standard set, and what the tournament uses each one for:
 *   first / last name  required    leaderboard, check-in
 *   email              required    the per-event unique key, scorer-app join,
 *                                  confirmations, receipts, auction
 *   phone              required for whoever submits the form on mobile/web (the
 *                      organizer's day-of contact for the team); optional for
 *                      teammates the captain lists, and in admin desk entry
 *   handicap index     optional    free-agent auto-pair (most charity golfers
 *                                  have none)
 *   free agents also:  skill level, age group, pairing note — all optional
 *
 * Leagues ask the same name and email, but there a handicap is REQUIRED (net
 * scoring, flights and pairings read it) — see validateLeagueMember().
 */

import { digitsOnly, isValidPhone, PHONE_INVALID } from './phone';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HANDICAP_MIN = 0;
export const HANDICAP_MAX = 54;

/** What the forms hold: raw text, exactly as typed. */
export interface GolferFields {
  firstName: string;
  lastName:  string;
  email:     string;
  /** Any formatting; only the digits are kept. */
  phone?:    string;
  /** Text so a blank stays blank (no handicap) instead of becoming 0. */
  handicap?: string;
}

/** The API's PlayerInput. */
export interface PlayerInput {
  firstName:      string;
  lastName:       string;
  email:          string;
  phone?:         string;
  handicapIndex?: number;
}

export interface GolferRules {
  /** Require a 10-digit phone (the person submitting on mobile/web). */
  phoneRequired?: boolean;
  /** Require a handicap index (league members). */
  handicapRequired?: boolean;
  /** Prefix for messages about one golfer of several, e.g. "Teammate 2". */
  label?: string;
}

/** Parses a handicap field. '' → null (none given); a non-number → NaN. */
export function parseHandicap(text: string | undefined): number | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/**
 * Checks one golfer against the standard rules. Returns the message to show,
 * or null when the golfer is valid.
 */
export function validateGolfer(g: GolferFields, rules: GolferRules = {}): string | null {
  const who = rules.label ? `${rules.label}: ` : '';
  if (!g.firstName.trim()) return `${who}First name is required.`;
  if (!g.lastName.trim())  return `${who}Last name is required.`;

  const email = g.email.trim();
  if (!email)                return `${who}Email address is required.`;
  if (!EMAIL_RE.test(email)) return `${who}Enter a valid email address.`;

  const phone = digitsOnly(g.phone ?? '');
  if (rules.phoneRequired && !phone) return `${who}Phone number is required.`;
  if (phone && !isValidPhone(phone)) return `${who}${PHONE_INVALID}`;

  const hcp = parseHandicap(g.handicap);
  if (hcp === null) {
    if (rules.handicapRequired) return `${who}Handicap index is required.`;
  } else if (Number.isNaN(hcp) || hcp < HANDICAP_MIN || hcp > HANDICAP_MAX) {
    return `${who}Handicap index must be a number from ${HANDICAP_MIN} to ${HANDICAP_MAX}.`;
  }
  return null;
}

/**
 * Checks a whole roster: each golfer, then that no email repeats. The first
 * golfer is the one submitting (`first` rules), the rest are teammates.
 */
export function validateRoster(
  golfers: GolferFields[],
  opts: { first?: GolferRules; others?: GolferRules; otherLabel?: (i: number) => string } = {},
): string | null {
  for (let i = 0; i < golfers.length; i++) {
    const rules = i === 0
      ? opts.first
      : { ...opts.others, label: opts.otherLabel?.(i) ?? `Player ${i + 1}` };
    const err = validateGolfer(golfers[i], rules);
    if (err) return err;
  }
  const seen = new Set<string>();
  for (const g of golfers) {
    const email = g.email.trim().toLowerCase();
    if (seen.has(email)) return `${email} is listed twice — each golfer needs their own email.`;
    seen.add(email);
  }
  return null;
}

/** Builds the API's PlayerInput. Call after validateGolfer has passed. */
export function toPlayerInput(g: GolferFields): PlayerInput {
  const phone = digitsOnly(g.phone ?? '');
  const hcp   = parseHandicap(g.handicap);
  return {
    firstName: g.firstName.trim(),
    lastName:  g.lastName.trim(),
    email:     g.email.trim().toLowerCase(),
    ...(phone ? { phone } : {}),
    ...(hcp !== null && !Number.isNaN(hcp) ? { handicapIndex: hcp } : {}),
  };
}

/** A league member must carry a handicap; otherwise the same identity rules. */
export function validateLeagueMember(g: GolferFields): string | null {
  return validateGolfer(g, { handicapRequired: true });
}

// ── Free-agent choices (values are the API's enum names) ─────────────────────

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Competitive';
export type AgeGroup   = 'Under30' | 'From30To50' | 'Over50';

export const SKILL_LEVEL_OPTIONS: { value: SkillLevel; label: string }[] = [
  { value: 'Beginner',     label: 'Beginner'     },
  { value: 'Intermediate', label: 'Intermediate' },
  { value: 'Advanced',     label: 'Advanced'     },
  { value: 'Competitive',  label: 'Competitive'  },
];

export const AGE_GROUP_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: 'Under30',    label: 'Under 30' },
  { value: 'From30To50', label: '30 – 50'  },
  { value: 'Over50',     label: 'Over 50'  },
];

/** Max length of the free-agent note, matching the API. */
export const PAIRING_NOTE_MAX = 500;
