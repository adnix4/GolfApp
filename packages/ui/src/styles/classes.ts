/**
 * Shared style classes
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS:
 *   Admin and mobile screens each declared their own StyleSheet, so the same
 *   style was retyped file by file: `errorText` 21 times identically, `center`
 *   23, `page` 26, the form-modal input / label / cancel / submit set in every
 *   form.  A class here is defined once and applied by name:
 *
 *     const c = useClasses();
 *     <Text style={c.errorText}>{error}</Text>
 *     <View style={[c.card, styles.local]} />   // local layout merges last
 *
 * WHAT BELONGS HERE (and what doesn't):
 *   Only styles with a real consensus across screens (see the census in
 *   docs/problemList.txt E5).  `card`, `header`, `row`, `modal` and
 *   `sectionTitle` had 8–20 variants each: they are layout, and stay local.
 *
 * THEME COLOURS ARE PART OF THE CLASS:
 *   Screens used to layer the brand colour on at every call site
 *   (`[formStyles.input, { borderColor: theme.colors.accent }]`).  The class
 *   carries it, built from the active ThemeContextValue, so `c.input` is
 *   already org-branded and a caller only adds what is genuinely local.
 *
 * Pure function, no react-native runtime import, so it is unit-testable in
 * node; useClasses() wraps it in StyleSheet.create.
 */

import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import { fontSize, neutral, radius, spacing, status, type ThemeContextValue } from '@gfp/theme';

type Style = ViewStyle | TextStyle | ImageStyle;

export function buildClasses(t: ThemeContextValue) {
  return {
    // ── Layout ─────────────────────────────────────────────────────────────
    page:   { flex: 1 },
    /** page that paints the org surface itself (mobile screens) */
    screen: { flex: 1, backgroundColor: t.pageBackground },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // ── Text ───────────────────────────────────────────────────────────────
    title:     { fontSize: fontSize.title, fontWeight: '800', color: t.colors.primary },
    muted:     { color: t.mutedText },
    emptyText: { fontSize: fontSize.lg, color: t.mutedText },

    // ── Errors ─────────────────────────────────────────────────────────────
    errorBox: {
      backgroundColor: status.dangerBg, borderRadius: radius.md, padding: spacing[3],
      marginBottom: spacing[3], borderLeftWidth: 3, borderLeftColor: status.danger,
    },
    errorText: { color: status.dangerText, fontSize: fontSize.md },

    // ── Form modal ─────────────────────────────────────────────────────────
    overlay: { flex: 1, backgroundColor: neutral.scrim, justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: fontSize.xxl, fontWeight: '800', marginBottom: spacing[4], color: t.colors.primary },
    fieldLabel: {
      fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing[2], marginTop: spacing[3],
      color: t.colors.primary,
    },
    /** helper line under a field label */
    fieldHint: { fontSize: fontSize.xs, marginTop: -4, marginBottom: spacing[2], lineHeight: 17, color: t.mutedText },
    /** admin (desktop) text input */
    input: {
      borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[3],
      fontSize: fontSize.lg, backgroundColor: neutral.inputBg, borderColor: t.colors.accent,
    },
    /** layer on an input whose value failed validation: `[c.input, bad && c.inputError]` */
    inputError: { borderColor: status.danger },
    /** mobile text input: bigger type and padding for touch */
    inputLg: {
      borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing[4], paddingVertical: spacing[3],
      fontSize: fontSize.xl, backgroundColor: neutral.inputBg, borderColor: t.colors.accent,
      color: t.colors.primary,
    },
    formActions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
    cancelBtn: {
      flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center',
      borderColor: t.colors.accent,
    },
    cancelText: { fontSize: fontSize.lg, fontWeight: '600', color: t.mutedText },
    submitBtn: {
      flex: 2, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center',
      backgroundColor: t.buttonBackground,
    },
    submitText: { fontSize: fontSize.lg, fontWeight: '700', color: t.buttonLabel },
  } as const satisfies Record<string, Style>;
}

export type Classes = ReturnType<typeof buildClasses>;
