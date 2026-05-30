'use client';

import { useEffect, useState } from 'react';
import { nm, tv } from './scoresPollerStyles';

/**
 * Status ticker shown in the footer (normal mode) or status bar (TV mode).
 * Counts the seconds since the last leaderboard update and shows them as
 * "Updated Ns ago", switching to "Live · Updated Ns ago" while SignalR is
 * connected and to an error string when polling is failing.
 *
 * Lives in its own component so its 1-second tick only re-renders this span
 * — keeping it in the parent would re-render the entire standings table
 * every second, which on TV mode with 50+ teams was the dominant CPU cost.
 */

const FALLBACK_POLL_MS = 15_000;

export default function UpdatedAgo({
  lastUpdated,
  connected,
  fetchError,
  tvMode,
}: {
  lastUpdated: Date | null;
  connected:   boolean;
  fetchError:  boolean;
  tvMode:      boolean;
}) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    setSecondsAgo(0);
    const id = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  if (fetchError) {
    return (
      <span style={tvMode ? tv.statusError : nm.footerError}>
        Connection issue — retrying…
      </span>
    );
  }

  if (!lastUpdated) {
    return <span style={tvMode ? tv.statusMeta : nm.footerMeta}>Loading…</span>;
  }

  const text = tvMode
    ? (connected ? `Live · Updated ${secondsAgo}s ago` : `Updated ${secondsAgo}s ago`)
    : (connected
        ? `Live · Updated ${secondsAgo}s ago`
        : `Updated ${secondsAgo}s ago · polling every ${FALLBACK_POLL_MS / 1000}s`);

  return <span style={tvMode ? tv.statusMeta : nm.footerMeta}>{text}</span>;
}
