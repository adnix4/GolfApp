using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using GolfFundraiserPro.Api.Common.Middleware;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Middleware;

/// <summary>
/// ExceptionHandlingMiddleware decides what every failing request returns
/// (docs/TestingToDoList.txt TT2): the status code clients branch on, and
/// whether anything internal (exception text, stack traces, database
/// errors) leaks to the caller. Production must leak nothing.
/// </summary>
public class ExceptionHandlingMiddlewareTests
{
    private sealed record Result(int Status, string ContentType, JsonElement Body);

    private static async Task<Result> Run(Exception? thrown, string environment = "Production")
    {
        var env = new NullWebHostEnvironment { EnvironmentName = environment };
        var mw  = new ExceptionHandlingMiddleware(
            _ => thrown is null ? Task.CompletedTask : Task.FromException(thrown),
            NullLogger<ExceptionHandlingMiddleware>.Instance, env);

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "POST";
        ctx.Request.Path   = "/api/v1/things";
        ctx.Response.Body  = new MemoryStream();
        await mw.InvokeAsync(ctx);

        ctx.Response.Body.Position = 0;
        var text = await new StreamReader(ctx.Response.Body).ReadToEndAsync();
        var body = text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
        return new Result(ctx.Response.StatusCode, ctx.Response.ContentType ?? string.Empty, body);
    }

    private static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) ? v.GetString() ?? string.Empty : string.Empty;

    [Fact]
    public async Task A_request_without_an_exception_is_untouched()
    {
        var r = await Run(null);
        Assert.Equal(200, r.Status);
        Assert.Equal(JsonValueKind.Undefined, r.Body.ValueKind);
    }

    // The API writes these messages for people (the admin and mobile apps show
    // them), so 4xx keeps the exception's own sentence.
    [Theory]
    [InlineData(typeof(NotFoundException),   404, "NOT_FOUND")]
    [InlineData(typeof(ConflictException),   409, "CONFLICT")]
    [InlineData(typeof(ForbiddenException),  403, "FORBIDDEN")]
    [InlineData(typeof(ValidationException), 400, "VALIDATION_ERROR")]
    public async Task Domain_exceptions_map_to_their_status_and_keep_their_message(Type type, int status, string code)
    {
        var ex = (Exception)Activator.CreateInstance(type, "Hole 19 does not exist.")!;
        var r  = await Run(ex);
        Assert.Equal(status, r.Status);
        Assert.Equal(code, Str(r.Body, "code"));
        Assert.Equal("Hole 19 does not exist.", Str(r.Body, "error"));
        Assert.StartsWith("application/json", r.ContentType);
    }

    // Controllers throw this when a signed-in account has no org claim (a
    // SuperAdmin calling an org endpoint). It used to fall through to 500.
    [Fact]
    public async Task A_missing_org_claim_is_a_403_not_a_server_error()
    {
        var r = await Run(new UnauthorizedAccessException("No orgId claim in token."));
        Assert.Equal(403, r.Status);
        Assert.Equal("FORBIDDEN", Str(r.Body, "code"));
        Assert.DoesNotContain("orgId", Str(r.Body, "error"));
    }

    [Fact]
    public async Task An_unexpected_exception_is_a_500_that_leaks_nothing_in_production()
    {
        var secret = "Host=db.internal;Password=hunter2";
        var r = await Run(new InvalidOperationException($"Connection failed: {secret}"));

        Assert.Equal(500, r.Status);
        Assert.Equal("INTERNAL_ERROR", Str(r.Body, "code"));
        Assert.Equal("An unexpected error occurred. Please try again.", Str(r.Body, "error"));
        Assert.False(r.Body.TryGetProperty("details", out _));          // no stack trace
        Assert.DoesNotContain("hunter2", r.Body.GetRawText());
        Assert.DoesNotContain("InvalidOperationException", r.Body.GetRawText());
    }

    [Fact]
    public async Task Development_adds_the_stack_trace_for_debugging()
    {
        var r = await Run(new InvalidOperationException("boom"), "Development");
        Assert.Equal(500, r.Status);
        Assert.Contains("boom", r.Body.GetProperty("details").GetProperty("stackTrace").GetString());
    }

    [Fact]
    public async Task A_unique_constraint_violation_is_a_409_with_a_generic_message()
    {
        var db = new DbUpdateException("save failed",
            new Exception("23505: duplicate key value violates unique constraint \"IX_events_event_code\""));
        var r = await Run(db);
        Assert.Equal(409, r.Status);
        Assert.Equal("CONFLICT", Str(r.Body, "code"));
        Assert.DoesNotContain("IX_events_event_code", r.Body.GetRawText());   // schema names stay private
    }

    [Fact]
    public async Task Any_other_database_error_is_a_500_without_the_database_text()
    {
        var db = new DbUpdateException("save failed", new Exception("relation \"players\" does not exist"));
        var r = await Run(db);
        Assert.Equal(500, r.Status);
        Assert.Equal("DATABASE_ERROR", Str(r.Body, "code"));
        Assert.DoesNotContain("players", r.Body.GetRawText());
    }

    [Fact]
    public async Task Responses_are_camelCase_and_omit_null_details()
    {
        var r = await Run(new ValidationException("Bad input."));
        Assert.True(r.Body.TryGetProperty("error", out _));
        Assert.True(r.Body.TryGetProperty("code", out _));
        Assert.False(r.Body.TryGetProperty("Error", out _));
        Assert.False(r.Body.TryGetProperty("details", out _));
    }

    private sealed class StartedResponse : HttpResponseFeature
    {
        public override bool HasStarted => true;
    }

    // Once headers are sent the status can't change; rewriting would throw a
    // second exception that hides the real one. The original must surface.
    [Fact]
    public async Task After_the_response_has_started_the_original_exception_propagates()
    {
        var env = new NullWebHostEnvironment { EnvironmentName = "Production" };
        var original = new InvalidOperationException("stream broke");
        var mw = new ExceptionHandlingMiddleware(_ => Task.FromException(original),
            NullLogger<ExceptionHandlingMiddleware>.Instance, env);

        var ctx = new DefaultHttpContext();
        ctx.Features.Set<IHttpResponseFeature>(new StartedResponse());

        var thrown = await Assert.ThrowsAsync<InvalidOperationException>(() => mw.InvokeAsync(ctx));
        Assert.Same(original, thrown);
    }
}
