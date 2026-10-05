import type { GameEvent } from '../actions/events.js';
import type { GameState, PlayerId } from '../state/types.js';
import { longestRoadLength } from './longest-road.js';

/**
 * Decide quién tiene una bonificación: el único que tiene el máximo (si llega al mínimo). El
 * titular conserva el premio mientras siga empatado en cabeza; si lo pierde y varios empatan
 * por delante, el premio queda vacante.
 */
export function resolveHolder(
  scores: ReadonlyMap<PlayerId, number>,
  minimum: number,
  holder: PlayerId | null,
): PlayerId | null {
  const max = Math.max(0, ...scores.values());
  if (max < minimum) return null;
  const leaders = [...scores].filter(([, value]) => value === max).map(([id]) => id);
  if (holder !== null && leaders.includes(holder)) return holder;
  return leaders.length === 1 ? (leaders[0] ?? null) : null;
}

export function longestRoadLengths(state: GameState): Map<PlayerId, number> {
  return new Map(state.players.map((p) => [p.id, longestRoadLength(state, p.id)]));
}

/** Recalcula camino más largo y mayor ejército; devuelve el estado y los eventos de cambio. */
export function updateAwards(state: GameState): { state: GameState; events: GameEvent[] } {
  const { rules } = state.config;
  const events: GameEvent[] = [];

  const armies = new Map(state.players.map((p) => [p.id, p.armiesPlayed]));
  const largestArmy = resolveHolder(armies, rules.minLargestArmy, state.awards.largestArmy);
  if (largestArmy !== state.awards.largestArmy) {
    events.push({
      type: 'AWARD_CHANGED',
      award: 'largestArmy',
      holder: largestArmy,
      previous: state.awards.largestArmy,
    });
  }

  const longestRoad = resolveHolder(
    longestRoadLengths(state),
    rules.minLongestRoad,
    state.awards.longestRoad,
  );
  if (longestRoad !== state.awards.longestRoad) {
    events.push({
      type: 'AWARD_CHANGED',
      award: 'longestRoad',
      holder: longestRoad,
      previous: state.awards.longestRoad,
    });
  }

  if (events.length === 0) return { state, events };
  return { state: { ...state, awards: { largestArmy, longestRoad } }, events };
}
