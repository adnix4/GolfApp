import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPublicEvent, fetchPublicLeaderboard } from '@/lib/api';
import type { PublicLeaderboard, PublicSponsorInfo, PublicFundraisingInfo } from '@/lib/api';

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
      ...(event.resolvedLogoUrl ? { images: [event.resolvedLogoUrl] } : {}),
    },
  };
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default async function EventPage(
  { params }: { params: Promise<{ orgSlug: string; eventCode: string }> }
) {
  const { orgSlug, eventCode } = await params;
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

  const holeChallenges = sortedSponsors.filter(s => s.holeNumbers && s.holeNumbers.length > 0);
  const hasSidebar     = event.sponsors.length > 0
    || event.fundraising.grandTotalCents > 0
    || holeChallenges.length > 0;

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

  const themeCss = buildThemeCss(event.resolvedThemeJson);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{gridCss + (themeCss ? `\n:root{${themeCss}}` : '')}</style>

      <div style={s.page}>
        {/* ── HEADER ── */}
        <header style={s.header}>
          <div style={s.headerInner}>
            {event.resolvedLogoUrl && (
              <img src={event.resolvedLogoUrl} alt={event.orgName} style={s.orgLogo} />
            )}
            <div>
              <p style={s.orgName}>{event.orgName}</p>
              <h1 style={s.eventName}>{event.name}</h1>
            </div>
            <StatusBadge status={event.status} />
          </div>
        </header>

        <main style={s.main}>
          <div className={hasSidebar ? 'gfp-grid' : undefined}>

            {/* ── LEFT / MAIN COLUMN ── */}
            <div style={s.mainCol}>

              {/* Event Info */}
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

              {/* Mission Statement */}
              {event.missionStatement && (
                <section style={{ ...s.card, borderLeft: '4px solid var(--color-action)' }}>
                  <p style={{ fontSize: '1rem', color: 'var(--color-primary)', lineHeight: 1.6, margin: 0 }}>
                    {event.missionStatement}
                  </p>
                  {event.is501c3 && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-accent)', marginTop: '0.75rem', marginBottom: 0 }}>
                      Donations to {event.orgName} may be tax-deductible as a charitable contribution under IRC § 501(c)(3). Consult your tax advisor.
                    </p>
                  )}
                </section>
              )}
              {!event.missionStatement && event.is501c3 && (
                <section style={{ ...s.card, borderLeft: '4px solid var(--color-action)' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-accent)', margin: 0 }}>
                    Donations to {event.orgName} may be tax-deductible as a charitable contribution under IRC § 501(c)(3). Consult your tax advisor.
                  </p>
                </section>
              )}

              {/* Live Scores Banner */}
              {['active', 'scoring'].includes(event.status) && (
                <LiveScoresBanner orgSlug={orgSlug} eventCode={eventCode} />
              )}

              {/* Registration CTAs */}
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

              {/* Leaderboard */}
              {showLeaderboard ? (
                <section style={s.card}>
                  <div style={s.cardHeader}>
                    <h2 style={s.cardTitle}>Leaderboard</h2>
                    <div style={s.cardHeaderRight}>
                      {event.status === 'completed' && (
                        <span style={s.completedBadge}>Final</span>
                      )}
                      {['active', 'scoring'].includes(event.status) && (
                        <a
                          href={`/e/${orgSlug}/${eventCode}/scores`}
                          style={s.liveLink}
                        >
                          Watch Live →
                        </a>
                      )}
                    </div>
                  </div>
                  {leaderboard && leaderboard.standings.length > 0 ? (
                    <LeaderboardTable leaderboard={leaderboard} />
                  ) : (
                    <p style={s.placeholder}>No scores submitted yet.</p>
                  )}
                </section>
              ) : (
                <section style={{ ...s.card, textAlign: 'center', padding: '2.5rem' }}>
                  <p style={{ fontSize: '2rem' }}>🏆</p>
                  <h2 style={{ ...s.cardTitle, marginTop: '0.5rem' }}>Leaderboard</h2>
                  <p style={s.placeholder}>Scores will appear here once the tournament begins.</p>
                </section>
              )}

              {/* Contact */}
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
            </div>

            {/* ── SIDEBAR ── */}
            {hasSidebar && (
              <aside style={s.sidebar}>

                {/* Donation Thermometer */}
                {event.fundraising.grandTotalCents > 0 && (
                  <DonationThermometer fundraising={event.fundraising} />
                )}

                {/* Hole Challenges */}
                {holeChallenges.length > 0 && (
                  <HoleChallengesWidget sponsors={holeChallenges} />
                )}

                {/* Sponsor Banner */}
                {sortedSponsors.length > 0 && (
                  <SponsorBannerWidget sponsors={sortedSponsors} />
                )}

              </aside>
            )}
          </div>
        </main>

        <footer style={s.footer}>
          <p>Powered by <strong>Golf Fundraiser Pro</strong></p>
        </footer>
      </div>
    </>
  );
}

// ── SIDEBAR WIDGETS ───────────────────────────────────────────────────────────

