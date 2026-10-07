import { describe, expect, it } from 'vitest';
import { COSTS } from '../rules/costs.js';
import { emptyCounts } from '../state/resources.js';
import {
  autoSetup,
  mainState,
  newGame,
  place,
  withBuildings,
  withSettlementSpot,
} from '../test-utils.js';
import {
  deficit,
  handValue,
  hexPips,
  pips,
  production,
  roadScore,
  settlementSpots,
  sumCounts,
  targets,
  upgradable,
  vertexScore,
} from './evaluate.js';

const board = newGame(3, 'evaluate-tests');
const vertices = board.board.topology.vertices;
const free = (id: string) => board.board.topology.vertexById[id];

describe('pips', () => {
  it('es la probabilidad relativa de la ficha: máxima en 6 y 8, mínima en 2 y 12', () => {
    expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(pips)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1]);
    expect(pips(null)).toBe(0);
    expect(pips(7)).toBe(0);
  });

  it('un hexágono sin producción vale cero', () => {
    const desert = board.board.topology.hexes.find(
      (h) => board.board.hexes[h.id]?.terrain === 'none',
    );
    expect(desert).toBeDefined();
    expect(hexPips(board, desert?.id ?? '')).toBe(0);
    expect(hexPips(board, 'no-existe')).toBe(0);
  });
});

