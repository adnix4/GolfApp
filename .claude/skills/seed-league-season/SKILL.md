---
name: seed-league-season
description: Create a fully-populated league-play season (a league, a season, skill flights, ~18 members across handicaps) and play it through the API one round at a time — generate pairings, open scoring, score every member, then close the round so handicaps recalculate, standings update, and skins resolve — pausing after each round to review the evolving leaderboard in the admin app. Use when the user asks to seed league/season data, generate sample league play, test handicaps/standings/skins/pairings, or step through league rounds.
user-invocable: true
allowed-tools:
  - Read
  - Bash(node *)
  - Bash(curl *)
---

# /seed-league-season — League season generator & round-by-round walkthrough

The **league-play** counterpart to `/seed-demo-event`. Creates a realistic league
season through the **real API** (not direct SQL) under a throwaway org, then plays
it **one round at a time** so the user can watch standings, handicaps, and skins
change after each round in the admin app.

A league season isn't a single status machine like a tournament event. It's the
**round** status machine repeated per round:

```
create round (Scheduled) → save pairings (Open) → open scoring (Scoring)
→ submit every member's 18 holes → close round (Closed)
```

**Closing** a round is where the Phase-5 engines fire — handicaps recalculate,
standings update, skins resolve. So the review pause is **after each round**:
watch indexes drift and the leaderboard reshuffle.

The work is done by `seed_league_season.mjs` (next to this file). You orchestrate
it: play a round, present the review info, then **stop and wait** for the user to
look before playing the next. Don't blast through all rounds — reviewing each
round's recalculation is the whole point.

## Prerequisites (check first)

- **API** running on `http://localhost:5000` (`cd apps/api && dotnet run`).
- **Admin app** (Expo web) on `http://localhost:8081` (`cd apps/admin && npm run dev`) — needed to *view* league pages, not to seed.
- **Postgres** container `gfp-postgres` up.

The script fails fast with a clear message if the API is unreachable. It needs
**no** Stripe key — league play involves no payments.

## How to run it

```
node .claude/skills/seed-league-season/seed_league_season.mjs <command>
```

| Command | What it does |
|---------|--------------|
| `setup`  | Registers a throwaway org+commissioner, creates a **league** (Stableford · Club handicap), a **season**, **3 skill flights**, and **~18 members** spread across handicaps and assigned to flights. No rounds played yet. |
| `round`  | Plays the **next** round end-to-end: creates it, generates + locks pairings, opens scoring, submits every member's 18 holes, then **closes** it (handicaps + standings + skins recalc). Prints top standings and the round's skins. Repeat per round. |
| `status` | Current standings (top 5), rounds played, member count + any sandbagger flags, last round's skins, review URLs. |
| `reset`  | Forgets local state so a fresh run can start clean. |

State (tokens, ids, members, rounds-played) is kept in `.state.json` beside the
script — local and disposable. Only one league season exists at a time; run
`reset` before starting another.

Optional env: `MEMBER_COUNT=24`, `TOTAL_ROUNDS=6`, `SKINS_POT=500` (cents/hole/
player; `0` disables skins), `LEAGUE_FORMAT=Stroke|Stableford|Match|Quota`.

## Procedure (follow this)

1. Confirm the API is up (the script will tell you if not).
2. Run `setup`. Relay the printed **review block** (admin login, season URL).
   **Stop and ask** the user to review the roster/flights, then say "round" when ready.
3. On the user's go-ahead, run `round` once. Relay the standings + skins summary and
   the review block. **Stop and wait.**
4. Repeat step 3 until `roundsPlayed == totalRounds` (the script says "Season complete").
5. Offer `reset` when the user is done.

Always surface the admin season URL after each step — that's the point of the pause.

## Notes & gotchas

- **One throwaway org per run:** each `setup` uses a unique slug/email, so runs never
  collide. There is **no API to delete a league**, so `reset` only clears local state;
  the (harmless) org/league rows stay in the DB.
- **Access tokens expire in 15 min:** the script re-logs-in at the start of every
  command and mid-way through the long per-round scoring loop, so resuming later is fine.
- **No course attached — by design.** Rounds use the API's supported simplified
  model: every hole plays as **par 4** with **per-hole stroke index = hole number**.
  A member with course handicap N therefore gets a stroke on holes 1..N — a clean,
  self-contained net/Stableford basis that needs no course or event. (Set
  `LEAGUE_FORMAT` to exercise the other standings formats; USGA differentials would
  require a rated course and aren't part of this seed.)
- **Closing is the payload.** `close` runs HandicapEngine → StandingsCalculator →
  SkinsCalculator in one call. If `close` returns a 500 about an untranslatable
  query, that's the known-unverified handicap-differential `GroupBy` (it can't run on
  the EF InMemory test provider; this seed is the way to confirm it on real Postgres).
  Relay the error verbatim if it happens — it's a real finding, not a seeder bug.
- **Handicaps drift across rounds.** Club handicap recalcs on each close (best-N-of-M
  of the par-relative differentials), so a member's index in `status` will differ from
  their seeded starting value after a round or two — that's the feature being demoed.
- **Sandbagger flag:** `GetMembers` flags members whose recent net scores are
  consistently ≥3 under — `status` surfaces the count. Random scoring may or may not
  trip it; it's there to review, not guaranteed.
- **Skins carry on ties:** a tied hole produces a winner-less skin whose pot rolls
  into the next hole. The round review prints won vs carried counts.
- **Pairings reduce repeats:** the engine greedy-swaps to avoid pairing the same
  members together across rounds, so later rounds' groups shift — visible in the
  admin pairings view / tee sheet PDF.
- If a `round` fails partway, re-running `round` would create a *second* round (the
  failed one may be left mid-flow). Prefer `reset` + fresh `setup` if a round errors out.
