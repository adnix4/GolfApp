/**
 * useClasses — the shared style classes for the active org theme.
 *
 * Cached per palette, not per component: every screen under one theme shares
 * a single StyleSheet, and a theme switch (branded event → org default) builds
 * a new one.  Keyed on the 5 brand colours because ThemeProvider builds a new
 * context object each render, and everything in the context derives from them.
 */

import { StyleSheet } from 'react-native';
import type { ThemeContextValue } from '@gfp/theme';
import { useTheme } from '../components/ThemeProvider';
import { buildClasses, type Classes } from './classes';

const cache = new Map<string, Classes>();
// A session sees a handful of palettes (org default, a branded event, the
// admin theme-editor preview); the cap only stops an editor dragging a
// colour picker from growing the map forever.
const MAX_CACHED = 16;

export function classesFor(theme: ThemeContextValue): Classes {
  const { primary, action, accent, highlight, surface } = theme.colors;
  const key = `${primary}|${action}|${accent}|${highlight}|${surface}`;
  let classes = cache.get(key);
  if (!classes) {
    if (cache.size >= MAX_CACHED) cache.clear();
    classes = StyleSheet.create(buildClasses(theme));
    cache.set(key, classes);
  }
  return classes;
}

export function useClasses(): Classes {
  return classesFor(useTheme());
}
