using System.Net;

namespace GolfFundraiserPro.Api.Features.Emails;

/// <summary>
/// The "set your phone up before you get here" email.
///
/// WHY THIS EXISTS — it is a load-shedding mechanism as much as a courtesy.
/// Joining an event is allowed from the moment a golfer is on a roster, the
/// mobile app restores its session from local storage rather than re-joining on
/// launch, and a re-join from an already-verified device skips the emailed code
/// entirely. So a golfer who joins the night before costs the API precisely
/// nothing on event morning.
///
/// Before this, nothing ever told them to. The only join affordance was the QR
/// code at the registration desk, which guarantees that the entire field joins
/// inside the same ten minutes — from behind a single venue NAT, with email
/// verification making each first join two round trips. A 144-player shotgun
/// start measured about five minutes of rolling rate-limit rejections at the
/// first tee, and nothing client-side retries a rejected join: the golfer just
/// sees a failure while standing on the tee box.
///
/// SENT TRANSACTIONALLY, not through EmailService.SendAsync: that path requires
/// the organizer to have authored an EmailTemplate row for the trigger and
/// silently no-ops when they haven't (no defaults are seeded). This email has to
/// arrive for every event, so it follows the same always-sends pattern as the
/// join verification code.
/// </summary>
public static class JoinNudgeEmail
{
    /// <summary>
    /// Absolute link to the SmartJoin landing page, which deep-links into the
    /// scorer app (gfp://join) on a phone and falls back to the store or the web
    /// registration page otherwise.
    /// </summary>
    public static string BuildJoinUrl(string webBaseUrl, string orgSlug, string eventCode) =>
        $"{webBaseUrl.TrimEnd('/')}/e/{orgSlug}/{eventCode}/join";

    /// <summary>Sent when a golfer is first added to a roster.</summary>
    public static string BuildWelcomeHtml(
        string firstName, string eventName, string eventCode, string joinUrl, DateTime? startAt) =>
        Wrap(
            heading: $"You're registered for {Enc(eventName)}",
            firstName: firstName,
            lead: startAt.HasValue
                ? $"You're all set for {Enc(startAt.Value.ToString("dddd, MMMM d"))}. " +
                  "One thing to do before the day:"
                : "You're all set. One thing to do before the day:",
            eventCode: eventCode,
            joinUrl: joinUrl,
            cta: "Set up my scorecard",
            closing:
                "Setting up now means your scorecard is ready the moment you reach the first " +
                "tee — no signal required, no queue at the registration desk.");

    /// <summary>Sent the day before the round to anyone on the roster.</summary>
    public static string BuildReminderHtml(
        string firstName, string eventName, string eventCode, string joinUrl, DateTime? startAt) =>
        Wrap(
            heading: $"{Enc(eventName)} is tomorrow",
            firstName: firstName,
            lead: startAt.HasValue
                ? $"Tee off is {Enc(startAt.Value.ToString("dddd, MMMM d"))}. " +
                  "If you haven't set up your scorecard yet, now is the moment:"
                : "If you haven't set up your scorecard yet, now is the moment:",
            eventCode: eventCode,
            joinUrl: joinUrl,
            cta: "Set up my scorecard",
            closing:
                "It takes a minute on wifi tonight, and saves you doing it on course wifi " +
                "tomorrow with everyone else. Already set up? Nothing to do — see you there.");

    private static string Wrap(
        string heading, string firstName, string lead,
        string eventCode, string joinUrl, string cta, string closing) => $"""
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#1b5e20;margin:0 0 12px;">⛳ Golf Fundraiser Pro</h2>
          <h3 style="color:#1b5e20;margin:0 0 16px;font-size:20px;">{heading}</h3>
          <p style="font-size:15px;color:#333;">Hi {Enc(firstName)},</p>
          <p style="font-size:15px;color:#333;">{lead}</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="{Enc(joinUrl)}"
               style="display:inline-block;background:#1b5e20;color:#ffffff;text-decoration:none;
                      font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;">
              {Enc(cta)}
            </a>
          </p>
          <p style="font-size:14px;color:#555;text-align:center;">
            Or enter your event code by hand:
            <strong style="letter-spacing:2px;font-size:16px;color:#1b5e20;">{Enc(eventCode)}</strong>
          </p>
          <p style="font-size:13px;color:#666;margin-top:20px;">{closing}</p>
        </div>
        """;

    private static string Enc(string value) => WebUtility.HtmlEncode(value);
}
