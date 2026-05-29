/**
 * Event-form option constants.
 *
 * These are the human-facing PascalCase tokens used in API requests/responses
 * and in admin/mobile form UI. They are intentionally separate from the
 * lowercase `EventFormat` discriminated union in index.ts, which represents
 * the underlying DB enum.
 *
 * If you add a new format/start type, update both the DB enum and these
 * constants — the labels/hints feed the radio cards and confirmation copy.
 */

/** Format options shown in the admin "Create Event" radio grid. */
export const FORMAT_OPTIONS = ['Scramble', 'Stroke', 'Stableford', 'BestBall'] as const;
export type FormatOption = (typeof FORMAT_OPTIONS)[number];

/**
 * Display labels for every format the API may return.
 * Includes 'Match' for league play even though the event admin form doesn't
 * offer it, so screens that render arbitrary API data still get a clean label.
 */
export const FORMAT_LABELS: Record<string, string> = {
  Scramble:   'Scramble',
  Stroke:     'Stroke Play',
  Stableford: 'Stableford',
  BestBall:   'Best Ball',
  Match:      'Match Play',
};

/** One-line description shown under each radio card in the event form. */
export const FORMAT_HINTS: Record<string, string> = {
  Scramble:   'Team plays the best shot each stroke',
  Stroke:     'Total strokes counted per player',
  Stableford: 'Points awarded based on score vs par',
  BestBall:   'Best individual score counts per hole',
};

/** Start-type options shown in the admin "Create Event" radio grid. */
export const START_OPTIONS = ['Shotgun', 'TeeTimes'] as const;
export type StartOption = (typeof START_OPTIONS)[number];

export const START_LABELS: Record<string, string> = {
  Shotgun:  'Shotgun Start',
  TeeTimes: 'Tee Times',
};

export const START_HINTS: Record<string, string> = {
  Shotgun:  'All teams begin simultaneously from different holes',
  TeeTimes: 'Teams are assigned scheduled tee times',
};

/** Allowed hole counts for tournament play. */
export const HOLES_OPTIONS = [9, 18] as const;
export type HolesOption = (typeof HOLES_OPTIONS)[number];
