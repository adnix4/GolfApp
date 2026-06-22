using System.Security.Cryptography;
using System.Text;

namespace GolfFundraiserPro.Api.Common;

/// <summary>
/// Shared check for the per-player session token minted at /join. Golfers have no
/// account/password, so this opaque token is what authorizes a player's own
/// actions — profile edit, score sync, auction bids, and the Stripe payment
/// endpoints. Used by MobileService, AuctionService, and PaymentsService so the
/// comparison (and its fail-closed semantics) live in exactly one place.
/// </summary>
public static class PlayerSessionAuth
{
    /// <summary>
    /// Constant-time check that <paramref name="provided"/> matches a player's
    /// stored token. Returns false for a null/empty stored or provided value
    /// (fail closed) and for any length/value mismatch.
    /// </summary>
    public static bool Matches(string? stored, string? provided)
    {
        if (string.IsNullOrEmpty(stored) || string.IsNullOrEmpty(provided)) return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(stored),
            Encoding.UTF8.GetBytes(provided));
    }
}
