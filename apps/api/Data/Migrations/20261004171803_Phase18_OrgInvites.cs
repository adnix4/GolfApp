using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds org_invites (problemList D20): an organizer's invitation for someone
    /// to join the org as EventStaff (desk volunteer) or OrgAdmin (co-organizer).
    /// Before this the only way in was /auth/register, which always creates a NEW
    /// org, so every desk volunteer shared the organizer login. Only a SHA-256 of
    /// the link token is stored. Additive: a new table, nothing existing changes.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261004171803_Phase18_OrgInvites")]
    public partial class Phase18_OrgInvites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "org_invites",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    org_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    invited_by_user_id = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    accepted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    revoked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_org_invites", x => x.id);
                    table.ForeignKey(
                        name: "FK_org_invites_organizations_org_id",
                        column: x => x.org_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_org_invites_org_id",
                table: "org_invites",
                column: "org_id");

            migrationBuilder.CreateIndex(
                name: "IX_org_invites_token_hash",
                table: "org_invites",
                column: "token_hash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "org_invites");
        }
    }
}
