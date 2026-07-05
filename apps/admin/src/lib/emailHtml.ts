import type { EmailBuilderData } from './api';

// ── EMAIL AD TEMPLATE ─────────────────────────────────────────────────────────
// Pure HTML-string builder for the email-ad screen — kept out of the screen
// component so it stays framework-free (usable from tests/scripts) and the
// screen file only deals with UI state.

export type SectionId = 'header' | 'details' | 'mission' | 'cta' | 'qr' | 'sponsors' | 'footer';

// Ordered like an event landing page (hero → where/when → pricing → story →
// QR → sponsors), mirroring the flow of event platforms like Qgiv.
export const DEFAULT_SECTIONS: SectionId[] = ['header', 'details', 'cta', 'mission', 'qr', 'sponsors', 'footer'];

export const SECTION_LABELS: Record<SectionId, string> = {
  header:   'Hero Banner',
  details:  'Where & When',
  mission:  'Mission Statement',
  cta:      'Pricing & Register',
  qr:       'Registration QR',
  sponsors: 'Sponsor Showcase',
  footer:   'Footer',
};

/** "$50" / "$37.50" from entry-fee cents; null when the event has no fee. */
export function formatFee(cents: number | null): string | null {
  if (cents == null || cents <= 0) return null;
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

/** Split sponsors into table rows of `size` for the showcase grid. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

// Table-based, inline styles only — required for Outlook/Gmail compatibility.
// Look modeled on golf-event landing pages (hero band with the event name and
// presenter, WHERE/WHEN info blocks with a Get Directions link, a pricing +
// register block, then QR and a sponsor showcase).

export function buildEmailHtml(data: EmailBuilderData, sections: SectionId[], subject: string): string {
  const p   = data.primaryColor;
  const fee = formatFee(data.entryFeeCents);

  const bodyParts = sections.map(id => {
    switch (id) {
      case 'header':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:${p};border-radius:8px 8px 0 0;">
    <tr><td style="padding:40px 32px 34px;text-align:center;font-family:Arial,sans-serif;">
      ${data.orgLogoUrl ? `<img src="${data.orgLogoUrl}" alt="${data.orgName}" height="72" style="display:block;margin:0 auto 18px;">` : ''}
      <p style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;margin:0 0 12px;">&#9971; Charity Golf Tournament</p>
      <h1 style="color:#ffffff;font-size:32px;line-height:38px;margin:0 0 10px;">${data.eventName}</h1>
      <p style="color:rgba(255,255,255,0.92);font-size:15px;margin:0 0 20px;">Presented by <strong>${data.orgName}</strong></p>
      <span style="display:inline-block;background:#ffffff;color:${p};font-size:14px;font-weight:bold;padding:9px 22px;border-radius:22px;">&#128197; ${data.eventDate}</span>
    </td></tr>
  </table>`;

      case 'details':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td style="padding:30px 32px 24px;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="50%" valign="top" style="padding-right:16px;">
          <p style="color:#999;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Where</p>
          ${data.courseName
            ? `<p style="color:#222;font-size:16px;font-weight:bold;margin:0 0 4px;">&#9971; ${data.courseName}</p>`
            : `<p style="color:#222;font-size:16px;font-weight:bold;margin:0 0 4px;">${data.eventLocation || 'Location to be announced'}</p>`}
          ${data.courseAddress ? `<p style="color:#666;font-size:13px;line-height:19px;margin:0 0 8px;">${data.courseAddress}</p>` : ''}
          ${data.directionsUrl ? `<a href="${data.directionsUrl}" style="color:${p};font-size:13px;font-weight:bold;text-decoration:none;">Get Directions &#8594;</a>` : ''}
        </td>
        <td width="50%" valign="top" style="padding-left:16px;border-left:1px solid #eeeeee;">
          <p style="color:#999;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">When</p>
          <p style="color:#222;font-size:16px;font-weight:bold;margin:0 0 4px;">&#128197; ${data.eventDate}</p>
          ${data.eventTime ? `<p style="color:#666;font-size:13px;margin:0;">&#128336; ${data.eventTime}</p>` : ''}
        </td>
      </tr></table>
    </td></tr>
  </table>`;

      case 'mission':
        return data.missionStatement ? `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td style="padding:8px 32px 24px;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-left:4px solid ${p};"><tr><td style="padding:18px 20px;">
        <p style="color:#999;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Why We Play</p>
        <p style="color:#555;font-size:14px;line-height:21px;font-style:italic;margin:0;">${data.missionStatement}</p>
      </td></tr></table>
    </td></tr>
  </table>` : '';

      case 'cta':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td style="padding:8px 32px 28px;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:10px;"><tr><td style="padding:26px 24px;text-align:center;">
        ${fee ? `
        <p style="color:#999;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin:0 0 6px;">Entry Fee</p>
        <p style="color:${p};font-size:32px;font-weight:bold;margin:0;">${fee}</p>
        <p style="color:#888;font-size:12px;margin:2px 0 18px;">per team</p>` : `
        <p style="color:#555;font-size:15px;margin:0 0 18px;">Spots are limited &mdash; reserve your team today!</p>`}
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${data.registrationUrl}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="25%" strokecolor="${p}" fillcolor="${p}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;">Register Now</center></v:roundrect><![endif]-->
        <!--[if !mso]><!--><a href="${data.registrationUrl}" style="background:${p};color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;padding:14px 44px;border-radius:10px;text-decoration:none;">Register Now</a><!--<![endif]-->
        <p style="color:#888;font-size:12px;margin:14px 0 0;">or visit <a href="${data.registrationUrl}" style="color:${p};text-decoration:none;">${data.registrationUrl}</a></p>
      </td></tr></table>
    </td></tr>
  </table>`;

      case 'qr':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td style="padding:8px 32px 28px;text-align:center;font-family:Arial,sans-serif;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border:1px solid #e5e5e5;border-radius:10px;"><tr><td style="padding:20px 28px;text-align:center;">
        <p style="color:#999;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Scan to Register</p>
        <img src="${data.qrCodeUrl}" alt="Registration QR code for ${data.eventName}" width="180" height="180" style="display:block;margin:0 auto;">
        <p style="color:#888;font-size:12px;line-height:18px;max-width:300px;margin:12px auto 0;">Point your phone's camera at the code to open the registration page &mdash; it also links you to the mobile scoring app for the day of the event.</p>
      </td></tr></table>
    </td></tr>
  </table>`;

      case 'sponsors':
        return data.sponsors.length > 0 ? `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;">
    <tr><td style="padding:24px 32px;font-family:Arial,sans-serif;text-align:center;">
      <p style="color:#888;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;margin:0 0 14px;">Thank You to Our Sponsors</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${chunk(data.sponsors.slice(0, 8), 4).map(row => `<tr>
          ${row.map(s =>
            `<td width="25%" style="text-align:center;padding:8px;">${
              s.logoUrl
                ? `<img src="${s.logoUrl}" alt="${s.name}" height="40" style="display:block;margin:0 auto;">`
                : `<span style="font-size:12px;color:#555;font-weight:bold;">${s.name}</span>`
            }</td>`
          ).join('')}
        </tr>`).join('')}
      </table>
    </td></tr>
  </table>` : '';

      case 'footer':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;border-radius:0 0 8px 8px;">
    <tr><td style="padding:18px 32px;text-align:center;font-family:Arial,sans-serif;font-size:11px;line-height:17px;color:#888;">
      ${data.is501c3 ? `${data.orgName} is a 501(c)(3) organization &mdash; your contribution may be tax-deductible.<br>` : ''}
      ${data.orgName} &middot; Powered by Golf Fundraiser Pro<br>
      <a href="${data.registrationUrl}" style="color:${p};text-decoration:none;">${data.registrationUrl}</a>
    </td></tr>
  </table>`;

      default: return '';
    }
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title></head>
<body style="margin:0;padding:20px;background:#e8e8e8;font-family:Arial,sans-serif;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
${bodyParts}
</table>
</body></html>`;
}
