import { Platform, Share } from 'react-native';

/**
 * Opens the OS share sheet with a team's join link — Messages, email, WhatsApp,
 * AirDrop, Copy, whatever the golfer uses. Shared by the post-registration
 * invite card and the Team tab's "Invite a teammate" button so both send the
 * same words. Throws when the device can't share (some desktop browsers); the
 * caller then points at the visible link to copy by hand.
 */
export async function shareTeamInvite(
  { url, teamName, eventName }: { url: string; teamName: string; eventName: string },
): Promise<void> {
  const text = `Join my team "${teamName}" for ${eventName}`;
  // iOS shows `url` as a link preview alongside the message; Android and web
  // read the message, which then has to carry the link itself.
  await Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}: ${url}` });
}
