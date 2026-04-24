/**
 * ThemeProvider & useTheme
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS:
 *   React Native components can't read CSS custom properties (those are web-only).
 *   Instead they get colors from React context.  ThemeProvider wraps the app root,
 *   receives a GFPTheme, converts it to a ThemeContextValue via buildThemeContext(),
 *   and makes it available via the useTheme() hook.
 *
 *   Flow:
 *   1. API returns org.theme (or null → use ECO_GREEN_DEFAULT)
 *   2. App root passes theme to <ThemeProvider theme={theme}>
 *   3. Any component calls const { primaryColor } = useTheme()
 *   4. Component uses primaryColor directly in StyleSheet.create()
 *
 * RULE (spec §7.2):
 *   No Platform.OS checks allowed in this file.  Must work identically on
 *   React Native (iOS/Android) and React Native Web (Expo Router web admin).
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import {
  ECO_GREEN_DEFAULT,
  buildThemeContext,
  type GFPTheme,
  type ThemeContextValue,
} from '@gfp/theme';

// ── CONTEXT SETUP ─────────────────────────────────────────────────────────────

/**
 * GFPThemeContext holds the current theme context value.
 * Initialized to ECO_GREEN_DEFAULT so any component rendered outside a
 * ThemeProvider (e.g. in tests) still gets valid colors.
 */
const GFPThemeContext = createContext<ThemeContextValue>(
  buildThemeContext(ECO_GREEN_DEFAULT)
);

// ── PROVIDER ──────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  /**
   * theme — the org's GFPTheme fetched from the API.
   * Pass null (or omit) to use the Eco Green defaults.
   * The provider converts this to a ThemeContextValue via buildThemeContext().
   */
  theme?: GFPTheme | null;
  children: ReactNode;
}

/**
 * ThemeProvider — wrap the app root with this component.
 *
 * USAGE IN apps/mobile (apps/mobile/src/app/_layout.tsx):
 *   const { theme } = useOrgTheme();  // fetches org.theme from API
 *   return (
 *     <ThemeProvider theme={theme}>
 *       <Stack />
 *     </ThemeProvider>
 *   );
 *
 * USAGE IN apps/admin (apps/admin/src/app/layout.tsx):
 *   Same pattern — the Expo Router web admin shares this exact component.
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  /**
   * Convert the raw GFPTheme to a ThemeContextValue.
   * If theme is null/undefined, fall back to ECO_GREEN_DEFAULT.
   * buildThemeContext() adds semantic aliases (buttonBackground, ctaBackground, etc.)
   * so components don't need to know which token drives which surface.
   */
  const contextValue = buildThemeContext(theme ?? ECO_GREEN_DEFAULT);

  return (
    <GFPThemeContext.Provider value={contextValue}>
      {children}
    </GFPThemeContext.Provider>
  );
}

// ── HOOK ──────────────────────────────────────────────────────────────────────

/**
 * useTheme — access the current GFP color theme in any component.
 *
 * USAGE:
 *   function MyButton() {
 *     const { buttonBackground, buttonLabel } = useTheme();
 *     return (
 *       <Pressable style={{ backgroundColor: buttonBackground }}>
 *         <Text style={{ color: buttonLabel }}>Press me</Text>
 *       </Pressable>
 *     );
 *   }
 *
 * WHY NOT useColorScheme():
 *   React Native's useColorScheme() only knows about "light" and "dark" system
 *   modes.  GFP needs per-org brand colors that are entirely independent of
 *   the system appearance.  useTheme() provides org-specific tokens; apps
 *   can optionally adjust for dark mode on top of the brand colors.
 *
 * @throws if called outside a ThemeProvider — but the context default
 *   (ECO_GREEN_DEFAULT) prevents this from crashing in practice.
 */
export function useTheme(): ThemeContextValue {
  return useContext(GFPThemeContext);
}
