// Utilidades solo para tests; no se exportan desde el índice del paquete.
import { applyAction } from './actions/apply.js';
import type { Action } from './actions/types.js';
import type { GameEvent } from './actions/events.js';
import { createConfig } from './state/config.js';
import { createGame } from './state/create-game.js';
import type { GameConfig, GameState, PlayerId } from './state/types.js';
import { respectsDistanceRule } from './rules/placement.js';
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
