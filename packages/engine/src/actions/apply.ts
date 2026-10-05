import { err, ok } from '../result.js';
import type { GameState, PlayerId } from '../state/types.js';
import type { Action } from './types.js';
import type { ActionResult } from './outcome.js';
import { roll } from './roll.js';
import { setupBuildRoad, setupBuildSettlement } from './setup.js';

function dispatch(state: GameState, player: PlayerId, action: Action): ActionResult {
  switch (action.type) {
    case 'BUILD_SETTLEMENT':
      if (state.phase.type === 'setup') return setupBuildSettlement(state, player, action.vertex);
      return err('NOT_IMPLEMENTED');
    case 'BUILD_ROAD':
      if (state.phase.type === 'setup') return setupBuildRoad(state, player, action.edge);
      return err('NOT_IMPLEMENTED');
    case 'ROLL':
      return roll(state, player);
    default:
      return err('NOT_IMPLEMENTED');
  }
}

/**
 * Aplica una acción de un jugador. Nunca muta el estado recibido: devuelve el nuevo estado y
 * los eventos, o un código de error de dominio.
 */
export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  if (state.phase.type === 'ended') return err('GAME_OVER');
  if (!state.players.some((p) => p.id === playerId)) return err('UNKNOWN_PLAYER');

  const result = dispatch(state, playerId, action);
  if (!result.ok) return result;

  const next: GameState = {
    ...result.value.state,
    log: [...result.value.state.log, { player: playerId, action }],
  };
  return ok({ state: next, events: result.value.events });
}
