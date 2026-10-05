import type { HexId } from '../board/hex.js';
import { RESOURCE_IDS } from '../board/types.js';
import type { ResourceId } from '../board/types.js';
import { err, ok } from '../result.js';
import { nextInt } from '../rng/rng.js';
import { robberVictims } from '../rules/robber.js';
import { covers, isValidCounts, totalCards } from '../state/resources.js';
import type { ResourceCounts } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer, mapPlayer, payToBank } from '../state/update.js';
import type { GameEvent } from './events.js';
import type { ActionResult } from './outcome.js';

/** Descarte tras un 7: lo hace cada jugador obligado, en cualquier orden. */
export function discard(
  state: GameState,
  player: PlayerId,
  resources: ResourceCounts,
): ActionResult {
  if (state.phase.type !== 'discard') return err('WRONG_PHASE');
  const owed = state.phase.owed[player];
  if (owed === undefined) return err('NOTHING_TO_DISCARD');
  if (!isValidCounts(resources) || totalCards(resources) !== owed)
    return err('WRONG_DISCARD_AMOUNT');
  if (!covers(getPlayer(state, player).hand, resources)) return err('NOT_ENOUGH_RESOURCES');

  let next = payToBank(state, player, resources);
  const remaining = { ...state.phase.owed };
  delete remaining[player];
  const events: GameEvent[] = [{ type: 'CARDS_DISCARDED', player, count: owed }];
  next =
    Object.keys(remaining).length > 0
      ? { ...next, phase: { type: 'discard', owed: remaining } }
      : { ...next, phase: { type: 'robber', returnTo: 'main' } };
  return ok({ state: next, events });
}

/** Mueve el ladrón y, si procede, roba una carta al azar a un jugador adyacente. */
export function moveRobber(
  state: GameState,
  player: PlayerId,
  hex: HexId,
  victim: PlayerId | null,
): ActionResult {
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (state.phase.type !== 'robber') return err('WRONG_PHASE');
  if (!state.board.topology.hexById[hex]) return err('INVALID_HEX');
  if (hex === state.robber) return err('ROBBER_MUST_MOVE');

  const candidates = robberVictims(state, hex, player);
  if (victim === null) {
    if (candidates.length > 0) return err('INVALID_VICTIM');
  } else if (!candidates.includes(victim)) {
    return err('INVALID_VICTIM');
  }

  let next: GameState = { ...state, robber: hex, phase: { type: state.phase.returnTo } };
  const events: GameEvent[] = [{ type: 'ROBBER_MOVED', player, hex, victim }];

  if (victim !== null) {
    // Carta al azar de la mano del robado: cada carta individual es equiprobable.
    const cards: ResourceId[] = [];
    for (const r of RESOURCE_IDS) {
      for (let i = 0; i < getPlayer(next, victim).hand[r]; i++) cards.push(r);
    }
    const pick = nextInt(next.rng, cards.length);
    const stolen = cards[pick.value];
    if (stolen === undefined) throw new Error('unreachable');
    next = { ...next, rng: pick.rng };
    next = mapPlayer(next, victim, (p) => ({
      ...p,
      hand: { ...p.hand, [stolen]: p.hand[stolen] - 1 },
    }));
    next = mapPlayer(next, player, (p) => ({
      ...p,
      hand: { ...p.hand, [stolen]: p.hand[stolen] + 1 },
    }));
    events.push({ type: 'CARD_STOLEN', thief: player, victim });
  }
  return ok({ state: next, events });
}
