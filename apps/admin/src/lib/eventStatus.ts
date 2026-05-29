/**
 * Event-status palette + label + transition rules (admin surface).
 *
 * The event status state machine is:
 *   Draft → Registration → Active → Scoring → Completed
 *                                              ↑
 *                                              └── (or Cancelled at any step)
 *
 * NEXT_TRANSITIONS exposes the single button the organizer should see at each
 * step. Statuses absent from the table (Draft, Completed, Cancelled) have no
 * forward button — Draft is advanced by a separate "Open Registration" flow,
 * the other two are terminal.
 *
 * The super-admin dashboard and the public web event page use different
 * palettes on purpose (different audiences see different labels/colors) so
 * they intentionally do not import from this file.
 */

export const EVENT_STATUS_COLOR: Record<string, string> = {
  Draft:        '#95a5a6',
  Registration: '#3498db',
  Active:       '#2ecc71',
  Scoring:      '#f39c12',
  Completed:    '#27ae60',
  Cancelled:    '#e74c3c',
};

export const EVENT_STATUS_LABEL: Record<string, string> = {
  Draft:        'Draft',
  Registration: 'Registration Open',
  Active:       'Active',
  Scoring:      'Scoring',
  Completed:    'Completed',
  Cancelled:    'Cancelled',
};

export interface EventStatusTransition {
  status: string;
  label:  string;
  danger?: boolean;
}

export const NEXT_TRANSITIONS: Record<string, EventStatusTransition[]> = {
  Registration: [{ status: 'Active',    label: 'Go Active (Day of Event)' }],
  Active:       [{ status: 'Scoring',   label: 'Open Scoring' }],
  Scoring:      [{ status: 'Completed', label: 'Mark Complete' }],
};

/** Fallback color for an unknown status, matching previous inline defaults. */
export const EVENT_STATUS_COLOR_FALLBACK = '#aaa';

/** Returns the palette color for an event status, falling back gracefully. */
export function eventStatusColor(status: string): string {
  return EVENT_STATUS_COLOR[status] ?? EVENT_STATUS_COLOR_FALLBACK;
}

/** Returns the display label for an event status, defaulting to the raw value. */
export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABEL[status] ?? status;
}
