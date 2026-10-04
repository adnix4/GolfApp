import { describe, it, expect } from 'vitest';
import { buildCells } from '../tickerCells';
import type { PublicAuctionItem, PublicEventData } from '@/lib/api';

type Sponsor = PublicEventData['sponsors'][number];

const sponsor = (name: string, extra: Partial<Sponsor> = {}): Sponsor =>
  ({ name, logoUrl: `https://cdn.example/${name}.png`, tagline: null, ...extra } as Sponsor);

const lot = (id: string, extra: Partial<PublicAuctionItem> = {}): PublicAuctionItem =>
  ({ id, title: `Lot ${id}`, auctionType: 'Silent', currentHighBidCents: 0,
     totalRaisedCents: 0, goalCents: null, photoUrls: [], ...extra } as unknown as PublicAuctionItem);

const kinds = (cells: ReturnType<typeof buildCells>) => cells.map(c => c.kind);

describe('buildCells (scoreboard marquee)', () => {
  it('is empty when there is nothing to show — no heading over nothing', () => {
    expect(buildCells([], [])).toEqual([]);
  });

  it('puts sponsors first, then lots, with a gap between runs and at the wrap', () => {
    const cells = buildCells([sponsor('Acme')], [lot('1')]);
    expect(kinds(cells)).toEqual(['heading', 'sponsor', 'gap', 'heading', 'lot', 'gap']);
    expect(cells[0]).toMatchObject({ text: 'Thank You to Our Sponsors' });
    expect(cells[3]).toMatchObject({ text: 'Bid on These Items' });
  });

  it('omits the sponsor run whole when there are no sponsors (no leading gap)', () => {
    expect(kinds(buildCells([], [lot('1')]))).toEqual(['heading', 'lot', 'gap']);
  });

  it('omits the lot run whole when nothing is open', () => {
    expect(kinds(buildCells([sponsor('Acme')], []))).toEqual(['heading', 'sponsor', 'gap']);
  });

  it('quotes the current bid on a silent lot, or invites the first bid', () => {
    const [, bid] = buildCells([], [lot('1', { currentHighBidCents: 2_500_000 })]);
    expect(bid).toMatchObject({ kind: 'lot', label: 'Bidding now', amount: 'Current bid $25,000.00' });
    const [, open] = buildCells([], [lot('2')]);
    expect(open).toMatchObject({ amount: 'Open for bids' });
  });

  it('never quotes a bid to beat on a Fund-a-Need — pledges stack', () => {
    const [, withGoal] = buildCells([], [lot('1', {
      auctionType: 'DonationSilent', totalRaisedCents: 150_000, goalCents: 500_000 } as never)]);
    expect(withGoal).toMatchObject({ label: 'Fund a need', amount: '$1,500.00 raised of $5,000.00' });
    expect((withGoal as { amount: string }).amount).not.toMatch(/bid/i);

    const [, noGoal] = buildCells([], [lot('2', {
      auctionType: 'DonationSilent', totalRaisedCents: 150_000 } as never)]);
    expect(noGoal).toMatchObject({ amount: '$1,500.00 raised' });
  });

  it('uses the first photo as the thumbnail, null when there is none', () => {
    const [, withPhoto] = buildCells([], [lot('1', { photoUrls: ['a.jpg', 'b.jpg'] })]);
    expect(withPhoto).toMatchObject({ photoUrl: 'a.jpg' });
    const [, none] = buildCells([], [lot('2', { photoUrls: undefined } as never)]);
    expect(none).toMatchObject({ photoUrl: null });
  });

  it('gives every cell a unique key, even for same-named sponsors', () => {
    const cells = buildCells([sponsor('Acme'), sponsor('Acme')], [lot('1'), lot('2')]);
    const keys = cells.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
