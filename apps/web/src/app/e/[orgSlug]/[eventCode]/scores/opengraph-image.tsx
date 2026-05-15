import { ImageResponse } from 'next/og';
import { fetchPublicEvent, fetchPublicLeaderboard } from '@/lib/api';

export const runtime = 'edge';
export const alt     = 'Live Leaderboard';
export const size    = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventCode: string }>;
}) {
  const { eventCode } = await params;
  const [event, board] = await Promise.all([
    fetchPublicEvent(eventCode),
    fetchPublicLeaderboard(eventCode),
  ]);

  const eventName = event?.name ?? 'Golf Tournament';
  const orgName   = event?.orgName ?? '';
  const standings = board?.standings.slice(0, 5) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          backgroundColor: '#1a1a2e', color: '#fff',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 20,
            padding: '36px 56px 24px',
            borderBottom: '2px solid rgba(255,255,255,0.1)',
          }}
        >
          {event?.resolvedLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.resolvedLogoUrl}
              alt={orgName}
              width={56}
              height={56}
              style={{ borderRadius: 8, objectFit: 'contain', backgroundColor: '#fff', padding: 4 }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {orgName && (
              <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {orgName}
              </span>
            )}
            <span style={{ fontSize: 34, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
              {eventName}
            </span>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: '#e74c3c',
              padding: '8px 18px', borderRadius: 20,
              fontSize: 16, fontWeight: 800, letterSpacing: 0.5,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fff' }} />
            LIVE
          </div>
        </div>

        {/* Leaderboard body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 56px' }}>
          {standings.length === 0 ? (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'rgba(255,255,255,0.4)' }}>
              Scores will appear here once the round begins.
            </div>
          ) : (
            standings.map((entry, i) => {
              const toPar  = entry.toPar === 0 ? 'E' : entry.toPar > 0 ? `+${entry.toPar}` : `${entry.toPar}`;
              const color  = entry.toPar < 0 ? '#2ecc71' : entry.toPar > 0 ? '#e74c3c' : '#fff';
              const thru   = entry.isComplete ? 'F' : `${entry.holesComplete}`;
              const isFirst = i === 0;
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '10px 16px',
                    marginBottom: 6,
                    borderRadius: 10,
                    backgroundColor: isFirst ? 'rgba(46,204,113,0.12)' : 'rgba(255,255,255,0.05)',
                    border: isFirst ? '1px solid rgba(46,204,113,0.3)' : '1px solid transparent',
                  }}
                >
                  <span style={{ width: 36, fontSize: isFirst ? 22 : 18, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                    {entry.rank}
                  </span>
                  <span style={{ flex: 1, fontSize: isFirst ? 22 : 18, fontWeight: isFirst ? 800 : 600, color: '#fff', marginLeft: 12 }}>
                    {entry.teamName}
                  </span>
                  <span style={{ fontSize: isFirst ? 28 : 22, fontWeight: 900, color, minWidth: 60, textAlign: 'right' }}>
                    {toPar}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginLeft: 16, minWidth: 30, textAlign: 'right' }}>
                    {thru}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
            padding: '12px 56px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            fontSize: 13, color: 'rgba(255,255,255,0.3)',
          }}
        >
          Golf Fundraiser Pro
        </div>
      </div>
    ),
    { ...size }
  );
}
