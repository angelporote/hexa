import { useEffect, useRef, useState } from 'react';
import { RESOURCE_IDS } from '@hexa/engine';
import type { ResourceCounts, ResourceId } from '@hexa/engine';

export interface Gain {
  readonly amount: number;
  /** Cambia con cada ganancia nueva, para poder reanimar el aviso. */
  readonly key: number;
}
export type Gains = Partial<Record<ResourceId, Gain>>;

/**
 * Cuánto ha subido cada recurso de la mano desde la última vista, durante un momento (`ttlMs`).
 * La primera lectura solo fija el punto de partida: abrir la página no «gana» nada.
 */
export function useGains(hand: ResourceCounts, ttlMs = 1800): Gains {
  const previous = useRef<ResourceCounts | null>(null);
  const counter = useRef(0);
  const [gains, setGains] = useState<Gains>({});

  useEffect(() => {
    const before = previous.current;
    previous.current = hand;
    if (!before) return;
    const next: Gains = {};
    for (const r of RESOURCE_IDS) {
      const amount = hand[r] - before[r];
      if (amount > 0) next[r] = { amount, key: ++counter.current };
    }
    if (Object.keys(next).length > 0) setGains((current) => ({ ...current, ...next }));
  }, [hand]);

  useEffect(() => {
    if (Object.keys(gains).length === 0) return;
    const timer = setTimeout(() => setGains({}), ttlMs);
    return () => clearTimeout(timer);
  }, [gains, ttlMs]);

  return gains;
}
