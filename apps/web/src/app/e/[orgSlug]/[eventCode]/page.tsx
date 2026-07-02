import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPublicEvent, fetchPublicLeaderboard } from '@/lib/api';
import EventRegistrationSection from './EventActions';
import EventHeader from './EventHeader';
import EventInfoCard from './EventInfoCard';
import LiveScoresBanner from './LiveScoresBanner';
import LeaderboardCard from './LeaderboardCard';
import EventSidebar from './EventSidebar';
import { buildThemeCss, gridCss, s } from './eventPageStyles';

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
  const leaderboard     = showLeaderboard ? await fetchPublicLeaderboard(eventCode) : null;
  const showDonate      = ['registration', 'active', 'scoring', 'completed'].includes(event.status);

  // Sidebar is rendered when at least one widget has something to show.
  const hasSponsors    = event.sponsors.length > 0;
  const hasFundraising = event.fundraising.grandTotalCents > 0;
  const hasChallenges  = event.sponsors.some(s => s.holeNumbers && s.holeNumbers.length > 0);
  const hasSidebar     = hasSponsors || hasFundraising || hasChallenges || showDonate;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type':    'SportsEvent',
    name:       event.name,
    organizer:  { '@type': 'Organization', name: event.orgName },
    sport:      'Golf',
    ...(event.startAt ? { startDate: event.startAt } : {}),
    ...(event.course ? {
      location: {
        '@type':  'SportsActivityLocation',
        name:     event.course.name,
        address:  { '@type': 'PostalAddress', addressLocality: event.course.city, addressRegion: event.course.state },
      },
    } : {}),
  };

  const themeCss = buildThemeCss(event.resolvedThemeJson);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{gridCss + (themeCss ? `\n:root{${themeCss}}` : '')}</style>

      <div style={s.page}>
        <EventHeader
          orgName={event.orgName}
          eventName={event.name}
          status={event.status}
          logoUrl={event.resolvedLogoUrl}
        />

        <main style={s.main}>
          <div className={hasSidebar ? 'gfp-grid' : undefined}>

            {/* ── LEFT / MAIN COLUMN ── */}
            <div style={s.mainCol}>
              <EventInfoCard event={event} />

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

              {['active', 'scoring'].includes(event.status) && (
                <LiveScoresBanner orgSlug={orgSlug} eventCode={eventCode} />
              )}

              {['registration', 'active'].includes(event.status) && (
                <EventRegistrationSection
                  eventId={event.id}
                  eventCode={event.eventCode}
                  orgName={event.orgName}
                  freeAgentEnabled={event.freeAgentEnabled}
                />
              )}

              {['active', 'scoring'].includes(event.status) && (
                <section style={{ ...s.card, borderLeft: '4px solid var(--color-action)' }}>
                  <h2 style={s.cardTitle}>⛳ Scoring your round?</h2>
                  <p style={{ color: 'var(--color-accent)', marginTop: '0.5rem', lineHeight: 1.6 }}>
                    Open the <strong style={{ color: 'var(--color-primary)' }}>Golf Fundraiser Pro</strong> scorer
                    app and enter this event code with the email you registered with. Your scorecard works even
                    without a signal and syncs to the live leaderboard automatically.
                  </p>
                  <p style={{ color: 'var(--color-accent)', fontSize: '0.9rem', marginTop: '0.85rem', marginBottom: 0 }}>
                    Event code: <code style={s.code}>{event.eventCode}</code>
                  </p>
                </section>
              )}

              <LeaderboardCard
                showLeaderboard={showLeaderboard}
                leaderboard={leaderboard}
                status={event.status}
                orgSlug={orgSlug}
                eventCode={eventCode}
              />

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
                <EventSidebar event={event} showDonate={showDonate} />
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
