import { applyAction } from '../actions/apply.js';
import { createRng } from '../rng/rng.js';
import { createConfig } from '../state/config.js';
import { createGame } from '../state/create-game.js';
import type { GameConfig, GameState, PlayerId } from '../state/types.js';
import { totalPoints } from '../scoring/points.js';
import { chooseMove } from './bot.js';
import { checkInvariants } from './invariants.js';

export interface GameReport {
  readonly seed: string;
  readonly finished: boolean;
  readonly winner: PlayerId | null;
  readonly turns: number;
  readonly steps: number;
  readonly points: Readonly<Record<PlayerId, number>>;
  /** Invariantes rotas, errores del motor o desajustes de reproducción. Vacío = partida limpia. */
  readonly violations: readonly string[];
}

export interface SimulateOptions {
  /** Pasos máximos (acciones) antes de dar la partida por atascada. */
  readonly maxSteps: number;
  /** Comprobar las invariantes cada N pasos (1 = en cada paso). */
  readonly checkEvery: number;
}

export const DEFAULT_SIMULATE_OPTIONS: SimulateOptions = { maxSteps: 20000, checkEvery: 1 };

/** Juega una partida completa con bots aleatorios y comprueba invariantes en el camino. */
export function simulateGame(
  seed: string,
  playerCount = 4,
  options: SimulateOptions = DEFAULT_SIMULATE_OPTIONS,
  config?: GameConfig,
): GameReport {
  const ids = ['p0', 'p1', 'p2', 'p3'].slice(0, playerCount);
  const cfg = config ?? createConfig(ids);
  let state: GameState = createGame(cfg, seed);
  let botRng = createRng(`bot:${seed}`);
  const violations: string[] = [];
  let steps = 0;

  const fail = (message: string) => violations.push(`paso ${steps}: ${message}`);
  const initial = checkInvariants(state);
  for (const p of initial) fail(`inicial: ${p}`);

  while (state.phase.type !== 'ended' && steps < options.maxSteps && violations.length === 0) {
    const { move, rng } = chooseMove(state, botRng);
    botRng = rng;
    if (!move) {
      fail(`sin jugadas legales en la fase ${state.phase.type}`);
      break;
    }
    const result = applyAction(state, move.player, move.action);
    if (!result.ok) {
      fail(`acción legal rechazada: ${move.action.type} → ${result.error}`);
      break;
    }
    state = result.value.state;
    steps++;
    if (steps % options.checkEvery === 0) {
      for (const p of checkInvariants(state)) fail(p);
    }
  }

  // Reproducibilidad: reaplicar el registro desde la semilla debe dar exactamente el mismo estado.
  if (violations.length === 0) {
    let replay = createGame(cfg, seed);
    for (const entry of state.log) {
      const r = applyAction(replay, entry.player, entry.action);
      if (!r.ok) {
        fail(`la repetición rechaza ${entry.action.type}: ${r.error}`);
        break;
      }
      replay = r.value.state;
    }
    if (violations.length === 0 && JSON.stringify(replay) !== JSON.stringify(state)) {
      fail('la repetición desde el registro no reproduce el estado final');
    }
    if (JSON.stringify(JSON.parse(JSON.stringify(state))) !== JSON.stringify(state)) {
      fail('el estado final no es serializable sin pérdida');
    }
  }

  return {
    seed,
    finished: state.phase.type === 'ended',
    winner: state.winner,
    turns: state.turn.number,
    steps,
    points: Object.fromEntries(state.players.map((p) => [p.id, totalPoints(state, p.id)])),
    violations,
  };
}
