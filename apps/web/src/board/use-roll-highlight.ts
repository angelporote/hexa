import { useEffect, useRef, useState } from 'react';

/**
 * Ficha de la tirada que debe resaltarse en el tablero durante unos segundos, para ver de un
 * vistazo qué hexágonos producen. El 7 no produce (mueve el ladrón), así que no resalta nada. Una
 * tirada que ya existía al montarse no se resalta: solo las que ocurren después.
 */
export function useRollHighlight(
  roll: { readonly dice: readonly [number, number]; readonly key: number } | null,
  ttlMs = 3500,
): number | null {
  const [active, setActive] = useState<number | null>(null);
  const seen = useRef<number | null>(roll?.key ?? null);

  useEffect(() => {
    if (!roll || roll.key === seen.current) return;
    seen.current = roll.key;
    const total = roll.dice[0] + roll.dice[1];
    if (total === 7) {
      setActive(null);
      return;
    }
    setActive(total);
    const timer = setTimeout(() => setActive(null), ttlMs);
    return () => clearTimeout(timer);
  }, [roll, ttlMs]);

  return active;
}
