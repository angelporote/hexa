// Utilidades solo para tests; no se exportan desde el índice del paquete.
import { applyAction } from './actions/apply.js';
import type { Action } from './actions/types.js';
import type { GameEvent } from './actions/events.js';
import { createConfig } from './state/config.js';
import { createGame } from './state/create-game.js';
import type { GameConfig, GameState, PlayerId } from './state/types.js';
import { respectsDistanceRule } from './rules/placement.js';
import type { EdgeId, VertexId } from './board/topology.js';
import { createRng } from './rng/rng.js';
import { rollDice } from './rules/dice.js';

export const PLAYERS = ['p0', 'p1', 'p2', 'p3'] as const;

export function newGame(playerCount = 4, seed = 'test', config?: GameConfig): GameState {
  return createGame(config ?? createConfig(PLAYERS.slice(0, playerCount)), seed);
}

/** Congela en profundidad para detectar mutaciones accidentales. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Aplica una acción esperando éxito; falla el test con el código de error si no lo logra. */
export function apply(
  state: GameState,
  player: PlayerId,
  action: Action,
): { state: GameState; events: readonly GameEvent[] } {
  const r = applyAction(state, player, action);
  if (!r.ok) throw new Error(`${action.type} por ${player} falló: ${r.error}`);
  return r.value;
}

/** Completa la colocación inicial eligiendo siempre el primer vértice y arista válidos. */
export function autoSetup(initial: GameState): GameState {
  let state = initial;
  while (state.phase.type === 'setup') {
    const player = state.turn.player;
    const vertex = state.board.topology.vertices.find(
      (v) => !state.buildings[v.id] && respectsDistanceRule(state, v.id),
    );
    if (!vertex) throw new Error('No hay vértice libre');
    state = apply(state, player, { type: 'BUILD_SETTLEMENT', vertex: vertex.id }).state;
    const edge = vertex.edges.find((e) => !state.roads[e]);
    if (!edge) throw new Error('No hay arista libre');
    state = apply(state, player, { type: 'BUILD_ROAD', edge }).state;
  }
  return state;
}

export function place(
  state: GameState,
  vertex: string,
  owner: PlayerId,
  kind: 'settlement' | 'city' = 'settlement',
): GameState {
  return { ...state, buildings: { ...state.buildings, [vertex]: { owner, kind } } };
}

export function setHand(
  state: GameState,
  player: PlayerId,
  hand: Partial<Record<'r1' | 'r2' | 'r3' | 'r4' | 'r5', number>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, hand: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, ...hand } } : p,
    ),
  };
}

/** Sustituye el RNG por uno que producirá exactamente la tirada `total` en el próximo ROLL. */
export function forceRoll(state: GameState, total: number): GameState {
  for (let i = 0; i < 10000; i++) {
    const rng = createRng(`force-${total}-${i}`);
    const { dice } = rollDice(rng);
    if (dice[0] + dice[1] === total) return { ...state, rng };
  }
  throw new Error(`No se encontró RNG para la tirada ${total}`);
}

/** Pasa directamente a la fase de tirada del jugador indicado (omite la colocación inicial). */
export function toRollPhase(state: GameState, player: PlayerId = 'p0'): GameState {
  return {
    ...state,
    phase: { type: 'roll' },
    turn: { player, number: 1, lastRoll: null, devCardPlayed: false },
  };
}

export function giveRoads(state: GameState, player: PlayerId, edges: readonly string[]): GameState {
  const roads = { ...state.roads };
  for (const e of edges) roads[e] = player;
  return { ...state, roads };
}

