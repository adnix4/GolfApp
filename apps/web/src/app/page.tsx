import type { Metadata } from 'next';
import { gfpLogoDataUri, GFP_LOGO_ON_DARK } from '@gfp/shared-types';
import { ADMIN_URL } from '@/lib/api';
import { L, landingCss } from './landingStyles';
import Walkthrough from './Walkthrough';

export const metadata: Metadata = {
  title: 'Golf Fundraiser Pro — the all-in-one platform for charity golf events',
  description:
    'Run beautiful, profitable golf fundraisers. Team registration, offline mobile scoring, a live public leaderboard, silent & live auctions, and sponsor management — in one platform.',
};

const ADMIN_REGISTER = `${ADMIN_URL}/register`;
const ADMIN_LOGIN = `${ADMIN_URL}/login`;

const FEATURES = [
  { icon: '📋', title: 'Event Management',      desc: 'Create and configure tournaments in minutes — format, holes, start type, and course.' },
  { icon: '👥', title: 'Team Registration',     desc: 'QR check-in, fee tracking, handicap entry, and full roster management.' },
  { icon: '🏆', title: 'Live Leaderboard',      desc: 'Real-time standings with par tracking, hole-by-hole scorecards, and TV mode.' },
  { icon: '🎯', title: 'Hole Challenges',       desc: 'Closest to pin, longest drive, and custom contests. Sponsor each hole for extra revenue.' },
  { icon: '💰', title: 'Auction & Fundraising', desc: 'Silent and live auctions built in. A donation thermometer keeps donors engaged.' },
  { icon: '📧', title: 'Email Builder',         desc: 'Professional event emails with sponsor logos, QR codes, and registration links.' },
  { icon: '🏅', title: 'Sponsor Management',    desc: 'Title, Gold, Silver, and custom tiers with logos, links, and hole sponsorships.' },
  { icon: '📊', title: 'Real-Time Dashboard',   desc: 'Live fundraising totals, check-in progress, and scoring status in one place.' },
];

const STATS = [
  { value: 'Free',      label: 'to get started' },
  { value: 'Minutes',   label: 'to launch your event' },
  { value: 'Real-Time', label: 'leaderboard' },
  { value: '100%',      label: 'mobile friendly' },
];

// The "quick run through of an event" — one card per lifecycle phase. `shot` is a
// screenshot path under /public; null renders a styled placeholder.
const STEPS: { phase: string; title: string; desc: string; shot: string | null }[] = [
  { phase: 'Registration', title: 'Sign up & fundraise', desc: 'Share a branded event page — teams register and pay, while sponsors and donations roll in before the first tee.', shot: '/screenshots/registration.png' },
  { phase: 'Scoring',       title: 'Live leaderboard',    desc: 'Golfers score on the mobile app, even with no signal. Scores sync to a real-time public leaderboard and big-screen TV mode.', shot: '/screenshots/scoring.png' },
  { phase: 'Completed',     title: 'Final results',       desc: 'Final standings publish instantly, auction winners are charged automatically, and donation receipts and totals are ready to report.', shot: '/screenshots/completed.png' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Golf Fundraiser Pro',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, iOS, Android',
  description: 'All-in-one platform for charity golf tournaments: registration, offline mobile scoring, live leaderboard, auctions, and sponsor management.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free to get started' },
};

export default function Home() {
  return (
    <main style={L.page}>
      <style dangerouslySetInnerHTML={{ __html: landingCss }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── HERO ── */}
      <header style={L.hero}>
        {/* Decorative mark — hidden by media query when it would crowd the copy */}
        <img className="gfp-hero-logo" src={gfpLogoDataUri(GFP_LOGO_ON_DARK)} alt="" aria-hidden />
        <div style={L.heroInner}>
          <p style={L.heroTag}>The all-in-one platform for charity golf events</p>
          <h1 style={L.heroTitle} className="gfp-hero-title">Run beautiful, profitable golf fundraisers.</h1>
          <p style={L.heroSub}>
            From registration to real-time leaderboards, silent auctions to sponsor management —
            everything your event needs, in one place. Free to get started.
          </p>
          <div style={L.heroCtas}>
            <a href={ADMIN_REGISTER} style={L.ctaPrimary} className="gfp-cta">Sign up your event →</a>
            <a href="/events" style={L.ctaOutline} className="gfp-cta">Find your event</a>
          </div>
        </div>
      </header>

      {/* ── STATS ── */}
      <section style={L.stats}>
        <div style={L.statsInner}>
          {STATS.map(s => (
            <div key={s.label} style={L.statItem}>
              <div style={L.statValue}>{s.value}</div>
              <div style={L.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={L.section}>
        <div style={L.container}>
          <h2 style={L.sectionTitle}>Everything you need to run a great event</h2>
          <p style={L.sectionSub}>Built for golf event organizers, charities, booster clubs, and fundraising pros.</p>
          <div className="gfp-feature-grid">
            {FEATURES.map(f => (
              <div key={f.title} style={L.featureCard}>
                <div style={L.featureIcon}>{f.icon}</div>
                <div style={L.featureTitle}>{f.title}</div>
                <div style={L.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIFECYCLE WALKTHROUGH (client — click-to-zoom screenshots) ── */}
      <Walkthrough steps={STEPS} />

      {/* ── GOLFER FIND-YOUR-EVENT TEASER ── */}
      <section style={L.golferBand}>
        <div style={L.golferInner}>
          <h2 style={L.golferTitle}>Playing in a tournament?</h2>
          <p style={L.golferSub}>
            Find your event to register, view the leaderboard, or donate. Have a link or QR code from your
            organizer? That takes you straight there.
          </p>
          <a href="/events" style={L.ctaOnLight} className="gfp-cta">Find your event →</a>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={L.bottomCta}>
        <div style={L.bottomCtaInner}>
          <h2 style={L.bottomCtaTitle}>Ready to run your tournament?</h2>
          <p style={L.bottomCtaSub}>Create your free account in under two minutes. No credit card required.</p>
          <a href={ADMIN_REGISTER} style={L.ctaPrimary} className="gfp-cta">Get started — it&apos;s free →</a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={L.footer}>
        <div style={L.footerInner}>
          <span style={L.footerText}>© {new Date().getFullYear()} Golf Fundraiser Pro · Built for nonprofit golf events</span>
          <a href={ADMIN_LOGIN} style={L.footerLink} className="gfp-cta">Organizer Login</a>
        </div>
      </footer>
    </main>
  );
}
