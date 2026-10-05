import type { Action, ActionType } from '../actions/types.js';
import { RESOURCE_IDS } from '../board/types.js';
import { nextInt } from '../rng/rng.js';
import type { RngState } from '../rng/rng.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer } from '../state/update.js';
import { emptyCounts } from '../state/resources.js';
import { legalActions } from '../views/legal-actions.js';

export interface BotMove {
  readonly player: PlayerId;
  readonly action: Action;
}

// Pesos por tipo de acción: favorecen construir para que las partidas terminen.
const WEIGHTS: Partial<Record<ActionType, number>> = {
  BUILD_CITY: 8,
  BUILD_SETTLEMENT: 8,
  BUILD_ROAD: 4,
  BUY_DEV_CARD: 4,
  PLAY_ARMY: 3,
  PLAY_ROADS: 3,
  PLAY_PLENTY: 2,
  PLAY_MONOPOLY: 2,
  BANK_TRADE: 1,
  END_TURN: 1,
};
const OFFER_CHANCE_PER_THOUSAND = 80;

/** Quién debe actuar a continuación (los descartes y las respuestas a ofertas no son del turno). */
export function pendingActor(state: GameState): PlayerId {
  if (state.phase.type === 'discard') {
    const owing = Object.keys(state.phase.owed)[0];
    if (owing !== undefined) return owing;
  }
  const offer = state.pendingTrade;
  if (state.phase.type === 'main' && offer) {
    const waiting = state.players.find(
      (p) =>
        p.id !== offer.from &&
        (offer.to === null || offer.to.includes(p.id)) &&
        !offer.accepted.includes(p.id) &&
        !offer.rejected.includes(p.id),
    );
    if (waiting) return waiting.id;
  }
  return state.turn.player;
}

function pick<T>(rng: RngState, items: readonly T[]): { value: T; rng: RngState } {
  const step = nextInt(rng, items.length);
  const value = items[step.value];
  if (value === undefined) throw new Error('lista vacía');
  return { value, rng: step.rng };
}

/** Bot aleatorio ponderado: juega por quien toque actuar (`pendingActor`). */
export function chooseMove(
  state: GameState,
  rng: RngState,
): { move: BotMove | null; rng: RngState } {
  return chooseMoveFor(state, pendingActor(state), rng, { offers: true });
}

/** Bot aleatorio ponderado por tipo de acción. Devuelve `null` si `player` no tiene jugadas. */
export function chooseMoveFor(
  state: GameState,
  player: PlayerId,
  rng: RngState,
  options: { readonly offers: boolean } = { offers: true },
): { move: BotMove | null; rng: RngState } {
  let current = rng;

  // De vez en cuando propone un intercambio 1 a 1 para ejercitar el comercio entre jugadores.
  if (
    options.offers &&
    state.phase.type === 'main' &&
    player === state.turn.player &&
    !state.pendingTrade
  ) {
    const roll = nextInt(current, 1000);
    current = roll.rng;
    const hand = getPlayer(state, player).hand;
    const owned = RESOURCE_IDS.filter((r) => hand[r] > 0);
    if (roll.value < OFFER_CHANCE_PER_THOUSAND && owned.length > 0) {
      const give = pick(current, owned);
      const others = RESOURCE_IDS.filter((r) => r !== give.value);
      const want = pick(give.rng, others);
      current = want.rng;
      return {
        move: {
          player,
          action: {
            type: 'OFFER_TRADE',
            to: null,
            give: { ...emptyCounts(), [give.value]: 1 },
            want: { ...emptyCounts(), [want.value]: 1 },
          },
        },
        rng: current,
      };
    }
  }

  const legal = legalActions(state, player);
  if (legal.length === 0) return { move: null, rng: current };

  const byType = new Map<ActionType, Action[]>();
  for (const action of legal) byType.set(action.type, [...(byType.get(action.type) ?? []), action]);
  const types = [...byType.keys()];
  const weights = types.map((t) => WEIGHTS[t] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const draw = nextInt(current, total);
  current = draw.rng;
  let acc = draw.value;
  let chosen = types[0];
  for (let i = 0; i < types.length; i++) {
    const w = weights[i] ?? 1;
    if (acc < w) {
      chosen = types[i];
      break;
    }
    acc -= w;
  }
  const actions = chosen === undefined ? undefined : byType.get(chosen);
  if (!actions) return { move: null, rng: current };
  const action = pick(current, actions);
  return { move: { player, action: action.value }, rng: action.rng };
}
