using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;

namespace WebAPI.Tests.Helpers;

/// <summary>
/// Creates a fresh ApplicationDbContext backed by an EF Core InMemory database.
/// Each call gets an isolated database — safe for parallel tests.
/// </summary>
public static class InMemoryDbFactory
{
    public static ApplicationDbContext Create(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;

        return new ApplicationDbContext(options);
    }
}
