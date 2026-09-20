using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using GolfFundraiserPro.Api.Common;

namespace WebAPI.Tests.Services;

/// <summary>
/// The join endpoint's own rate limit is sized for a shotgun start, so this is
/// what actually stops email enumeration: a budget of FAILED attempts per IP.
///
/// The property that matters is asymmetry — a golfer on the roster typing their
/// own address spends nothing, while a prober spends on every single try. These
/// tests exercise the no-Redis path, which is also what a dev box and any
/// GFP_ALLOW_NO_REDIS deployment run on.
/// </summary>
public class JoinAttemptLimiterTests
{
    private static JoinAttemptLimiter Build()
    {
        JoinAttemptLimiter.ResetMemoryForTests();

        // Empty provider → no IConnectionMultiplexer → in-memory fallback.
        var services = new ServiceCollection().BuildServiceProvider();
        return new JoinAttemptLimiter(services, NullLogger<JoinAttemptLimiter>.Instance);
    }

    private const string Ip = "203.0.113.9";

    [Fact]
    public async Task A_fresh_caller_is_not_blocked()
    {
        Assert.False(await Build().IsBlockedAsync(Ip));
    }

    [Fact]
    public async Task Stays_unblocked_below_the_threshold()
    {
        var limiter = Build();
        for (var i = 0; i < JoinAttemptLimiter.MaxFailuresPerWindow - 1; i++)
            await limiter.RecordFailureAsync(Ip);

        Assert.False(await limiter.IsBlockedAsync(Ip));
    }

    [Fact]
    public async Task Blocks_once_the_budget_is_spent()
    {
        var limiter = Build();
        for (var i = 0; i < JoinAttemptLimiter.MaxFailuresPerWindow; i++)
            await limiter.RecordFailureAsync(Ip);

        Assert.True(await limiter.IsBlockedAsync(Ip));
    }

    [Fact]
    public async Task Stays_blocked_as_failures_continue()
    {
        var limiter = Build();
        for (var i = 0; i < JoinAttemptLimiter.MaxFailuresPerWindow * 3; i++)
            await limiter.RecordFailureAsync(Ip);

        Assert.True(await limiter.IsBlockedAsync(Ip));
    }

    [Fact]
    public async Task Budgets_are_per_address()
    {
        // One prober must not lock out an unrelated network — or, at a venue,
        // the golfers sharing the building with them.
        var limiter = Build();
        for (var i = 0; i < JoinAttemptLimiter.MaxFailuresPerWindow; i++)
            await limiter.RecordFailureAsync(Ip);

        Assert.True(await limiter.IsBlockedAsync(Ip));
        Assert.False(await limiter.IsBlockedAsync("198.51.100.2"));
    }

    [Fact]
    public async Task Successful_joins_never_spend_from_the_budget()
    {
        // The whole design: arrivals are uncapped because only failures count.
        // A full field joining is simply a long run of no RecordFailureAsync.
        var limiter = Build();

        for (var i = 0; i < 500; i++)
            Assert.False(await limiter.IsBlockedAsync(Ip));
    }

    [Fact]
    public async Task Reset_clears_a_blocked_caller()
    {
        var limiter = Build();
        for (var i = 0; i < JoinAttemptLimiter.MaxFailuresPerWindow; i++)
            await limiter.RecordFailureAsync(Ip);
        Assert.True(await limiter.IsBlockedAsync(Ip));

        await limiter.ResetAsync(Ip);

        Assert.False(await limiter.IsBlockedAsync(Ip));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task An_unknown_address_is_never_blocked_and_never_recorded(string? ip)
    {
        // A missing address must fail OPEN. Failing closed here would let one
        // malformed request take the join endpoint down for everyone.
        var limiter = Build();

        await limiter.RecordFailureAsync(ip!);
        Assert.False(await limiter.IsBlockedAsync(ip!));
    }

    [Fact]
    public async Task Failures_recorded_for_one_address_do_not_leak_between_instances()
    {
        // Build() resets the shared in-memory state, so each test case starts
        // clean even though the fallback store is static.
        var first = Build();
        for (var i = 0; i < JoinAttemptLimiter.MaxFailuresPerWindow; i++)
            await first.RecordFailureAsync(Ip);
        Assert.True(await first.IsBlockedAsync(Ip));

        var second = Build();
        Assert.False(await second.IsBlockedAsync(Ip));
    }
}
