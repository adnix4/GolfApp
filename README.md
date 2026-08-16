# Golf Fundraiser Pro

**Golf Scramble Made Easy** — A complete tournament management platform for non-profit fundraising events.

Built in six feature phases, all delivered; work since has continued past them
(schema migrations run to `Phase14`). This is the monorepo housing all
applications and shared packages.

---

## Architecture Overview

```
golf-fundraiser-pro/              ← Turborepo monorepo root
  apps/
    api/       → ASP.NET Core .NET 8  — REST API (port 5000)
    admin/     → Expo Router web      — Organizer dashboard (port 8081)
    mobile/    → Expo SDK 57          — iOS/Android scoring app
    web/       → Next.js 16           — Public leaderboard + landing page (port 3000)
  packages/
    ui/          → Shared React Native components (mobile + admin)
    shared-types/→ TypeScript DTOs + Zod schemas (API contracts)
    theme/       → 5-token color system + WCAG validation
  infra/
    docker-compose.yml  → PostgreSQL/PostGIS, Redis, pgAdmin
    nginx.conf          → Local reverse proxy (port 8080)
    init-scripts/       → DB initialization SQL
  .github/
    workflows/          → ci, deploy-api, deploy-admin, eas-build
                          (web deploys via Vercel's own GitHub integration —
                           there is no deploy-web workflow)
```

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend API | ASP.NET Core Web API (.NET 8) | C# 12, EF Core, Minimal API style |
| Database | PostgreSQL 16 + PostGIS 3.4 | PostGIS required for GPS features |
| Cache | Redis 7 | Leaderboard cache + SignalR backplane |
| Admin Dashboard | Expo Router web | Shares UI components with mobile |
| Public Web | Next.js 16 App Router | SSR, Vercel, JSON-LD structured data |
| Mobile App | React Native + Expo SDK 57 | New Architecture, EAS Build |
| Real-Time | ASP.NET SignalR | Phase 3 |
| Payments | Stripe | Phase 4 |
| Email | SendGrid | 100/day free tier |
| Auth | ASP.NET Identity + JWT | 15-min access tokens |

---

## Prerequisites

