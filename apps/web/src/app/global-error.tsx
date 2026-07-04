'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary (problemList A4): catches throws in the ROOT layout
 * itself, which error.tsx cannot. It replaces the entire document, so it must
 * render its own <html>/<body> and cannot rely on the layout's CSS variables —
 * everything is self-contained static styling.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global-error boundary] root layout error caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={s.body}>
        <div style={s.card}>
          <div style={s.emoji}>⛳</div>
          <h1 style={s.title}>Something went wrong</h1>
          <p style={s.message}>Golf Fundraiser Pro hit an unexpected error. Try again.</p>
          <pre style={s.errorBox}>{error.message || String(error)}</pre>
          <button type="button" style={s.retryBtn} onClick={() => reset()}>
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}

const s: Record<string, React.CSSProperties> = {
  body: {
    margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '2rem 1rem', background: '#f4f7de',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16,
    padding: '2rem', textAlign: 'center', border: '1px solid #e0e6c8',
  },
  emoji:   { fontSize: '2.5rem' },
  title:   { fontSize: '1.25rem', margin: '0.5rem 0 0', color: '#31572c' },
  message: { color: '#555', fontSize: '0.9rem', marginTop: '0.5rem' },
  errorBox: {
    background: '#f8f8f4', borderRadius: 8, padding: '0.6rem',
    marginTop: '1rem', fontSize: '0.75rem', color: '#8a5a44',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 96,
    overflow: 'auto', textAlign: 'left',
  },
  retryBtn: {
    marginTop: '1.1rem', background: '#31572c', color: '#fff',
    border: 'none', borderRadius: 10, padding: '0.75rem 2.25rem',
    fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
  },
};
