import { describe, expect, it } from 'vitest';
import { createRng } from '../rng/rng.js';
import { generateBoard } from './generator.js';
import { hexId, hexNeighbor } from './hex.js';
import { parseMapTemplate } from './map-template.js';
import { BASE_MAP } from './maps/index.js';
import type { Board } from './types.js';

function gen(seed: string, avoid = true): Board {
  const result = generateBoard(BASE_MAP, createRng(seed), { avoidAdjacentHotNumbers: avoid });
  if (!result.ok) throw new Error(result.error);
  return result.value.board;
}

describe('mapa base', () => {
  it('es una plantilla válida con 19 hexágonos, 18 fichas y 9 puertos', () => {
    expect(BASE_MAP.hexes).toHaveLength(19);
    expect(BASE_MAP.numbers).toHaveLength(18);
    expect(BASE_MAP.ports).toHaveLength(9);
  });
});

describe('parseMapTemplate', () => {
  it('rechaza terrenos que no suman el número de hexágonos', () => {
    const bad = { ...BASE_MAP, terrains: { ...BASE_MAP.terrains, r1: 5 } };
    const r = parseMapTemplate(bad);
    expect(r.ok).toBe(false);
  });

  it('rechaza fichas con el valor 7', () => {
    const bad = { ...BASE_MAP, numbers: [7, ...BASE_MAP.numbers.slice(1)] };
    expect(parseMapTemplate(bad).ok).toBe(false);
  });

  it('rechaza puertos en aristas interiores', () => {
    const bad = { ...BASE_MAP, ports: [{ q: 0, r: 0, dir: 0 }, ...BASE_MAP.ports.slice(1)] };
    const r = parseMapTemplate(bad);
    expect(r.ok).toBe(false);
  });

  it('rechaza datos que no son un mapa', () => {
    expect(parseMapTemplate({ id: 'x' }).ok).toBe(false);
    expect(parseMapTemplate(null).ok).toBe(false);
  });
});

describe('generateBoard', () => {
  it('es reproducible con la misma semilla y distinto con otra', () => {
    expect(gen('seed-1')).toEqual(gen('seed-1'));
    expect(gen('seed-1').hexes).not.toEqual(gen('seed-2').hexes);
  });

  it('reparte exactamente los terrenos, fichas y puertos de la plantilla', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const board = gen(seed);
      const hexes = Object.values(board.hexes);
      for (const id of ['r1', 'r2', 'r3', 'r4', 'r5', 'none'] as const) {
        expect(hexes.filter((h) => h.terrain === id)).toHaveLength(BASE_MAP.terrains[id]);
      }
      const numbers = hexes.flatMap((h) => (h.number === null ? [] : [h.number]));
      expect([...numbers].sort((x, y) => x - y)).toEqual(
        [...BASE_MAP.numbers].sort((x, y) => x - y),
      );
      expect(hexes.filter((h) => h.terrain === 'none').every((h) => h.number === null)).toBe(true);
      expect(board.ports.map((p) => p.kind).sort()).toEqual([...BASE_MAP.portKinds].sort());
    }
  });

  it('los puertos quedan en aristas costeras', () => {
    const board = gen('ports');
    for (const port of board.ports) {
      expect(board.topology.edgeById[port.edge]?.hexes).toHaveLength(1);
    }
  });

  it('con la opción activa, 6 y 8 nunca son contiguos (200 semillas)', () => {
    for (let i = 0; i < 200; i++) {
      const board = gen(`hot-${i}`);
      const hot = (id: string) => {
        const n = board.hexes[id]?.number;
        return n === 6 || n === 8;
      };
      for (const h of board.topology.hexes) {
        if (!hot(h.id)) continue;
        for (let d = 0; d < 6; d++) {
          const n = hexId(hexNeighbor(h, d));
          if (board.hexes[n]) expect(hot(n)).toBe(false);
        }
      }
    }
  });

  it('sin la opción, alguna semilla produce 6 y 8 contiguos', () => {
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const board = gen(`free-${i}`, false);
      found = board.topology.hexes.some((h) => {
        const n = board.hexes[h.id]?.number;
        if (n !== 6 && n !== 8) return false;
        return [0, 1, 2, 3, 4, 5].some((d) => {
          const m = board.hexes[hexId(hexNeighbor(h, d))]?.number;
          return m === 6 || m === 8;
        });
      });
    }
    expect(found).toBe(true);
  });

  it('es serializable en JSON sin pérdida', () => {
    const board = gen('json');
    expect(JSON.parse(JSON.stringify(board))).toEqual(board);
  });
});
