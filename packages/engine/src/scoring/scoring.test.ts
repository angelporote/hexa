import { describe, expect, it } from 'vitest';
import { apply, findChain, giveRoads, newGame, place, setHand } from '../test-utils.js';
import { resolveHolder, updateAwards } from './awards.js';
import { longestRoadLength } from './longest-road.js';
import type { GameState } from '../state/types.js';

const base = (): GameState => newGame(4);

function ring(state: GameState): { edges: string[]; vertices: string[] } {
  const hex = state.board.topology.hexById['h0,0'];
  if (!hex) throw new Error('sin hexágono central');
  return { edges: [...hex.edges], vertices: [...hex.vertices] };
}

describe('camino más largo: longitud', () => {
  it('sin caminos es 0 y con uno es 1', () => {
    const s = base();
    expect(longestRoadLength(s, 'p0')).toBe(0);
    expect(longestRoadLength(giveRoads(s, 'p0', findChain(s, 1).edges), 'p0')).toBe(1);
  });

  it('una cadena cuenta todas sus aristas', () => {
    const s = base();
    for (const n of [2, 5, 8, 12]) {
      expect(longestRoadLength(giveRoads(s, 'p0', findChain(s, n).edges), 'p0')).toBe(n);
    }
  });

  it('no mezcla los caminos de otros jugadores', () => {
    const s = base();
    const mine = findChain(s, 3);
    const theirs = findChain(s, 6, new Set(mine.edges));
    const t = giveRoads(giveRoads(s, 'p0', mine.edges), 'p1', theirs.edges);
    expect(longestRoadLength(t, 'p0')).toBe(3);
    expect(longestRoadLength(t, 'p1')).toBe(6);
  });

  it('ramificación: con tres brazos de 2 el máximo es 4 (dos brazos)', () => {
    const s = base();
    const center = s.board.topology.vertices.find(
      (v) =>
        v.edges.length === 3 &&
        v.neighbors.every((n) => (s.board.topology.vertexById[n]?.edges.length ?? 0) === 3),
    );
    if (!center) throw new Error('sin vértice interior');
    const edges: string[] = [];
    for (const e of center.edges) {
      edges.push(e);
      const arm = s.board.topology.edgeById[e]?.vertices.find((v) => v !== center.id) ?? '';
      const more = s.board.topology.vertexById[arm]?.edges.find((x) => x !== e) ?? '';
      edges.push(more);
    }
    expect(edges).toHaveLength(6);
    expect(longestRoadLength(giveRoads(s, 'p0', edges), 'p0')).toBe(4);
  });

  it('un ciclo cuenta entero', () => {
    const s = base();
    expect(longestRoadLength(giveRoads(s, 'p0', ring(s).edges), 'p0')).toBe(6);
  });

  it('un ciclo con cola suma el ciclo completo más la cola', () => {
    const s = base();
    const { edges, vertices } = ring(s);
    const start = vertices[0] ?? '';
    const tail1 = s.board.topology.vertexById[start]?.edges.find((e) => !edges.includes(e)) ?? '';
    const mid = s.board.topology.edgeById[tail1]?.vertices.find((v) => v !== start) ?? '';
    const tail2 = s.board.topology.vertexById[mid]?.edges.find((e) => e !== tail1) ?? '';
    expect(longestRoadLength(giveRoads(s, 'p0', [...edges, tail1, tail2]), 'p0')).toBe(8);
  });

  it('un edificio ajeno en mitad de la cadena la corta', () => {
    const s = base();
    const chain = findChain(s, 6);
    const cut = place(giveRoads(s, 'p0', chain.edges), chain.vertices[3] ?? '', 'p1');
    expect(longestRoadLength(cut, 'p0')).toBe(3);
  });

  it('un edificio propio no corta', () => {
    const s = base();
    const chain = findChain(s, 6);
    const own = place(giveRoads(s, 'p0', chain.edges), chain.vertices[3] ?? '', 'p0');
    expect(longestRoadLength(own, 'p0')).toBe(6);
  });

  it('un edificio ajeno en un extremo no recorta la cadena', () => {
    const s = base();
    const chain = findChain(s, 6);
    const end = place(giveRoads(s, 'p0', chain.edges), chain.vertices[6] ?? '', 'p1');
    expect(longestRoadLength(end, 'p0')).toBe(6);
    const start = place(giveRoads(s, 'p0', chain.edges), chain.vertices[0] ?? '', 'p1');
    expect(longestRoadLength(start, 'p0')).toBe(6);
  });

  it('un edificio ajeno sobre un ciclo no lo rompe (el camino empieza y acaba allí)', () => {
    const s = base();
    const { edges, vertices } = ring(s);
    const t = place(giveRoads(s, 'p0', edges), vertices[2] ?? '', 'p1');
    expect(longestRoadLength(t, 'p0')).toBe(6);
  });

  it('un cruce cortado por un edificio ajeno separa los tramos', () => {
    const s = base();
    const { edges, vertices } = ring(s);
    const start = vertices[0] ?? '';
    const tail = s.board.topology.vertexById[start]?.edges.find((e) => !edges.includes(e)) ?? '';
    // El edificio ajeno sobre el nudo impide enlazar la cola con el ciclo.
    const t = place(giveRoads(s, 'p0', [...edges, tail]), start, 'p1');
    expect(longestRoadLength(t, 'p0')).toBe(6);
  });
});

