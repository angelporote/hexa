// Bot para tests de integración: decide solo con lo que ve un cliente (su `PlayerView`).
import { RESOURCE_IDS, nextInt } from '@hexa/engine';
import type { Action, PlayerView, ResourceId, RngState } from '@hexa/engine';

const WEIGHTS: Record<string, number> = {
  BUILD_CITY: 8,
  BUILD_SETTLEMENT: 8,
  BUILD_ROAD: 4,
  BUY_DEV_CARD: 4,
  PLAY_ARMY: 3,
  PLAY_ROADS: 3,
  PLAY_PLENTY: 2,
  PLAY_MONOPOLY: 2,
};

function pick<T>(rng: RngState, items: readonly T[]): { value: T; rng: RngState } {
  const step = nextInt(rng, items.length);
  const value = items[step.value];
  if (value === undefined) throw new Error('lista vacía');
  return { value, rng: step.rng };
}

const zero = (): Record<ResourceId, number> => ({ r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 });

/** Elige una acción de `view.legalActions` (o una oferta 1 a 1 de vez en cuando). */
export function chooseAction(
  view: PlayerView,
  rng: RngState,
): { action: Action; rng: RngState } | null {
  let state = rng;
  if (view.canOfferTrade && view.you) {
    const roll = nextInt(state, 1000);
    state = roll.rng;
    const hand = view.you.hand;
    const owned = RESOURCE_IDS.filter((r) => hand[r] > 0);
    if (roll.value < 80 && owned.length > 0) {
      const give = pick(state, owned);
      const want = pick(
        give.rng,
        RESOURCE_IDS.filter((r) => r !== give.value),
      );
      return {
        action: {
          type: 'OFFER_TRADE',
          to: null,
          give: { ...zero(), [give.value]: 1 },
          want: { ...zero(), [want.value]: 1 },
        },
        rng: want.rng,
      };
    }
  }

  const legal = view.legalActions;
  if (legal.length === 0) return null;
  const types = [...new Set(legal.map((a) => a.type))];
  const weights = types.map((t) => WEIGHTS[t] ?? 1);
  const draw = nextInt(
    state,
    weights.reduce((a, b) => a + b, 0),
  );
  state = draw.rng;
  let left = draw.value;
  let chosen = types[0];
  for (const [i, t] of types.entries()) {
    const w = weights[i] ?? 1;
    if (left < w) {
      chosen = t;
      break;
    }
    left -= w;
  }
  const candidates = legal.filter((a) => a.type === chosen);
  const action = pick(state, candidates);
  return { action: action.value, rng: action.rng };
}
