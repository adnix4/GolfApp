// ─────────────────────────────────────────────────────────────────────────────
// Domain/Enums/AllEnums.cs — All PostgreSQL ENUM types for Golf Fundraiser Pro
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY ONE FILE FOR ALL ENUMS:
//   The spec Foundation §4 defines all ENUM columns in one place.
//   Keeping the C# enums together makes it easy to cross-reference the spec
//   and ensures consistency — the string values here MUST exactly match the
//   Postgres ENUM values (EF Core stores the enum name as a string by default,
//   but we use [JsonConverter] + explicit string values for safety).
//
// EF CORE MAPPING APPROACH:
//   We store enums as strings (not integers) in PostgreSQL.
//   Reason: if a new enum value is added to the DB, old code that doesn't
//   know about it gets a clear error ("Unknown enum value 'xyz'") rather
//   than a silent wrong integer mapping.
//
//   In ApplicationDbContext.OnModelCreating() each enum property is configured:
//     builder.Property(e => e.Status)
//            .HasConversion<string>()   // store as string
//            .HasColumnType("text");    // Postgres text column
//
// NAMESPACE:
//   All enums are in the GolfFundraiserPro.Api.Domain.Enums namespace.
//   They are referenced by entity classes in Domain/Entities/ and by
//   the ApplicationDbContext mapping configuration.
// ─────────────────────────────────────────────────────────────────────────────

namespace GolfFundraiserPro.Api.Domain.Enums;

// ── EVENT ENUMS ───────────────────────────────────────────────────────────────

/// <summary>
/// The scoring format for a golf tournament.
/// Maps to the events.format column. See spec Foundation §4.1.
/// </summary>
public enum EventFormat
{
    /// <summary>
    /// All players hit, team picks the best shot, repeat.
    /// Most common for charity/fundraiser events — helps slower golfers.
    /// </summary>
    Scramble,

    /// <summary>
    /// Each player counts every stroke. Lowest total wins.
    /// </summary>
    Stroke,

    /// <summary>
    /// Points awarded per hole based on score vs par.
    /// Bogey = 1pt, Par = 2pts, Birdie = 3pts, Eagle = 4pts.
    /// </summary>
    Stableford,

    /// <summary>
    /// Each player plays their own ball. Best score on each hole counts.
    /// </summary>
    BestBall,

    /// <summary>
    /// Head-to-head by holes won. Used in Phase 5 league play.
    /// </summary>
    Match
}

/// <summary>
/// How teams begin the round.
/// Maps to the events.start_type column. See spec Foundation §4.1.
/// </summary>
public enum EventStartType
{
    /// <summary>
    /// All teams tee off simultaneously from different holes at a signal (a "shotgun").
    /// Used when the course must be cleared by a specific time.
    /// The admin assigns each team a starting hole (1–18).
    /// </summary>
    Shotgun,

    /// <summary>
    /// Teams start sequentially from hole 1 at scheduled intervals.
    /// Each team has an assigned tee time (e.g. 8:00, 8:10, 8:20...).
    /// </summary>
    TeeTimes
}

/// <summary>
/// The lifecycle state of an event.
/// Maps to the events.status column. See spec Foundation §4.1.
/// Transitions: Draft → Registration → Active → Scoring → Completed
///              Any state → Cancelled (soft delete)
/// </summary>
public enum EventStatus
{
    /// <summary>Being configured by the organizer. Not visible to the public.</summary>
    Draft,

    /// <summary>Registration page is live. Accepting team signups and donations.</summary>
    Registration,

    /// <summary>Day-of state. Check-in is open. Public landing page shows event is happening today.</summary>
    Active,

    /// <summary>Round is in progress. Score entry is open. Leaderboard is live.</summary>
    Scoring,

    /// <summary>Round is over. Final leaderboard is published. Thank-you emails sent.</summary>
    Completed,

    /// <summary>
    /// Event was cancelled. Record is kept (soft delete — never deleted from DB).
    /// Spec Foundation §10: "Soft deletes: records are never deleted. Use status = cancelled."
    /// </summary>
    Cancelled
}

// ── PLAYER / TEAM ENUMS ───────────────────────────────────────────────────────

/// <summary>
/// How a player came to be registered for an event.
/// Maps to the players.registration_type column. See spec Foundation §4.1.
/// </summary>
public enum RegistrationType
{
    /// <summary>Captain registered the entire team at once (Mode 1).</summary>
    FullTeam,

    /// <summary>Player joined an existing team via search or invite link (Mode 2).</summary>
    IndividualJoin,

    /// <summary>Solo player entered the free agent pool, awaiting assignment (Mode 3).</summary>
    FreeAgent,

    /// <summary>Was assigned from the free agent pool by the organizer.</summary>
    FreeAgentAssigned,

    /// <summary>Added same-day at check-in by event staff (walk-up registration).</summary>
    WalkUp
}

/// <summary>
/// Self-reported skill level for free agent pool matching.
/// Maps to the players.skill_level column (nullable).
/// Used by the auto-pair algorithm to group similarly-skilled players.
/// </summary>
public enum SkillLevel
{
    Beginner,
    Intermediate,
    Advanced,
    Competitive
}

/// <summary>
/// Self-reported age group for free agent pool matching.
/// Maps to the players.age_group column (nullable).
/// Used as a soft tiebreaker in the handicap snake-draft algorithm.
/// </summary>
public enum AgeGroup
{
    Under30,
    From30To50,
    Over50
}

/// <summary>
/// Check-in status for both individual players and teams.
/// Maps to players.check_in_status and teams.check_in_status columns.
/// </summary>
public enum CheckInStatus
{
    /// <summary>Has not yet checked in. QR code not yet scanned.</summary>
    Pending,

