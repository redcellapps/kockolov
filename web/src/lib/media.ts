import { useCallback, useSyncExternalStore } from 'react';

/**
 * True while the media query matches; updates when the window is resized. A page drawn on the server
 * (and the browser taking it over) starts with false, then shows the real answer right after.
 */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (changed: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', changed);
      return () => m.removeEventListener('change', changed);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
