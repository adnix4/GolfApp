'use client';

/**
 * Golfer "find your event" front door. Two ways in:
 *  1. Browse the live directory of open events (GET /pub/events/active) with a
 *     client-side name/org filter — each card links to /e/{orgSlug}/{eventCode}.
 *  2. Type an event code → resolve via fetchPublicEvent(code) → redirect.
 * Email links & organizer QR codes already land straight on the event page,
 * so this page is for golfers who don't have the direct link.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchActiveEvents, fetchPublicEvent, type ActiveEventSummary } from '@/lib/api';
import { L } from '../landingStyles';

const STATUS: Record<string, { label: string; color: string }> = {
  Registration: { label: 'Registration Open', color: '#2e7d32' },
  Active:       { label: 'Event Day',          color: '#1565c0' },
  Scoring:      { label: 'In Progress',        color: '#e65100' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function EventsPage() {
  const router = useRouter();
  const [events,  setEvents]  = useState<ActiveEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState('');
  const [code,    setCode]    = useState('');
  const [resolving, setResolving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveEvents().then(data => { setEvents(data); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.orgName.toLowerCase().includes(q) ||
      (e.courseName ?? '').toLowerCase().includes(q) ||
      (e.courseCity ?? '').toLowerCase().includes(q),
    );
  }, [events, query]);

  async function goToCode(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) { setCodeError('Enter an event code.'); return; }
    setCodeError(null);
    setResolving(true);
    try {
      const data = await fetchPublicEvent(c);
      if (data) router.push(`/e/${data.orgSlug}/${data.eventCode}`);
      else setCodeError(`No event found for code "${c}". Check the code with your organizer.`);
    } catch {
      setCodeError('Could not look up that code. Please try again.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <main style={L.page}>
      <div style={{ ...L.container, paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
        <h1 style={{ ...L.sectionTitle, textAlign: 'left', fontSize: '1.9rem' }}>Find your event</h1>
        <p style={{ ...L.sectionSub, textAlign: 'left', marginLeft: 0, marginBottom: '1.75rem' }}>
          Search for your tournament below, or enter the event code your organizer gave you.
        </p>

        {/* ── EVENT CODE BOX ── */}
        <form onSubmit={goToCode} style={ec.codeBox}>
          <input
            value={code}
            onChange={ev => { setCode(ev.target.value.toUpperCase()); setCodeError(null); }}
            placeholder="Have a code? e.g. ABC12345"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={ec.codeInput}
            aria-label="Event code"
          />
          <button type="submit" disabled={resolving} style={{ ...L.ctaOnLight, opacity: resolving ? 0.6 : 1, border: 'none', cursor: 'pointer' }}>
            {resolving ? 'Looking up…' : 'Go →'}
          </button>
        </form>
        {codeError && <p style={ec.error}>{codeError}</p>}

        {/* ── SEARCH ── */}
        <input
          value={query}
          onChange={ev => setQuery(ev.target.value)}
          placeholder="Search by event, organization, or course…"
          style={ec.search}
          aria-label="Search events"
        />

        {/* ── DIRECTORY ── */}
        {loading ? (
          <p style={ec.muted}>Loading tournaments…</p>
        ) : events.length === 0 ? (
          <p style={ec.muted}>No tournaments are open right now. If you have an event code, enter it above.</p>
        ) : filtered.length === 0 ? (
          <p style={ec.muted}>No events match “{query}”. Try a different search, or use your event code above.</p>
        ) : (
          <div style={ec.grid}>
            {filtered.map(e => {
              const st = STATUS[e.status];
              const meta = [e.orgName, e.courseName, e.courseCity && e.courseState ? `${e.courseCity}, ${e.courseState}` : null, formatDate(e.startAt)].filter(Boolean).join(' · ');
              return (
                <a key={e.id} href={`/e/${e.orgSlug}/${e.eventCode}`} style={ec.card} className="gfp-cta">
                  <div style={ec.cardName}>{e.name}</div>
                  <div style={ec.cardMeta}>{meta}</div>
                  {st && <span style={{ ...ec.badge, backgroundColor: st.color + '18', color: st.color }}>{st.label}</span>}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

const ec: Record<string, React.CSSProperties> = {
  codeBox:   { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' },
  codeInput: { flex: '1 1 260px', border: '1.5px solid var(--color-accent)', borderRadius: 12, padding: '0.85rem 1rem', fontSize: '1rem', color: 'var(--color-primary)', backgroundColor: '#fff', textTransform: 'uppercase', letterSpacing: 1 },
  error:     { color: '#c0392b', fontSize: '0.9rem', margin: '0.25rem 0 0' },
  search:    { width: '100%', border: '1px solid #ddd', borderRadius: 12, padding: '0.85rem 1rem', fontSize: '1rem', color: 'var(--color-primary)', backgroundColor: '#fff', margin: '1.5rem 0' },
  muted:     { color: '#4b5563', fontSize: '0.95rem', padding: '1rem 0' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' },
  card:      { display: 'block', backgroundColor: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
  cardName:  { color: 'var(--color-primary)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.35rem' },
  cardMeta:  { color: '#4b5563', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '0.75rem' },
  badge:     { display: 'inline-block', fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: 999 },
};
