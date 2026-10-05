// Utilidades solo para tests; no se exportan desde el índice del paquete.
import { applyAction } from './actions/apply.js';
import type { Action } from './actions/types.js';
import type { GameEvent } from './actions/events.js';
import { createConfig } from './state/config.js';
import { createGame } from './state/create-game.js';
import type { GameConfig, GameState, PlayerId } from './state/types.js';
import { respectsDistanceRule } from './rules/placement.js';

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
