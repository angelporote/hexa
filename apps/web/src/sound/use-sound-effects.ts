import { useEffect, useRef } from 'react';
import type { GameEvent } from '@hexa/engine';
import type { LoggedEvent } from '../net/connection.js';
import type { SoundPlayer } from './player.js';
import type { SoundId } from './recipes.js';
import { getSoundPlayer } from './store.js';

/**
 * Qué sonidos corresponden a quien mira:
 * - `public`: lo que le pasa a la mesa (dados, construcciones, ladrón, victoria). Pantalla
 *   principal y espectadores.
 * - `personal`: lo que te pasa a ti (tu turno, recibir recursos, una oferta, tu victoria). Mando.
 * - `all`: las dos cosas, para quien juega a distancia y no tiene pantalla común al lado.
 */
export type SoundScope = 'public' | 'personal' | 'all';

/** Si varios sonidos coinciden, suenan por este orden de importancia. */
const PRIORITY: readonly SoundId[] = ['win', 'turn', 'offer', 'dice', 'robber', 'build', 'gain'];
/** Más de tres sonidos seguidos serían ruido. */
const MAX_PER_BATCH = 3;
/** Separación entre sonidos de un mismo lote, en segundos. */
export const SOUND_GAP = 0.25;

/** Sonidos de un lote de eventos, sin repetidos y por orden de importancia. */
export function soundsFor(
  events: readonly GameEvent[],
  me: string | null,
  scope: SoundScope,
): SoundId[] {
  const publicScope = scope !== 'personal';
  const personalScope = scope !== 'public';
  const found = new Set<SoundId>();

  for (const e of events) {
    switch (e.type) {
      case 'DICE_ROLLED':
        if (publicScope) found.add('dice');
        break;
      case 'SETTLEMENT_BUILT':
      case 'CITY_BUILT':
      case 'ROAD_BUILT':
        if (publicScope) found.add('build');
        break;
      case 'ROBBER_MOVED':
        if (publicScope) found.add('robber');
        break;
      case 'GAME_WON':
        if (publicScope || (personalScope && e.player === me)) found.add('win');
        break;
      case 'TURN_STARTED':
        if (personalScope && me !== null && e.player === me) found.add('turn');
        break;
      case 'RESOURCES_GAINED':
        if (personalScope && me !== null && e.player === me) found.add('gain');
        break;
      case 'TRADE_OFFERED':
        if (
          personalScope &&
          me !== null &&
          e.offer.from !== me &&
          (e.offer.to === null || e.offer.to.includes(me))
        ) {
          found.add('offer');
        }
        break;
      case 'TRADE_COMPLETED':
        if (personalScope && me !== null && (e.from === me || e.with === me)) found.add('gain');
        break;
      default:
        break;
    }
  }
  return PRIORITY.filter((id) => found.has(id)).slice(0, MAX_PER_BATCH);
}

/**
 * Reproduce los sonidos de los eventos nuevos. Ignora el historial que ya hubiera al montarse
 * (p. ej., al recargar la página): solo suena lo que ocurre a partir de entonces. También prepara
 * el audio en el primer toque, que es cuando el navegador lo permite.
 */
export function useSoundEffects(
  events: readonly LoggedEvent[],
  me: string | null,
  scope: SoundScope,
  player: SoundPlayer = getSoundPlayer(),
): void {
  const lastSeen = useRef<number | null>(null);

  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [player]);

  useEffect(() => {
    const newest = events.at(-1)?.id ?? 0;
    const before = lastSeen.current;
    lastSeen.current = newest;
    if (before === null) return;
    const fresh = events.filter((e) => e.id > before).map((e) => e.event);
    soundsFor(fresh, me, scope).forEach((id, i) => player.play(id, i * SOUND_GAP));
  }, [events, me, scope, player]);
}