describe('vertexScore', () => {
  it('suma la producción de los hexágonos del vértice, con más peso a lo que aún no produce', () => {
    const weight = { r1: 1, r2: 1, r3: 0.8, r4: 1.1, r5: 1.1 } as const;
    // un vértice sin puerto ni ladrón: el cálculo se puede hacer a mano
    const portVertices = new Set(board.board.ports.flatMap((p) => p.vertices));
    const v = vertices.find(
      (x) => !portVertices.has(x.id) && x.hexes.every((h) => hexPips(board, h) > 0),
    );
    if (!v) throw new Error('sin vértice de prueba');
    const seen = new Set<string>();
    let expected = 0;
    for (const h of v.hexes) {
      const tile = board.board.hexes[h];
      if (!tile || tile.terrain === 'none') continue;
      const novelty = seen.has(tile.terrain) ? 1 : 1.6;
      seen.add(tile.terrain);
      expected +=
        pips(tile.number) * weight[tile.terrain] * novelty * (board.robber === h ? 0.5 : 1);
    }
    expect(vertexScore(board, v.id, 'p0')).toBeCloseTo(expected, 9);
  });

  it('repetir un recurso que ya se produce vale menos que uno nuevo', () => {
    let found = false;
    for (const target of vertices) {
      for (const other of vertices) {
        if (target.id === other.id || target.neighbors.includes(other.id)) continue;
        const terrains = (id: string) =>
          new Set(free(id)?.hexes.map((h) => board.board.hexes[h]?.terrain));
        const shared = [...terrains(target.id)].some(
          (t) => t !== 'none' && terrains(other.id).has(t),
        );
        if (!shared) continue;
        const after = place(board, other.id, 'p0');
        expect(vertexScore(after, target.id, 'p0')).toBeLessThan(
          vertexScore(board, target.id, 'p0'),
        );
        // para otro jugador el vértice sigue valiendo lo mismo
        expect(vertexScore(after, target.id, 'p1')).toBeCloseTo(
          vertexScore(board, target.id, 'p1'),
          9,
        );
        found = true;
        break;
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it('el ladrón encima de un hexágono rebaja los vértices que lo tocan', () => {
    const best = [...vertices].sort(
      (a, b) => vertexScore(board, b.id, 'p0') - vertexScore(board, a.id, 'p0'),
    )[0];
    const hex = best?.hexes.find((h) => hexPips(board, h) > 0 && h !== board.robber);
    if (!best || !hex) throw new Error('sin vértice de prueba');
    expect(vertexScore({ ...board, robber: hex }, best.id, 'p0')).toBeLessThan(
      vertexScore(board, best.id, 'p0'),
    );
  });

  it('un puerto suma: general siempre, específico más si ya se produce ese recurso', () => {
    const withoutPorts = (state: typeof board): typeof board => ({
      ...state,
      board: { ...state.board, ports: [] },
    });
    const bonus = (state: typeof board, vertex: string): number =>
      vertexScore(state, vertex, 'p0') - vertexScore(withoutPorts(state), vertex, 'p0');

    const general = board.board.ports.find((p) => p.kind === 'any');
    const specific = board.board.ports.find((p) => p.kind !== 'any');
    if (!general || !specific || specific.kind === 'any') throw new Error('sin puertos');
    const [g] = general.vertices;
    const [s] = specific.vertices;
    expect(bonus(board, g)).toBeCloseTo(1.5, 9);
    expect(bonus(board, s)).toBeCloseTo(0.5, 9);

    // con un poblado que ya produce el recurso del puerto (3 puntos o más) el puerto vale más
    const producer = vertices.find(
      (v) =>
        v.id !== s &&
        !v.neighbors.includes(s) &&
        v.hexes.some((h) => {
          const tile = board.board.hexes[h];
          return tile?.terrain === specific.kind && pips(tile.number) >= 3;
        }),
    );
    if (!producer) throw new Error('sin productor');
    expect(bonus(place(board, producer.id, 'p0'), s)).toBeCloseTo(2, 9);
  });

  it('un vértice que no existe vale cero', () => {
    expect(vertexScore(board, 'nada', 'p0')).toBe(0);
    expect(roadScore(board, 'nada', 'p0')).toBe(0);
  });
});

describe('production', () => {
  it('suma la probabilidad de cada recurso; la ciudad cuenta doble', () => {
    const v = vertices.find((x) => x.hexes.some((h) => hexPips(board, h) > 0));
    if (!v) throw new Error('sin vértice');
    const settlement = production(place(board, v.id, 'p0'), 'p0');
    const city = production(place(board, v.id, 'p0', 'city'), 'p0');
    for (const r of ['r1', 'r2', 'r3', 'r4', 'r5'] as const)
      expect(city[r]).toBe(settlement[r] * 2);
    expect(sumCounts(settlement)).toBeGreaterThan(0);
    expect(sumCounts(production(board, 'p0'))).toBe(0);
  });
});

describe('roadScore', () => {
  it('el mejor camino de un tablero vacío llega al mejor vértice', () => {
    const bestVertex = Math.max(...vertices.map((v) => vertexScore(board, v.id, 'p0')));
    const bestRoad = Math.max(
      ...board.board.topology.edges.map((e) => roadScore(board, e.id, 'p0')),
    );
    expect(bestRoad).toBeCloseTo(bestVertex, 9);
  });

  it('un camino que no lleva a ningún sitio donde poblar vale cero', () => {
    // con todos los vértices ocupados no hay dónde expandirse
    const full = vertices.reduce(
      (s, v) => ({
        ...s,
        buildings: { ...s.buildings, [v.id]: { owner: 'p1', kind: 'settlement' as const } },
      }),
      board,
    );
    const edge = board.board.topology.edges[0];
    expect(roadScore(full, edge?.id ?? '', 'p0')).toBe(0);
  });
});

describe('settlementSpots y upgradable', () => {
  it('tras la colocación inicial no hay sitio hasta alargar los caminos; luego sí', () => {
    const state = mainState();
    expect(settlementSpots(state, 'p0')).toEqual([]);
    const { state: grown, spot } = withSettlementSpot(state, 'p0');
    expect(settlementSpots(grown, 'p0')).toContain(spot);
    expect(settlementSpots(grown, 'p1')).not.toContain(spot);
  });

  it('upgradable lista solo los poblados del jugador', () => {
    const state = autoSetup(newGame(3, 'upgrade'));
    const mine = Object.entries(state.buildings).filter(([, b]) => b.owner === 'p0');
    expect(upgradable(state, 'p0').sort()).toEqual(mine.map(([v]) => v).sort());
    const first = mine[0]?.[0] ?? '';
    const city = place(state, first, 'p0', 'city');
    expect(upgradable(city, 'p0')).not.toContain(first);
  });
});

describe('targets', () => {
  it('con pocos edificios y sitio, primero poblado y después ciudad', () => {
    const { state } = withSettlementSpot(mainState(), 'p0');
    expect(targets(state, 'p0').map((t) => t.kind)).toEqual(['settlement', 'city', 'devCard']);
  });

  it('con cuatro edificios o más prefiere la ciudad', () => {
    const { state } = withSettlementSpot(withBuildings(mainState(), 'p0', 2), 'p0');
    expect(targets(state, 'p0').map((t) => t.kind)).toEqual(['city', 'settlement', 'devCard']);
  });

  it('sin sitio donde poblar quiere caminos', () => {
    expect(targets(mainState(), 'p0').map((t) => t.kind)).toEqual(['city', 'devCard', 'road']);
  });

  it('sin piezas de ciudad ni de poblado solo le quedan cartas y caminos', () => {
    const base = mainState();
    const state = {
      ...base,
      players: base.players.map((p) =>
        p.id === 'p0' ? { ...p, pieces: { ...p.pieces, settlements: 0, cities: 0 } } : p,
      ),
    };
    expect(targets(state, 'p0').map((t) => t.kind)).toEqual(['devCard', 'road']);
    const noRoads = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p0' ? { ...p, pieces: { ...p.pieces, roads: 0 } } : p,
      ),
    };
    expect(targets(noRoads, 'p0').map((t) => t.kind)).toEqual(['devCard']);
  });
});

describe('handValue y deficit', () => {
  const plan = [
    { kind: 'settlement', cost: COSTS.settlement },
    { kind: 'devCard', cost: COSTS.devCard },
  ] as const;

  it('valora más lo que acerca al primer objetivo que lo que sirve al siguiente o a nada', () => {
    const settle = { ...emptyCounts(), r1: 1, r2: 1, r3: 1, r4: 1 };
    const useless = { ...emptyCounts(), r5: 4 };
    expect(handValue(settle, plan)).toBeGreaterThan(handValue(useless, plan));
    // una carta útil más siempre sube el valor
    expect(handValue({ ...settle, r1: 2 }, plan)).toBeGreaterThan(handValue(settle, plan));
    expect(handValue(emptyCounts(), plan)).toBe(0);
  });

  it('cada carta se asigna a un solo objetivo', () => {
    // una sola lana no puede servir a la vez al poblado y a la carta
    const one = { ...emptyCounts(), r3: 1 };
    const two = { ...emptyCounts(), r3: 2 };
    expect(handValue(two, plan)).toBeGreaterThan(handValue(one, plan));
    expect(handValue(one, plan)).toBeCloseTo(3, 9);
  });

  it('deficit es lo que falta para pagar, sin negativos', () => {
    const hand = { ...emptyCounts(), r1: 3, r4: 1 };
    expect(deficit(hand, COSTS.settlement)).toEqual({ r1: 0, r2: 1, r3: 1, r4: 0, r5: 0 });
    expect(sumCounts(deficit(hand, COSTS.road))).toBe(1);
  });
});
