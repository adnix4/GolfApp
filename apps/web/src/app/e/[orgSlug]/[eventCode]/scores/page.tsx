import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPublicEvent, fetchPublicLeaderboard } from '@/lib/api';
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

  return (
    <ScoresPoller
      event={event}
      initialLeaderboard={leaderboard}
      eventCode={eventCode}
      tvMode={tvMode}
    />
  );
}
