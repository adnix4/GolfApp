# Performance Review — 2026-07-03 (branch: perf/evaluation)

Scope: API (ASP.NET Core / EF Core), mobile scorer, admin dashboard, public web.
Focus: things that unnecessarily slow the system down, ranked by impact.

**Status: all high-impact (1–3) and medium (4–7) items are FIXED on this
branch** (see ✅ notes below).

## High impact

### 1. ✅ FIXED — Cartesian-product event loads (EF multi-collection Include, no split query)
> Fix: Teams/Players/Scores Includes removed from GetByIdAsync / UpdateAsync /
> AttachCourseAsync / UpdateBrandingAsync; dashboard counts now come from a
> single projected `LoadCountsAsync` query (COUNT/COUNT DISTINCT DB-side);
> GetByIdAsync is `AsNoTracking`. Covered by `GetById_computes_dashboard_counts_db_side`.
`EventService` loads events with `Include(Course.Holes)` + `Include(Teams.Players)` +
`Include(Scores)` in `GetByIdAsync` (~line 149), `UpdateAsync` (~178), and
`UpdateBrandingAsync` (~504). The DbContext is registered without
`UseQuerySplittingBehavior(SplitQuery)`, so EF emits ONE joined SQL query whose
row count is the *product* of the collections. A completed 15-team event
(18 holes × 60 players × 1,080 scores) duplicates every event/course column
across hundreds of thousands of result rows — for a single dashboard GET.
All entities are change-tracked on top of that.

The only thing the mapper does with Teams/Players/Scores is compute four counts
(`MapToEventResponse` → `Counts`). Fix options (best first):
- Project counts DB-side (`.Select(e => new { ..., TeamCount = e.Teams.Count(), ... })`)
  and drop the collection Includes entirely.
- Or add `.AsSplitQuery()` + `AsNoTracking()` where entities aren't mutated.
- `UpdateBrandingAsync` needs none of these Includes — it only writes branding
  columns; the Includes exist just so the response mapper can produce counts.