function DonationThermometer({ fundraising }: { fundraising: PublicFundraisingInfo }) {
  const total = fundraising.grandTotalCents;
  const goal  = fundraising.goalCents;
  const pct   = goal ? Math.min(100, Math.round((total / goal) * 100)) : 100;

  return (
    <div style={w.card}>
      <h3 style={w.title}>💰 Fundraising</h3>
      <p style={w.totalAmt}>{cents(total)}</p>
      <p style={w.totalLabel}>Total Raised</p>

      <div style={w.track}>
        <div style={{ ...w.fill, width: `${pct}%` }} />
      </div>

      {goal ? (
        <div style={w.goalRow}>
          <span style={w.goalPct}>{pct}% of goal</span>
          <span style={w.goalAmt}>{cents(goal)} goal</span>
        </div>
      ) : null}

      {fundraising.donationsCents > 0 && (
        <p style={w.subStat}>
          {cents(fundraising.donationsCents)} from donations
        </p>
      )}
    </div>
  );
}

function HoleChallengesWidget({ sponsors }: { sponsors: PublicSponsorInfo[] }) {
  // Flatten sponsors → one entry per hole number, sorted ascending
  const entries = sponsors
    .flatMap(s => (s.holeNumbers ?? []).map(h => ({ hole: h, name: s.name, desc: s.challengeDescription ?? null })))
    .sort((a, b) => a.hole - b.hole);

  return (
    <div style={w.card}>
      <h3 style={w.title}>🏆 Hole Challenges</h3>
      {entries.map((e, i) => (
        <div key={i} style={w.holeRow}>
          <span style={w.holeNum}>Hole {e.hole}</span>
          <div style={w.holeInfo}>
            {e.desc && <span style={w.holeDesc}>{e.desc}</span>}
            <span style={w.holeSponsor}>{e.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SponsorBannerWidget({ sponsors }: { sponsors: PublicSponsorInfo[] }) {
  const tierColors: Record<string, string> = {
    title: '#8e44ad', gold: '#f39c12', hole: '#16a085',
    silver: '#7f8c8d', bronze: '#d35400',
  };
  return (
    <div style={w.card}>
      <h3 style={w.title}>🤝 Our Sponsors</h3>
      {sponsors.map((sp, i) => (
        <div key={i} style={w.sponsorRow}>
          {sp.logoUrl && (
            <img src={sp.logoUrl} alt={sp.name} style={w.sponsorLogo} />
          )}
          <div style={w.sponsorInfo}>
            <p style={w.sponsorName}>{sp.name}</p>
            {sp.tagline && <p style={w.sponsorTagline}>{sp.tagline}</p>}
          </div>
          <span style={{ ...w.tierDot, backgroundColor: tierColors[sp.tier] ?? '#aaa' }} />
        </div>
      ))}
    </div>
  );
}

// ── EXISTING SUB-COMPONENTS ───────────────────────────────────────────────────

function LiveScoresBanner({ orgSlug, eventCode }: { orgSlug: string; eventCode: string }) {
  return (
    <section style={s.liveBanner}>
      <div style={s.liveBannerInfo}>
        <span style={s.livePill}>
          <span style={s.livePulse} />
          Live
        </span>
        <p style={s.liveBannerText}>Round in progress — scores update in real time</p>
      </div>
      <div style={s.liveBannerActions}>
        <a href={`/e/${orgSlug}/${eventCode}/scores`} style={s.liveBtn}>
          📊 Watch Live Scores
        </a>
        <a href={`/e/${orgSlug}/${eventCode}/scores?tv=1`} style={s.tvBtn}>
          📺 TV Mode
        </a>
      </div>
    </section>
  );
}

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

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function cents(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
}

// ── RESPONSIVE GRID CSS ───────────────────────────────────────────────────────

const gridCss = `
  .gfp-grid {
    display: grid;
    grid-template-columns: 1fr 288px;
    gap: 1.25rem;
    align-items: start;
  }
  @media (max-width: 740px) {
    .gfp-grid { grid-template-columns: 1fr; }
  }
  @keyframes gfp-live-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.85); }
  }
`;

// ── PAGE STYLES ───────────────────────────────────────────────────────────────

const s = {
  page:      { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const },
  header:    { backgroundColor: 'var(--color-primary)', padding: '1.5rem 1rem' },
  headerInner: {
    maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center',
    gap: '1rem', flexWrap: 'wrap' as const,
  },
  orgLogo:   { height: 48, width: 'auto', borderRadius: 6, backgroundColor: '#fff', padding: '4px 8px' },
  orgName:   { fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' as const, letterSpacing: 1 },
  eventName: { fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0 },
  badge:     { padding: '4px 12px', borderRadius: 14, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginLeft: 'auto' },

  main:    { flex: 1, maxWidth: 1160, margin: '0 auto', width: '100%', padding: '1.5rem 1rem' },
  mainCol: { display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' },
  sidebar: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },

  card:      { backgroundColor: '#fff', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  cardHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' },
  cardHeaderRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  cardTitle: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '1rem' },
  infoGrid:  { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  infoItem:  { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  infoIcon:  { fontSize: '1.25rem', lineHeight: 1, marginTop: 2 },
  infoLabel: { fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  infoValue: { fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 },
  ctaRow:    { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' as const, marginBottom: '1rem' },
  ctaBtn:    { display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', transition: 'opacity 0.15s', textDecoration: 'none' },
  ctaNote:   { fontSize: '0.875rem', color: 'var(--color-accent)' },
  completedBadge: { backgroundColor: '#27ae60', color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700 },
  liveLink:  { fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-action)', textDecoration: 'none' },

  liveBanner: {
    backgroundColor: '#f0faf4',
    border: '1px solid #b7e4c7',
    borderLeft: '4px solid #27ae60',
    borderRadius: 12,
    padding: '1.125rem 1.375rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap' as const,
  },
  liveBannerInfo:    { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  livePill: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: '#e74c3c', color: '#fff',
    padding: '3px 10px', borderRadius: 12,
    fontSize: '0.75rem', fontWeight: 800, letterSpacing: 0.5,
    flexShrink: 0,
  },
  livePulse: {
    width: 7, height: 7, borderRadius: '50%',
    backgroundColor: '#fff',
    display: 'inline-block',
    animation: 'gfp-live-pulse 1.4s ease-in-out infinite',
  },
  liveBannerText:    { fontSize: '0.9rem', fontWeight: 600, color: '#1a6b3c' },
  liveBannerActions: { display: 'flex', gap: '0.625rem', flexWrap: 'wrap' as const },
  liveBtn: {
    display: 'inline-block',
    padding: '0.5rem 1.125rem',
    borderRadius: 8,
    fontWeight: 700, fontSize: '0.875rem',
    textDecoration: 'none',
    backgroundColor: '#27ae60', color: '#fff',
    whiteSpace: 'nowrap' as const,
  },
  tvBtn: {
    display: 'inline-block',
    padding: '0.5rem 1.125rem',
    borderRadius: 8,
    fontWeight: 700, fontSize: '0.875rem',
    textDecoration: 'none',
    backgroundColor: 'transparent', color: '#27ae60',
    border: '1.5px solid #27ae60',
    whiteSpace: 'nowrap' as const,
  },
  placeholder: { color: 'var(--color-accent)', fontSize: '0.95rem', fontStyle: 'italic' },
  table:     { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.95rem' },
  th:        { padding: '0.625rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  td:        { padding: '0.625rem 1rem', fontSize: '0.95rem', color: 'var(--color-primary)' },
  code:      { backgroundColor: '#e8f0e8', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.875rem' },
  footer:    { textAlign: 'center' as const, padding: '1.5rem', fontSize: '0.8rem', color: 'var(--color-accent)', borderTop: '1px solid #eee' },
} as const;

// ── THEME CSS HELPER ──────────────────────────────────────────────────────────

function buildThemeCss(themeJson: string | null): string {
  if (!themeJson) return '';
  try {
    const t = JSON.parse(themeJson) as Record<string, string>;
    const vars = Object.entries(t)
      .filter(([, v]) => /^#[0-9a-fA-F]{6}$/.test(v))
      .map(([k, v]) => `--color-${k}:${v}`)
      .join(';');
    return vars;
  } catch { return ''; }
}

// ── WIDGET STYLES ─────────────────────────────────────────────────────────────

const w = {
  card:     { backgroundColor: '#fff', borderRadius: 12, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  title:    { fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: '0.875rem' },

  // Thermometer
  totalAmt:   { fontSize: '2rem', fontWeight: 900, color: 'var(--color-primary)', lineHeight: 1 },
  totalLabel: { fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: '0.75rem', marginTop: 2 },
  track:      { height: 14, backgroundColor: '#e8f0e8', borderRadius: 7, overflow: 'hidden', marginBottom: '0.5rem' },
  fill:       { height: '100%', backgroundColor: 'var(--color-action)', borderRadius: 7, transition: 'width 0.6s ease' },
  goalRow:    { display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' },
  goalPct:    { fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-action)' },
  goalAmt:    { fontSize: '0.8rem', color: 'var(--color-accent)' },
  subStat:    { fontSize: '0.8rem', color: 'var(--color-accent)', marginTop: '0.5rem' },

  // Hole Challenges
  holeRow:    { display: 'flex', alignItems: 'flex-start', gap: '0.625rem', paddingVertical: '0.5rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.5rem' },
  holeNum:    { fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-primary)', minWidth: 52, paddingTop: 1 },
  holeInfo:   { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  holeDesc:   { fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' },
  holeSponsor:{ fontSize: '0.75rem', color: 'var(--color-accent)' },

  // Sponsors
  sponsorRow:    { display: 'flex', alignItems: 'center', gap: '0.625rem', paddingTop: '0.625rem', borderTop: '1px solid #f0f0f0' },
  sponsorLogo:   { width: 36, height: 36, objectFit: 'contain' as const, borderRadius: 4, flexShrink: 0 },
  sponsorInfo:   { flex: 1, minWidth: 0 },
  sponsorName:   { fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  sponsorTagline:{ fontSize: '0.7rem', color: 'var(--color-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  tierDot:       { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
} as const;
