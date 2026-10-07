import { RESOURCE_IDS } from '../board/types.js';
import { err, ok } from '../result.js';
import { addCounts, covers, isValidCounts, subCounts, totalCards } from '../state/resources.js';
import type { ResourceCounts } from '../state/resources.js';
import type { GameState, PlayerId, TradeOffer } from '../state/types.js';
import { getPlayer, mapPlayer } from '../state/update.js';
import type { ActionResult } from './outcome.js';

/** Quienes pueden responder a la oferta: todos menos el oferente, o la lista indicada. */
export function offerRecipients(state: GameState, offer: TradeOffer): PlayerId[] {
  return state.players
    .map((p) => p.id)
    .filter((id) => id !== offer.from && (offer.to === null || offer.to.includes(id)));
}

function sharesResource(a: ResourceCounts, b: ResourceCounts): boolean {
  return RESOURCE_IDS.some((r) => a[r] > 0 && b[r] > 0);
}

function openOffer(state: GameState, offerId: number): TradeOffer | null {
  if (state.phase.type !== 'main') return null;
  const offer = state.pendingTrade;
  return offer && offer.id === offerId ? offer : null;
}

export function offerTrade(
  state: GameState,
  player: PlayerId,
  to: readonly PlayerId[] | null,
  give: ResourceCounts,
  want: ResourceCounts,
): ActionResult {
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (state.phase.type !== 'main') return err('WRONG_PHASE');
  if (state.pendingTrade) return err('TRADE_PENDING');
  if (!isValidCounts(give) || !isValidCounts(want)) return err('INVALID_TRADE');
  if (totalCards(give) === 0 || totalCards(want) === 0) return err('INVALID_TRADE');
  if (sharesResource(give, want)) return err('INVALID_TRADE');
  if (to !== null) {
    const valid = new Set(state.players.map((p) => p.id));
    if (to.length === 0 || new Set(to).size !== to.length) return err('INVALID_TRADE');
    if (to.some((id) => id === player || !valid.has(id))) return err('INVALID_TRADE');
  }
  if (!covers(getPlayer(state, player).hand, give)) return err('NOT_ENOUGH_RESOURCES');

  const offer: TradeOffer = {
    id: state.nextOfferId,
    from: player,
    to: to === null ? null : [...to],
    give,
    want,
    accepted: [],
    rejected: [],
    counters: [],
  };
  return ok({
    state: { ...state, pendingTrade: offer, nextOfferId: state.nextOfferId + 1 },
    events: [{ type: 'TRADE_OFFERED', offer }],
  });
}

function respond(
  state: GameState,
  player: PlayerId,
  offerId: number,
  accept: boolean,
): ActionResult {
  const offer = openOffer(state, offerId);
  if (!offer) return err(state.phase.type === 'main' ? 'NO_SUCH_OFFER' : 'WRONG_PHASE');
  if (!offerRecipients(state, offer).includes(player)) return err('NOT_A_RECIPIENT');
  const list = accept ? offer.accepted : offer.rejected;
  if (list.includes(player)) return err('ALREADY_RESPONDED');
  if (accept && !covers(getPlayer(state, player).hand, offer.want)) {
    return err('NOT_ENOUGH_RESOURCES');
  }

  const updated: TradeOffer = {
    ...offer,
    accepted: accept ? [...offer.accepted, player] : offer.accepted.filter((id) => id !== player),
    rejected: accept ? offer.rejected.filter((id) => id !== player) : [...offer.rejected, player],
    // Responder con sí o no retira la contraoferta que hubiera hecho antes.
    counters: offer.counters.filter((c) => c.from !== player),
  };
  return ok({
    state: { ...state, pendingTrade: updated },
    events: [{ type: accept ? 'TRADE_ACCEPTED' : 'TRADE_REJECTED', player, offerId }],
  });
}

export const acceptTrade = (state: GameState, player: PlayerId, offerId: number): ActionResult =>
  respond(state, player, offerId, true);

export const rejectTrade = (state: GameState, player: PlayerId, offerId: number): ActionResult =>
  respond(state, player, offerId, false);

/**
 * Un destinatario responde con otras condiciones: da `give` y pide `want`. Sustituye a su
 * respuesta anterior (sí, no o contraoferta). El oferente decide si la acepta.
 */