describe('resolveHolder', () => {
  const scores = (o: Record<string, number>) => new Map(Object.entries(o));

  it('exige el mínimo y un único líder', () => {
    expect(resolveHolder(scores({ a: 4, b: 2 }), 5, null)).toBeNull();
    expect(resolveHolder(scores({ a: 5, b: 2 }), 5, null)).toBe('a');
    expect(resolveHolder(scores({ a: 5, b: 5 }), 5, null)).toBeNull();
  });

  it('el titular conserva el premio si sigue empatado en cabeza', () => {
    expect(resolveHolder(scores({ a: 5, b: 5 }), 5, 'a')).toBe('a');
    expect(resolveHolder(scores({ a: 5, b: 5 }), 5, 'b')).toBe('b');
  });

  it('se transfiere solo con ventaja estricta', () => {
    expect(resolveHolder(scores({ a: 5, b: 6 }), 5, 'a')).toBe('b');
  });

  it('si el titular cae y varios empatan por delante, queda vacante', () => {
    expect(resolveHolder(scores({ a: 3, b: 5, c: 5 }), 5, 'a')).toBeNull();
  });

  it('si el titular cae por debajo del mínimo, queda vacante', () => {
    expect(resolveHolder(scores({ a: 4, b: 2 }), 5, 'a')).toBeNull();
  });
});

describe('bonificaciones', () => {
  it('camino más largo: se concede al llegar a 5 y emite un evento', () => {
    const s = base();
    const chain = findChain(s, 5);
    const four = giveRoads(s, 'p0', chain.edges.slice(0, 4));
    expect(updateAwards(four).state.awards.longestRoad).toBeNull();
    const five = updateAwards(giveRoads(s, 'p0', chain.edges));
    expect(five.state.awards.longestRoad).toBe('p0');
    expect(five.events).toEqual([
      { type: 'AWARD_CHANGED', award: 'longestRoad', holder: 'p0', previous: null },
    ]);
  });

  it('un empate no quita el premio al titular; una ventaja estricta sí', () => {
    const s = base();
    const a = findChain(s, 5);
    const b = findChain(s, 7, new Set(a.edges));
    let t = giveRoads(s, 'p0', a.edges);
    t = updateAwards(t).state;
    t = updateAwards(giveRoads(t, 'p1', b.edges.slice(0, 5))).state;
    expect(t.awards.longestRoad).toBe('p0');
    t = updateAwards(giveRoads(t, 'p1', b.edges.slice(0, 6))).state;
    expect(t.awards.longestRoad).toBe('p1');
  });

  it('cortar el camino del titular transfiere el premio al siguiente (o lo deja vacante)', () => {
    const s = base();
    const a = findChain(s, 6);
    const b = findChain(s, 5, new Set(a.edges));
    let t = updateAwards(giveRoads(giveRoads(s, 'p0', a.edges), 'p1', b.edges)).state;
    expect(t.awards.longestRoad).toBe('p0');
    // un edificio de p2 corta la cadena de p0 por la mitad
    t = updateAwards(place(t, a.vertices[3] ?? '', 'p2')).state;
    expect(t.awards.longestRoad).toBe('p1');
    // si p1 tampoco llega a 5 tras otro corte, nadie lo tiene
    t = updateAwards(place(t, b.vertices[2] ?? '', 'p2')).state;
    expect(t.awards.longestRoad).toBeNull();
  });

  it('mayor ejército: 3 cartas para obtenerlo y ventaja estricta para quitarlo', () => {
    let s = base();
    const setArmies = (st: GameState, id: string, n: number): GameState => ({
      ...st,
      players: st.players.map((p) => (p.id === id ? { ...p, armiesPlayed: n } : p)),
    });
    s = updateAwards(setArmies(s, 'p0', 2)).state;
    expect(s.awards.largestArmy).toBeNull();
    s = updateAwards(setArmies(s, 'p0', 3)).state;
    expect(s.awards.largestArmy).toBe('p0');
    s = updateAwards(setArmies(s, 'p1', 3)).state;
    expect(s.awards.largestArmy).toBe('p0');
    s = updateAwards(setArmies(s, 'p1', 4)).state;
    expect(s.awards.largestArmy).toBe('p1');
  });

  it('applyAction recalcula las bonificaciones al construir el quinto camino', () => {
    const s0 = base();
    const chain = findChain(s0, 5);
    let s = giveRoads(s0, 'p0', chain.edges.slice(0, 4));
    s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 1 } };
    s = setHand(s, 'p0', { r1: 1, r2: 1 });
    const r = apply(s, 'p0', { type: 'BUILD_ROAD', edge: chain.edges[4] ?? '' });
    expect(r.state.awards.longestRoad).toBe('p0');
    expect(r.events.at(-1)).toEqual({
      type: 'AWARD_CHANGED',
      award: 'longestRoad',
      holder: 'p0',
      previous: null,
    });
  });

  it('jugar la tercera carta de ejército concede el premio', () => {
    let s = { ...base(), phase: { type: 'main' } as const };
    s = { ...s, turn: { ...s.turn, number: 9 } };
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p0'
          ? { ...p, armiesPlayed: 2, devCards: [{ card: 'army' as const, boughtOnTurn: 1 }] }
          : p,
      ),
    };
    const r = apply(s, 'p0', { type: 'PLAY_ARMY' });
    expect(r.state.awards.largestArmy).toBe('p0');
  });
});
