/**
 * @gfp/ui — Shared React Native Component Library
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the barrel export file.  It re-exports every component so consuming
 * apps can write a single import:
 *
 *   import { ScoreCard, LeaderboardRow, ThemeProvider, useTheme } from '@gfp/ui'
 *
 * WHY BARREL EXPORTS:
 *   Without a barrel, every import must reference the full internal path:
 *   import { ScoreCard } from '@gfp/ui/src/components/ScoreCard'
 *   That's brittle — internal restructuring breaks all consumer imports.
 *   The barrel provides a stable public API surface for the package.
 *
 * COMPONENT INVENTORY (spec §7.2):
 *   ScoreCard      — per-hole gross score entry with ± buttons (56pt touch targets)
 *   LeaderboardRow — team name, to-par, thru hole, sponsor badge
 *   TeamCard       — player roster, starting hole, tee time, check-in status
 *   SponsorBanner  — logo + tier badge for scoring screens and leaderboard
 *   ThemeProvider  — wraps app root, provides useTheme() context
 *   useTheme       — hook to access GFP color tokens in any component
 */

export { ScoreCard }      from './components/ScoreCard';
export { LeaderboardRow } from './components/LeaderboardRow';
export { TeamCard }       from './components/TeamCard';
export { SponsorBanner }  from './components/SponsorBanner';
export { ThemeProvider, useTheme } from './components/ThemeProvider';

/**
 * Re-export types so consumers don't need to import from @gfp/theme directly
 * when they only use components from this package.
 */
export type { ThemeContextValue } from '@gfp/theme';