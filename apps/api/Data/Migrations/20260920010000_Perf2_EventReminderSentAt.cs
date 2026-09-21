using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds events.reminder_sent_at — the idempotency marker for the day-before
    /// "set up your scorecard" nudge.
    ///
    /// WHY: EventReminderJob sweeps hourly for events teeing off inside the next
    /// day. Without a stamp it would mail the same roster on every sweep. The
    /// column is the record of "this event's nudge has gone out", so the sweep
    /// stays a cheap indexed filter and re-running it is harmless.
    ///
    /// WHY IT MATTERS BEYOND COURTESY: golfers who set their phone up the night
    /// before make no requests at the first tee. Joining is already allowed from
    /// the moment a player is on a roster, and the mobile app restores its
    /// session locally rather than re-joining — but nothing had ever told anyone
    /// to do it early, so the whole field arrived and joined at once from one
    /// venue NAT. This column is what lets us ask them to.
    ///
    /// Existing rows get null, i.e. "not yet sent". Events that already started
    /// are excluded by the job's own start-time window, so no backfill is needed
    /// and no historical event will be mailed about.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260920010000_Perf2_EventReminderSentAt")]
    public partial class Perf2_EventReminderSentAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "reminder_sent_at",
                table: "events",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "reminder_sent_at", table: "events");
        }
    }
}
