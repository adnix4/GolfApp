'use client';

import { useEffect, useState } from 'react';
import type { PublicEventData } from '@/lib/api';
import { tv } from './scoresPollerStyles';

/**
 * TV-mode-only rotating sponsor strip pinned at the bottom of the page.
 * Cycles through the configured sponsors with a fade transition, paused
 * automatically when fewer than 2 sponsors are available.
 */

const TICKER_INTERVAL_MS = 5_000;

export default function SponsorTicker({
  sponsors,
}: {
  sponsors: PublicEventData['sponsors'];
}) {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (sponsors.length < 2) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % sponsors.length);
        setVisible(true);
      }, 400);
    }, TICKER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sponsors.length]);

  const sp = sponsors[idx];
  if (!sp) return null;

  return (
    <div style={tv.ticker}>
      <span style={tv.tickerLabel}>SPONSORED BY</span>
      <div style={{ ...tv.tickerContent, opacity: visible ? 1 : 0, transition: 'opacity 0.35s ease' }}>
        {sp.logoUrl && (
          <img src={sp.logoUrl} alt={sp.name} style={tv.tickerLogo} />
        )}
        <span style={tv.tickerName}>{sp.name}</span>
        {sp.tagline && <span style={tv.tickerTagline}>— {sp.tagline}</span>}
      </div>
    </div>
  );
}
