---
name: popup-format
description: The popup standard for Golf Fundraiser Pro's admin and mobile apps — how every popup, dialog, confirm, alert, warning, and error message is built and worded. Use when adding, changing, or reviewing any popup or dialog, when a screen shows a warning or failure to the user, or when asked to format, audit, or clean up popups.
user-invocable: true
---

# Popup format — Golf Fundraiser Pro

Every popup in admin and mobile renders as **one frame**, `DialogFrame`
(`packages/ui/src/components/DialogFrame.tsx`), through each app's dialog host.
It is the format first built for the scorer's auction popups:

```
┌────────────────────────────────────┐
│ Spring Charity Scramble            │  header band: event (or org) name,
├────────────────────────────────────┤  primary fill, buttonLabel text
│ ⚠ Title                            │  title in primary; ⚠ warning, ✕ error
│ [★ Sponsor]  [Item]                │  chips not named in the message
│ Message with [Item] set inline…    │
│ NOT_FOUND · HTTP 404        (dev)  │  grey code line — dev builds only
│ ☐ Don't show me this warning again │  only where allowed (rules below)
│                  [Cancel] [Confirm]│  Cancel outlined; confirm primary;
└────────────────────────────────────┘  destructive red
```

## 1. Always go through the host

| App | Confirm | Info / warning | Failure |
|---|---|---|---|
| mobile | `notify(title, msg, buttons, opts)` — `@/lib/notify` | `notify(...)` | `notifyFailure(title, error)` |
| admin | `confirmAction(title, msg, onConfirm, confirmText, opts)` — `@/lib/confirmAction` | `alertAction(title, msg, opts)` or `notify` (`@/lib/dialog`) | `alertFailure(title, error)` — `@/lib/dialog` |

- **Never** call `Alert.alert`, `window.confirm`, `window.alert`, or hand-roll a
  `<Modal>` card for a dialog. The system dialogs can't be styled (and
  react-native-web's `Alert` is a no-op).
- A popup that needs extra content (a logo, a prize box, stat rows) renders
  `<DialogFrame …>{children}</DialogFrame>` directly — see `SponsorModal`,
  `ChallengeDetailModal`, `HoleInfoModal` in
  `apps/mobile/src/components/scorecardComponents.tsx`.
- Hosts: mobile `apps/mobile/src/components/DialogHost.tsx` (root layout,
  event theme). Admin `DialogHost` in `apps/admin/src/lib/dialog.tsx`, mounted
  in `app/_layout.tsx` (org theme) and `events/[id]/_layout.tsx` (event theme +
  event id); the innermost wins.
- Buttons behave like `Alert`'s: a `'cancel'` button runs when the popup is
  dismissed (back button, Escape, backdrop). `'secondary'` is outlined but is
  **not** a cancel (e.g. "Visit website →"). `destructive: true` (admin
  `confirmAction` option) or `style: 'destructive'` turns the confirm red —
  use it for removals and anything irreversible.
- `kind`: `'warning'` for anything the user should pause on, `'error'` for
  failures (set automatically by the failure helpers), else leave it.

## 2. Highlight items and sponsors

Pass `highlights: [{ text, kind }]`. The frame sets each on a bold chip —
inline where the message names it (quotes are dropped), otherwise on its own
line under the title.

- **Auction items** — `kind: 'item'` → action-colored chip. (Mobile shorthand:
  `highlight: item.title`.)
- **Sponsors** — `kind: 'sponsor'` → highlight-colored chip with ★.
  **Any sponsor named in a popup must be highlighted** — including "Presented
  by …" lines and removal confirms.

Chip and label colors come from the theme's derived on-colors, so they stay
readable with any event palette — never pass literal colors.

## 3. "Don't show me this warning again"

Offer it with `dontShowAgain: { id: '<stable-id>' }` **only when all hold**:

1. It's a **warning** raised by a **tournament setting or rule** (e.g. the
   card-on-file rule behind "Check in anyway — no card on file").
