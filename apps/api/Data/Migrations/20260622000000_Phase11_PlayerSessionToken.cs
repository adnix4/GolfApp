using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds players.session_token — an opaque per-player token minted at /join and
    /// held by the mobile app. Golfers have no account/password, so this token is
    /// what authorizes their own actions (self profile edit, score sync, auction
    /// bids, Stripe payment endpoints). Nullable until a player first joins.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260622000000_Phase11_PlayerSessionToken")]
    public partial class Phase11_PlayerSessionToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "session_token",
                table: "players",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "session_token", table: "players");
        }
    }
}
