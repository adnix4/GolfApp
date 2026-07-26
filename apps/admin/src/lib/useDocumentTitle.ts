import { useEffect } from 'react';

/**
 * Sets the browser tab title (web only). No-op on native, or when `title` is
 * empty/undefined so callers can defer to a more specific layout without
 * clobbering a title another layer already set.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    if (typeof document !== 'undefined') {
      document.title = title;
    }
  }, [title]);
}
