/**
 * Event-status palette + label + transition rules (admin surface).
 *
 * The event status state machine is:
 *   Draft → Registration → Active → Scoring → Completed
 *                                              ↑
 *                                              └── (or Cancelled at any step)
 *
 * NEXT_TRANSITIONS exposes the single button the organizer should see at each
 * step. Statuses absent from the table (Draft, Completed, Cancelled) have no
 * forward button — Draft is advanced by a separate "Open Registration" flow,
 * the other two are terminal.
 *
 * The super-admin dashboard and the public web event page use different
 * palettes on purpose (different audiences see different labels/colors) so
 * they intentionally do not import from this file.
 */

export const EVENT_STATUS_COLOR: Record<string, string> = {
  Draft:        '#95a5a6',
  Registration: '#3498db',
  Active:       '#2ecc71',
  Scoring:      '#f39c12',
  Completed:    '#27ae60',
  Cancelled:    '#e74c3c',
};

export const EVENT_STATUS_LABEL: Record<string, string> = {
  Draft:        'Draft',
  Registration: 'Registration Open',
  Active:       'Active',
  Scoring:      'Scoring',
  Completed:    'Completed',
  Cancelled:    'Cancelled',
};

export interface EventStatusTransition {
  status: string;
  label:  string;
  danger?: boolean;
}

export const NEXT_TRANSITIONS: Record<string, EventStatusTransition[]> = {
  Registration: [{ status: 'Active',    label: 'Go Active (Day of Event)' }],
  Active:       [{ status: 'Scoring',   label: 'Open Scoring' }],
  Scoring:      [{ status: 'Completed', label: 'Mark Complete' }],
};

// ── Open Scoring gate ─────────────────────────────────────────────────────────
//
// Opening scoring before the field has checked in means golfers start entering
// scores before the desk has seen them — and since check-in is also what waives
// the auction's saved-card requirement (AuctionBidRules.NeedsPaymentMethod), an
// early flip quietly leaves cardless golfers unable to bid.
//
// Deliberately counted in TEAMS, using the counts already on the Overview page.
// The server computes teamsCheckedIn as CheckedIn || Complete
// (EventService.LoadCountsAsync), so a team that reached Complete via the
// per-golfer cascade is counted. Guests (team-less attendees) are invisible to
// both numbers by design — a spouse who came for the banquet must never be able
// to hold up the round.

export interface ScoringGate {
  /** True when every registered team is checked in. */
  ready:       boolean;
  /** Teams still to check in. */
  outstanding: number;
  total:       number;
}

export function scoringGate(
  counts: { teamsRegistered: number; teamsCheckedIn: number },
): ScoringGate {
  const total       = Math.max(0, counts.teamsRegistered);
  const checkedIn   = Math.min(Math.max(0, counts.teamsCheckedIn), total);
  const outstanding = total - checkedIn;
  // Zero teams is not "ready" — there is nothing to score.
  return { ready: total > 0 && outstanding === 0, outstanding, total };
}

/** Explains why Open Scoring is unavailable. */
export function scoringGateHint(gate: ScoringGate): string {
  if (gate.total === 0) return 'No teams are registered yet.';
  return `${gate.outstanding} of ${gate.total} team${gate.total === 1 ? '' : 's'} still need check-in`;
}

/**
 * Confirm copy for the override. A no-show team must never be able to strand
 * the round, so the organizer can always proceed — but they see exactly who is
 * missing first, and that those golfers can still be checked in later.
 */
export function openScoringEarlyCopy(teamNames: string[]): {
  title: string; message: string; confirmText: string;
} {
  const list = teamNames.length > 0
    ? teamNames.map(n => `• ${n}`).join('\n')
    : '• (none)';
  return {
    title:   'Open scoring early?',
    message:
      `These teams are not checked in:\n\n${list}\n\n` +
      'Their golfers can still score, and you can still check them in after ' +
      'scoring opens.',
    confirmText: 'Open Scoring',
  };
}

/** Fallback color for an unknown status, matching previous inline defaults. */
export const EVENT_STATUS_COLOR_FALLBACK = '#aaa';

/** Returns the palette color for an event status, falling back gracefully. */
export function eventStatusColor(status: string): string {
  return EVENT_STATUS_COLOR[status] ?? EVENT_STATUS_COLOR_FALLBACK;
}

/** Returns the display label for an event status, defaulting to the raw value. */
export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABEL[status] ?? status;
}
