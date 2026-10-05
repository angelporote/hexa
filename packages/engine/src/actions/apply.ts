import { err, ok } from '../result.js';
import type { GameState, PlayerId } from '../state/types.js';
import { buildCity, buildRoad, buildSettlement } from './build.js';
import type { ActionResult } from './outcome.js';
import { buyDevCard, playArmy, playMonopoly, playPlenty, playRoads } from './dev-cards.js';
import { discard, moveRobber } from './robber.js';
import { roll } from './roll.js';
import { endTurn } from './turn.js';
import { setupBuildRoad, setupBuildSettlement } from './setup.js';
import type { Action } from './types.js';

function dispatch(state: GameState, player: PlayerId, action: Action): ActionResult {
  switch (action.type) {
    case 'ROLL':
      return roll(state, player);
    case 'BUILD_SETTLEMENT':
      return state.phase.type === 'setup'
        ? setupBuildSettlement(state, player, action.vertex)
        : buildSettlement(state, player, action.vertex);
    case 'BUILD_ROAD':
      return state.phase.type === 'setup'
        ? setupBuildRoad(state, player, action.edge)
        : buildRoad(state, player, action.edge);
    case 'BUILD_CITY':
      return buildCity(state, player, action.vertex);
    case 'DISCARD':
      return discard(state, player, action.resources);
    case 'MOVE_ROBBER':
      return moveRobber(state, player, action.hex, action.victim);
    case 'BUY_DEV_CARD':
      return buyDevCard(state, player);
    case 'PLAY_ARMY':
      return playArmy(state, player);
    case 'PLAY_ROADS':
      return playRoads(state, player);
    case 'PLAY_PLENTY':
      return playPlenty(state, player, action.resources);
    case 'PLAY_MONOPOLY':
      return playMonopoly(state, player, action.resource);
    case 'END_TURN':
      return endTurn(state, player);
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
