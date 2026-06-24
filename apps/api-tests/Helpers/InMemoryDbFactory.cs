using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using GolfFundraiserPro.Api.Data;

namespace WebAPI.Tests.Helpers;

/// <summary>
/// Creates a fresh ApplicationDbContext backed by an EF Core InMemory database.
/// Each call gets an isolated database — safe for parallel tests.
/// </summary>
public static class InMemoryDbFactory
{
    /// <param name="ignoreTransactions">
    /// When true, suppress the InMemory "transactions are not supported" warning so
    /// code paths that call BeginTransactionAsync (e.g. AuthService.RegisterAsync)
    /// run as a no-op transaction instead of throwing.
    /// </param>
    public static ApplicationDbContext Create(string? dbName = null, bool ignoreTransactions = false)
    {
        var builder = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString());

        if (ignoreTransactions)
            builder.ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning));

        return new ApplicationDbContext(builder.Options);
    }
}
