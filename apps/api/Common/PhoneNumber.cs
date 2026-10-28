using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Common;

/// <summary>
/// US (NANP) 10-digit phone numbers — the server half of
/// packages/shared-types/src/phone.ts.
///
/// WHY THIS EXISTS:
///   Every client formats and checks the number, but the API accepted any text
///   up to 30 characters, and forms disagreed on what they sent ("5558675309"
///   from the registration forms, "(555) 867-5309" from the admin player form).
///   Every write path now goes through Normalize, so a stored phone is always
///   10 digits and a malformed one is a 400, whichever client sent it.
/// </summary>
public static class PhoneNumber
{
    public const string Invalid = "Enter a 10-digit US phone number, like (555) 867-5309.";

    /// <summary>
    /// Digits only, or null for a blank value (which clears the phone).
    /// Accepts the usual punctuation and a leading +1 country code.
    /// Throws ValidationException (400) for anything else.
    /// </summary>
    public static string? Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        foreach (var ch in raw)
            if (!char.IsAsciiDigit(ch) && " ()-.+".IndexOf(ch) < 0)
                throw new ValidationException(Invalid);

        var digits = new string(raw.Where(char.IsAsciiDigit).ToArray());
        if (digits.Length == 11 && digits[0] == '1') digits = digits[1..];

        // NANP: area code and exchange never start with 0 or 1.
        if (digits.Length != 10 || digits[0] < '2' || digits[3] < '2')
            throw new ValidationException(Invalid);

        return digits;
    }
}
