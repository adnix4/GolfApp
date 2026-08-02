'use client';

import { useEffect, useMemo, useState } from 'react';
// formatCents, not formatCentsShort: this can end up on a projector, and a
// five-figure lot reading "$25000.00" without grouping is hard to take in at a
// glance. Matches the event page's fundraising totals.
import { formatCents, isDonationItem } from '@gfp/shared-types';
import type { PublicAuctionItem, PublicEventData } from '@/lib/api';
import { nm, tv } from './scoresPollerStyles';

/**
 * One continuous marquee across the live scoreboard, carrying the event's
 * sponsors and whatever auction lots are still open (problem list U2 + U3).
 *
 * Replaced a TV-only strip that faded between sponsors one at a time. Two
 * problems with that: the normal web scorecard — which is what almost every
 * golfer and guest actually looks at — carried no sponsor recognition at all,
 * and a fade shows one name per five seconds, so a sponsor twelfth in the list
 * was effectively invisible. A single scrolling track puts every sponsor and
 * every open lot past the viewer on a fixed cycle, and doubles as the auction's
 * only presence on the scoreboard.
 *
 * Sponsors lead: they paid for placement and their entry is static, so a
 * consistent position is worth more to them than proximity to the bidding.
 */

/** Seconds of travel per cell — the cycle grows with the content so a long list
 *  doesn't turn into a blur, and a short one doesn't crawl. */
const SECONDS_PER_CELL = 6;
const MIN_DURATION_S   = 20;

type Cell =
  | { kind: 'sponsor'; key: string; name: string; logoUrl: string; tagline: string | null }
  | { kind: 'lot';     key: string; title: string; label: string; amount: string };

function buildCells(
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
      label:  donation ? 'Fund a need' : 'Bidding now',
      amount: donation
        ? `${formatCents(item.totalRaisedCents)} raised${
            item.goalCents ? ` of ${formatCents(item.goalCents)}` : ''}`
        : item.currentHighBidCents > 0
          ? `Current bid ${formatCents(item.currentHighBidCents)}`
          : 'Open for bids',
    };
  });

  return [...sponsorCells, ...lotCells];
}

export default function EventTicker({
  sponsors,
  auctionItems,
  tvMode,
}: {
  sponsors:     PublicEventData['sponsors'];
  auctionItems: PublicAuctionItem[];
  tvMode:       boolean;
}) {
  const st    = tvMode ? tv : nm;
  const cells = useMemo(() => buildCells(sponsors, auctionItems), [sponsors, auctionItems]);

  // The CSS media query already stops the animation before hydration; this
  // additionally drops the duplicate copy, which exists only to make the loop
  // seamless and is just repetition once nothing is moving.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (cells.length === 0) return null;

  const durationS = Math.max(MIN_DURATION_S, cells.length * SECONDS_PER_CELL);

  const renderCell = (cell: Cell) => (
    <span key={cell.key} style={st.tickerCell}>
      {cell.kind === 'sponsor' ? (
        <>
          <span style={st.tickerChip}>Sponsor</span>
          {/* Plain <img>, as everywhere else sponsor art appears: the URL comes
              from whatever host the organizer uploaded to, and next/image would
              need each one allowlisted. alt="" because the name follows it. */}
          {cell.logoUrl && <img src={cell.logoUrl} alt="" style={st.tickerLogo} />}
          <span style={st.tickerName}>{cell.name}</span>
          {cell.tagline && <span style={st.tickerTagline}>{cell.tagline}</span>}
        </>
      ) : (
        <>
          <span style={st.tickerChip}>{cell.label}</span>
          <span style={st.tickerName}>{cell.title}</span>
          <span style={st.tickerSep}>·</span>
          <span style={st.tickerPrice}>{cell.amount}</span>
        </>
      )}
    </span>
  );

  return (
    <div style={st.ticker}>
      <div className="gfp-ticker-viewport" style={st.tickerViewport}>
        <div
          className="gfp-ticker-track"
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            whiteSpace:   'nowrap',
            willChange:   'transform',
            animation:    reducedMotion
              ? undefined
              : `gfp-ticker ${durationS}s linear infinite`,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {cells.map(renderCell)}
          </span>
          {/* Second copy is presentational only — it exists so translateX(-50%)
              wraps without a gap, and a screen reader must not read the list
              through twice. */}
          {!reducedMotion && (
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
              {cells.map(renderCell)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
