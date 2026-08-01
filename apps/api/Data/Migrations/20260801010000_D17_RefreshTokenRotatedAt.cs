using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds refresh_tokens."RotatedAt" so a token revoked BY ROTATION can be
    /// told apart from one revoked by logout or a password change.
    ///
    /// Why (D17): when an access token expires, every in-flight request 401s at
    /// once and each context refreshes with the same refresh token. Rotation
    /// revokes on the first, so the rest were answered "invalid or expired —
    /// please log in again", which cleared a perfectly good session. Observed
    /// live as 2x200 + 1x400 on a single expiry. A token stamped here stays
    /// replayable for a short grace window (TokenService.RefreshReplayGrace);
    /// logout leaves the column null and therefore gets no grace at all.
    ///
    /// Deliberately NOT backfilled. Existing revoked rows have unknown reason,
    /// and defaulting them to "rotated" would hand a grace window to tokens
    /// that were revoked by logout. Null means no grace, which is the safe
    /// reading for every historical row.
    ///
    /// Note this table uses PascalCase column names, unlike the rest of the
    /// schema — matching the existing convention here rather than the global one.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260801010000_D17_RefreshTokenRotatedAt")]
    public partial class D17_RefreshTokenRotatedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "RotatedAt",
                table: "refresh_tokens",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "RotatedAt", table: "refresh_tokens");
        }
    }
}
