import { describe, expect, it } from 'vitest';
import { createRng, nextInt, nextUint32, shuffle } from './rng.js';

function take(seed: string, n: number): number[] {
  let rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const step = nextUint32(rng);
    out.push(step.value);
    rng = step.rng;
  }
  return out;
}

describe('rng', () => {
  it('misma semilla, misma secuencia', () => {
    expect(take('abc', 50)).toEqual(take('abc', 50));
  });

  it('semillas distintas, secuencias distintas', () => {
    expect(take('abc', 10)).not.toEqual(take('abd', 10));
  });

  it('no muta el estado recibido', () => {
    const rng = createRng('x');
    const snapshot = JSON.stringify(rng);
    nextUint32(rng);
    expect(JSON.stringify(rng)).toBe(snapshot);
  });

  it('el estado es serializable y la secuencia continúa igual tras restaurarlo', () => {
    const first = nextUint32(nextUint32(createRng('persist')).rng);
    const restored = JSON.parse(JSON.stringify(first.rng)) as typeof first.rng;
    expect(nextUint32(restored)).toEqual(nextUint32(first.rng));
  });

  it('nextInt respeta el rango y es razonablemente uniforme', () => {
    let rng = createRng('uniform');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) {
      const step = nextInt(rng, 6);
      rng = step.rng;
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThan(6);
      counts[step.value] = (counts[step.value] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });

  it('nextInt rechaza límites no válidos', () => {
    expect(() => nextInt(createRng('x'), 0)).toThrow();
    expect(() => nextInt(createRng('x'), 1.5)).toThrow();
  });

  it('shuffle devuelve una permutación sin mutar la entrada y es reproducible', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = shuffle(createRng('s'), input);
    const b = shuffle(createRng('s'), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...a.value].sort((x, y) => x - y)).toEqual(input);
    expect(a.value).toEqual(b.value);
    expect(a.value).not.toEqual(input);
  });
});
