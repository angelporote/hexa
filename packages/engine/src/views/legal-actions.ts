import { canApply } from '../actions/apply.js';
import type { Action } from '../actions/types.js';
import { RESOURCE_IDS } from '../board/types.js';
import type { ResourceId } from '../board/types.js';
import { robberTargets, robberVictims } from '../rules/robber.js';
import { emptyCounts } from '../state/resources.js';
import type { ResourceCounts } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer } from '../state/update.js';

/** Todas las combinaciones de `amount` cartas que se pueden sacar de `hand`. */
function discardChoices(hand: ResourceCounts, amount: number): ResourceCounts[] {
  const out: ResourceCounts[] = [];
  const current = emptyCounts();
  const walk = (index: number, left: number): void => {
    const resource = RESOURCE_IDS[index];
    if (resource === undefined) {
      if (left === 0) out.push({ ...current });
      return;
    }
    for (let n = Math.min(hand[resource], left); n >= 0; n--) {
      current[resource] = n;
      walk(index + 1, left - n);
    }
    current[resource] = 0;
  };
  walk(0, amount);
  return out;
}

function candidates(state: GameState, player: PlayerId): Action[] {
  const { topology } = state.board;
  const out: Action[] = [];
  const pairs = (): [ResourceId, ResourceId][] =>
    RESOURCE_IDS.flatMap((a) => RESOURCE_IDS.map((b): [ResourceId, ResourceId] => [a, b]));
  const devCardPlays = (): Action[] => [
    { type: 'PLAY_ARMY' },
    { type: 'PLAY_ROADS' },
    // El orden de los dos recursos es indiferente: solo se ofrece una de cada par.
    ...pairs()
      .filter(([a, b]) => RESOURCE_IDS.indexOf(a) <= RESOURCE_IDS.indexOf(b))
      .map((resources): Action => ({ type: 'PLAY_PLENTY', resources })),
    ...RESOURCE_IDS.map((resource): Action => ({ type: 'PLAY_MONOPOLY', resource })),
  ];

  switch (state.phase.type) {
    case 'setup':
      for (const v of topology.vertices) out.push({ type: 'BUILD_SETTLEMENT', vertex: v.id });
      for (const e of topology.edges) out.push({ type: 'BUILD_ROAD', edge: e.id });
      break;
    case 'roll':
      out.push({ type: 'ROLL' }, ...devCardPlays());
      break;
    case 'discard': {
      const owed = state.phase.owed[player];
      if (owed !== undefined) {
        for (const resources of discardChoices(getPlayer(state, player).hand, owed)) {
          out.push({ type: 'DISCARD', resources });
        }
      }
      break;
    }
    case 'robber':
      for (const hex of robberTargets(state)) {
        const victims = robberVictims(state, hex, player);
        if (victims.length === 0) out.push({ type: 'MOVE_ROBBER', hex, victim: null });
        for (const victim of victims) out.push({ type: 'MOVE_ROBBER', hex, victim });
      }
      break;
    case 'roadBuilding':
      for (const e of topology.edges) out.push({ type: 'BUILD_ROAD', edge: e.id });
      break;
    case 'main': {
      for (const e of topology.edges) out.push({ type: 'BUILD_ROAD', edge: e.id });
      for (const v of topology.vertices) {
        out.push({ type: 'BUILD_SETTLEMENT', vertex: v.id }, { type: 'BUILD_CITY', vertex: v.id });
      }
      out.push({ type: 'BUY_DEV_CARD' }, ...devCardPlays());
      for (const [give, want] of pairs()) out.push({ type: 'BANK_TRADE', give, want });
      const offer = state.pendingTrade;
      if (offer) {
        out.push(
          { type: 'ACCEPT_TRADE', offerId: offer.id },
          { type: 'REJECT_TRADE', offerId: offer.id },
          { type: 'CANCEL_TRADE', offerId: offer.id },
        );
        for (const counter of offer.counters) {
          out.push({ type: 'CONFIRM_COUNTER', offerId: offer.id, with: counter.from });
        }
        for (const id of offer.accepted) {
          out.push({ type: 'CONFIRM_TRADE', offerId: offer.id, with: id });
        }
      }
      out.push({ type: 'END_TURN' });
      break;
    }
    case 'ended':
      break;
  }
  return out;
}

/**
 * Acciones que `player` puede ejecutar ahora mismo, ya validadas con el motor. Las ofertas de
 * comercio (`OFFER_TRADE`) quedan fuera porque su espacio de parámetros es libre: la vista
 * indica con `canOfferTrade` si puede proponer una.
 */
export function legalActions(state: GameState, player: PlayerId): Action[] {
  return candidates(state, player).filter((action) => canApply(state, player, action));
}

/** El jugador podría proponer algún intercambio ahora (su turno, fase main y sin oferta abierta). */
export function canOfferTrade(state: GameState, player: PlayerId): boolean {
  if (state.turn.player !== player || state.phase.type !== 'main' || state.pendingTrade) {
    return false;
  }
  return RESOURCE_IDS.some((r) => getPlayer(state, player).hand[r] > 0);
}

/** El jugador puede responder a la oferta abierta con otras condiciones. */
export function canCounterTrade(state: GameState, player: PlayerId): boolean {
  const offer = state.pendingTrade;
  if (!offer || state.phase.type !== 'main' || offer.from === player) return false;
  const recipient = offer.to === null || offer.to.includes(player);
  return recipient && RESOURCE_IDS.some((r) => getPlayer(state, player).hand[r] > 0);
}
