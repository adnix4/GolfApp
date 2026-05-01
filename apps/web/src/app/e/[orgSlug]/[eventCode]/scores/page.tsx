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
  return {
    title: `${event.name} — Live Scores`,
    description:  `Live leaderboard for ${event.name} by ${event.orgName}`,
    robots: 'noindex',
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
