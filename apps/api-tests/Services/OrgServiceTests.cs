using Xunit;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Features.Orgs;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for OrgService: profile updates, blank-name guard, logo-upload validation,
/// and the WCAG-AA theme validation (hex format + primary/surface contrast gate).
/// </summary>
public class OrgServiceTests
{
    private static (OrgService svc, ApplicationDbContext db, Guid orgId) Build()
    {
        var db = InMemoryDbFactory.Create();
        var orgId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Acme", Slug = "acme" });
        db.SaveChanges();
        return (new OrgService(db, new FakeFileStorage(), NullLogger<OrgService>.Instance), db, orgId);
    }

    [Fact]
    public async Task Get_unknown_org_throws_NotFound()
    {
        var (svc, _, _) = Build();
        await Assert.ThrowsAsync<NotFoundException>(() => svc.GetAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task Update_applies_fields_and_trims_name()
    {
        var (svc, _, orgId) = Build();
        var res = await svc.UpdateAsync(orgId, new UpdateOrgRequest
        {
            Name = "  New Name  ", MissionStatement = "Do good.", Is501c3 = true,
        });

        Assert.Equal("New Name", res.Name);
        Assert.Equal("Do good.", res.MissionStatement);
        Assert.True(res.Is501c3);
    }

    [Fact]
    public async Task Update_blank_name_throws_Validation()
    {
        var (svc, _, orgId) = Build();
        await Assert.ThrowsAsync<ValidationException>(
            () => svc.UpdateAsync(orgId, new UpdateOrgRequest { Name = "   " }));
    }

    [Fact]
    public async Task Update_blank_logo_and_mission_clear_to_null()
    {
        var (svc, db, orgId) = Build();
        db.Organizations.Single().LogoUrl = "/uploads/logos/old.png";
        db.Organizations.Single().MissionStatement = "old";
        await db.SaveChangesAsync();

        var res = await svc.UpdateAsync(orgId, new UpdateOrgRequest { LogoUrl = "", MissionStatement = " " });

        Assert.Null(res.LogoUrl);
        Assert.Null(res.MissionStatement);
    }

    [Fact]
    public async Task Update_accepts_a_high_contrast_theme()
    {
        var (svc, _, orgId) = Build();
        var theme = "{\"primary\":\"#000000\",\"action\":\"#31572c\",\"accent\":\"#4f772d\",\"highlight\":\"#90a955\",\"surface\":\"#ffffff\"}";

        var res = await svc.UpdateAsync(orgId, new UpdateOrgRequest { ThemeJson = theme });
        Assert.Equal(theme, res.ThemeJson);
    }

    [Fact]
    public async Task Update_rejects_invalid_hex_in_theme()
    {
        var (svc, _, orgId) = Build();
        var theme = "{\"primary\":\"#xyz\",\"action\":\"#31572c\",\"accent\":\"#4f772d\",\"highlight\":\"#90a955\",\"surface\":\"#ffffff\"}";
        await Assert.ThrowsAsync<ValidationException>(
            () => svc.UpdateAsync(orgId, new UpdateOrgRequest { ThemeJson = theme }));
    }

    [Fact]
    public async Task Update_rejects_theme_failing_WCAG_contrast()
    {
        var (svc, _, orgId) = Build();
        // white-on-white = 1:1 contrast, far below the 4.5:1 AA threshold.
        var theme = "{\"primary\":\"#ffffff\",\"action\":\"#31572c\",\"accent\":\"#4f772d\",\"highlight\":\"#90a955\",\"surface\":\"#ffffff\"}";
        await Assert.ThrowsAsync<ValidationException>(
            () => svc.UpdateAsync(orgId, new UpdateOrgRequest { ThemeJson = theme }));
    }

    [Fact]
    public async Task Update_rejects_malformed_theme_json()
    {
        var (svc, _, orgId) = Build();
        await Assert.ThrowsAsync<ValidationException>(
            () => svc.UpdateAsync(orgId, new UpdateOrgRequest { ThemeJson = "{not json" }));
    }

    [Fact]
    public async Task Update_blank_theme_clears_it_to_null()
    {
        var (svc, db, orgId) = Build();
        db.Organizations.Single().ThemeJson = "{\"primary\":\"#000000\"}";
        await db.SaveChangesAsync();

        var res = await svc.UpdateAsync(orgId, new UpdateOrgRequest { ThemeJson = "" });
        Assert.Null(res.ThemeJson);
    }

    // ── Logo upload validation ──────────────────────────────────────────────────

    private static IFormFile FakeFile(long length, string contentType, string name = "logo.png")
    {
        var stream = new MemoryStream(length > 0 ? new byte[length] : Array.Empty<byte>());
        return new FormFile(stream, 0, length, "file", name)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType,
        };
    }

    [Fact]
    public async Task UploadLogo_rejects_empty_file()
    {
        var (svc, _, orgId) = Build();
        await Assert.ThrowsAsync<ValidationException>(
            () => svc.UploadLogoAsync(orgId, FakeFile(0, "image/png")));
    }

    [Fact]
    public async Task UploadLogo_rejects_disallowed_content_type()
    {
        var (svc, _, orgId) = Build();
        await Assert.ThrowsAsync<ValidationException>(
            () => svc.UploadLogoAsync(orgId, FakeFile(10, "application/pdf")));
    }
}
