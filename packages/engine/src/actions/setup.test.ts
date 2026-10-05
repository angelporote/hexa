import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { apply, autoSetup, deepFreeze, newGame } from '../test-utils.js';
import { totalCards } from '../state/resources.js';
import type { GameState } from '../state/types.js';

function firstFreeVertex(state: GameState): string {
  const v = state.board.topology.vertices.find((x) => !state.buildings[x.id]);
  if (!v) throw new Error('sin vértices');
  return v.id;
}

describe('colocación inicial', () => {
  it('sigue el orden de ida y vuelta y termina en el primer jugador', () => {
    for (const n of [2, 3, 4]) {
      let state = newGame(n);
      const order: string[] = [];
      while (state.phase.type === 'setup') {
        order.push(state.turn.player);
        const player = state.turn.player;
        const vertex = state.board.topology.vertices.find(
          (v) => !state.buildings[v.id] && v.neighbors.every((nb) => !state.buildings[nb]),
        );
        if (!vertex) throw new Error('sin vértice');
        state = apply(state, player, { type: 'BUILD_SETTLEMENT', vertex: vertex.id }).state;
        const edge = vertex.edges[0];
        if (!edge) throw new Error('sin arista');
        state = apply(state, player, { type: 'BUILD_ROAD', edge }).state;
      }
      const ids = ['p0', 'p1', 'p2', 'p3'].slice(0, n);
      expect(order).toEqual([...ids, ...[...ids].reverse()]);
      expect(state.phase).toEqual({ type: 'roll' });
      expect(state.turn.player).toBe('p0');
      expect(state.turn.number).toBe(1);
    }
  });

  it('la primera colocación no da recursos; la segunda da uno por terreno productor adyacente', () => {
    let state = newGame(3, 'res');
    state = autoSetup(state);
    // 3 jugadores: los 3 primeros poblados no dan nada, los 3 segundos sí
    const total = state.players.reduce((sum, p) => sum + totalCards(p.hand), 0);
    const expected = state.log
      .filter((e, i) => e.action.type === 'BUILD_SETTLEMENT' && i >= 6)
      .reduce((sum, e) => {
        if (e.action.type !== 'BUILD_SETTLEMENT') return sum;
        const hexes = state.board.topology.vertexById[e.action.vertex]?.hexes ?? [];
        return sum + hexes.filter((h) => state.board.hexes[h]?.terrain !== 'none').length;
      }, 0);
    expect(total).toBe(expected);
    // el banco refleja lo entregado
    const bankTotal = Object.values(state.bank).reduce((a, b) => a + b, 0);
    expect(bankTotal).toBe(95 - total);
  });

  it('descuenta piezas y registra las acciones', () => {
    const state = autoSetup(newGame(4));
    for (const p of state.players) {
      expect(p.pieces).toEqual({ roads: 13, settlements: 3, cities: 4 });
    }
    expect(state.log).toHaveLength(16);
    expect(Object.keys(state.buildings)).toHaveLength(8);
    expect(Object.keys(state.roads)).toHaveLength(8);
  });

  it('rechaza actuar fuera de turno', () => {
    const state = newGame(4);
    const r = applyAction(state, 'p1', {
      type: 'BUILD_SETTLEMENT',
      vertex: firstFreeVertex(state),
    });
    expect(r).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('rechaza vértices inexistentes, ocupados y demasiado cercanos', () => {
    const state = newGame(4);
    const v = state.board.topology.vertices[0];
    if (!v) throw new Error('sin vértices');
    expect(applyAction(state, 'p0', { type: 'BUILD_SETTLEMENT', vertex: 'nope' })).toEqual({
      ok: false,
      error: 'INVALID_VERTEX',
    });
    const placed = apply(state, 'p0', { type: 'BUILD_SETTLEMENT', vertex: v.id }).state;
    const road = apply(placed, 'p0', { type: 'BUILD_ROAD', edge: v.edges[0] ?? '' }).state;
    expect(applyAction(road, 'p1', { type: 'BUILD_SETTLEMENT', vertex: v.id })).toEqual({
      ok: false,
      error: 'VERTEX_OCCUPIED',
    });
    const neighbor = v.neighbors[0] ?? '';
    expect(applyAction(road, 'p1', { type: 'BUILD_SETTLEMENT', vertex: neighbor })).toEqual({
      ok: false,
      error: 'TOO_CLOSE_TO_BUILDING',
    });
  });

  it('exige poblado antes que camino y camino antes que otro poblado', () => {
    const state = newGame(4);
    const v = state.board.topology.vertices[0];
    if (!v) throw new Error('sin vértices');
    expect(applyAction(state, 'p0', { type: 'BUILD_ROAD', edge: v.edges[0] ?? '' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
    const placed = apply(state, 'p0', { type: 'BUILD_SETTLEMENT', vertex: v.id }).state;
    const other = state.board.topology.vertices.find(
      (x) => x.id !== v.id && !v.neighbors.includes(x.id),
    );
    expect(
      applyAction(placed, 'p0', { type: 'BUILD_SETTLEMENT', vertex: other?.id ?? '' }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('el camino inicial debe tocar el poblado recién colocado', () => {
    const state = newGame(4);
    const v = state.board.topology.vertices[0];
    if (!v) throw new Error('sin vértices');
    const placed = apply(state, 'p0', { type: 'BUILD_SETTLEMENT', vertex: v.id }).state;
    const far = state.board.topology.edges.find((e) => !v.edges.includes(e.id));
    expect(applyAction(placed, 'p0', { type: 'BUILD_ROAD', edge: far?.id ?? '' })).toEqual({
      ok: false,
      error: 'NOT_CONNECTED',
    });
    expect(applyAction(placed, 'p0', { type: 'BUILD_ROAD', edge: 'nope' })).toEqual({
      ok: false,
      error: 'INVALID_EDGE',
    });
  });

  it('no muta el estado recibido', () => {
    const state = deepFreeze(newGame(4));
    expect(() => autoSetup(state)).not.toThrow();
  });
});
