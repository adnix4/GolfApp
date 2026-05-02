using System.Text;

namespace GolfFundraiserPro.Api.Features.Events;

/// <summary>
/// Pure helper for event-code format rules — no DB, fully unit-testable.
/// </summary>
public static class EventCodeRules
{
    /// <summary>
    /// Characters used in event codes — uppercase alpha + digits, excluding O/0 and I/1
    /// to avoid ambiguity when reading printed QR codes.
    /// </summary>
    public const string ValidChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    public const int Length = 8;

    public static string Generate()
    {
        var random = new Random();
        var sb     = new StringBuilder(Length);
        for (int i = 0; i < Length; i++)
            sb.Append(ValidChars[random.Next(ValidChars.Length)]);
        return sb.ToString();
    }

    public static bool IsValidFormat(string? code)
        => code is not null
           && code.Length == Length
           && code.All(c => ValidChars.Contains(c));
}
