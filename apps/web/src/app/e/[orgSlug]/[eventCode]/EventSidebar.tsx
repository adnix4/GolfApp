import { resolveMedia } from '@/lib/api';
import { formatCents } from '@gfp/shared-types';
import { w } from './eventPageStyles';
import { DonateWidget } from './EventActions';
import type {
  PublicEventData, PublicFundraisingInfo, PublicSponsorInfo,
} from '@/lib/api';
import type { HoleChallengeRow } from './holeChallenges';

/**
 * Right-hand column of the public event page. Renders any combination of:
 * - Donation thermometer (when grandTotalCents > 0)
 * - Donate widget (during registration/active/scoring/completed)
 * - Hole-challenges list (when any challenge or hole sponsor exists)
 * - Sorted sponsor banner
 *
 * Caller decides whether to render this at all via hasSidebar.
 */
export default function EventSidebar({
  event,
  showDonate,
  holeChallenges,
}: {
  event:          PublicEventData;
  showDonate:     boolean;
  holeChallenges: HoleChallengeRow[];  // from buildHoleChallengeRows
}) {
  const tierOrder      = ['title', 'gold', 'hole', 'silver', 'bronze'];
  const sortedSponsors = [...event.sponsors].sort(
    (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier),
  );

  return (
    <>
      {event.fundraising.grandTotalCents > 0 && (
        <DonationThermometer fundraising={event.fundraising} />
      )}

      {showDonate && (
        <div style={w.card}>
          <h3 style={w.title}>💝 Support This Event</h3>
          <p style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: '0.5rem' }}>
            Your donation helps make this event possible.
          </p>
          <DonateWidget
            eventCode={event.eventCode}
            orgName={event.orgName}
            is501c3={event.is501c3}
          />
        </div>
      )}

      {holeChallenges.length > 0 && (
        <HoleChallengesWidget rows={holeChallenges} />
      )}

      {sortedSponsors.length > 0 && (
        <SponsorBannerWidget sponsors={sortedSponsors} />
      )}
    </>
  );
}

function DonationThermometer({ fundraising }: { fundraising: PublicFundraisingInfo }) {
  const total = fundraising.grandTotalCents;
  const goal  = fundraising.goalCents;
  const pct   = goal ? Math.min(100, Math.round((total / goal) * 100)) : 100;

  return (
    <div style={w.card}>
      <h3 style={w.title}>💰 Fundraising</h3>
      <p style={w.totalAmt}>{formatCents(total)}</p>
      <p style={w.totalLabel}>Total Raised</p>

      <div style={w.track}>
        <div style={{ ...w.fill, width: `${pct}%` }} />
      </div>

      {goal ? (
        <div style={w.goalRow}>
          <span style={w.goalPct}>{pct}% of goal</span>
          <span style={w.goalAmt}>{formatCents(goal)} goal</span>
        </div>
      ) : null}

      {fundraising.donationsCents > 0 && (
        <p style={w.subStat}>
          {formatCents(fundraising.donationsCents)} from donations
        </p>
      )}
    </div>
  );
}

function HoleChallengesWidget({ rows }: { rows: HoleChallengeRow[] }) {
  return (
    <div style={w.card}>
      <h3 style={w.title}>🏆 Hole Challenges</h3>
      {rows.map(r => (
        <div key={r.key} style={w.holeRow}>
          <span style={w.holeNum}>{r.hole == null ? 'All day' : `Hole ${r.hole}`}</span>
          <div style={w.holeInfo}>
            {r.description && <span style={w.holeDesc}>{r.description}</span>}
            {r.prize && <span style={w.holeSponsor}>Prize: {r.prize}</span>}
            {r.sponsorName && <span style={w.holeSponsor}>{r.sponsorName}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

const TIER_DOT_COLORS: Record<string, string> = {
  title: '#8e44ad', gold: '#f39c12', hole: '#16a085',
  silver: '#7f8c8d', bronze: '#d35400',
};

function SponsorBannerWidget({ sponsors }: { sponsors: PublicSponsorInfo[] }) {
  return (
    <div style={w.card}>
      <h3 style={w.title}>🤝 Our Sponsors</h3>
      {sponsors.map((sp, i) => (
        <div key={i} style={w.sponsorRow}>
          {sp.logoUrl && (
            <img src={resolveMedia(sp.logoUrl)} alt={sp.name} style={w.sponsorLogo} />
          )}
          <div style={w.sponsorInfo}>
            <p style={w.sponsorName}>{sp.name}</p>
            {sp.tagline && <p style={w.sponsorTagline}>{sp.tagline}</p>}
          </div>
          <span style={{ ...w.tierDot, backgroundColor: TIER_DOT_COLORS[sp.tier] ?? '#aaa' }} />
        </div>
      ))}
    </div>
  );
}
