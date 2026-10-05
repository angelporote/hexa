import { nextInt } from '../rng/rng.js';
import type { RngState } from '../rng/rng.js';

export type Dice = readonly [number, number];

export function rollDice(rng: RngState): { dice: Dice; rng: RngState } {
  const a = nextInt(rng, 6);
  const b = nextInt(a.rng, 6);
  return { dice: [a.value + 1, b.value + 1], rng: b.rng };
}
