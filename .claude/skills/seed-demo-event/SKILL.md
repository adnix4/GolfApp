---
name: seed-demo-event
description: Create a fully-populated demo golf tournament (custom branding colors, unique sponsors, hole challenges, 10–15 teams of 2–4 players, scores, donations) and walk it through the event lifecycle one phase at a time — Draft → Registration → Active → Scoring → Completed — pausing at each phase for review in the web/admin apps. Use when the user asks to seed a demo/test event, generate sample tournament data, or step through the event phases.
user-invocable: true
allowed-tools:
  - Read
  - Bash(node *)
  - Bash(curl *)
---

# /seed-demo-event — Demo tournament generator & lifecycle walkthrough

Creates a realistic demo event through the **real API** (not direct SQL) under a
throwaway org, then advances it through the status machine **one phase at a
time** so the user can review each phase in the running apps.

The work is done by `seed_demo_event.mjs` (next to this file). You orchestrate
it: run a step, present the review info, then **stop and wait** for the user to
look before advancing. Do not blast through all phases in one go — the whole
point is reviewing each phase.

## Prerequisites (check first)

- **API** running on `http://localhost:5000` (`cd apps/api && dotnet run`).
- **Web** running on `http://localhost:3000` (`cd apps/web && npm run dev`) — needed to *view* phases, not to seed.
- **Postgres** container `gfp-postgres` up.

The script fails fast with a clear message if the API is unreachable. It needs
**no** Stripe key — entry fees are applied without creating PaymentIntents.

## How to run it

All commands run from the skill directory:

```
node .claude/skills/seed-demo-event/seed_demo_event.mjs <command>
```

| Command | What it does |
|---------|--------------|
| `setup`   | Registers a throwaway org+admin, creates the event, attaches a par-72 course, applies **custom colors**, adds **6 unique sponsors** + **4 hole challenges** + **5 auction items** (4 silent + 1 Fund-a-Need), configures free agents/capacity. Leaves the event in **Draft**. |
| `advance` | Moves to the next phase and seeds that phase's data (see below). |
| `status`  | Prints current phase, counts, score-source breakdown, conflicts, and review URLs. |
| `resolve-conflict [admin\|mobile\|<score>]` | Resolves the seeded mobile-vs-admin conflict (default keeps the **admin** value; `mobile` takes the mobile value; or pass an exact gross score). Prints the team's holes-complete before→after as it rejoins the leaderboard. |
| `reset`   | Cancels the event and clears local state so a new run can start clean. |

State (tokens, ids, event code, credentials) is kept in `.state.json` beside the
script — local and disposable. Only one demo event exists at a time; run `reset`
before starting another.

Optional: `TEAM_COUNT=15 node ... setup` (clamped to 10–15; default 12).

## What each `advance` seeds

| Phase entered | Data added | Review |
|---------------|-----------|--------|
| **Registration** | 10–15 teams (2–4 players each), entry fee enabled + ~75% teams marked paid, public donations | Public landing page is now live: colors, sponsors, mission, donation thermometer |
| **Active** | ~80% of teams checked in; holes 1–6 scored — **one team's scores arrive via the real mobile sync endpoint** (`/sync/scores`, Source=MobileSync) and **one deliberate mobile-vs-admin conflict** is created; ~12 players checked in and **auction bids placed** | Live leaderboard begins; admin scorecard shows mobile + admin scores side by side and a conflict to resolve; admin Auction tab shows live high bids |
| **Scoring** | Holes 7–18 scored, hole-challenge results recorded | Full ranked leaderboard; challenges view |
| **Completed** | Final round-day donation; round closed | Final standings / thank-you flow |

## Procedure (follow this)

1. Confirm the API is up (the script will tell you if not).
2. Run `setup`. Relay the printed **review block** (event code, org slug, public
   URL, leaderboard URL, admin login). Note that a **Draft event is not public
   yet** — it's reviewable only in the admin dashboard. **Stop and ask** the
   user to review, then say "advance" when ready.
3. On the user's go-ahead, run `advance` once. Relay the review block and the
   one-line description of what that phase now shows. **Stop and wait.**
4. Repeat step 3 until the event reaches **Completed**.
5. Offer `reset` when the user is done.

Always surface the exact `…/e/{slug}/{code}` and `…/scores` URLs after each step
— they're the whole point of the review pause.

## Notes & gotchas

- **Throwaway org per run:** each `setup` uses a unique slug/email, so runs never
  collide. `reset` cancels the event but leaves the (harmless) org rows in the DB;
  Draft/Cancelled events never appear in the public list.
- **Access tokens expire in 15 min:** the script re-logs-in at the start of every
  command and before long scoring loops, so resuming later is fine.
- **Custom colors** are applied via the event branding endpoint (`themeJson`), a
  flat `{primary,action,accent,highlight,surface}` GFP palette the web reads as
  `--color-*` CSS variables.
- **Mobile sync path + conflict (Active phase):** one team (`teams[0]`) is scored
  through the real `/api/v1/sync/scores` endpoint (Source=MobileSync) instead of
  the admin endpoint, proving mobile scores feed the admin scorecard and both
  leaderboards. A second team (`teams[1]`) gets a deliberate conflict on hole 3:
  the admin value is entered first, then the mobile app syncs a different value
  from a different device → the server flags the existing row `IsConflicted` (it
  does **not** store the mobile value), and the conflicted hole drops out of the
  leaderboard until an admin resolves it (admin scorecard → resolve). `status`
  prints a "Scores by source" breakdown and the unresolved-conflict count. Use
  the `resolve-conflict` command (or the admin UI) to clear it and watch the team
  rejoin the standings.
- **Auction items stay Open** for the whole demo. Closing/awarding/buy-now would
  trigger `ChargeWinnerAsync` (Stripe), which 500s with no `STRIPE_SECRET_KEY`.
  So the seeder only creates items + bids/pledges; it never produces winners or
  charges. Bidding requires `CheckedIn` players (the eligibility rule waives the
  payment-method requirement for checked-in players), which is why bids are
  seeded in the **Active** phase, after player check-in.
- If `advance` reports an unexpected status, the event was moved outside this tool
  — run `status`, and `reset` if needed.
