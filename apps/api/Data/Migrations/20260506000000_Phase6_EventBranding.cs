using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase6_EventBranding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "logo_url",
                table: "events",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "theme_json",
                table: "events",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "mission_statement",
                table: "events",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_501c3",
                table: "events",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "logo_url",          table: "events");
            migrationBuilder.DropColumn(name: "theme_json",        table: "events");
            migrationBuilder.DropColumn(name: "mission_statement", table: "events");
            migrationBuilder.DropColumn(name: "is_501c3",          table: "events");
        }
    }
}
