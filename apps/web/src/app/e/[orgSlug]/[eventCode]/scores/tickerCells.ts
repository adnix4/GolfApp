// The scoreboard marquee's content, kept free of React so its rules are
// testable (problemList T10). EventTicker renders these cells; see the
// component for why there is one combined track (U2 + U3).
// formatCents, not formatCentsShort: this can end up on a projector, and a
// five-figure lot reading "$25000.00" without grouping is hard to take in at a
// glance. Matches the event page's fundraising totals.
import { formatCents, isDonationItem } from '@gfp/shared-types';
import type { PublicAuctionItem, PublicEventData } from '@/lib/api';

export type Cell =
  | { kind: 'heading'; key: string; text: string }
  | { kind: 'gap';     key: string }
  | { kind: 'sponsor'; key: string; name: string; logoUrl: string; tagline: string | null }
  | { kind: 'lot';     key: string; title: string; label: string; amount: string;
      photoUrl: string | null };

export function buildCells(
  sponsors: PublicEventData['sponsors'],
  auctionItems: PublicAuctionItem[],
): Cell[] {
  const sponsorCells: Cell[] = sponsors.map((s, i) => ({
    kind:    'sponsor',
    key:     `s${i}-${s.name}`,
    name:    s.name,
    logoUrl: s.logoUrl,
    tagline: s.tagline,
  }));

  const lotCells: Cell[] = auctionItems.map(item => {
    const donation = isDonationItem(item.auctionType);
    return {
      kind:   'lot',
      key:    `a-${item.id}`,
      title:  item.title,
      // A Fund-a-Need has no "current bid" to beat — pledges stack — so quoting
      // one would invite people to try to top it.
      //
      // The label is the fallback for a lot with no photo. Where there IS one,
      // the thumbnail takes its place: a picture of the item sells it across a
      // ballroom better than the words "Bidding now", and the price beside it
      // already says the lot is live.
      label:  donation ? 'Fund a need' : 'Bidding now',
      photoUrl: item.photoUrls?.[0] ?? null,
      amount: donation
        ? `${formatCents(item.totalRaisedCents)} raised${
            item.goalCents ? ` of ${formatCents(item.goalCents)}` : ''}`
        : item.currentHighBidCents > 0
          ? `Current bid ${formatCents(item.currentHighBidCents)}`
          : 'Open for bids',
    };
  });

  // Two announced runs rather than one undifferentiated stream: a heading tells
  // the room what it's looking at, which is what makes the sponsor run read as
  // thanks and the lot run read as a call to bid. Each section is omitted whole
  // when it's empty — no heading over nothing.
  const cells: Cell[] = [];

  if (sponsorCells.length > 0) {
    cells.push({ kind: 'heading', key: 'h-sponsors', text: 'Thank You to Our Sponsors' });
    cells.push(...sponsorCells);
  }

  if (lotCells.length > 0) {
    if (cells.length > 0) cells.push({ kind: 'gap', key: 'g-mid' });
    cells.push({ kind: 'heading', key: 'h-lots', text: 'Bid on These Items' });
    cells.push(...lotCells);
  }

  // Trailing gap so the wrap — last lot straight into the repeated sponsor
  // heading — gets the same breathing room as the seam in the middle.
  if (cells.length > 0) cells.push({ kind: 'gap', key: 'g-end' });

  return cells;
}
