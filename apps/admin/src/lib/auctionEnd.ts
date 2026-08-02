/**
 * Auction status palette + End Auction confirm copy (admin surface).
 *
 * Ending the auction is the organizer's settlement moment: every lot still
 * taking bids closes at once, winners are recorded, and the money moves to the
 * checkout desk. None of it can be undone from the app, so the confirm has to
 * say plainly what is about to happen — how many lots close, what goes unsold,
 * which live lots are being left for a manual award, and how many winners have
 * no card on file.
 *
 * Copy lives here as pure functions so it can be unit-tested without a screen,
 * matching the openScoringEarlyCopy / markCompleteCopy pattern in eventStatus.ts.
 */

import type { AuctionEndSummary, ParkedLiveLot } from './api';

// ── Item status palette ───────────────────────────────────────────────────────
//
// Every status used to render as identical grey text, so a lot that sold for
// $400 looked the same as one nobody bid on.

export const AUCTION_STATUS_COLOR: Record<string, string> = {
  Open:      '#2ecc71',
  Extended:  '#f39c12',
  Closed:    '#27ae60',
  Awarded:   '#8e44ad',
  Unsold:    '#95a5a6',
  Cancelled: '#e74c3c',
};

export const AUCTION_STATUS_LABEL: Record<string, string> = {
  Open:      'Open',
  Extended:  'Closing soon',
  Closed:    'Sold',
  Awarded:   'Awarded',
  Unsold:    'No bids',
  Cancelled: 'Cancelled',
};

export const AUCTION_STATUS_COLOR_FALLBACK = '#aaa';

export function auctionStatusColor(status: string): string {
  return AUCTION_STATUS_COLOR[status] ?? AUCTION_STATUS_COLOR_FALLBACK;
}

export function auctionStatusLabel(status: string): string {
  return AUCTION_STATUS_LABEL[status] ?? status;
}

/** True once a lot can no longer take bids. */
export function isAuctionStatusFinal(status: string): boolean {
  return status === 'Closed' || status === 'Awarded'
      || status === 'Unsold' || status === 'Cancelled';
}

// ── End Auction confirm ───────────────────────────────────────────────────────

/** Longest list of parked live lots to name before summarising the rest. */
const MAX_LISTED_LOTS = 8;

export function formatCents(cents: number): string {
  const d = Math.abs(cents) / 100;
  return `$${d.toFixed(2)}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

function lotList(lots: ParkedLiveLot[]): string {
  const shown  = lots.slice(0, MAX_LISTED_LOTS);
  const hidden = lots.length - shown.length;
  return shown.map(l => `• ${l.title}`).join('\n')
    + (hidden > 0 ? `\n• …and ${hidden} more` : '');
}

/**
 * Confirm copy for End Auction. Reads the preview the server just returned, so
 * the organizer is agreeing to the same numbers the server is about to produce.
 */
export function endAuctionCopy(summary: AuctionEndSummary): {
  title: string; message: string; confirmText: string;
} {
  const parts: string[] = [];

  if (summary.lotsClosed === 0) {
    parts.push('No lots are still taking bids.');
  } else {
    const sold = summary.lotsSold > 0
      ? `${summary.lotsSold} ${plural(summary.lotsSold, 'lot')} will be sold`
      : null;
    const unsold = summary.lotsUnsold > 0
      ? `${summary.lotsUnsold} will close with no bids`
      : null;

    parts.push(
      `${summary.lotsClosed} ${plural(summary.lotsClosed, 'lot')} will close now`
      + (sold || unsold ? ` — ${[sold, unsold].filter(Boolean).join(', and ')}` : '')
      + '.');
  }

  if (summary.winnersCreated > 0) {
    parts.push(
      `${summary.winnersCreated} ${plural(summary.winnersCreated, 'winner')} to collect from, `
      + `${formatCents(summary.outstandingCents)} to take at checkout.`);
  }

  if (summary.winnersWithoutCard > 0) {
    // Check-in waives the saved-card requirement for bidding, so this is a
    // routine outcome rather than a bug — but it is the desk's problem tonight.
    parts.push(
      `${summary.winnersWithoutCard} ${plural(summary.winnersWithoutCard, 'winner has', 'winners have')} `
      + 'no card on file. They can still pay by card, cash or check at the desk.');
  }

  if (summary.liveLotsAwaitingAward.length > 0) {
    parts.push(
      `${summary.liveLotsAwaitingAward.length} live ${plural(summary.liveLotsAwaitingAward.length, 'lot')} `
      + 'will stay open for you to award by hand:\n'
      + lotList(summary.liveLotsAwaitingAward));
  }

  if (summary.liveSessionEnded) {
    parts.push('The live auction session will end.');
  }

  parts.push('Bidding closes for good — this cannot be undone.');

  return {
    title: 'End the auction?',
    message: parts.join('\n\n'),
    confirmText: 'End Auction',
  };
}

/**
 * One-line result banner after ending. Deliberately mentions the parked live
 * lots, because those are the organizer's remaining work.
 */
export function endAuctionResult(summary: AuctionEndSummary): string {
  if (summary.lotsClosed === 0 && summary.liveLotsAwaitingAward.length === 0)
    return 'Nothing left to close — the auction was already over.';

  const bits = [`${summary.lotsClosed} ${plural(summary.lotsClosed, 'lot')} closed`];

  if (summary.lotsUnsold > 0) bits.push(`${summary.lotsUnsold} with no bids`);
  if (summary.winnersCreated > 0)
    bits.push(`${formatCents(summary.outstandingCents)} to collect at checkout`);
  if (summary.liveLotsAwaitingAward.length > 0)
    bits.push(`${summary.liveLotsAwaitingAward.length} live `
      + `${plural(summary.liveLotsAwaitingAward.length, 'lot')} still to award`);

  return `${bits.join(' · ')}.`;
}

// ── Checkout desk ─────────────────────────────────────────────────────────────

/** Confirm copy for taking money at the desk. */
export function settleCopy(
  playerName: string, outstandingCents: number,
  method: 'Card' | 'Cash' | 'Check', markPickedUp: boolean,
): { title: string; message: string; confirmText: string } {
  const amount = formatCents(outstandingCents);
  const how = method === 'Card'
    ? 'Their saved card will be charged now.'
    : `Record ${amount} received by ${method.toLowerCase()}. No card will be charged.`;

  return {
    title: `Take ${amount} from ${playerName}?`,
    message: `${how}${markPickedUp ? '\n\nTheir items will also be marked as collected.' : ''}`,
    confirmText: method === 'Card' ? 'Charge Card' : `Record ${method}`,
  };
}
