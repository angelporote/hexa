import { describe, expect, it } from 'vitest';
import { BASE_MAP, buildTopology, createRng, generateBoard } from '@hexa/engine';
import { HEX_SIZE, cornerPoint, hexCenter, layoutBoard, pips, polygonPoints } from './geometry.js';

function board() {
  const r = generateBoard(BASE_MAP, createRng('geo'));
  if (!r.ok) throw new Error(r.error);
  return r.value.board;
}

describe('geometría del tablero', () => {
  it('los vecinos de un hexágono están a distancia √3 · radio', () => {
    const c0 = hexCenter(0, 0);
    for (const [q, r] of [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ] as const) {
      const c = hexCenter(q, r);
      expect(Math.hypot(c.x - c0.x, c.y - c0.y)).toBeCloseTo(HEX_SIZE * Math.sqrt(3), 6);
    }
  });

  it('las esquinas son equidistantes del centro y la 1 está arriba a la derecha de la 0', () => {
    const c = hexCenter(0, 0);
    for (let i = 0; i < 6; i++) {
      const p = cornerPoint(c, i);
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(HEX_SIZE, 6);
    }
    expect(cornerPoint(c, 1).y).toBeLessThan(cornerPoint(c, 0).y); // sube (y hacia abajo)
    expect(cornerPoint(c, 1).x).toBeLessThan(cornerPoint(c, 0).x);
  });

  it('coloca los 54 vértices y 72 aristas, todos en posiciones distintas', () => {
    const b = board();
    const layout = layoutBoard(b.topology, b.ports);
    expect(Object.keys(layout.vertices)).toHaveLength(54);
    expect(Object.keys(layout.edges)).toHaveLength(72);
    const keys = new Set(
      Object.values(layout.vertices).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    );
    expect(keys.size).toBe(54);
  });

  it('un vértice compartido cae en el mismo punto visto desde cualquiera de sus hexágonos', () => {
    const b = board();
    const layout = layoutBoard(b.topology, b.ports);
    for (const hex of b.topology.hexes) {
      const center = hexCenter(hex.q, hex.r);
      hex.vertices.forEach((id, i) => {
        const here = cornerPoint(center, i);
        const stored = layout.vertices[id];
        expect(stored && Math.hypot(stored.x - here.x, stored.y - here.y) < 1e-6).toBe(true);
      });
    }
  });

  it('cada arista une dos vértices vecinos del grafo, a distancia igual al radio', () => {
    const b = board();
    const layout = layoutBoard(b.topology, b.ports);
    for (const edge of b.topology.edges) {
      const [va, vb] = edge.vertices;
      const a = layout.vertices[va];
      const bb = layout.vertices[vb];
      expect(a && bb && Math.hypot(a.x - bb.x, a.y - bb.y)).toBeCloseTo(HEX_SIZE, 6);
    }
  });

  it('las insignias de puerto quedan fuera del tablero y dentro del viewBox', () => {
    const b = board();
    const layout = layoutBoard(b.topology, b.ports);
    expect(layout.ports).toHaveLength(9);
    const { x, y, w, h } = layout.viewBox;
    for (const port of layout.ports) {
      expect(port.badge.x).toBeGreaterThan(x);
      expect(port.badge.x).toBeLessThan(x + w);
      expect(port.badge.y).toBeGreaterThan(y);
      expect(port.badge.y).toBeLessThan(y + h);
      // más lejos del origen que el punto medio de su arista
      const mid = { x: (port.a.x + port.b.x) / 2, y: (port.a.y + port.b.y) / 2 };
      expect(Math.hypot(port.badge.x, port.badge.y)).toBeGreaterThan(Math.hypot(mid.x, mid.y));
    }
  });

  it('el viewBox contiene todas las esquinas', () => {
    const topology = buildTopology([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    const layout = layoutBoard(topology, []);
    const { x, y, w, h } = layout.viewBox;
    for (const hex of layout.hexes) {
      for (const c of hex.corners) {
        expect(c.x).toBeGreaterThan(x);
        expect(c.x).toBeLessThan(x + w);
        expect(c.y).toBeGreaterThan(y);
        expect(c.y).toBeLessThan(y + h);
      }
    }
  });

  it('pips y polígonos', () => {
    expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(pips)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1]);
    expect(
      polygonPoints([
        { x: 1, y: 2 },
        { x: 3.456, y: 4 },
      ]),
    ).toBe('1.00,2.00 3.46,4.00');
  });
});
