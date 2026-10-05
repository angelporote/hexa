import type { ResourceId } from '../board/types.js';
import { err, ok } from '../result.js';
import { tradeRatios } from '../rules/ports.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer, mapPlayer } from '../state/update.js';
import type { ActionResult } from './outcome.js';

/** Cambia `ratio` cartas de `give` por 1 de `want`, con el ratio que den sus puertos. */
export function bankTrade(
  state: GameState,
  player: PlayerId,
  give: ResourceId,
  want: ResourceId,
): ActionResult {
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (state.phase.type !== 'main') return err('WRONG_PHASE');
  if (give === want) return err('INVALID_TRADE');

  const ratio = tradeRatios(state, player)[give];
  if (getPlayer(state, player).hand[give] < ratio) return err('NOT_ENOUGH_RESOURCES');
  if (state.bank[want] < 1) return err('BANK_LACKS_RESOURCES');

  let next = mapPlayer(state, player, (p) => ({
    ...p,
    hand: { ...p.hand, [give]: p.hand[give] - ratio, [want]: p.hand[want] + 1 },
  }));
  next = {
    ...next,
    bank: { ...next.bank, [give]: next.bank[give] + ratio, [want]: next.bank[want] - 1 },
  };
  return ok({
    state: next,
    events: [{ type: 'BANK_TRADED', player, give, giveCount: ratio, want }],
  });
}
