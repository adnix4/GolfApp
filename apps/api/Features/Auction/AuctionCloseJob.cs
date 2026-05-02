using Hangfire;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// Hangfire recurring job: checks every 10 seconds for expired silent auction items
/// and closes them, determines winners, and triggers automatic charges.
/// </summary>
public class AuctionCloseJob
{
    private readonly AuctionService _auction;
    private readonly ILogger<AuctionCloseJob> _logger;

    public AuctionCloseJob(AuctionService auction, ILogger<AuctionCloseJob> logger)
    {
        _auction = auction;
        _logger  = logger;
    }

    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync()
    {
        try
        {
            await _auction.ProcessExpiredItemsAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AuctionCloseJob failed");
        }
    }
}
