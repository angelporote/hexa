import type { GameEvent } from '../actions/events.js';
import type { GameState } from '../state/types.js';
import { totalPoints } from './points.js';

/**
 * La victoria solo se reclama en el turno propio: gana el jugador activo en cuanto sus puntos
 * totales alcanzan el objetivo. Quien lo alcanza en turno ajeno gana al empezar el suyo.
 */
export function checkVictory(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.phase.type === 'setup' || state.phase.type === 'ended' || state.winner !== null) {
    return { state, events: [] };
  }
  const player = state.turn.player;
  const points = totalPoints(state, player);
  if (points < state.config.rules.victoryPoints) return { state, events: [] };
  return {
    state: { ...state, winner: player, phase: { type: 'ended' } },
    events: [{ type: 'GAME_WON', player, points }],
  };
}
