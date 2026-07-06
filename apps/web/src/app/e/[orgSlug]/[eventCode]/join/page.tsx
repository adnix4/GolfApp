import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchPublicEvent } from '@/lib/api';
import { buildThemeCss } from '../eventPageStyles';
import SmartJoin from './SmartJoin';

// ── SMART JOIN / "OPEN IN APP" ────────────────────────────────────────────────
// Landing target for the email ad's Register button and the registration QR.
// The page itself is a thin server shell; SmartJoin detects the visitor's
// device client-side and routes them:
//   • iOS / Android → deep-links into the GFP Scorer app (gfp://join) with
//     store / browser fallbacks when the app isn't installed.
//   • Desktop       → forwards to the web registration page.

export async function generateMetadata(
  { params }: { params: Promise<{ orgSlug: string; eventCode: string }> }
): Promise<Metadata> {
  const { eventCode } = await params;
  const event = await fetchPublicEvent(eventCode);
  return { title: event ? `Join ${event.name}` : 'Event Not Found' };
}

export default async function JoinLandingPage(
  { params }: { params: Promise<{ orgSlug: string; eventCode: string }> }
) {
  const { orgSlug, eventCode } = await params;
  const event = await fetchPublicEvent(eventCode);
  if (!event) notFound();

  const themeCss = buildThemeCss(event.resolvedThemeJson);

  return (
    <>
      {themeCss && <style>{`:root{${themeCss}}`}</style>}
      <SmartJoin
        orgSlug={orgSlug}
        eventCode={event.eventCode}
        eventId={event.id}
        eventName={event.name}
        orgName={event.orgName}
        logoUrl={event.resolvedLogoUrl}
      />
    </>
  );
}
