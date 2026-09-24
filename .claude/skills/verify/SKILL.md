---
name: verify
description: How to build, launch, and drive Golf Fundraiser Pro locally to verify changes end-to-end (API + web; admin/mobile notes). Use when verifying a change works at runtime, not just in tests.
---

# Verify — Golf Fundraiser Pro

## Launch

```powershell
# 1. Infra (postgres+postgis, redis, pgadmin). Idempotent.
cd infra; docker compose up -d; cd ..

# 2. API on :5000 (run from apps/api). It loads the monorepo root .env.local
#    itself (DATABASE_URL etc.) — but when launched from a tool shell, set:
$env:DATABASE_URL = 'postgres://gfp:gfp_local@localhost:5432/golf_fundraiser'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
cd apps/api; dotnet run          # EF migrations auto-apply at startup

# 3. Web (Next.js) on :3000
cd apps/web; npm run dev

# 4. Admin (Expo web) on :8081 — heavy; only when a screen must be eyeballed
cd apps/admin; npx expo start --web
```

Readiness: any GET like `/api/v1/pub/events/XXXXXXXX` returning 404 means the
API is up. Check `\d players` etc. via `docker exec gfp-postgres psql -U gfp -d golf_fundraiser`.

## Drive the API

Create a throwaway org per run (same pattern as the seed skill):

- `POST /api/v1/auth/register` `{ email, password, displayName, orgName, orgSlug, is501c3 }` → `accessToken`
- `POST /api/v1/events` (Bearer) — accepts `config` (e.g. `{ entryFeeCents }`); returns 201
- `PATCH /api/v1/events/{id}` `{ status: 'Registration' }` to open it
- Public: `GET /api/v1/pub/events/{eventCode}`, `POST /api/v1/events/{id}/register/team`
- Fundraising: `GET /api/v1/events/{id}/fundraising` (Bearer), `GET /api/v1/pub/events/{code}/fundraising`

## Gotchas

- Root `.env.local` has PLACEHOLDER Stripe keys (`sk_test_REPLACE…`,
  `whsec_REPLACE…`), so no real PaymentIntents can be created locally.
  Fee-event registration still succeeds (A8 fix): it returns
  `entryFeeClientSecret: null` with the fee amounts populated.
  `confirm-entry-fee` with an unverifiable intent id returns 400.
- Stripe webhooks CAN be driven without real Stripe: sign the payload with the
  configured `STRIPE_WEBHOOK_SECRET` value —
  `Stripe-Signature: t={unix},v1=HMAC_SHA256(whsec, "{t}.{payload}")`.
  Event JSON needs `api_version: '2024-06-20'` (Stripe.net 45.0.0 expects it).
- Missing Stripe-Signature header → 400 "Missing Stripe signature" (A9 fix).
- `dotnet test` / vitest are CI's job — verification means driving these
  surfaces and reading responses/log output
  (`tasks/*.output` for the background `dotnet run`).
- Test data: throwaway orgs accumulate in the local DB; fine to leave.
- `npm run e2e` runs against its OWN database (`golf_fundraiser_e2e`) and Redis
  db 1, and drops/recreates only that. It no longer runs `docker compose down -v`,
  so your dev data in `golf_fundraiser` survives a harness run. It did not always:
  before 2026-09-23 every run dropped the shared volume.
- Snapshot before anything destructive: `npm run db:backup` writes
  `backups/golf_fundraiser_<stamp>.dump` (pg_dump -Fc, inside the container).
  `npm run db:restore -- backups/<file> --yes` puts it back.
- `.env.local` no longer overrides variables the parent shell already set — real
  env wins, standard dotenv precedence. So `$env:DATABASE_URL` above now actually
  takes effect; before 2026-09-23 the file silently replaced it.
