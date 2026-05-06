using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.League;

// ── LEAGUE ────────────────────────────────────────────────────────────────────

public record LeagueResponse
{
    public Guid   Id              { get; init; }
    public Guid   OrgId           { get; init; }
    public string Name            { get; init; } = string.Empty;
    public string Format          { get; init; } = string.Empty;
    public string HandicapSystem  { get; init; } = string.Empty;
    public double HandicapCap     { get; init; }
    public short  MaxFlights      { get; init; }
    public int    DuesCents       { get; init; }
    public int    SeasonCount     { get; init; }
    public DateTime CreatedAt     { get; init; }
}

public record CreateLeagueRequest
{
    [Required, MaxLength(200)]
    public string Name           { get; init; } = string.Empty;
    [Required]
    public string Format         { get; init; } = string.Empty;
    public string HandicapSystem { get; init; } = "Club";
    public double HandicapCap    { get; init; } = 36.0;
    public short  MaxFlights     { get; init; } = 1;
    public int    DuesCents      { get; init; }
}

public record UpdateLeagueRequest
{
    public string? Name           { get; init; }
    public string? Format         { get; init; }
    public string? HandicapSystem { get; init; }
    public double? HandicapCap    { get; init; }
    public short?  MaxFlights     { get; init; }
    public int?    DuesCents      { get; init; }
}

// ── SEASON ────────────────────────────────────────────────────────────────────

public record SeasonResponse
{
    public Guid     Id             { get; init; }
    public Guid     LeagueId       { get; init; }
    public string   Name           { get; init; } = string.Empty;
    public short    TotalRounds    { get; init; }
    public DateOnly StartDate      { get; init; }
    public DateOnly EndDate        { get; init; }
    public string   Status         { get; init; } = string.Empty;
    public short    RoundsCounted  { get; init; }
    public string   StandingMethod { get; init; } = string.Empty;
    public int      MemberCount    { get; init; }
    public int      RoundCount     { get; init; }
    public DateTime CreatedAt      { get; init; }
}

public record CreateSeasonRequest
{
    [Required, MaxLength(200)]
    public string   Name           { get; init; } = string.Empty;
    [Required]
    public short    TotalRounds    { get; init; }
    [Required]
    public DateOnly StartDate      { get; init; }
    [Required]
    public DateOnly EndDate        { get; init; }
    public short    RoundsCounted  { get; init; }
    public string   StandingMethod { get; init; } = "TotalNet";
}

// ── FLIGHT ────────────────────────────────────────────────────────────────────

public record FlightResponse
{
    public Guid    Id           { get; init; }
    public Guid    SeasonId     { get; init; }
    public string  Name         { get; init; } = string.Empty;
    public double? MinHandicap  { get; init; }
    public double? MaxHandicap  { get; init; }
    public int     MemberCount  { get; init; }
}

public record CreateFlightRequest
{
    [Required, MaxLength(100)]
    public string  Name        { get; init; } = string.Empty;
    public double? MinHandicap { get; init; }
    public double? MaxHandicap { get; init; }
}

// ── LEAGUE MEMBER ─────────────────────────────────────────────────────────────

public record LeagueMemberResponse
{
    public Guid     Id            { get; init; }
    public Guid     SeasonId      { get; init; }
    public Guid?    PlayerId      { get; init; }
    public Guid?    FlightId      { get; init; }
    public string?  FlightName    { get; init; }
    public string   FirstName     { get; init; } = string.Empty;
    public string   LastName      { get; init; } = string.Empty;
    public string   Email         { get; init; } = string.Empty;
    public double   HandicapIndex { get; init; }
    public bool     DuesPaid      { get; init; }
    public short    RoundsPlayed  { get; init; }
    public short    Absences      { get; init; }
    public string   Status        { get; init; } = string.Empty;
    public bool     IsSandbagger  { get; init; }
}

public record AddMemberRequest
{
    [Required, MaxLength(100)]
    public string FirstName    { get; init; } = string.Empty;
    [Required, MaxLength(100)]
    public string LastName     { get; init; } = string.Empty;
    [Required, MaxLength(254)]
    public string Email        { get; init; } = string.Empty;
    public double HandicapIndex { get; init; }
    public Guid?  FlightId     { get; init; }
    public Guid?  PlayerId     { get; init; }
    public string Status       { get; init; } = "Active";
}

public record UpdateMemberRequest
{
    public Guid?   FlightId      { get; init; }
    public double? HandicapIndex { get; init; }
    public bool?   DuesPaid      { get; init; }
    public string? Status        { get; init; }
}

public record OverrideHandicapRequest
{
    [Required]
    public double NewIndex { get; init; }
    [Required, MaxLength(500)]
    public string Reason   { get; init; } = string.Empty;
}

// ── ROUND ─────────────────────────────────────────────────────────────────────

