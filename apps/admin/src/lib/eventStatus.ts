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

// ── Mark Complete gate ────────────────────────────────────────────────────────
//
// Completing the event is terminal — EventStatusRules has no transition out of
// Completed — and it closes scoring server-side: ScoreService rejects entry for
// anything but Active/Scoring, and MobileService rejects batch sync the same
// way. Holes still queued offline on a golfer's phone therefore become
// unsyncable, and the mobile shell deliberately does NOT propagate a mid-round
// status flip, so the field keeps playing and only discovers the loss at sync.
//
// Counted in TEAMS via the leaderboard, which already reports per-team progress
// (holesComplete / isComplete). The event's own counts.holesScored is DISTINCT
// hole numbers across the whole field, not per-team progress, and would call a
// half-finished round "done".
//
// This is a warning, not a block. A team that walks off at hole 14 must never
// be able to hold the organizer hostage — but they should see who is still out
// there before they commit.

/** Minimal per-team shape this gate needs — a subset of LeaderboardEntry. */
export interface TeamProgress {
  teamName:      string;
  holesComplete: number;
  isComplete:    boolean;
}

export interface CompletionGate {
  /** True when at least one team exists and every one has finished. */
  ready:      boolean;
  /** Teams still out on the course, with how many holes they have scored. */
  unfinished: { name: string; thru: number }[];
  total:      number;
}

/**
 * Splits the leaderboard into finished / unfinished teams. Trusts the server's
 * isComplete flag (computed against the event's hole count) rather than
 * re-deriving it, so 9-hole events work without special-casing.
 *
 * An empty leaderboard is NOT ready — no scores at all is itself worth a
 * confirm, not a silent pass.
 */
export function completionGate(entries: TeamProgress[]): CompletionGate {
  const unfinished = entries
    .filter(e => !e.isComplete)
    .map(e => ({ name: e.teamName, thru: Math.max(0, e.holesComplete) }));
  return { ready: entries.length > 0 && unfinished.length === 0, unfinished, total: entries.length };
}

/** Longest team list we will put in a confirm dialog before truncating. */
const MAX_LISTED_TEAMS = 10;

/**
 * Reminds the organizer the auction is still running.
 *
 * Completing the event deliberately does nothing to the auction — the round
 * ending and the fundraiser ending are two different moments, and the auction
 * usually runs on into the banquet. That decoupling is right, but it means an
 * organizer can mark the event complete and walk away believing they closed
 * everything, while lots keep taking bids with nobody watching.
 *
 * So: mention it, never act on it. Ending the auction stays a separate,
 * deliberate press of End Auction on the auction screen.
 */
function openLotsNote(openAuctionLots: number): string {
  if (openAuctionLots <= 0) return '';
  return `\n\n${openAuctionLots} auction lot${openAuctionLots === 1 ? ' is' : 's are'} `
    + 'still open for bidding. Completing the event does not close the auction — '
    + 'use End Auction on the Auction Items tab when you are ready.';
}

/**
 * Confirm copy for Mark Complete — the early-finish warning when teams are
 * still scoring, and a short terminal-action confirm when they are all in.
 *
 * `openAuctionLots` is optional so a caller that cannot cheaply count them (or
 * whose lookup failed) still gets sound copy rather than a wrong number.
 */
export function markCompleteCopy(
  gate: CompletionGate, openAuctionLots = 0,
): { title: string; message: string; confirmText: string } {
  const confirmText = 'Mark Complete';
  const auction     = openLotsNote(openAuctionLots);

  if (gate.ready) {
    return {
      title: 'Mark event complete?',
      message:
        `All ${gate.total} team${gate.total === 1 ? ' has' : 's have'} finished scoring.` +
        auction + '\n\n' +
        'Completing the event closes scoring for good — this cannot be undone.',
      confirmText,
    };
  }

  const shown  = gate.unfinished.slice(0, MAX_LISTED_TEAMS);
  const hidden = gate.unfinished.length - shown.length;
  const list   = shown.map(t => `• ${t.name} — thru ${t.thru}`).join('\n')
    + (hidden > 0 ? `\n• …and ${hidden} more team${hidden === 1 ? '' : 's'}` : '');

  const count = gate.total === 0
    ? 'No teams have scored yet.'
    : `${gate.unfinished.length} of ${gate.total} team${gate.total === 1 ? '' : 's'} ` +
      `${gate.unfinished.length === 1 ? 'has' : 'have'} not finished all holes:`;

  return {
    title: 'End scoring early?',
    message:
      `${count}${gate.total === 0 ? '' : `\n\n${list}`}\n\n` +
      'Marking the event complete closes scoring — golfers can no longer enter ' +
      'or sync scores, including holes still saved offline on their phones. ' +
      'This cannot be undone.' + auction,
    confirmText,
  };
}

/**
 * Fallback copy when the scoring-progress lookup fails. The organizer is at the
 * course with a banquet starting; a failed request must not lock them out of
 * finishing the event, so we still offer the confirm — just honestly.
 */
export function markCompleteUncheckedCopy(): {
  title: string; message: string; confirmText: string;
} {
  return {
    title: 'Mark event complete?',
    message:
      'Could not check scoring progress, so some teams may still be out on the course.\n\n' +
      'Marking the event complete closes scoring — golfers can no longer enter ' +
      'or sync scores, including holes still saved offline on their phones. ' +
      'This cannot be undone.',
    confirmText: 'Mark Complete',
  };
}

/** Confirm copy for Cancel Event — the other terminal, unrecoverable status. */
export function cancelEventCopy(): {
  title: string; message: string; confirmText: string;
} {
  return {
    title: 'Cancel this event?',
    message:
      'Cancelling closes registration, check-in and scoring, and removes the ' +
      'event from the public list.\n\nThis cannot be undone.',
    confirmText: 'Cancel Event',
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
