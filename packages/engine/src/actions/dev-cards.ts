import { RESOURCE_IDS } from '../board/types.js';
import type { ResourceId } from '../board/types.js';
import { err, ok } from '../result.js';
import { COSTS } from '../rules/costs.js';
import { legalRoadEdges } from '../rules/placement.js';
import { covers, emptyCounts } from '../state/resources.js';
import type { DevCardId, GameState, PlayerId } from '../state/types.js';
import { getPlayer, giveFromBank, mapPlayer, payToBank } from '../state/update.js';
import type { RuleError } from './errors.js';
import type { GameEvent } from './events.js';
import type { ActionResult } from './outcome.js';

export function buyDevCard(state: GameState, player: PlayerId): ActionResult {
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (state.phase.type !== 'main') return err('WRONG_PHASE');
  if (state.devDeck.length === 0) return err('DECK_EMPTY');
  if (!covers(getPlayer(state, player).hand, COSTS.devCard)) return err('NOT_ENOUGH_RESOURCES');

  const [card, ...rest] = state.devDeck;
  if (card === undefined) return err('DECK_EMPTY');
  let next = payToBank(state, player, COSTS.devCard);
  next = { ...next, devDeck: rest };
  next = mapPlayer(next, player, (p) => ({
    ...p,
    devCards: [...p.devCards, { card, boughtOnTurn: state.turn.number }],
  }));
  // El evento no dice qué carta salió: es información privada del comprador.
  return ok({ state: next, events: [{ type: 'DEV_CARD_BOUGHT', player }] });
}

/**
 * Comprobaciones comunes para jugar una carta: turno propio, antes de tirar o en la fase
 * principal, una sola carta por turno y nunca la comprada en este mismo turno.
 */
function takeCard(
  state: GameState,
  player: PlayerId,
  card: DevCardId,
): { ok: true; state: GameState; returnTo: 'roll' | 'main' } | { ok: false; error: RuleError } {
  if (state.turn.player !== player) return { ok: false, error: 'NOT_YOUR_TURN' };
  if (state.phase.type !== 'roll' && state.phase.type !== 'main') {
    return { ok: false, error: 'WRONG_PHASE' };
  }
  if (state.turn.devCardPlayed) return { ok: false, error: 'DEV_CARD_ALREADY_PLAYED' };

  const held = getPlayer(state, player).devCards;
  const playable = held.findIndex((c) => c.card === card && c.boughtOnTurn < state.turn.number);
  if (playable === -1) {
    const bought = held.some((c) => c.card === card);
    return { ok: false, error: bought ? 'DEV_CARD_BOUGHT_THIS_TURN' : 'NO_SUCH_DEV_CARD' };
  }
  const next = mapPlayer(state, player, (p) => ({
    ...p,
    devCards: p.devCards.filter((_, i) => i !== playable),
  }));
  return {
    ok: true,
    state: { ...next, turn: { ...next.turn, devCardPlayed: true } },
    returnTo: state.phase.type,
  };
}

export function playArmy(state: GameState, player: PlayerId): ActionResult {
  const taken = takeCard(state, player, 'army');
  if (!taken.ok) return err(taken.error);
  const next = mapPlayer(taken.state, player, (p) => ({ ...p, armiesPlayed: p.armiesPlayed + 1 }));
  return ok({
    state: { ...next, phase: { type: 'robber', returnTo: taken.returnTo } },
    events: [{ type: 'DEV_CARD_PLAYED', player, card: 'army' }],
  });
}

export function playRoads(state: GameState, player: PlayerId): ActionResult {
  const me = getPlayer(state, player);
  const taken = takeCard(state, player, 'roads');
  if (!taken.ok) return err(taken.error);
  if (me.pieces.roads < 1 || legalRoadEdges(state, player).length === 0) {
    return err('NO_LEGAL_PLACEMENT');
  }
  const remaining = Math.min(2, me.pieces.roads);
  return ok({
    state: { ...taken.state, phase: { type: 'roadBuilding', remaining, returnTo: taken.returnTo } },
    events: [{ type: 'DEV_CARD_PLAYED', player, card: 'roads' }],
  });
}

export function playPlenty(
  state: GameState,
  player: PlayerId,
  resources: readonly [ResourceId, ResourceId],
): ActionResult {
  const wanted = emptyCounts();
  for (const r of resources) wanted[r] += 1;
  if (RESOURCE_IDS.some((r) => wanted[r] > state.bank[r])) return err('BANK_LACKS_RESOURCES');
  const taken = takeCard(state, player, 'plenty');
  if (!taken.ok) return err(taken.error);
  const next = giveFromBank(taken.state, player, wanted);
  return ok({
    state: next,
    events: [
      { type: 'DEV_CARD_PLAYED', player, card: 'plenty' },
      { type: 'RESOURCES_GAINED', player, resources: wanted, reason: 'dev-card' },
    ],
  });
}

export function playMonopoly(
  state: GameState,
  player: PlayerId,
  resource: ResourceId,
): ActionResult {
  const taken = takeCard(state, player, 'monopoly');
  if (!taken.ok) return err(taken.error);
  let total = 0;
  let next = taken.state;
  for (const other of next.players) {
    if (other.id === player) continue;
    const amount = other.hand[resource];
    if (amount === 0) continue;
    total += amount;
    next = mapPlayer(next, other.id, (p) => ({ ...p, hand: { ...p.hand, [resource]: 0 } }));
  }
  next = mapPlayer(next, player, (p) => ({
    ...p,
    hand: { ...p.hand, [resource]: p.hand[resource] + total },
  }));
  const events: GameEvent[] = [
    { type: 'DEV_CARD_PLAYED', player, card: 'monopoly' },
    { type: 'MONOPOLY_COLLECTED', player, resource, total },
  ];
  return ok({ state: next, events });
}