### 2. ✅ FIXED — `GetPublicEventAsync` is the hottest anonymous endpoint and the heaviest
> Fix: rewritten as one `AsNoTracking` projection — team count and donation sum
> computed by the database, sponsors returned as narrow rows (no collection
> Includes at all). Behavior unchanged (404 rules, branding fallback, spots
> remaining); covered by two new projection tests.
`EventService.GetPublicEventAsync` (~line 589) does 5 Includes — Organization,
Course, **Teams**, **Sponsors**, **Donations** — three of which are collections
(cartesian, same problem as #1), tracked, and then:
- materializes ALL team rows to compute `Teams.Count`
- materializes ALL donation rows to compute a SUM
It backs `/api/v1/pub/events/{code}` which serves every public landing view,
the Next.js SSR (60 s revalidate — good), **and every mobile device's poll loop**.

### 3. ✅ FIXED — Mobile polls the heavy endpoint for 3 small fields
> Fix: new `GET /api/v1/pub/events/{code}/status` (single-row projection:
> status + resolvedThemeJson + sponsorsVersion); mobile `fetchEventStatus`
> now targets it. Bonus correctness: unlike the landing endpoint it reports
> Draft/Cancelled, so test-mode theme refresh works and devices detect a
> cancelled event instead of silently retrying a 404 forever.
`fetchEventStatus` (mobile `lib/api.ts:202`) hits `/pub/events/{code}` but reads
only `status`, `resolvedThemeJson`, `sponsorsVersion`. Poll cadence:
- Waiting room (`(scoring)/_layout.tsx`): every **5 s per device** until scoring opens.
- In-round session poll (`lib/session.tsx`): every 30 s (WiFi) / 60 s (cellular).
30 waiting devices = 6 req/s into the cartesian query in #2. Fix: add a projected
`GET /pub/events/{code}/status` returning just those three fields (single-row,
`AsNoTracking`), or at minimum fix #2 and add a short Redis/memory cache like the
leaderboard's 2 s TTL.

## Medium impact

### 4. ✅ FIXED — No response compression
> Fix: Brotli/Gzip via AddResponseCompression (EnableForHttps) + UseResponseCompression.
> Verified live: `/api/health` responds `Content-Encoding: br`.
No `AddResponseCompression`/`UseResponseCompression` in `Program.cs`. Leaderboard
and public-event JSON are polled by many clients; a 36-team leaderboard payload
compresses ~5-10×. If a reverse proxy (nginx/Cloudflare) fronts the API in prod
this is moot — verify; otherwise enable gzip/brotli for `application/json`.

### 5. ✅ FIXED — Uploaded logos served with no cache headers
> Fix: org/event/sponsor logo uploads now get versioned filenames
> (`{id}-{ticks}{ext}`, old file already deleted on replace), so `/uploads/*`
> is served `public, max-age=31536000, immutable` — a replaced logo always has
> a NEW URL. The brand-extraction `-fetched` suggestion file deliberately
> self-overwrites, so it gets `no-cache` (ETag revalidation) instead.
> Verified live on both branches of the policy.
`app.UseStaticFiles()` (Program.cs:162) serves `/uploads/**` with no
`Cache-Control`, so every landing/leaderboard view re-validates or re-downloads
org/sponsor logos. Upload filenames appear unique per upload — safe to add
`OnPrepareResponse` with `Cache-Control: public, max-age=604800` (or immutable
if filenames are content-addressed).

### 6. ✅ FIXED — `ListActiveEventsAsync` materializes tracked entities per directory view
> Fix: now an `AsNoTracking` column projection (org/course names inline);
> JSON config parsing stays in memory. No cache added — revisit if the
> directory gets real traffic.
`MobileService.ListActiveEventsAsync` (line 54) loads full Event + Organization +
Course entities (tracked) and parses `ConfigJson` in a loop, and both the web
"find your event" page (`cache: 'no-store'`) and the mobile join screen call it.
Reference-only Includes so no cartesian, but it should be a projection +
`AsNoTracking`, and is a good candidate for a 30-60 s cache since it changes
rarely.

### 7. ✅ FIXED — `HandicapEngine` per-member player writes (N+1)
> Fix: SyncToPlayersAsync fetches all target players in one `Contains` query
> and applies indexes from a dictionary.
`HandicapEngine.cs:106` — `FindAsync` per member with `PlayerId` inside a loop.
Bounded (~18 members) and only runs at round close, so low priority; a single
`Where(p => ids.Contains(p.Id))` fetch would still be cleaner.

## Low / notes

- **Hangfire on Postgres** polls its queue tables continuously (default
  `QueuePollInterval` ~15 s). Fine, but worth setting explicitly if DB chatter
  matters on a small instance.
- Mobile `(scoring)/leaderboard.tsx` re-renders on a 10 s `nowTick` interval for
  the "updated Xs ago" label — negligible at this list size.
- `docs` scale assumption: everything above matters at tournament scale
  (~40 teams, ~160 players, dozens of spectators); none of it is failing today,
  it's headroom being burned.

## What's already good (don't touch)

- **Leaderboard read path**: `LeaderboardLoader` uses narrow projections +
  `AsNoTracking` (comment explicitly says "never an Include() Cartesian").
- **Redis 2 s read-through cache** on the public leaderboard absorbs
  shotgun-burst polling; no-op cleanly when Redis is absent in dev.
- **`LeaderboardBroadcaster`** coalesces SignalR broadcasts to ≤1 per event per
  1.5 s window.
- **Mobile sync**: `BatchSyncAsync` is properly batched (one score dictionary
  load, one SaveChanges, one publish); `attemptSync` early-exits with mutex +
  backoff; polling stops when offline and live hooks poll only when SignalR is
  disconnected (15 s fallback).
- **Web SSR caching**: event page revalidates at 60 s, leaderboard at 30 s;
  only the deliberately-fresh paths use `no-store`.
- Session-token auth is a constant-time byte compare, not bcrypt — cheap on the
  polling path.
- Admin screens use FlatList (11 files) and have no polling loops (SignalR +
  manual refresh).

## Suggested fix order

1. ~~`UpdateBrandingAsync`: drop unneeded Includes~~ ✅ done
2. ~~`GetPublicEventAsync`: rewrite as a single projection~~ ✅ done
3. ~~Add `GET /pub/events/{code}/status` micro-endpoint~~ ✅ done
4. ~~`GetByIdAsync`/`UpdateAsync`: project counts DB-side~~ ✅ done
5. ~~Response compression + static upload cache headers~~ ✅ done
6. ~~`ListActiveEventsAsync` projection~~ ✅ done (cache deferred)