- **Node.js 20+** and **npm 10+**
- **.NET 8 SDK** — [download](https://dotnet.microsoft.com/download/dotnet/8)
- **Docker Desktop** — for PostgreSQL, Redis, pgAdmin
- **EAS CLI** — `npm install -g eas-cli` (for mobile builds; the Expo CLI itself
  ships with the `expo` dependency and is run via `npx expo`)

---

## First-Time Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/golf-fundraiser-pro.git
cd golf-fundraiser-pro

# Install all workspace dependencies in one command
npm install
```

### 2. Configure environment

```bash
# Copy the template — never commit .env.local
cp .env.example .env.local

# Edit .env.local and fill in:
#   JWT_SECRET          → openssl rand -hex 64
#   JWT_REFRESH_SECRET  → openssl rand -hex 64  (different value)
#   SENDGRID_API_KEY    → from https://app.sendgrid.com
#   (Stripe/Mapbox keys optional until their respective phases)
```

### 3. Start the database stack

```bash
# Start PostgreSQL (PostGIS), Redis, and pgAdmin
cd infra && docker compose up -d

# Verify all three are healthy
docker compose ps

# Expected output:
#   gfp-postgres   running (healthy)
#   gfp-redis      running (healthy)
#   gfp-pgadmin    running (healthy)
```

**pgAdmin** is available at http://localhost:5050
- Email: `admin@local.dev`
- Password: `admin`
- The `golf_fundraiser` database connection is pre-configured.

### 4. Database migrations

In Development the API applies pending EF Core migrations **automatically at
startup**, so step 5 below is usually all you need. Run them by hand only if you
want the schema in place before the API boots:

```bash
cd apps/api
dotnet ef database update

# Verify PostGIS is enabled in pgAdmin or psql:
#   SELECT PostGIS_Version();
```

Outside Development this is off by default — migrations belong in the deploy
step, so a bad schema never silently reaches a running service. Single-container
hosts can opt in with `GFP_MIGRATE_ON_STARTUP=true`.

### 5. Start all development servers

Open **four terminals**:

**Terminal 1 — API:**
```bash
cd apps/api
dotnet run
# API available at http://localhost:5000
# Swagger UI at http://localhost:5000/swagger
```

**Terminal 2 — Admin Dashboard:**
```bash
cd apps/admin
npm run dev
# Admin at http://localhost:8081
```

**Terminal 3 — Public Web:**
```bash
cd apps/web
npm run dev
# Web at http://localhost:3000
```

**Terminal 4 — Mobile (optional):**
```bash
cd apps/mobile
npm start
# Scan QR with Expo Go app on your phone
```

Or start all JavaScript apps at once from the root:
```bash
npm run dev
# Turborepo starts admin + web + mobile in parallel
# (API still needs its own terminal — it's .NET, not JS)
```

---

## Monorepo Commands

All commands run from the repo root:

```bash
npm run build          # Build all workspaces (packages before apps)
npm run dev            # Start all JS dev servers in parallel
npm run lint           # ESLint across all TypeScript workspaces
npm run type-check     # tsc --noEmit across all TypeScript workspaces
npm run test           # Run tests in all workspaces
npm run check-updates  # Outdated deps + watchlist version-drift check (72h install cooldown)
npm run audit:prod     # Production dependency audit gate — the same one CI runs
npm run clean          # Delete all build artifacts + node_modules
```

---

## Working with Shared Packages

The three packages in `packages/` are used by importing their scoped names:

```typescript
// In apps/admin, apps/mobile, or apps/web:
import { ECO_GREEN_DEFAULT, buildCSSVars, validateContrast } from '@gfp/theme'
import type { EventDTO, TeamDTO, LeaderboardEntryDTO }        from '@gfp/shared-types'
import { ScoreCard, LeaderboardRow, ThemeProvider, useTheme } from '@gfp/ui'
```

If you modify a package, Turborepo automatically rebuilds dependents on the next `npm run build`.

---

## Database Access

**Connection string (local):**
```
postgresql://gfp:gfp_local@localhost:5432/golf_fundraiser
```

**Useful psql commands:**
```bash
# Connect directly
psql postgresql://gfp:gfp_local@localhost:5432/golf_fundraiser

# Verify PostGIS
SELECT PostGIS_Version();

# List all tables
\dt

# Check migration history
SELECT * FROM "__EFMigrationsHistory";
```

**Reset database (wipe and recreate):**
```bash
cd infra && docker compose down -v   # -v removes the named volume
docker compose up -d
cd ../apps/api && dotnet ef database update
```

---

## CI/CD

| Workflow | Trigger | Action |
|---|---|---|
| `ci.yml` | Every PR + push to main | Lint, type-check, .NET build + tests, production dependency audit |
| `deploy-api.yml` | Merge to main (apps/api changed) | Docker build → ghcr.io, then Railway redeploy |
| `deploy-admin.yml` | Merge to main (apps/admin changed) | EAS Hosting deploy |
| `eas-build.yml` | Manual or version tag | EAS Build iOS + Android |

`apps/web` is **not** deployed by a workflow — Vercel's GitHub integration builds
it directly, which is why Vercel checks appear on PRs without a corresponding
file in `.github/workflows/`.

GitHub Secrets:
- `EXPO_TOKEN` — configured.
- `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID` — **not yet configured.** Without them
  `deploy-api.yml` still builds and pushes the image to ghcr.io, then skips the
  Railway call and reports success. The image can be deployed by hand.
- `TURBO_TOKEN`, `TURBO_TEAM` — optional, enables Turborepo remote cache.

The dependency audit gate is `npm run audit:prod`, not bare `npm audit`. Accepted
high/critical advisories live in `.audit-allowlist.json`, each with a reason and a
`reviewBy` date; the build fails on anything unlisted, on an expired entry, and on
an entry that no longer matches.

---

## Phase Roadmap

All six feature phases have shipped. Each row names code you can go read.

| Phase | Feature | Status | Lives in |
|---|---|---|---|
| Foundation | Monorepo, packages, infra | ✅ Shipped | `packages/`, `infra/` |
| Phase 1 | Admin tournament management, registration, leaderboard, emails | ✅ Shipped | `apps/api/Features/Events`, `apps/admin` |
| Phase 2 | Mobile scoring app, offline SQLite, QR scorecard transfer | ✅ Shipped | `apps/mobile/src/lib/db.ts`, `backgroundSync.ts` |
| Phase 3 | SignalR real-time updates, push notifications, email ad builder | ✅ Shipped | `apps/api/Hubs/TournamentHub.cs`, `Features/Notifications` |
| Phase 4 | Stripe payments, silent/live auction | ✅ Shipped | `apps/api/Features/Auction`, `Features/Payments` |
| Phase 5 | League play, handicap engine, season standings, skins | ✅ Shipped | `apps/api/Features/League` (`HandicapEngine`, `PairingEngine`, `SkinsCalculator`) |
| Phase 6 | Per-event branding, GPS cup location | ✅ Shipped | `packages/theme`, PostGIS columns |

Work has continued past the numbered phases — per-player session tokens
(`Phase11` migration), per-golfer entry fees (`Phase14`), auction checkout,
blob storage, and scoreboard branding.

**Feature-complete is not pilot-ready.** The remaining path to a real event —
accounts and domain, a staging environment, a dress rehearsal, mobile
distribution via TestFlight/EAS, and day-of ops — is tracked in
`docs/problemList.txt`, which carries its own P0–P5 priority index. Read that
before planning work; it is the authoritative to-do list, not this table.
