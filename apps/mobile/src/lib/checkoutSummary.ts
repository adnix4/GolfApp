/**
 * How the golfer's auction checkout reads, shared by the Auction tab's banner
 * and the checkout screen so both say the same thing.
 *
 * A checkout cart mixes items won (to pay for AND collect) with Fund-a-Need
 * pledges (to pay for only — there is nothing to pick up). "You won 2 items,
 * ready to collect" is wrong for a golfer who only pledged, so the wording is
 * worked out here, pure and testable.
 */

interface SummaryLine {
  isPledge:   boolean;
  pickedUpAt: string | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Counts plus whether anything still has to be collected at the desk. */
export function checkoutCounts(lines: SummaryLine[]) {
  const items   = lines.filter(l => !l.isPledge);
  const pledges = lines.length - items.length;
  return {
    items:          items.length,
    pledges,
    awaitingPickup: items.some(l => !l.pickedUpAt),
  };
}

/**
 * "You won 2 items", "You won 1 item + 1 pledge", or — with no items — a thank
 * you for the pledge. Empty string for an empty cart.
 */
export function checkoutHeadline(lines: SummaryLine[]): string {
  const { items, pledges } = checkoutCounts(lines);
  if (items > 0) {
    return `You won ${plural(items, 'item')}${pledges > 0 ? ` + ${plural(pledges, 'pledge')}` : ''}`;
  }
  if (pledges > 0) {
    return pledges === 1 ? 'Thank you for your pledge' : `Thank you for your ${pledges} pledges`;
  }
  return '';
}