2. It **recurs** — the same organizer/golfer will see it again and again.
3. It is **not destructive or irreversible** (cancel event, end auction,
   remove sponsor: always ask).
4. It does **not verify a payment amount.** Bids, pledges, "Record entry
   fee?", "Take $X from …" — mark these `payment: true`. `resolveDontShowAgain`
   (`@gfp/shared-types`) **throws in dev** if a payment popup asks for the
   checkbox, and drops it in production.

Behaviour: remembered **per event** (`dismissKey(eventId, id)`); a dismissed
warning runs its confirm action without showing. Only a confirmed choice is
remembered — ticking the box then pressing Cancel doesn't count. Admin's
Event Settings has **"Show dismissed warnings again"**. Admin offers the box
only under the event host (it needs an event id).

Current ids: `cardless-checkin` (admin check-in, via `checkInConfirmCopy().dialog`).

## 4. Failure popups

Use `notifyFailure` / `alertFailure`; they word the message with
`describeFailure` (`packages/shared-types/src/popup.ts`):

- **Production:** plain English that says what went wrong and what to do.
  No HTTP status numbers, error codes, stack traces, or "Request failed (400)".
  Validation errors keep the server's own sentence (the API writes those for
  people); everything else maps by status — network, 401, 403, 404, 409, 5xx.
- **Development** (`__DEV__`): the same message **plus** a grey code line,
  `CODE · HTTP 400`. Never hand-write codes into the message.
- Keep the thrown error's `status` and `code`: API clients should throw
  `ApiError` (`parseApiError` in shared-types; mobile `apiFailure()` in
  `src/lib/api.ts`), not `new Error(text)`.
- Titles say what failed in plain words: "Couldn't save your card", not
  "Error" or "Update Failed".
- Inline form errors (not popups) use `friendlyApiError` (admin) — same rules,
  no code line.

## Review checklist

- [ ] Goes through `notify` / `confirmAction` / `alertAction` / failure helper, or `DialogFrame`.
- [ ] Every item named → `kind: 'item'`; every sponsor named → `kind: 'sponsor'`.
- [ ] Payment amount being confirmed → `payment: true`, and no `dontShowAgain`.
- [ ] `dontShowAgain` only on a recurring, setting-driven, non-destructive warning, with a stable id.
- [ ] Irreversible confirm → `destructive: true` (red) and usually `kind: 'warning'`.
- [ ] Failure → `notifyFailure`/`alertFailure`; message readable by a golfer with no code or status in it.
- [ ] No literal colors on fills; labels come from the theme.

## Audit recipe

Find popups that bypass the standard:

```bash
cd C:/GolfApp
# System dialogs outside the hosts' own fallbacks
grep -rn "Alert\.alert(\|window\.confirm(\|window\.alert(" apps/admin/src apps/mobile/app apps/mobile/src \
  --include=*.ts --include=*.tsx | grep -v "lib/notify.ts\|lib/dialog.tsx\|__tests__"
# Hand-rolled dialog cards (inspect each; full-screen viewers/sheets are fine)
grep -rln "<Modal" apps/admin/src apps/mobile/app apps/mobile/src --include=*.tsx
# Sponsors named in popup copy without a sponsor highlight
grep -rn "sponsor" apps/admin/src apps/mobile/app apps/mobile/src --include=*.tsx -i | grep -i "confirmAction\|notify(\|Presented by"
```

Classify each hit against §1–§4, convert it, then run `npm run type-check`,
`npm run lint`, and `npm test`. Verify in the browser with the **verify** skill
(headless Edge recipe in memory): count native dialogs (`page.on('dialog')`
must stay at 0) and check the chip colors.

**Exempt:** the hole-in-one celebrations (bespoke animation, not warnings),
full-screen photo viewers, and bottom-sheet forms such as the auction bid sheet
(which carries the same event-name band and item chip).
