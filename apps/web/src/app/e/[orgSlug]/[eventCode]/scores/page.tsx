import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPublicAuctionItems, fetchPublicEvent, fetchPublicLeaderboard } from '@/lib/api';
import ScoresPoller from './ScoresPoller';

export async function generateMetadata(
  { params }: { params: Promise<{ orgSlug: string; eventCode: string }> }
): Promise<Metadata> {
  const { eventCode } = await params;
  const event = await fetchPublicEvent(eventCode);
  if (!event) return { title: 'Event Not Found' };
  const { orgSlug } = await params;
  const description = `Live leaderboard for ${event.name} by ${event.orgName}`;
  return {
    title: `${event.name} — Live Scores`,
    description,
    robots: 'noindex',
    openGraph: {
      title: `${event.name} — Live Leaderboard`,
      description,
      type: 'website',
      images: [`/e/${orgSlug}/${eventCode}/scores/opengraph-image`],
    },
  };
}

export default async function ScoresPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; eventCode: string }>;
  searchParams: Promise<{ tv?: string }>;
}) {
  const { eventCode }  = await params;
  const { tv }         = await searchParams;
  const tvMode         = tv === '1';

  const [event, leaderboard] = await Promise.all([
    fetchPublicEvent(eventCode),
    fetchPublicLeaderboard(eventCode),
  ]);

  if (!event) notFound();

  // Sequential because it keys off event.id. The ticker tolerates an empty
  // first paint — the client refetches on the first auction signal — but SSR
  // means a TV left on the board shows the lots even before a bid lands.
  const auctionItems = await fetchPublicAuctionItems(event.id);

  return (
    <>
      {/* TV/kiosk mode is a full-screen big-display leaderboard — hide the
          persistent site header there. */}
      {tvMode && <style>{`.gfp-site-header{display:none}`}</style>}
      <ScoresPoller
        event={event}
        initialLeaderboard={leaderboard}
        initialAuctionItems={auctionItems}
        eventCode={eventCode}
        tvMode={tvMode}
      />
    </>
  );
}
