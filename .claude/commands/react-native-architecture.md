# React Native Architecture — Golf Fundraiser Pro

You are working in `apps/mobile`, an **Expo SDK 55 / React Native** app using **Expo Router** (file-based routing). Read the relevant spec in `docs/GolfFundPro/GFP_Phase2_ScoringApp.docx.txt` before making non-trivial changes.

## Routing

Expo Router with grouped routes under `app/`:

| Group | Screens | Purpose |
|-------|---------|---------|
| `(auth)/` | `join`, `register`, `preflight` | Player join flow and event preflight check |
| `(scoring)/` | `scorecard`, `leaderboard`, `league`, `auction`, `team`, `help` | Active round screens |
| `(round-end)/` | `sync`, `qr-transfer` | End-of-round score submission |

Root layout (`app/_layout.tsx`) wraps everything in `SessionThemeProvider` for per-event branding.

## State & services (`src/lib/`)

| File | Role |
|------|------|
| `authStore.ts` | Zustand store — player identity, JWT, event/team context |
| `store.ts` | Zustand store — round state, scorecard, hole scores |
| `session.tsx` | React context — active session object, exposes `useSession()` |
| `api.ts` | Typed fetch wrapper; adds JWT header; throws on non-2xx |
| `db.ts` | `expo-sqlite` layer — `pending_scores` table + helpers |
| `backgroundSync.ts` | Offline sync engine — drains `pending_scores` to the API |
| `pushNotifications.ts` | `expo-notifications` registration + foreground handler |
| `holeUtils.ts` | Pure scoring helpers (par, stroke index, net score) |
| `useNetworkTier.ts` | Hook — returns `"online" | "offline"` based on NetInfo |

## Offline-first pattern

Scores are **always written to SQLite first** (`db.ts → pending_scores`), then `backgroundSync.ts` drains them to the API when online. Never write scores directly to the API from the scorecard screen.

## Auth

Players authenticate via event code + name (no password). JWT is stored in `expo-secure-store` and loaded into `authStore` on startup.

## Theming

Per-event branding is delivered by the API at join time and stored in session. `SessionThemeProvider` in `app/_layout.tsx` injects it via React context. Use `useTheme()` (from `@golfapp/theme`) for colours/fonts — never hardcode brand values.

## Testing

- Runner: **vitest 2.1.9** with config in `vitest.config.mts`
- Mocks: `src/__mocks__/` — expo-sqlite, expo-secure-store, expo-modules-core, react-native
- Pattern: reset `backgroundSync` module state in `beforeEach`; prefer integration-style tests over heavy mocking
- Run: `pnpm --filter mobile test`

## Key conventions

- All screens are TypeScript (`.tsx`). No `any` — use the shared types from `packages/shared-types`.
- Use `useNetworkTier()` to gate online actions; never assume connectivity.
- Expo Router navigation: `router.push()` / `router.replace()` — no React Navigation primitives.
- API base URL comes from `expo-constants` (`Constants.expoConfig.extra.apiUrl`), not hardcoded.
