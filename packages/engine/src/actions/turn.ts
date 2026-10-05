import { err, ok } from '../result.js';
import type { GameState, PlayerId } from '../state/types.js';
import type { ActionResult } from './outcome.js';

/** Termina el turno: pasa al siguiente jugador, que debe tirar los dados. */
export function endTurn(state: GameState, player: PlayerId): ActionResult {
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (state.phase.type !== 'main') return err('WRONG_PHASE');

  const seat = state.players.findIndex((p) => p.id === player);
  const following = state.players[(seat + 1) % state.players.length];
  if (!following) throw new Error('unreachable');
  const number = state.turn.number + 1;
  return ok({
    state: {
      ...state,
      phase: { type: 'roll' },
      turn: { player: following.id, number, lastRoll: null, devCardPlayed: false },
      // Una oferta abierta caduca al acabar el turno de quien la hizo.
      pendingTrade: null,
    },
    events: [
      ...(state.pendingTrade
        ? [{ type: 'TRADE_CANCELLED' as const, offerId: state.pendingTrade.id }]
        : []),
      { type: 'TURN_STARTED', player: following.id, number },
    ],
  });
}
