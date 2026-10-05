import { err, ok } from '../result.js';
import { rollDice } from '../rules/dice.js';
import { computeProduction } from '../rules/production.js';
import type { GameState, PlayerId } from '../state/types.js';
import { giveFromBank } from '../state/update.js';
import { RESOURCE_IDS } from '../board/types.js';
import type { GameEvent } from './events.js';
import type { ActionResult } from './outcome.js';
import { startSeven } from './seven.js';

export function roll(state: GameState, player: PlayerId): ActionResult {
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (state.phase.type !== 'roll') return err('WRONG_PHASE');

  const { dice, rng } = rollDice(state.rng);
  const total = dice[0] + dice[1];
  let next: GameState = { ...state, rng, turn: { ...state.turn, lastRoll: dice } };
  const events: GameEvent[] = [{ type: 'DICE_ROLLED', player, dice, total }];

  if (total === 7) return ok({ state: startSeven(next), events });

  const production = computeProduction(next, total);
  for (const resource of production.shortages) {
    events.push({ type: 'PRODUCTION_SHORTAGE', resource });
  }
  for (const [who, gained] of Object.entries(production.gains)) {
    next = giveFromBank(next, who, gained);
    if (RESOURCE_IDS.some((r) => gained[r] > 0)) {
      events.push({ type: 'RESOURCES_GAINED', player: who, resources: gained, reason: 'roll' });
    }
  }
  return ok({ state: { ...next, phase: { type: 'main' } }, events });
}
