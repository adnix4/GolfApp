using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds the player columns backing golfer email verification at /join (A3).
    /// The join credential used to be "event code + registered email"; now the
    /// server emails a one-time code and only mints the session token after the
    /// golfer proves ownership of the registered address:
    ///   • verification_code / verification_expires_at / verification_attempts —
    ///     the pending one-time code with its 10-minute expiry and try counter.
    ///   • verified_device_id — the deviceId that last completed verification;
    ///     rejoins from that device skip the code prompt.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260704000000_Phase13_JoinEmailVerification")]
    public partial class Phase13_JoinEmailVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "verification_code",
                table: "players",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "verification_expires_at",
                table: "players",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<short>(
                name: "verification_attempts",
                table: "players",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0);

            migrationBuilder.AddColumn<string>(
                name: "verified_device_id",
                table: "players",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "verification_code", table: "players");
            migrationBuilder.DropColumn(name: "verification_expires_at", table: "players");
            migrationBuilder.DropColumn(name: "verification_attempts", table: "players");
            migrationBuilder.DropColumn(name: "verified_device_id", table: "players");
        }
    }
}
