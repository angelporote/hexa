import type { EdgeId, HexId, Port, Topology, VertexId } from '@hexa/engine';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Radio del hexágono (del centro a una esquina) en unidades del dibujo. */
export const HEX_SIZE = 60;

const SQRT3 = Math.sqrt(3);

/** Centro del hexágono (q, r) con la punta hacia arriba. */
export function hexCenter(q: number, r: number, size = HEX_SIZE): Point {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

/**
 * Esquina `i` de un hexágono. Coincide con el motor: la esquina `i` queda entre las direcciones
 * `i` e `i + 1`, a −30° − 60°·i (el eje y crece hacia abajo).
 */
export function cornerPoint(center: Point, i: number, size = HEX_SIZE): Point {
  const angle = ((-30 - 60 * i) * Math.PI) / 180;
  return { x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) };
}

export interface LaidOutHex {
  readonly id: HexId;
  readonly center: Point;
  /** Las 6 esquinas en el orden del motor. */
  readonly corners: readonly Point[];
}

export interface LaidOutPort {
  readonly edge: EdgeId;
  readonly a: Point;
  readonly b: Point;
  /** Dónde se dibuja la insignia, fuera de la costa. */
  readonly badge: Point;
}

export interface BoardLayout {
  readonly hexes: readonly LaidOutHex[];
  readonly vertices: Readonly<Record<VertexId, Point>>;
  readonly edges: Readonly<Record<EdgeId, { readonly a: Point; readonly b: Point }>>;
  readonly ports: readonly LaidOutPort[];
  readonly viewBox: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}

/** Coloca el tablero en el plano a partir del grafo del motor; no depende del estado de la partida. */
export function layoutBoard(
  topology: Topology,
  ports: readonly Port[],
  size = HEX_SIZE,
): BoardLayout {
  const hexes: LaidOutHex[] = [];
  const vertices: Record<VertexId, Point> = {};
  const edges: Record<EdgeId, { a: Point; b: Point }> = {};

  for (const hex of topology.hexes) {
    const center = hexCenter(hex.q, hex.r, size);
    const corners = [0, 1, 2, 3, 4, 5].map((i) => cornerPoint(center, i, size));
    hexes.push({ id: hex.id, center, corners });
    hex.vertices.forEach((id, i) => {
      const p = corners[i];
      if (p && !vertices[id]) vertices[id] = p;
    });
    hex.edges.forEach((id, i) => {
      const a = corners[(i + 5) % 6];
      const b = corners[i];
      if (a && b && !edges[id]) edges[id] = { a, b };
    });
  }

  const laidOutPorts: LaidOutPort[] = [];
  for (const port of ports) {
    const edge = edges[port.edge];
    const owner = topology.hexes.find((h) => h.edges.includes(port.edge));
    if (!edge || !owner) continue;
    const center = hexCenter(owner.q, owner.r, size);
    const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
    // Hacia fuera: del centro del hexágono que tiene la arista hacia su punto medio.
    const dx = mid.x - center.x;
    const dy = mid.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const push = size * 0.62;
    laidOutPorts.push({
      edge: port.edge,
      a: edge.a,
      b: edge.b,
      badge: { x: mid.x + (dx / length) * push, y: mid.y + (dy / length) * push },
    });
  }

  const xs = hexes
    .flatMap((h) => h.corners.map((c) => c.x))
    .concat(laidOutPorts.map((p) => p.badge.x));
  const ys = hexes
    .flatMap((h) => h.corners.map((c) => c.y))
    .concat(laidOutPorts.map((p) => p.badge.y));
  const margin = size * 0.75;
  const minX = Math.min(...xs) - margin;
  const minY = Math.min(...ys) - margin;
  const viewBox = {
    x: minX,
    y: minY,
    w: Math.max(...xs) + margin - minX,
    h: Math.max(...ys) + margin - minY,
  };
  return { hexes, vertices, edges, ports: laidOutPorts, viewBox };
}

/** Puntos de un polígono en formato `points` de SVG. */
export function polygonPoints(points: readonly Point[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/** Puntos de probabilidad de una ficha: 5 para el 6 y el 8, 1 para el 2 y el 12. */
export function pips(number: number): number {
  return 6 - Math.abs(7 - number);
}
