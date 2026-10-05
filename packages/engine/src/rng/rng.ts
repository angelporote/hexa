// RNG sfc32 funcional: el estado son 4 enteros de 32 bits, serializable en JSON,
// y cada paso devuelve el valor junto al estado siguiente (nunca muta).

export interface RngState {
  readonly s: readonly [number, number, number, number];
}

export interface RngStep<T> {
  readonly value: T;
  readonly rng: RngState;
}

// Hash de cadena a 4 enteros de 32 bits (xmur3).
function seedWords(seed: string): [number, number, number, number] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  return [next(), next(), next(), next()];
}

export function nextUint32(rng: RngState): RngStep<number> {
  let [a, b, c, d] = rng.s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return { value: t >>> 0, rng: { s: [a, b, c, d] } };
}

export function createRng(seed: string): RngState {
  let rng: RngState = { s: seedWords(seed) };
  // Descartar las primeras salidas para mezclar bien el estado inicial.
  for (let i = 0; i < 12; i++) rng = nextUint32(rng).rng;
  return rng;
}

/** Entero uniforme en [0, maxExclusive) por muestreo con rechazo, sin sesgo de módulo. */
export function nextInt(rng: RngState, maxExclusive: number): RngStep<number> {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x100000000) {
    throw new Error(`Límite no válido: ${maxExclusive}`);
  }
  const limit = 0x100000000 - (0x100000000 % maxExclusive);
  let state = rng;
  for (;;) {
    const step = nextUint32(state);
    state = step.rng;
    if (step.value < limit) return { value: step.value % maxExclusive, rng: state };
  }
}

/** Fisher-Yates sobre una copia; la entrada no se modifica. */
export function shuffle<T>(rng: RngState, items: readonly T[]): RngStep<T[]> {
  const out = [...items];
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const step = nextInt(state, i + 1);
    state = step.rng;
    const j = step.value;
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return { value: out, rng: state };
}
