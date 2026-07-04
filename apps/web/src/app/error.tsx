'use client';

import { useEffect } from 'react';

/**
 * Segment-level error boundary (problemList A4). Next.js renders this in
 * place of a crashed route segment — the SiteHeader and root layout stay up,
 * and reset() re-renders the segment. CSS variables from the root layout are
 * still available here, so the card follows the site theme.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Surface the underlying throw — the boundary is a safety net, not a fix.
  useEffect(() => {
    console.error('[error boundary] render error caught:', error);
  }, [error]);

  return (
    <main style={s.wrap}>
      <div style={s.card}>
        <div style={s.emoji}>⛳</div>
        <h1 style={s.title}>Something went wrong</h1>
        <p style={s.message}>
          This page hit an unexpected error. Try again — if it keeps happening,
          the event page may be temporarily unavailable.
        </p>
        <pre style={s.errorBox}>{error.message || String(error)}</pre>
        <button type="button" style={s.retryBtn} onClick={() => reset()}>
          Try Again
        </button>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '60vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '2rem 1rem',
  },
  card: {
    width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16,
    padding: '2rem', textAlign: 'center', border: '1px solid #e0e6c8',
  },
  emoji:   { fontSize: '2.5rem' },
  title:   { fontSize: '1.25rem', margin: '0.5rem 0 0', color: 'var(--color-primary, #31572c)' },
  message: { color: '#555', fontSize: '0.9rem', marginTop: '0.5rem' },
  errorBox: {
    background: '#f8f8f4', borderRadius: 8, padding: '0.6rem',
    marginTop: '1rem', fontSize: '0.75rem', color: '#8a5a44',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96,
    overflow: 'auto', textAlign: 'left',
  },
  retryBtn: {
    marginTop: '1.1rem', background: 'var(--color-primary, #31572c)', color: '#fff',
    border: 'none', borderRadius: 10, padding: '0.75rem 2.25rem',
    fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
  },
};