export function counterTrade(
  state: GameState,
  player: PlayerId,
  offerId: number,
  give: ResourceCounts,
  want: ResourceCounts,
): ActionResult {
  const offer = openOffer(state, offerId);
  if (!offer) return err(state.phase.type === 'main' ? 'NO_SUCH_OFFER' : 'WRONG_PHASE');
  if (!offerRecipients(state, offer).includes(player)) return err('NOT_A_RECIPIENT');
  if (!isValidCounts(give) || !isValidCounts(want)) return err('INVALID_TRADE');
  if (totalCards(give) === 0 || totalCards(want) === 0) return err('INVALID_TRADE');
  if (sharesResource(give, want)) return err('INVALID_TRADE');
  if (!covers(getPlayer(state, player).hand, give)) return err('NOT_ENOUGH_RESOURCES');

  const updated: TradeOffer = {
    ...offer,
    accepted: offer.accepted.filter((id) => id !== player),
    rejected: offer.rejected.filter((id) => id !== player),
    counters: [...offer.counters.filter((c) => c.from !== player), { from: player, give, want }],
  };
  return ok({
    state: { ...state, pendingTrade: updated },
    events: [{ type: 'TRADE_COUNTERED', player, offerId }],
  });
}

export function cancelTrade(state: GameState, player: PlayerId, offerId: number): ActionResult {
  const offer = openOffer(state, offerId);
  if (!offer) return err(state.phase.type === 'main' ? 'NO_SUCH_OFFER' : 'WRONG_PHASE');
  if (offer.from !== player) return err('NOT_YOUR_TURN');
  return ok({
    state: { ...state, pendingTrade: null },
    events: [{ type: 'TRADE_CANCELLED', offerId }],
  });
}

/** El oferente elige entre quienes aceptaron; se revisan de nuevo las manos de ambos. */
export function confirmTrade(
  state: GameState,
  player: PlayerId,
  offerId: number,
  partner: PlayerId,
): ActionResult {
  const offer = openOffer(state, offerId);
  if (!offer) return err(state.phase.type === 'main' ? 'NO_SUCH_OFFER' : 'WRONG_PHASE');
  if (offer.from !== player) return err('NOT_YOUR_TURN');
  if (!offer.accepted.includes(partner)) return err('NOT_ACCEPTED');
  if (!covers(getPlayer(state, player).hand, offer.give)) return err('NOT_ENOUGH_RESOURCES');
  if (!covers(getPlayer(state, partner).hand, offer.want)) return err('NOT_ENOUGH_RESOURCES');

  let next = mapPlayer(state, player, (p) => ({
    ...p,
    hand: addCounts(subCounts(p.hand, offer.give), offer.want),
  }));
  next = mapPlayer(next, partner, (p) => ({
    ...p,
    hand: addCounts(subCounts(p.hand, offer.want), offer.give),
  }));
  return ok({
    state: { ...next, pendingTrade: null },
    events: [{ type: 'TRADE_COMPLETED', offerId, from: player, with: partner }],
  });
}

/** El oferente cierra el trato con las condiciones de la contraoferta de `partner`. */
export function confirmCounter(
  state: GameState,
  player: PlayerId,
  offerId: number,
  partner: PlayerId,
): ActionResult {
  const offer = openOffer(state, offerId);
  if (!offer) return err(state.phase.type === 'main' ? 'NO_SUCH_OFFER' : 'WRONG_PHASE');
  if (offer.from !== player) return err('NOT_YOUR_TURN');
  const counter = offer.counters.find((c) => c.from === partner);
  if (!counter) return err('NO_COUNTER');
  // El oferente entrega lo que el otro pide y recibe lo que el otro da.
  if (!covers(getPlayer(state, player).hand, counter.want)) return err('NOT_ENOUGH_RESOURCES');
  if (!covers(getPlayer(state, partner).hand, counter.give)) return err('NOT_ENOUGH_RESOURCES');

  let next = mapPlayer(state, player, (p) => ({
    ...p,
    hand: addCounts(subCounts(p.hand, counter.want), counter.give),
  }));
  next = mapPlayer(next, partner, (p) => ({
    ...p,
    hand: addCounts(subCounts(p.hand, counter.give), counter.want),
  }));
  return ok({
    state: { ...next, pendingTrade: null },
    events: [{ type: 'TRADE_COMPLETED', offerId, from: player, with: partner }],
  });
}
