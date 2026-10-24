/**
 * Golfer "find your event" front door. Two ways in:
 *  1. Browse the live directory of open events (GET /pub/events/active) —
 *     fetched here on the server so it arrives with the HTML — with a
 *     client-side name/org filter; each card links to /e/{orgSlug}/{eventCode}.
 *  2. Type an event code → resolve → redirect (EventsDirectory).
 * Email links & organizer QR codes already land straight on the event page,
 * so this page is for golfers who don't have the direct link.
 */

import { fetchActiveEvents } from '@/lib/api';
import EventsDirectory from './EventsDirectory';

export default async function EventsPage() {
  const events = await fetchActiveEvents();
  return <EventsDirectory events={events} />;
}
