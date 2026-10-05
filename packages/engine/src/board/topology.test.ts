import { describe, expect, it } from 'vitest';
import { hexesInRadius, hexDistance, hexNeighbor, HEX_DIRECTIONS } from './hex.js';
import { buildTopology } from './topology.js';

describe('coordenadas hexagonales', () => {
  it('las direcciones consecutivas son vecinas entre sí', () => {
    for (let i = 0; i < 6; i++) {
      const a = hexNeighbor({ q: 0, r: 0 }, i);
      const b = hexNeighbor({ q: 0, r: 0 }, i + 1);
      expect(hexDistance(a, b)).toBe(1);
    }
    expect(HEX_DIRECTIONS).toHaveLength(6);
  });

  it('un radio 2 contiene 19 hexágonos', () => {
    expect(hexesInRadius(2)).toHaveLength(19);
  });
});

describe('buildTopology', () => {
  it('el mapa base de 19 hexágonos produce 54 vértices y 72 aristas', () => {
    const t = buildTopology(hexesInRadius(2));
    expect(t.hexes).toHaveLength(19);
    expect(t.vertices).toHaveLength(54);
    expect(t.edges).toHaveLength(72);
  });

  it('un solo hexágono tiene 6 vértices y 6 aristas', () => {
    const t = buildTopology(hexesInRadius(0));
    expect(t.vertices).toHaveLength(6);
    expect(t.edges).toHaveLength(6);
  });

  it('siete hexágonos producen 24 vértices y 30 aristas', () => {
    const t = buildTopology(hexesInRadius(1));
    expect(t.vertices).toHaveLength(24);
    expect(t.edges).toHaveLength(30);
  });

  it('cada hexágono tiene 6 vértices y 6 aristas distintos, y cada arista une vértices de su hexágono', () => {
    const t = buildTopology(hexesInRadius(2));
    for (const hex of t.hexes) {
      expect(new Set(hex.vertices).size).toBe(6);
      expect(new Set(hex.edges).size).toBe(6);
      hex.edges.forEach((edgeId, i) => {
        const edge = t.edgeById[edgeId];
        expect(edge).toBeDefined();
        // la arista i une las esquinas i-1 e i
        const expected = [hex.vertices[(i + 5) % 6], hex.vertices[i]].sort();
        expect([...(edge?.vertices ?? [])].sort()).toEqual(expected);
      });
    }
  });

  it('cada vértice toca entre 1 y 3 hexágonos y tiene 2 o 3 aristas', () => {
    const t = buildTopology(hexesInRadius(2));
    for (const v of t.vertices) {
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
      expect([2, 3]).toContain(v.edges.length);
      expect(v.neighbors).toHaveLength(v.edges.length);
    }
  });

  it('los vecinos son simétricos', () => {
    const t = buildTopology(hexesInRadius(2));
    for (const v of t.vertices) {
      for (const n of v.neighbors) {
        expect(t.vertexById[n]?.neighbors).toContain(v.id);
      }
    }
  });

  it('es determinista', () => {
    expect(buildTopology(hexesInRadius(2))).toEqual(buildTopology(hexesInRadius(2)));
  });

  it('rechaza hexágonos duplicados', () => {
    expect(() =>
      buildTopology([
        { q: 0, r: 0 },
        { q: 0, r: 0 },
      ]),
    ).toThrow();
  });
});
