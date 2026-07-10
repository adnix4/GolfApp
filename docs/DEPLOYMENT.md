# Golf Fundraiser Pro — Deployment Runbook

How to deploy the platform for staging / a real-world pilot. Written against
the D2/D3 phases in `problemList.txt`. `.env.example` is the authoritative
env-var reference — this document is the runbook that strings it together.

## Topology

| App | What ships | Suggested target |
|-----|-----------|------------------|
| `apps/api` | ASP.NET Core 8 container | Railway / Render / any container host |
| `apps/web` | Next.js (`next build`) | Vercel or the same container host |
| `apps/admin` | Static bundle (`expo export --platform web`) | Any static host / CDN / nginx |
| `apps/mobile` | Native builds via EAS | TestFlight (iOS) + Play internal track (Android) |
| Postgres | **postgis/postgis:16-3.4** or managed PostGIS | Managed DB (plain postgres breaks GPS features) |
| Redis 7 | SignalR backplane + caching | Managed Redis |
| Object storage | Uploads (logos, auction photos) | S3 / Cloudflare R2 (IFileStorage; MinIO-verified) |

DNS assumed by config defaults: `golffundraiser.pro` (web), `app.` (admin),
`api.` (API). All TLS.

## API — environment variables

Required (startup fails without them):

| Variable | Notes |
|----------|-------|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `DATABASE_URL` | Postgres connection string — database must have PostGIS |
| `JWT_SECRET` | ≥ 32 bytes (`openssl rand -hex 64`); startup guard enforces length |
| `REDIS_URL` | Redis connection string |

Payments + email (required for a real event):

| Variable | Notes |
|----------|-------|
| `STRIPE_SECRET_KEY` | Live (or test-mode for a rehearsal). Registration survives Stripe outages (A8) but payments won't work |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe dashboard after registering `https://api.<domain>/api/v1/webhooks/stripe`. Fail-closed outside Development |
| SendGrid/email vars | See `.env.example` EMAIL section. **Critical path**: join verification codes must arrive — the dev bypass is refused in Production |

Production hardening (added 2026-07-09, all documented in `.env.example`):

| Variable | Notes |
|----------|-------|
| `CORS_ALLOWED_ORIGINS` | Comma-separated web + admin origins. Unset falls back to canonical domains, never allow-all |
| `TRUST_FORWARDED_HEADERS` | `true` only behind a proxy/LB that owns `X-Forwarded-*` — enables real client IPs for rate limiting |
| `DATA_PROTECTION_KEYS_PATH` | Persistent mounted volume for DataProtection keys |
| `GFP_MIGRATE_ON_STARTUP` | `true` only if the host has no CI/CD migration step; failures crash startup on purpose |
| `SUPER_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | Seeds the first platform admin on any environment (idempotent) |
| Storage vars | `STORAGE_CONNECTION_STRING` + `CDN_BASE_URL` for S3/R2; blank = local disk (dev only — doesn't survive redeploys) |

Guards that refuse to start in Production: `JoinVerification__TestBypassCode`
set (join-verification bypass), `JWT_SECRET` missing/short, `DATABASE_URL`
missing. Migration failure with `GFP_MIGRATE_ON_STARTUP=true` also crashes
startup so the platform keeps the previous deployment serving.

Migrations without the startup flag:

```
cd apps/api && dotnet ef database update --connection "$DATABASE_URL"
```

Health check: `GET /api/health` (anonymous, 200 + timestamp). Swagger and the
Hangfire dashboard are Development-only and never exposed in Production.

## Web (`apps/web`)

Build-time env (embedded in the bundle — set BEFORE `next build`):

- `NEXT_PUBLIC_API_URL` — `https://api.<domain>`
- `NEXT_PUBLIC_ADMIN_URL` — `https://app.<domain>`
- `NEXT_PUBLIC_SITE_URL` — `https://<domain>` (metadataBase for OG images)
- `NEXT_PUBLIC_IOS_APP_URL` / `NEXT_PUBLIC_ANDROID_APP_URL` — store listings
  once published (join hand-off page falls back gracefully while unset)

```
cd apps/web && npm run build && npm run start   # or deploy to Vercel
```

## Admin (`apps/admin`)

Build-time env: `EXPO_PUBLIC_API_URL=https://api.<domain>`.

```
cd apps/admin && npx expo export --platform web   # outputs dist/
```

Serve `dist/` statically (SPA fallback to `index.html` required — expo-router
handles client routing).

## Mobile (`apps/mobile`)

- `EXPO_PUBLIC_API_URL=https://api.<domain>` at build time.
- EAS builds: iOS requires Apple Developer Program; SDK 56 builds set
  **iOS 16.4 minimum** (drops older devices — confirm before release).
- Push notifications ride the EAS project credentials; verify a real push
  end-to-end during the dress rehearsal.
- Expo Go is NOT viable for a real event — distribute installable builds
  (TestFlight / Play internal track / direct APK).

## Pre-pilot checklist (dress rehearsal — D4)

1. `/seed-demo-event` against staging; walk Draft → Completed.
2. Score from real phones, including airplane-mode offline entry + sync-back.
3. Join verification email arrives on Gmail + Outlook (SPF/DKIM authenticated
   domain).
4. Stripe test charge end-to-end: registration → PaymentIntent → webhook marks
   paid → fundraising totals. Also the cash mark-paid path.
5. TV leaderboard (`/scores?tv=1`) on a real screen.
6. Backups: nightly `pg_dump` scheduled and a restore actually tested once.
7. Error monitoring (e.g. Sentry) wired in all three apps + uptime ping on
   `/api/health`.
