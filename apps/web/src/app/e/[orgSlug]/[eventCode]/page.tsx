import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPublicEvent, fetchPublicLeaderboard } from '@/lib/api';
import type { PublicLeaderboard, PublicSponsorInfo } from '@/lib/api';

// ── METADATA ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ orgSlug: string; eventCode: string }> }
): Promise<Metadata> {
  const { eventCode } = await params;
  const event = await fetchPublicEvent(eventCode);
  if (!event) return { title: 'Event Not Found' };

  const dateStr = event.startAt
    ? new Date(event.startAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const description = [
    `${event.orgName} golf fundraiser`,
    event.format,
    dateStr,
    event.course ? `at ${event.course.name}` : '',
  ].filter(Boolean).join(' · ');

  return {
    title: event.name,
    description,
    openGraph: {
      title: event.name,
      description,
      type: 'website',
      ...(event.orgLogoUrl ? { images: [event.orgLogoUrl] } : {}),
    },
  };
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default async function EventPage(
  { params }: { params: Promise<{ orgSlug: string; eventCode: string }> }
) {
  const { eventCode } = await params;
  const event = await fetchPublicEvent(eventCode);
  if (!event) notFound();

  const showLeaderboard = ['active', 'scoring', 'completed'].includes(event.status);
  const leaderboard = showLeaderboard ? await fetchPublicLeaderboard(eventCode) : null;

  const dateStr = event.startAt
    ? new Date(event.startAt).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;

  const tierOrder = ['title', 'gold', 'hole', 'silver', 'bronze'];
  const sortedSponsors = [...event.sponsors].sort(
    (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    organizer: { '@type': 'Organization', name: event.orgName },
    sport: 'Golf',
    ...(event.startAt ? { startDate: event.startAt } : {}),
    ...(event.course ? {
      location: {
        '@type': 'SportsActivityLocation',
        name: event.course.name,
        address: { '@type': 'PostalAddress', addressLocality: event.course.city, addressRegion: event.course.state },
      },
    } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={s.page}>
        {/* ── HEADER ── */}
        <header style={s.header}>
          <div style={s.headerInner}>
            {event.orgLogoUrl && (
    <img src={event.orgLogoUrl} alt={event.orgName} style={s.orgLogo} />
            )}
            <div>
              <p style={s.orgName}>{event.orgName}</p>
              <h1 style={s.eventName}>{event.name}</h1>
            </div>
            <StatusBadge status={event.status} />
          </div>
        </header>

        <main style={s.main}>
          {/* ── EVENT INFO ── */}
          <section style={s.card}>
            <div style={s.infoGrid}>
              {dateStr && <InfoItem icon="📅" label="Date" value={dateStr} />}
              <InfoItem icon="⛳" label="Format" value={fmt(event.format)} />
              {event.course && (
                <InfoItem icon="📍" label="Course" value={`${event.course.name} — ${event.course.city}, ${event.course.state}`} />
              )}
              {event.spotsRemaining != null && (
                <InfoItem
                  icon="👥"
                  label="Team Spots"
                  value={event.spotsRemaining === 0
                    ? 'Event full'
                    : `${event.spotsRemaining} spot${event.spotsRemaining !== 1 ? 's' : ''} remaining`}
                />
              )}
            </div>
          </section>

          {/* ── REGISTRATION CTAs ── */}
          {['registration', 'active'].includes(event.status) && (
            <section style={s.card} id="register">
              <h2 style={s.cardTitle}>Join the Tournament</h2>
              <div style={s.ctaRow}>
                <CTAButton href="#contact" primary label="Register a Team" />
                <CTAButton href="#contact" label="Join a Team" />
                {event.freeAgentEnabled && (
                  <CTAButton href="#contact" label="I Need a Team" />
                )}
              </div>
              <p style={s.ctaNote}>
                Contact {event.orgName} to register or for more information.
              </p>
            </section>
          )}

          {/* ── FUNDRAISING ── */}
          {event.fundraising.grandTotalCents > 0 && (
            <section style={s.card}>
              <h2 style={s.cardTitle}>Fundraising</h2>
              <div style={s.statRow}>
                <div style={s.stat}>
                  <span style={s.statValue}>{cents(event.fundraising.grandTotalCents)}</span>
                  <span style={s.statLabel}>Total Raised</span>
                </div>
                <div style={s.stat}>
                  <span style={s.statValue}>{cents(event.fundraising.donationsCents)}</span>
                  <span style={s.statLabel}>Donations</span>
                </div>
              </div>
            </section>
          )}

          {/* ── LEADERBOARD ── */}
          {showLeaderboard && (
            <section style={s.card}>
              <div style={s.cardHeader}>
                <h2 style={s.cardTitle}>Leaderboard</h2>
                {event.status === 'completed' && (
                  <span style={s.completedBadge}>Final</span>
                )}
              </div>
              {leaderboard && leaderboard.standings.length > 0 ? (
                <LeaderboardTable leaderboard={leaderboard} />
              ) : (
                <p style={s.placeholder}>No scores submitted yet.</p>
              )}
            </section>
          )}

          {!showLeaderboard && (
            <section style={{ ...s.card, textAlign: 'center', padding: '2.5rem' }}>
              <p style={{ fontSize: '2rem' }}>🏆</p>
              <h2 style={{ ...s.cardTitle, marginTop: '0.5rem' }}>Leaderboard</h2>
              <p style={s.placeholder}>Scores will appear here once the tournament begins.</p>
            </section>
          )}

          {/* ── SPONSORS ── */}
          {sortedSponsors.length > 0 && (
            <section style={s.card}>
              <h2 style={s.cardTitle}>Our Sponsors</h2>
              <SponsorGrid sponsors={sortedSponsors} />
            </section>
          )}

          {/* ── CONTACT ── */}
          <section style={{ ...s.card, textAlign: 'center' }} id="contact">
            <h2 style={s.cardTitle}>Get Involved</h2>
            <p style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>
              Questions about registration or the event? Reach out to{' '}
              <strong style={{ color: 'var(--color-primary)' }}>{event.orgName}</strong>.
            </p>
            <p style={{ color: 'var(--color-accent)', fontSize: '0.875rem', marginTop: '1rem' }}>
              Event code: <code style={s.code}>{event.eventCode}</code>
            </p>
          </section>
        </main>

        <footer style={s.footer}>
          <p>Powered by <strong>Golf Fundraiser Pro</strong></p>
        </footer>
      </div>
    </>
  );
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    registration: { bg: '#3498db', text: '#fff' },
    active:       { bg: '#2ecc71', text: '#fff' },
    scoring:      { bg: '#f39c12', text: '#fff' },
    completed:    { bg: '#27ae60', text: '#fff' },
  };
  const c = colors[status];
  if (!c) return null;
  return (
    <span style={{ backgroundColor: c.bg, color: c.text, ...s.badge }}>
      {status === 'active' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.infoItem}>
      <span style={s.infoIcon}>{icon}</span>
      <div>
        <p style={s.infoLabel}>{label}</p>
        <p style={s.infoValue}>{value}</p>
      </div>
    </div>
  );
}

function CTAButton({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      style={{
        ...s.ctaBtn,
        backgroundColor: primary ? 'var(--color-primary)' : 'transparent',
        color: primary ? '#fff' : 'var(--color-primary)',
        border: `2px solid var(--color-primary)`,
      }}
    >
      {label}
    </a>
  );
}

function LeaderboardTable({ leaderboard }: { leaderboard: PublicLeaderboard }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.table}>
        <thead>
          <tr style={{ backgroundColor: 'var(--color-highlight)' }}>
            <th style={{ ...s.th, width: 40, textAlign: 'center' }}>#</th>
            <th style={{ ...s.th, textAlign: 'left' }}>Team</th>
            <th style={{ ...s.th, width: 70, textAlign: 'right' }}>To Par</th>
            <th style={{ ...s.th, width: 60, textAlign: 'right' }}>Thru</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.standings.map((entry, i) => {
            const toParLabel = entry.toPar === 0 ? 'E' : entry.toPar > 0 ? `+${entry.toPar}` : `${entry.toPar}`;
            const toParColor = entry.toPar < 0 ? '#27ae60' : entry.toPar > 0 ? '#e74c3c' : 'var(--color-primary)';
            const thru = entry.isComplete ? 'F' : String(entry.holesComplete);
            return (
              <tr key={i} style={{ borderBottom: '1px solid #eee', backgroundColor: i % 2 === 0 ? '#fff' : 'var(--color-surface)' }}>
                <td style={{ ...s.td, textAlign: 'center', fontWeight: 700 }}>{entry.rank}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{entry.teamName}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: toParColor }}>{toParLabel}</td>
                <td style={{ ...s.td, textAlign: 'right', color: 'var(--color-accent)' }}>{thru}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SponsorGrid({ sponsors }: { sponsors: PublicSponsorInfo[] }) {
  const tierColors: Record<string, string> = {
    title: '#8e44ad', gold: '#f39c12', hole: '#16a085', silver: '#7f8c8d', bronze: '#d35400',
  };
  return (
    <div style={s.sponsorGrid}>
      {sponsors.map((sponsor, i) => (
        <div key={i} style={s.sponsorCard}>
          {sponsor.logoUrl && (
<img src={sponsor.logoUrl} alt={sponsor.name} style={s.sponsorLogo} />
          )}
          <p style={s.sponsorName}>{sponsor.name}</p>
          {sponsor.tagline && <p style={s.sponsorTagline}>{sponsor.tagline}</p>}
          <span style={{ ...s.tierBadge, backgroundColor: tierColors[sponsor.tier] ?? '#999' }}>
            {sponsor.tier}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function cents(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const s = {
  page:      { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const },
  header:    { backgroundColor: 'var(--color-primary)', padding: '1.5rem 1rem' },
  headerInner: {
    maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center',
    gap: '1rem', flexWrap: 'wrap' as const,
  },
  orgLogo:   { height: 48, width: 'auto', borderRadius: 6, backgroundColor: '#fff', padding: '4px 8px' },
  orgName:   { fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' as const, letterSpacing: 1 },
  eventName: { fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0 },
  badge:     { padding: '4px 12px', borderRadius: 14, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginLeft: 'auto' },
  main:      { flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' },
  card:      { backgroundColor: '#fff', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  cardHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' },
  cardTitle: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '1rem' },
  infoGrid:  { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  infoItem:  { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  infoIcon:  { fontSize: '1.25rem', lineHeight: 1, marginTop: 2 },
  infoLabel: { fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  infoValue: { fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 },
  ctaRow:    { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' as const, marginBottom: '1rem' },
  ctaBtn:    { display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', transition: 'opacity 0.15s', textDecoration: 'none' },
  ctaNote:   { fontSize: '0.875rem', color: 'var(--color-accent)' },
  statRow:   { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const },
  stat:      { display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' },
  statValue: { fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)' },
  statLabel: { fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  completedBadge: { backgroundColor: '#27ae60', color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700 },
  placeholder: { color: 'var(--color-accent)', fontSize: '0.95rem', fontStyle: 'italic' },
  table:     { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.95rem' },
  th:        { padding: '0.625rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  td:        { padding: '0.625rem 1rem', fontSize: '0.95rem', color: 'var(--color-primary)' },
  sponsorGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '1rem', marginTop: '0.5rem' },
  sponsorCard: { border: '1px solid #e8e8e8', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.5rem', minWidth: 140 },
  sponsorLogo: { height: 48, maxWidth: 120, objectFit: 'contain' as const },
  sponsorName: { fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)', textAlign: 'center' as const },
  sponsorTagline: { fontSize: '0.75rem', color: 'var(--color-accent)', textAlign: 'center' as const },
  tierBadge: { padding: '2px 8px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' as const },
  code:      { backgroundColor: '#e8f0e8', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.875rem' },
  footer:    { textAlign: 'center' as const, padding: '1.5rem', fontSize: '0.8rem', color: 'var(--color-accent)', borderTop: '1px solid #eee' },
} as const;