/** Camino simple de `length` aristas consecutivas, evitando las aristas y vértices indicados. */
export function findChain(
  state: GameState,
  length: number,
  avoidEdges: ReadonlySet<string> = new Set(),
): { edges: string[]; vertices: string[] } {
  const { vertices, edgeById } = state.board.topology;
  const search = (
    path: string[],
    edges: string[],
  ): { edges: string[]; vertices: string[] } | null => {
    if (edges.length === length) return { edges, vertices: path };
    const last = path[path.length - 1] ?? '';
    const node = state.board.topology.vertexById[last];
    for (const e of node?.edges ?? []) {
      if (edges.includes(e) || avoidEdges.has(e)) continue;
      const ends = edgeById[e]?.vertices ?? ['', ''];
      const next = ends[0] === last ? ends[1] : ends[0];
      if (path.includes(next)) continue;
      const found = search([...path, next], [...edges, e]);
      if (found) return found;
    }
    return null;
  };
  for (const v of vertices) {
    const found = search([v.id], []);
    if (found) return found;
  }
  throw new Error(`No hay cadena de ${length} aristas`);
}

// ── Estados preparados a mano para los tests del bot ─────────────────────────────────────

type Hand = Parameters<typeof setHand>[2];

/** Fase principal del turno de `p0` tras la colocación inicial, con las manos indicadas. */
export function mainState(
  hands: Readonly<Record<PlayerId, Hand>> = {},
  playerCount = 3,
  seed = 'bot-tests',
): GameState {
  let state = autoSetup(newGame(playerCount, seed));
  state = {
    ...state,
    phase: { type: 'main' },
    turn: { player: 'p0', number: 6, lastRoll: [3, 4], devCardPlayed: false },
  };
  for (const [id, hand] of Object.entries(hands)) state = setHand(state, id, hand);
  return state;
}

/** Camino de aristas entre dos vértices pasando solo por vértices sin edificio ajeno. */
function pathBetween(state: GameState, from: VertexId, to: VertexId, player: PlayerId): EdgeId[] {
  const { vertexById, edgeById } = state.board.topology;
  const previous = new Map<VertexId, { vertex: VertexId; edge: EdgeId }>();
  const queue: VertexId[] = [from];
  const seen = new Set<VertexId>([from]);
  while (queue.length > 0) {
    const current = queue.shift() ?? '';
    if (current === to) break;
    for (const edge of vertexById[current]?.edges ?? []) {
      const ends = edgeById[edge]?.vertices ?? ['', ''];
      const next = ends[0] === current ? ends[1] : ends[0];
      if (seen.has(next)) continue;
      const building = state.buildings[next];
      if (building && building.owner !== player) continue;
      seen.add(next);
      previous.set(next, { vertex: current, edge });
      queue.push(next);
    }
  }
  const path: EdgeId[] = [];
  for (let at = to; at !== from;) {
    const step = previous.get(at);
    if (!step) throw new Error('sin camino');
    path.unshift(step.edge);
    at = step.vertex;
  }
  return path;
}

/**
 * Da a `player` los caminos necesarios para que exista al menos un vértice donde poblar y lo
 * devuelve junto con ese vértice. El vértice más cercano libre que cumple la regla de distancia.
 */
export function withSettlementSpot(
  state: GameState,
  player: PlayerId,
): { state: GameState; spot: VertexId } {
  const mine = Object.entries(state.buildings)
    .filter(([, b]) => b.owner === player)
    .map(([v]) => v);
  const from = mine[0];
  if (!from) throw new Error('el jugador no tiene edificios');
  let best: { spot: VertexId; path: EdgeId[] } | null = null;
  for (const v of state.board.topology.vertices) {
    if (state.buildings[v.id] || !respectsDistanceRule(state, v.id)) continue;
    let path: EdgeId[];
    try {
      path = pathBetween(state, from, v.id, player);
    } catch {
      continue;
    }
    if (!best || path.length < best.path.length) best = { spot: v.id, path };
  }
  if (!best) throw new Error('no hay sitio donde poblar');
  const owned = best.path.filter((e) => !state.roads[e]);
  return { state: giveRoads(state, player, owned), spot: best.spot };
}

/** Coloca `count` poblados más de `player` (los primeros vértices libres que lo permiten). */
export function withBuildings(state: GameState, player: PlayerId, count: number): GameState {
  let next = state;
  let placed = 0;
  for (const v of state.board.topology.vertices) {
    if (placed >= count) break;
    if (next.buildings[v.id] || !respectsDistanceRule(next, v.id)) continue;
    next = place(next, v.id, player);
    placed++;
  }
  return next;
}
