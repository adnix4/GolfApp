# Golf Fundraiser Pro — Claude Code Guide

## Project structure

Monorepo with three apps:
- `apps/api` — ASP.NET Core 8 Web API (C#, EF Core, PostgreSQL)
- `apps/mobile` — Expo / React Native scorer app (TypeScript)
- `apps/admin` — Next.js organizer dashboard (TypeScript)

Shared packages live in `packages/` (theme, UI components, shared types).

## Design & spec documents

Full design documents are in `docs/GolfFundPro/`. Read the relevant file before
making non-trivial changes in that area. Do not load all files at once.

| File | Covers |
|------|--------|
| `GFP_Foundation.docx.txt` | Data model, auth, org/event/team/player entities, status state machine |
| `GFP_Phase1_AdminTournament.docx.txt` | Admin dashboard — event creation, roster, check-in, scoring entry |
| `GFP_Phase2_ScoringApp.docx.txt` | Mobile scorer — join flow, offline SQLite, sync, preflight |
| `GFP_Phase3_LiveScoring.docx.txt` | SignalR real-time, Redis pub/sub, push notifications, hole-in-one alerts |
| `GFP_Phase4_PaymentsAuction.docx.txt` | Stripe payments, silent/live/donation auction |
| `GFP_Phase5_LeaguePlay.docx.txt` | League/season model, handicap engine, pairing, standings, skins |
| `GFP_Phase6_GPS.docx.txt` | Per-event branding, GPS cup location, mobile theme provider |
| `Golf_Fundraiser_Pro_TechSpec_v9.docx.txt` | Full technical specification (authoritative reference) |
| `Golf_Fundraiser_Pro_Pricing_Strategy.docx.txt` | Pricing tiers and feature gating |

## Key conventions

- **Never commit** — user handles all git commits.
- **API auth** — organizer endpoints use JWT (`[Authorize(Policy = "OrgAdmin")]` or `"EventStaff"`); public/mobile endpoints are `[AllowAnonymous]`.
- **Event status machine** — Draft → Registration → Active → Scoring → Completed (or Cancelled). Enforce via `EventStatusRules.cs`.
- **Mobile offline** — scores queue in SQLite (`pending_scores`), synced by `backgroundSync.ts`. Don't assume connectivity.
- **Test mode** — Draft events are joinable by event code only and show a purple test-mode banner; they never appear in the public event list.
