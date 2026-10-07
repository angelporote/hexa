import { useSyncExternalStore } from 'react';

/** Se cumple la consulta CSS (p. ej. `(min-width: 960px)`); si no hay `matchMedia`, nunca. */
export function useMediaQuery(query: string): boolean {
  const subscribe = (notify: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => undefined;
    }
    const list = window.matchMedia(query);
    list.addEventListener('change', notify);
    return () => list.removeEventListener('change', notify);
  };
  const getSnapshot = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Pantalla ancha: el mando se reorganiza con el tablero a un lado (vista combinada de escritorio). */
export const WIDE_QUERY = '(min-width: 960px)';
