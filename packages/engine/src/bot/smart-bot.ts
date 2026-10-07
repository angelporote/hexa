import type { Action } from '../actions/types.js';
import type { HexId } from '../board/hex.js';
import type { ResourceId } from '../board/types.js';
import { nextInt } from '../rng/rng.js';
import type { RngState } from '../rng/rng.js';
import { tradeRatios } from '../rules/ports.js';
import { publicPoints } from '../scoring/points.js';
import { addCounts, emptyCounts, subCounts, totalCards } from '../state/resources.js';
import type { ResourceCounts } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer } from '../state/update.js';
import { legalActions } from '../views/legal-actions.js';
import type { BotMove } from '../sim/bot.js';
import {
  deficit,
  handValue,
  hexPips,
  roadScore,
  settlementSpots,
  sumCounts,
  targets,
  vertexScore,
} from './evaluate.js';
import type { Target } from './evaluate.js';

// Bot razonable (ADR 0014). Puntúa cada acción legal con reglas sencillas y elige la mejor; los
// empates se deshacen con el RNG. Solo lee lo que vería un jugador: su mano, sus cartas y lo
// público (de las manos ajenas, únicamente cuántas cartas tienen).

/** Las bandas de puntuación fijan la prioridad entre tipos de jugada; dentro de una banda manda el valor. */
const SCORE = {
  setupSettlement: 1000,
  armyBlocked: 950,
  primaryBuild: 900,
  secondaryBuild: 850,
  plentyCompletes: 800,
  armyForLargest: 920,
  devPrimary: 880,
  rollOrEnd: 100,
  roadsExpand: 650,
  roadBuildingPhase: 500,
  buyDev: 400,
  monopoly: 330,
  road: 300,
  bankTrade: 200,
  acceptTrade: 100,
  cancelOffer: 50,
  endTurn: 10,
  never: -1000,
} as const;

const EPSILON = 1e-9;

interface Context {
  readonly state: GameState;
  readonly player: PlayerId;
  readonly hand: ResourceCounts;
  readonly plan: readonly Target[];
}

function context(state: GameState, player: PlayerId): Context {
  return { state, player, hand: getPlayer(state, player).hand, plan: targets(state, player) };
}

/** Puntos de probabilidad propios que el ladrón está bloqueando ahora mismo. */
function blockedPips(ctx: Context): number {
  const { state, player } = ctx;
  const node = state.board.topology.hexById[state.robber];
  if (!node) return 0;
  const p = hexPips(state, state.robber);
  let blocked = 0;
  for (const vertex of node.vertices) {
    const building = state.buildings[vertex];
    if (building?.owner === player) blocked += p * (building.kind === 'city' ? 2 : 1);
  }
  return blocked;
}

/** Ejércitos jugados por el rival con más (público). */
function bestOtherArmy(ctx: Context): number {
  return Math.max(
    0,
    ...ctx.state.players.filter((p) => p.id !== ctx.player).map((p) => p.armiesPlayed),
  );
}

function robberScore(ctx: Context, hex: HexId, victim: PlayerId | null): number {
  const { state, player } = ctx;
  const node = state.board.topology.hexById[hex];
  if (!node) return SCORE.never;
  const p = hexPips(state, hex);
  let damage = 0;
  let self = 0;
  for (const vertex of node.vertices) {
    const building = state.buildings[vertex];
    if (!building) continue;
    const size = building.kind === 'city' ? 2 : 1;
    if (building.owner === player) self += p * size;
    else damage += p * size * (1 + publicPoints(state, building.owner) / 5);
  }
  let score = damage * 10 - self * 15;
  if (victim !== null) {
    score += 3 + publicPoints(state, victim) / 2 + totalCards(getPlayer(state, victim).hand) / 5;
  }
  return score;
}

/** Cuánto mejora la mano si se cambian `pay` por `receive`. */
function tradeGain(ctx: Context, receive: ResourceCounts, pay: ResourceCounts): number {
  const after = subCounts(addCounts(ctx.hand, receive), pay);
  return handValue(after, ctx.plan) - handValue(ctx.hand, ctx.plan);
}

function scoreBuyDevCard(ctx: Context): number {
  const primary = ctx.plan[0];
  if (!primary) return SCORE.never;
  if (primary.kind === 'devCard') return SCORE.devPrimary;
  // Comprar una carta no debe alejar el objetivo principal (gasta lana, cereal y mineral).
  const cost = ctx.plan.find((t) => t.kind === 'devCard')?.cost ?? emptyCounts();
  const after = subCounts(ctx.hand, cost);
  const before = sumCounts(deficit(ctx.hand, primary.cost));
  return sumCounts(deficit(after, primary.cost)) <= before ? SCORE.buyDev : SCORE.never;
}

function scoreBankTrade(ctx: Context, give: ResourceId, want: ResourceId): number {
  const primary = ctx.plan[0];
  if (!primary) return SCORE.never;
  const missing = deficit(ctx.hand, primary.cost);
  if (missing[want] === 0) return SCORE.never;
  // Solo se cambia lo que sobra respecto a los dos primeros objetivos.
  const reserved = ctx.plan.slice(0, 2).reduce((sum, t) => sum + t.cost[give], 0);
  const ratio = tradeRatios(ctx.state, ctx.player)[give];
  if (ctx.hand[give] - reserved < ratio) return SCORE.never;
  return SCORE.bankTrade + sumCounts(missing);
}