    /// <summary>Individual player has been checked in (QR scanned or staff marked).</summary>
    CheckedIn,

    /// <summary>
    /// For teams: all players on the team have checked in.
    /// Set automatically when the last team member checks in.
    /// </summary>
    Complete
}

// ── SCORE ENUMS ───────────────────────────────────────────────────────────────

/// <summary>
/// How a score record was created. Used for audit trails and conflict resolution.
/// Maps to the scores.source column. See spec Foundation §4.1.
/// </summary>
public enum ScoreSource
{
    /// <summary>Entered manually by event staff on the admin dashboard tablet (Phase 1).</summary>
    AdminEntry,

    /// <summary>Submitted by a golfer via the mobile app and synced to the server (Phase 2).</summary>
    MobileSync,

    /// <summary>
    /// Transferred from a paper scorecard via QR code scan at round end (Phase 2).
    /// The QR encodes the full scorecard; the app decodes and syncs it.
    /// </summary>
    QrTransfer
}

// ── SPONSOR ENUMS ─────────────────────────────────────────────────────────────

/// <summary>
/// Display/pricing tier for event sponsors.
/// Determines logo placement across all surfaces (app, leaderboard, emails, PDF).
/// Maps to the sponsors.tier column. See spec Foundation §4.1 and Flyer.
/// </summary>
public enum SponsorTier
{
    /// <summary>
    /// "Presented by" sponsor. Largest placement.
    /// Appears: hero band on landing page, email header, all printed materials.
    /// </summary>
    Title,

    /// <summary>
    /// Prominent row on landing page, leaderboard banner, scorecard footer.
    /// </summary>
    Gold,

    /// <summary>
    /// Per-hole sponsor. Logo shown on score entry screen for that hole,
    /// and on the leaderboard's hole challenge tab.
    /// </summary>
    Hole,

    /// <summary>
    /// Landing page grid, email footer, leaderboard banner rotation.
    /// </summary>
    Silver,

    /// <summary>
    /// Email footer listing, thank-you email acknowledgment only.
    /// Smallest placement.
    /// </summary>
    Bronze
}

// ── HOLE CHALLENGE ENUMS ──────────────────────────────────────────────────────

/// <summary>
/// The type of on-course contest at a given hole (or all day).
/// Maps to the hole_challenges.challenge_type column.
/// </summary>
public enum ChallengeType
{
    /// <summary>
    /// Measured from landing spot to pin. Shortest distance wins.
    /// Phase 1: admin enters distance in yards manually.
    /// Phase 6: GPS measurement automated.
    /// </summary>
    ClosestToPin,

    /// <summary>
    /// Measured from tee to drive landing. Longest distance wins.
    /// Must land in the fairway (organizer rules enforcement).
    /// </summary>
    LongestDrive,

    /// <summary>Fewest putts on the green wins.</summary>
    Putting,

    /// <summary>
    /// Team must beat the "pro" (event host or skill benchmark) on a given hole.
    /// </summary>
    BeatThePro,

    /// <summary>
    /// Hole in one on any hole. Typically carries a special prize.
    /// Triggers a push notification to all connected devices (Phase 3).
    /// </summary>
    HoleInOne,

    /// <summary>Drive closest to the center line of the fairway wins.</summary>
    StraightestDrive
}

// ── QR CODE ENUMS ─────────────────────────────────────────────────────────────

/// <summary>
/// The purpose of a QR code. Determines what happens when it is scanned.
/// Maps to the qr_codes.qr_type column. See spec Foundation §4.1.
/// </summary>
public enum QrType
{
    /// <summary>Scanned by a new player to join the event registration flow.</summary>
    EventJoin,

    /// <summary>
    /// Unique per player. Scanning checks in that specific player.
    /// Included in the registration confirmation email.
    /// </summary>
    PlayerCheckin,

    /// <summary>Deep link to the public leaderboard page for this event.</summary>
    Leaderboard,

    /// <summary>Deep link to the donation widget on the landing page.</summary>
    Donation,

    /// <summary>
    /// Links to a specific hole challenge entry form.
    /// Printed on hole signs so players can self-report results.
    /// </summary>
    HoleChallenge,

    /// <summary>Deep link to download the iOS/Android mobile app from the stores.</summary>
    AppDownload
}

// ── EMAIL TEMPLATE ENUMS ──────────────────────────────────────────────────────

/// <summary>
/// The trigger event that causes an email template to be sent.
/// Maps to the email_templates.trigger_type column. See spec Foundation §4.1.
/// Phase 5 additions are marked — their templates exist in the DB from Phase 1
/// but are only triggered once the league engine is deployed.
/// </summary>
public enum EmailTriggerType
{
    /// <summary>Sent immediately when a player completes registration.</summary>
    RegistrationConfirm,

    /// <summary>Sent to invited teammates with a registration link and token.</summary>
    Invite,

    /// <summary>Sent to a free agent when the organizer assigns them to a team.</summary>
    TeamAssignment,

    /// <summary>Sent 24 hours before event start_at to all checked-in players.</summary>
    Reminder,

    /// <summary>
    /// Sent when organizer marks event status = Completed.
    /// Contains final score, leaderboard position, total funds raised.
    /// </summary>
    ThankYou,

    /// <summary>Sent to donors after a donation is recorded. Includes 501c3 note if applicable.</summary>
    DonationReceipt,

    /// <summary>Phase 5: sent after a league round closes with the player's round result.</summary>
    RoundResult,

    /// <summary>Phase 5: sent when a player's handicap index is recalculated after a round.</summary>
    HandicapUpdate
}
