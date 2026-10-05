import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer } from '../state/update.js';

const AWARD_POINTS = 2;

/** Puntos visibles para todos: edificios y bonificaciones. */
export function publicPoints(state: GameState, player: PlayerId): number {
  let points = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.owner === player) points += building.kind === 'city' ? 2 : 1;
  }
  if (state.awards.longestRoad === player) points += AWARD_POINTS;
  if (state.awards.largestArmy === player) points += AWARD_POINTS;
  return points;
}

/** Puntos totales: suma las cartas de punto, que solo conoce su dueño. */
export function totalPoints(state: GameState, player: PlayerId): number {
  const hidden = getPlayer(state, player).devCards.filter((c) => c.card === 'point').length;
  return publicPoints(state, player) + hidden;
}
