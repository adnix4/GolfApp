import { formatCentsShort } from '@gfp/shared-types';
import type { FlushResult } from './bidQueue';

/**
 * Turns the server's bid rejection codes into something a golfer can act on.
 * These arrive as bare machine strings ("BID_TOO_LOW:5000") and used to be shown
 * verbatim, so the one message that told the golfer what to do next — the actual
 * minimum — was buried in a code.
 */
export function describeBidError(raw: string): string {
  if (raw === 'NO_PAYMENT_METHOD')
    return 'To bid, either save a card or check in at the registration desk.';
  if (raw === 'AUCTION_CLOSED')
    return 'This item just closed. Pull down to refresh the list.';

  const tooLow = raw.match(/^BID_TOO_LOW:(\d+)$/);
  if (tooLow)
    return `That is below the minimum — bids on this item start at ${formatCentsShort(Number(tooLow[1]))}.`;

  // A session-token mismatch comes back as the generic player-not-found text.
  if (/was not found/i.test(raw))
    return 'Your session has expired. Rejoin the event and try again.';

  return raw || 'Something went wrong. Please try again.';
}

/** One line per finished queued bid, naming the lot so the popup can chip it. */
function describeOne(r: FlushResult): string {
  const what = r.bid.kind === 'pledge'
    ? `Your ${formatCentsShort(r.bid.amountCents)} pledge to ${r.bid.itemTitle}`
    : `Your ${formatCentsShort(r.bid.amountCents)} bid on ${r.bid.itemTitle}`;

  if (r.outcome === 'expired') {
    return r.bid.attempted
      ? `${what} waited over 30 minutes for a connection. It may have gone through — check My Bids.`
      : `${what} waited over 30 minutes for a connection, so it wasn't sent. Bid again if you still want it.`;
  }
  if (r.outcome === 'rejected') {
    // The rejection reasons are written for a bid that was just typed; for a
    // queued one the useful part is why, so drop the refresh hint.
    const why = describeBidError(r.message).replace(' Pull down to refresh the list.', '');
    return `${what} wasn't placed. ${why}`;
  }
  if (r.bid.kind === 'pledge') return `${what} is in. Thank you!`;
  return r.response.isWinning
    ? `${what} went through. You're the high bidder at ${formatCentsShort(r.response.currentHighBidCents)}.`
    : `${what} went through, but another golfer's maximum is higher. The bid is now ${formatCentsShort(r.response.currentHighBidCents)}.`;
}

/**
 * The popup shown after queued bids are sent. One bid gets its own title;
 * several share one popup so a reconnect doesn't stack a dialog per lot.
 */
export function describeFlushResults(results: FlushResult[]): {
  title: string; message: string; highlights: string[]; warning: boolean;
} | null {
  if (results.length === 0) return null;
  const warning = results.some(r => r.outcome !== 'placed');
  const highlights = [...new Set(results.map(r => r.bid.itemTitle))];

  if (results.length === 1) {
    const r = results[0];
    const title =
      r.outcome === 'placed'   ? (r.bid.kind === 'pledge' ? 'Queued pledge sent' : 'Queued bid sent') :
      r.outcome === 'rejected' ? (r.bid.kind === 'pledge' ? 'Queued pledge not placed' : 'Queued bid not placed') :
      'Queued bid not sent';
    return { title, message: describeOne(r), highlights, warning };
  }

  return {
    title: 'Queued bids sent',
    message: results.map(r => `• ${describeOne(r)}`).join('\n'),
    highlights,
    warning,
  };
}
