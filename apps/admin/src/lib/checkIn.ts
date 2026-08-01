// ─────────────────────────────────────────────────────────────────────────────
// checkIn.ts — check-in status helpers + the shared confirm copy
// ─────────────────────────────────────────────────────────────────────────────
//
// WIRE FORMAT: the API projects the CheckInStatus enum with `.ToString()`
// (TeamService.MapToTeamResponse, PlayerService.MapToPlayerResponse), so the
// values on the wire are PascalCase — "Pending" / "CheckedIn" / "Complete".
// Both check-in screens previously compared against lowercase 'pending', which
// never matched: the Check In button was unrenderable, the status pill always
// fell through to grey, and the stats counted every team as checked in.
// Compare through these helpers rather than inline string literals.
//
// WHY CHECK-IN MATTERS BEYOND THE DESK: checking a golfer in also waives the
// saved-card requirement for auction bids (AuctionBidRules.NeedsPaymentMethod).
// That is why a cardless check-in warns first — see confirmGolferCheckIn.
// ─────────────────────────────────────────────────────────────────────────────

// Deliberately free of react-native imports so this stays unit-testable under
// the admin's node-environment vitest config. The screens pair checkInConfirmCopy
// with confirmAction themselves.

/** The values the API actually sends. */
export type CheckInStatus = 'Pending' | 'CheckedIn' | 'Complete';

/**
 * True for any non-pending state. `Complete` is the team-level value meaning
 * every golfer on the roster is in, so both it and `CheckedIn` read as done.
 */
export const isCheckedIn = (status: string): boolean => status !== 'Pending';

/** Display label — "Complete" is an internal distinction, not desk language. */
export const CHECK_IN_LABEL: Record<string, string> = {
  Pending:   'Pending',
  CheckedIn: 'Checked In',
  Complete:  'Checked In',
};

export const CHECK_IN_STATUS_COLOR: Record<string, string> = {
  Pending:   '#f39c12',
  CheckedIn: '#2ecc71',
  Complete:  '#27ae60',
};

export const checkInLabel = (status: string): string =>
  CHECK_IN_LABEL[status] ?? status;

export const checkInColor = (status: string): string =>
  CHECK_IN_STATUS_COLOR[status] ?? '#aaa';

export interface CheckInConfirmCopy {
  title:       string;
  message:     string;
  confirmText: string;
}

/**
 * Copy for the per-golfer check-in confirmation, stating card status either way.
 *
 * A golfer with no card can still be checked in — that is the point of the
 * waiver — but the organizer accepts a collection risk by doing it: if that
 * golfer wins an auction item the automatic charge fails (the winner lands in
 * the failed-charge list on the Fundraising tab for manual re-charge or waive).
 * Single-sourced so the Registration and Teams screens cannot drift.
 */
export function checkInConfirmCopy(
  golferName: string,
  hasPaymentMethod: boolean,
): CheckInConfirmCopy {
  if (hasPaymentMethod) {
    return {
      title:       'Check in golfer',
      message:     `${golferName} — card on file.\n\nCheck this golfer in?`,
      confirmText: 'Check In',
    };
  }
  return {
    title:   'Check in golfer',
    message: `${golferName} has NO card on file.\n\n` +
      'Checking in lets them bid in the auction without one. ' +
      "If they win an item you'll need to collect payment manually.",
    confirmText: 'Check In Anyway',
  };
}

/** "2 of 4 golfers have no card — check in individually" */
export function cardlessHint(cardlessCount: number, total: number): string {
  return `${cardlessCount} of ${total} golfer${total !== 1 ? 's' : ''} have no card` +
    ' — check in individually';
}

/** Golfers on a roster with no saved card — drives the team-button gate. */
export const golfersWithoutCard = <T extends { hasPaymentMethod: boolean }>(
  players: T[],
): T[] => players.filter(p => !p.hasPaymentMethod);

/**
 * The whole-team button is a fast path, offered only when it carries no
 * collection risk. A roster with any cardless golfer must be checked in one at
 * a time so each warning is seen and accepted individually.
 */
export const canCheckInWholeTeam = (
  players: { hasPaymentMethod: boolean }[],
): boolean => players.length > 0 && players.every(p => p.hasPaymentMethod);
