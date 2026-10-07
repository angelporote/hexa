import type { HexId } from '../board/hex.js';
import type { EdgeId, VertexId } from '../board/topology.js';
import { RESOURCE_IDS } from '../board/types.js';
import type { ResourceId } from '../board/types.js';
import { COSTS } from '../rules/costs.js';
import { respectsDistanceRule, touchesOwnRoad } from '../rules/placement.js';
import { emptyCounts } from '../state/resources.js';
import type { ResourceCounts } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer } from '../state/update.js';

// Todo lo de este archivo usa solo lo que ve un jugador: el tablero, los edificios y los caminos.
// De las manos ajenas no se lee nada (el ladrón y los puntos se valoran sin ellas).

/** Probabilidad relativa de cada ficha (puntos de probabilidad: 6 − |7 − n|). */
export function pips(token: number | null): number {
  return token === null || token === 7 ? 0 : Math.max(0, 6 - Math.abs(7 - token));
}

/** Puntos de probabilidad de un hexágono (0 si no produce). */
export function hexPips(state: GameState, hex: HexId): number {
  const tile = state.board.hexes[hex];
  return tile && tile.terrain !== 'none' ? pips(tile.number) : 0;
}

/** Cuánto vale cada recurso al elegir dónde construir: cereal y mineral hacen ciudades. */
const RESOURCE_WEIGHT: Record<ResourceId, number> = { r1: 1, r2: 1, r3: 0.8, r4: 1.1, r5: 1.1 };

/** Puntos de probabilidad que produce `player` de cada recurso (la ciudad cuenta doble). */
export function production(state: GameState, player: PlayerId): Record<ResourceId, number> {
  const out = emptyCounts();
  for (const [vertex, building] of Object.entries(state.buildings)) {
    if (building.owner !== player) continue;
    const node = state.board.topology.vertexById[vertex];
    for (const hex of node?.hexes ?? []) {
      const tile = state.board.hexes[hex];
      if (!tile || tile.terrain === 'none') continue;
      out[tile.terrain] += pips(tile.number) * (building.kind === 'city' ? 2 : 1);
    }
  }
  return out;
}

/**
 * Valor de poner un edificio en `vertex`: producción de los hexágonos que toca, con más peso a lo
 * que `player` aún no produce, más puertos útiles, menos si el ladrón bloquea el hexágono.
 */
export function vertexScore(state: GameState, vertex: VertexId, player: PlayerId): number {
  const node = state.board.topology.vertexById[vertex];
  if (!node) return 0;
  const mine = production(state, player);
  const seen = new Set<ResourceId>();
  let score = 0;
  for (const hex of node.hexes) {
    const tile = state.board.hexes[hex];
    if (!tile || tile.terrain === 'none') continue;
    const p = pips(tile.number);
    const novelty = mine[tile.terrain] === 0 && !seen.has(tile.terrain) ? 1.6 : 1;
    seen.add(tile.terrain);
    const blocked = state.robber === hex ? 0.5 : 1;
    score += p * RESOURCE_WEIGHT[tile.terrain] * novelty * blocked;
  }
  for (const port of state.board.ports) {
    if (!port.vertices.includes(vertex)) continue;
    score += port.kind === 'any' ? 1.5 : 0.5 + (mine[port.kind] >= 3 ? 1.5 : 0);
  }
  return score;
}

/** Vértice libre donde `player` puede poblar ahora mismo ignorando el coste. */
export function settlementSpots(state: GameState, player: PlayerId): VertexId[] {
  return state.board.topology.vertices
    .map((v) => v.id)
    .filter(
      (id) =>
        state.buildings[id] === undefined &&
        respectsDistanceRule(state, id) &&
        touchesOwnRoad(state, player, id),
    );
}

/** Poblados del jugador que se pueden convertir en ciudad. */
export function upgradable(state: GameState, player: PlayerId): VertexId[] {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.owner === player && b.kind === 'settlement')
    .map(([v]) => v);
}

/**
 * Valor de un camino que se coloca en `edge`: el mejor sitio donde poder poblar a continuación
 * (en sus extremos o a un paso), que es hacia donde conviene crecer.
 */
export function roadScore(state: GameState, edge: EdgeId, player: PlayerId): number {
  const node = state.board.topology.edgeById[edge];
  if (!node) return 0;
  let best = 0;
  for (const end of node.vertices) {
    const candidates = [
      { vertex: end, weight: 1 },
      ...(state.board.topology.vertexById[end]?.neighbors ?? []).map((vertex) => ({
        vertex,
        weight: 0.8,
      })),
    ];
    for (const { vertex, weight } of candidates) {
      if (state.buildings[vertex] !== undefined || !respectsDistanceRule(state, vertex)) continue;
      best = Math.max(best, vertexScore(state, vertex, player) * weight);
    }
  }
  return best;
}

export type TargetKind = 'settlement' | 'city' | 'devCard' | 'road';

export interface Target {
  readonly kind: TargetKind;
  readonly cost: ResourceCounts;
}

/** Edificios (poblados y ciudades) del jugador. */
function buildingCount(state: GameState, player: PlayerId): number {
  return Object.values(state.buildings).filter((b) => b.owner === player).length;
}

/**
 * En qué quiere gastar `player`, por orden de prioridad. Primero crecer (poblado si hay sitio y
 * aún tiene pocos edificios; si no, ciudad), después la otra opción, las cartas de desarrollo y,
 * solo si le falta sitio, los caminos.
 */
export function targets(state: GameState, player: PlayerId): Target[] {
  const me = getPlayer(state, player);
  const canSettle = me.pieces.settlements > 0 && settlementSpots(state, player).length > 0;
  const canCity = me.pieces.cities > 0 && upgradable(state, player).length > 0;
  const settle: Target = { kind: 'settlement', cost: COSTS.settlement };
  const city: Target = { kind: 'city', cost: COSTS.city };

  const out: Target[] = [];
  if (canSettle && (buildingCount(state, player) < 4 || !canCity)) {
    out.push(settle);
    if (canCity) out.push(city);
  } else {
    if (canCity) out.push(city);
    if (canSettle) out.push(settle);
  }
  out.push({ kind: 'devCard', cost: COSTS.devCard });
  if (!canSettle && me.pieces.roads > 0) out.push({ kind: 'road', cost: COSTS.road });
  return out;
}

const TARGET_WEIGHTS = [3, 2, 1, 0.5];

/** Cuánto acerca esta mano a los objetivos: cada carta útil para el primero vale más que para el siguiente. */
export function handValue(hand: ResourceCounts, plan: readonly Target[]): number {
  const left: Record<ResourceId, number> = { ...hand };
  let score = 0;
  plan.forEach((target, i) => {
    const weight = TARGET_WEIGHTS[i] ?? 0.25;
    for (const r of RESOURCE_IDS) {
      const take = Math.min(left[r], target.cost[r]);
      score += weight * take;
      left[r] -= take;
    }
  });
  // Lo que no sirve a ningún objetivo vale poco, pero no nada (puede cambiarse en el banco).
  for (const r of RESOURCE_IDS) score += 0.1 * left[r];
  return score;
}

/** Lo que le falta a `hand` para pagar `cost`. */
export function deficit(hand: ResourceCounts, cost: ResourceCounts): Record<ResourceId, number> {
  const out = emptyCounts();
  for (const r of RESOURCE_IDS) out[r] = Math.max(0, cost[r] - hand[r]);
  return out;
}

export const sumCounts = (c: ResourceCounts): number => RESOURCE_IDS.reduce((s, r) => s + c[r], 0);
