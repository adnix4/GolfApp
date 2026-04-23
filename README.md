# Golf Fundraiser Pro

**Golf Scramble Made Easy** — A complete tournament management platform for non-profit fundraising events.

Built in six phases. This is the monorepo housing all applications and shared packages.

---

## Architecture Overview

```
golf-fundraiser-pro/              ← Turborepo monorepo root
  apps/
    api/       → ASP.NET Core .NET 8  — REST API (port 5000)
    admin/     → Expo Router web      — Organizer dashboard (port 8081)
    mobile/    → Expo SDK 55          — iOS/Android scoring app
    web/       → Next.js 15           — Public leaderboard + landing page (port 3000)
  packages/
    ui/          → Shared React Native components (mobile + admin)
    shared-types/→ TypeScript DTOs + Zod schemas (API contracts)
    theme/       → 5-token color system + WCAG validation
  infra/
    docker-compose.yml  → PostgreSQL/PostGIS, Redis, pgAdmin
    nginx.conf          → Local reverse proxy (port 8080)
    init-scripts/       → DB initialization SQL
  .github/
    workflows/          → CI, deploy-api, deploy-web, deploy-admin, eas-build
```

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend API | ASP.NET Core Web API (.NET 8) | C# 12, EF Core, Minimal API style |
| Database | PostgreSQL 16 + PostGIS 3.4 | PostGIS required for GPS features |
| Cache | Redis 7 | Leaderboard cache + SignalR backplane |
| Admin Dashboard | Expo Router web | Shares UI components with mobile |
| Public Web | Next.js 15 App Router | SSR, Vercel, JSON-LD structured data |
| Mobile App | React Native + Expo SDK 55 | New Architecture, EAS Build |
| Real-Time | ASP.NET SignalR | Phase 3 |
| Payments | Stripe | Phase 4 |
| Email | SendGrid | 100/day free tier |
| Auth | ASP.NET Identity + JWT | 15-min access tokens |

---

## Prerequisites

- **Node.js 20+** and **npm 10+**
- **.NET 8 SDK** — [download](https://dotnet.microsoft.com/download/dotnet/8)
- **Docker Desktop** — for PostgreSQL, Redis, pgAdmin
- **Expo CLI** — `npm install -g eas-cli` (for mobile builds)

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

### 4. Run database migrations

```bash
cd apps/api

# Apply all EF Core migrations (creates the full Phase 1 schema)
dotnet ef database update

# Verify PostGIS is enabled in pgAdmin or psql:
#   SELECT PostGIS_Version();
```

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
npm run build       # Build all workspaces (packages before apps)
npm run dev         # Start all JS dev servers in parallel
npm run lint        # ESLint across all TypeScript workspaces
npm run type-check  # tsc --noEmit across all TypeScript workspaces
npm run test        # Run tests in all workspaces
npm run clean       # Delete all build artifacts + node_modules
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
| `ci.yml` | Every PR + push to main | Lint, type-check, .NET build |
| `deploy-api.yml` | Merge to main (apps/api changed) | Docker build → Railway |
| `deploy-web.yml` | Merge to main (apps/web changed) | Vercel production deploy |
| `deploy-admin.yml` | Merge to main (apps/admin changed) | EAS Hosting deploy |
| `eas-build.yml` | Manual or version tag | EAS Build iOS + Android |

Required GitHub Secrets:
- `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEB`
- `EXPO_TOKEN`
- `TURBO_TOKEN`, `TURBO_TEAM` (optional — enables remote cache)

---

## Phase Roadmap

| Phase | Feature | Status |
|---|---|---|
| Foundation | Monorepo, packages, infra | ✅ Complete |
| Phase 1 | Admin tournament management, registration, leaderboard, emails | 🚧 In Progress |
| Phase 2 | Mobile scoring app, offline SQLite, QR scorecard transfer | ⏳ Planned |
| Phase 3 | SignalR real-time updates, push notifications, email ad builder | ⏳ Planned |
| Phase 4 | Stripe payments, silent/live auction | ⏳ Planned |
| Phase 5 | League play, handicap engine, season standings | ⏳ Planned |
| Phase 6 | GPS scoring, Mapbox course maps, closest-to-pin measurement | ⏳ Planned |