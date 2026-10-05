import { err, ok } from '../result.js';
import { updateAwards } from '../scoring/awards.js';
import { checkVictory } from '../scoring/victory.js';
import type { GameState, PlayerId } from '../state/types.js';
import { bankTrade } from './bank-trade.js';
import { buildCity, buildRoad, buildSettlement } from './build.js';
import type { ActionResult } from './outcome.js';
import { buyDevCard, playArmy, playMonopoly, playPlenty, playRoads } from './dev-cards.js';
import { discard, moveRobber } from './robber.js';
import { roll } from './roll.js';
import { acceptTrade, cancelTrade, confirmTrade, offerTrade, rejectTrade } from './player-trade.js';
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
    case 'BANK_TRADE':
      return bankTrade(state, player, action.give, action.want);
    case 'OFFER_TRADE':
      return offerTrade(state, player, action.to, action.give, action.want);
    case 'ACCEPT_TRADE':
      return acceptTrade(state, player, action.offerId);
    case 'REJECT_TRADE':
      return rejectTrade(state, player, action.offerId);
    case 'CANCEL_TRADE':
      return cancelTrade(state, player, action.offerId);
    case 'CONFIRM_TRADE':
      return confirmTrade(state, player, action.offerId, action.with);
    default:
      return err('NOT_IMPLEMENTED');
  }
}

/** Comprueba la legalidad sin calcular bonificaciones ni victoria: barato para enumerar. */
export function canApply(state: GameState, playerId: PlayerId, action: Action): boolean {
  if (state.phase.type === 'ended') return false;
  if (!state.players.some((p) => p.id === playerId)) return false;
  return dispatch(state, playerId, action).ok;
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

  const logged: GameState = {
    ...result.value.state,
    log: [...result.value.state.log, { player: playerId, action }],
  };
  const awards = updateAwards(logged);
  const victory = checkVictory(awards.state);
  return ok({
    state: victory.state,
    events: [...result.value.events, ...awards.events, ...victory.events],
  });
}
