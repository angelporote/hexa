// Coordenadas hexagonales axiales (q, r) con hexágonos de punta arriba.

export interface HexCoord {
  readonly q: number;
  readonly r: number;
}

export type HexId = string;

// Orden cíclico alrededor del hexágono: cada dirección es vecina de la siguiente.
// La esquina `i` queda entre la dirección `i` y la `i + 1`; la arista `i` mira hacia la dirección `i`.
export const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexId(c: HexCoord): HexId {
  return `h${c.q},${c.r}`;
}

export function hexNeighbor(c: HexCoord, direction: number): HexCoord {
  const d = HEX_DIRECTIONS[((direction % 6) + 6) % 6];
  if (!d) throw new Error('unreachable: dirección fuera de rango');
  return { q: c.q + d.q, r: c.r + d.r };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Todos los hexágonos a distancia ≤ radius del origen, en orden determinista. */
export function hexesInRadius(radius: number): HexCoord[] {
  const out: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

export function compareHex(a: HexCoord, b: HexCoord): number {
  return a.q - b.q || a.r - b.r;
}