public record LeagueRoundResponse
{
    public Guid     Id           { get; init; }
    public Guid     SeasonId     { get; init; }
    public Guid?    CourseId     { get; init; }
    public string?  CourseName   { get; init; }
    public DateOnly RoundDate    { get; init; }
    public string   Status       { get; init; } = string.Empty;
    public string?  Notes        { get; init; }
    public int      PairingCount { get; init; }
    public int      ScoredCount  { get; init; }
}

public record CreateRoundRequest
{
    [Required]
    public DateOnly RoundDate { get; init; }
    public Guid?   CourseId  { get; init; }
    public string? Notes     { get; init; }
}

// ── PAIRING ───────────────────────────────────────────────────────────────────

public record PairingGroupResponse
{
    public Guid        Id            { get; init; }
    public short       GroupNumber   { get; init; }
    public List<Guid>  MemberIds     { get; init; } = new();
    public List<string> MemberNames  { get; init; } = new();
    public TimeOnly?   TeeTime       { get; init; }
    public short?      StartingHole  { get; init; }
    public bool        IsLocked      { get; init; }
}

public record SavePairingsRequest
{
    [Required]
    public List<PairingGroupInput> Groups { get; init; } = new();
    public bool Lock { get; init; } = true;
}

public record PairingGroupInput
{
    [Required]
    public List<Guid> MemberIds    { get; init; } = new();
    public TimeOnly?  TeeTime      { get; init; }
    public short?     StartingHole { get; init; }
}

// ── SCORE ─────────────────────────────────────────────────────────────────────

public record SubmitLeagueScoreRequest
{
    [Required]
    public Guid  MemberId   { get; init; }
    [Required]
    public short HoleNumber { get; init; }
    [Required]
    public short GrossScore { get; init; }
}

public record LeagueRoundScorecard
{
    public Guid   MemberId      { get; init; }
    public string MemberName    { get; init; } = string.Empty;
    public double HandicapIndex { get; init; }
    public int    GrossTotal    { get; init; }
    public int    NetTotal      { get; init; }
    public int    StablefordTotal { get; init; }
    public List<HoleScoreRow> Holes { get; init; } = new();
}

public record HoleScoreRow
{
    public short HoleNumber      { get; init; }
    public short Par             { get; init; }
    public short GrossScore      { get; init; }
    public short NetScore        { get; init; }
    public short StablefordPoints { get; init; }
}

// ── STANDINGS ─────────────────────────────────────────────────────────────────

public record StandingRow
{
    public short  Rank           { get; init; }
    public Guid   MemberId       { get; init; }
    public string MemberName     { get; init; } = string.Empty;
    public string FlightName     { get; init; } = string.Empty;
    public double HandicapIndex  { get; init; }
    public int    TotalPoints    { get; init; }
    public int    NetStrokes     { get; init; }
    public double SeasonAvgNet   { get; init; }
    public short  RoundsPlayed   { get; init; }
}

// ── HANDICAP HISTORY ──────────────────────────────────────────────────────────

public record HandicapHistoryRow
{
    public Guid      Id            { get; init; }
    public Guid?     RoundId       { get; init; }
    public DateOnly? RoundDate     { get; init; }
    public double    OldIndex      { get; init; }
    public double    NewIndex      { get; init; }
    public double    Differential  { get; init; }
    public bool      AdminOverride { get; init; }
    public string?   Reason        { get; init; }
    public DateTime  CreatedAt     { get; init; }
}

// ── SKINS ─────────────────────────────────────────────────────────────────────

public record SkinRow
{
    public Guid    Id                  { get; init; }
    public short   HoleNumber          { get; init; }
    public Guid?   WinnerMemberId      { get; init; }
    public string? WinnerName          { get; init; }
    public int     PotCents            { get; init; }
    public short?  CarriedOverFromHole { get; init; }
}

// ── SEASON DASHBOARD ──────────────────────────────────────────────────────────

public record SeasonDashboard
{
    public SeasonResponse         Season    { get; init; } = null!;
    public List<LeagueRoundResponse> Rounds { get; init; } = new();
    public List<LeagueMemberResponse> Roster { get; init; } = new();
    public List<FlightResponse>   Flights   { get; init; } = new();
    public List<StandingRow>      Standings { get; init; } = new();
}

// ── MEMBER SEASON SUMMARY (mobile) ───────────────────────────────────────────

public record MemberSeasonSummary
{
    public Guid    MemberId      { get; init; }
    public string  Name          { get; init; } = string.Empty;
    public double  HandicapIndex { get; init; }
    public string  FlightName    { get; init; } = string.Empty;
    public short   Rank          { get; init; }
    public int     TotalPoints   { get; init; }
    public short   RoundsPlayed  { get; init; }
    public List<HandicapHistoryRow> HandicapTrend { get; init; } = new();
    public List<RoundResultRow>     RoundHistory  { get; init; } = new();
}

public record RoundResultRow
{
    public Guid    RoundId        { get; init; }
    public DateOnly RoundDate     { get; init; }
    public int     GrossTotal     { get; init; }
    public int     NetTotal       { get; init; }
    public int     StablefordPoints { get; init; }
    public double  Differential   { get; init; }
}