function scoreAction(ctx: Context, action: Action): number {
  const { state, player, hand } = ctx;
  const me = getPlayer(state, player);
  const phase = state.phase.type;
  const primary = ctx.plan[0];

  switch (action.type) {
    case 'ROLL':
      return SCORE.rollOrEnd;
    case 'END_TURN':
      return SCORE.endTurn;

    case 'BUILD_SETTLEMENT': {
      const value = vertexScore(state, action.vertex, player);
      if (phase === 'setup') return SCORE.setupSettlement + value;
      return (primary?.kind === 'settlement' ? SCORE.primaryBuild : SCORE.secondaryBuild) + value;
    }
    case 'BUILD_CITY': {
      const value = vertexScore(state, action.vertex, player);
      return (primary?.kind === 'city' ? SCORE.primaryBuild : SCORE.secondaryBuild) + value;
    }
    case 'BUILD_ROAD': {
      const value = roadScore(state, action.edge, player);
      if (phase === 'setup' || phase === 'roadBuilding') return SCORE.roadBuildingPhase + value;
      // Un camino solo se construye para llegar a un sitio nuevo, o si sobran madera y arcilla.
      const needsRoom = settlementSpots(state, player).length === 0 && me.pieces.settlements > 0;
      const spare = hand.r1 >= 3 && hand.r2 >= 3;
      return (needsRoom || spare) && value > 0 ? SCORE.road + value : SCORE.never;
    }
    case 'BUY_DEV_CARD':
      return scoreBuyDevCard(ctx);

    case 'PLAY_ARMY': {
      if (blockedPips(ctx) > 0) return SCORE.armyBlocked;
      if (phase === 'roll') return SCORE.never; // antes de tirar solo merece la pena si te bloquea
      const next = me.armiesPlayed + 1;
      if (next >= state.config.rules.minLargestArmy && next > bestOtherArmy(ctx)) {
        return SCORE.armyForLargest;
      }
      return SCORE.buyDev - 100;
    }
    case 'PLAY_ROADS': {
      if (phase === 'roll') return SCORE.never;
      return settlementSpots(state, player).length === 0 ? SCORE.roadsExpand : SCORE.road - 150;
    }
    case 'PLAY_PLENTY': {
      if (phase === 'roll' || !primary) return SCORE.never;
      const got = emptyCounts();
      for (const r of action.resources) got[r] += 1;
      const before = sumCounts(deficit(hand, primary.cost));
      const after = sumCounts(deficit(addCounts(hand, got), primary.cost));
      if (before > 0 && after === 0) return SCORE.plentyCompletes;
      const gained = before - after;
      return gained === 2 ? SCORE.road : gained === 1 ? SCORE.rollOrEnd : SCORE.never;
    }
    case 'PLAY_MONOPOLY': {
      if (phase === 'roll' || !primary) return SCORE.never;
      const missing = deficit(hand, primary.cost)[action.resource];
      return missing > 0 ? SCORE.monopoly + missing * 10 : SCORE.never;
    }
    case 'BANK_TRADE':
      return scoreBankTrade(ctx, action.give, action.want);

    case 'DISCARD':
      return handValue(subCounts(hand, action.resources), ctx.plan);
    case 'MOVE_ROBBER':
      return robberScore(ctx, action.hex, action.victim);

    case 'ACCEPT_TRADE': {
      const offer = state.pendingTrade;
      if (!offer) return SCORE.never;
      const gain = tradeGain(ctx, offer.give, offer.want);
      return gain > EPSILON ? SCORE.acceptTrade + gain * 10 : SCORE.never;
    }
    case 'REJECT_TRADE':
      return 0;
    case 'CANCEL_TRADE':
      return SCORE.cancelOffer;
    case 'CONFIRM_TRADE': {
      const offer = state.pendingTrade;
      if (!offer) return SCORE.never;
      const gain = tradeGain(ctx, offer.want, offer.give);
      return gain > EPSILON ? SCORE.acceptTrade + gain * 10 : SCORE.never;
    }
    case 'CONFIRM_COUNTER': {
      const counter = state.pendingTrade?.counters.find((c) => c.from === action.with);
      if (!counter) return SCORE.never;
      const gain = tradeGain(ctx, counter.give, counter.want);
      return gain > EPSILON ? SCORE.acceptTrade + gain * 10 : SCORE.never;
    }

    // El bot razonable no propone ni contraoferta: no negocia con jugadores.
    case 'OFFER_TRADE':
    case 'COUNTER_TRADE':
      return SCORE.never;
  }
}

/**
 * Jugada del bot razonable para `player`, o `null` si no tiene ninguna. Es una función pura del
 * estado: el `rng` solo desempata entre jugadas igual de buenas.
 */
export function chooseSmartMove(
  state: GameState,
  player: PlayerId,
  rng: RngState,
): { move: BotMove | null; rng: RngState } {
  const legal = legalActions(state, player);
  if (legal.length === 0) return { move: null, rng };

  const ctx = context(state, player);
  let best = -Infinity;
  let ties: Action[] = [];
  for (const action of legal) {
    const score = scoreAction(ctx, action);
    if (score > best + EPSILON) {
      best = score;
      ties = [action];
    } else if (Math.abs(score - best) <= EPSILON) {
      ties.push(action);
    }
  }
  const draw = nextInt(rng, ties.length);
  const action = ties[draw.value];
  if (!action) return { move: null, rng: draw.rng };
  return { move: { player, action }, rng: draw.rng };
}
