import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { COSTS } from '../rules/costs.js';
import { apply, newGame, place, setHand } from '../test-utils.js';
import type { GameState } from '../state/types.js';
import { totalCards } from '../state/resources.js';

const RICH = { r1: 10, r2: 10, r3: 10, r4: 10, r5: 10 };

/** Estado en fase main con p0 teniendo un poblado y un camino saliendo de él. */
function scenario(): { state: GameState; vertex: string; edge: string; farVertex: string } {
  let state = newGame(3);
  const v = state.board.topology.vertices.find((x) => x.neighbors.length === 3);
  if (!v) throw new Error('sin vértice');
  const edge = v.edges[0] ?? '';
  const e = state.board.topology.edgeById[edge];
  const farVertex = e?.vertices.find((x) => x !== v.id) ?? '';
  state = place(state, v.id, 'p0');
  state = {
    ...state,
    roads: { [edge]: 'p0' },
    phase: { type: 'main' },
    turn: { ...state.turn, number: 1 },
  };
  return { state: setHand(state, 'p0', RICH), vertex: v.id, edge, farVertex };
}

describe('BUILD_ROAD', () => {
  it('construye un camino conectado, cobra el coste y descuenta la pieza', () => {
    const { state, farVertex, edge } = scenario();
    const far = state.board.topology.vertexById[farVertex];
    const next = far?.edges.find((e) => e !== edge) ?? '';
    const r = apply(state, 'p0', { type: 'BUILD_ROAD', edge: next });
    expect(r.state.roads[next]).toBe('p0');
    expect(totalCards(r.state.players[0]?.hand ?? RICH)).toBe(50 - 2);
    expect(r.state.bank.r1).toBe(19 + COSTS.road.r1);
    expect(r.state.players[0]?.pieces.roads).toBe(15 - 1);
  });

  it('rechaza caminos no conectados, ocupados, inexistentes o sin recursos', () => {
    const { state, vertex, edge } = scenario();
    const isolated = state.board.topology.edges.find(
      (e) =>
        !e.vertices.includes(vertex) &&
        !state.roads[e.id] &&
        !e.vertices.some((v) => state.board.topology.vertexById[v]?.edges.includes(edge)),
    );
    expect(applyAction(state, 'p0', { type: 'BUILD_ROAD', edge: isolated?.id ?? '' })).toEqual({
      ok: false,
      error: 'NOT_CONNECTED',
    });
    expect(applyAction(state, 'p0', { type: 'BUILD_ROAD', edge })).toEqual({
      ok: false,
      error: 'EDGE_OCCUPIED',
    });
    expect(applyAction(state, 'p0', { type: 'BUILD_ROAD', edge: 'x' })).toEqual({
      ok: false,
      error: 'INVALID_EDGE',
    });
    const poor = setHand(state, 'p0', { r1: 1 });
    const adjacent = state.board.topology.vertexById[vertex]?.edges.find((e) => e !== edge) ?? '';
    expect(applyAction(poor, 'p0', { type: 'BUILD_ROAD', edge: adjacent })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
  });

  it('un edificio ajeno bloquea la continuación de la red', () => {
    const { state, farVertex, edge } = scenario();
    const blocked = place(state, farVertex, 'p1');
    const far = blocked.board.topology.vertexById[farVertex];
    const next = far?.edges.find((e) => e !== edge) ?? '';
    expect(applyAction(blocked, 'p0', { type: 'BUILD_ROAD', edge: next })).toEqual({
      ok: false,
      error: 'NOT_CONNECTED',
    });
  });

  it('respeta el límite de piezas', () => {
    const { state, vertex, edge } = scenario();
    const spent = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p0' ? { ...p, pieces: { ...p.pieces, roads: 0 } } : p,
      ),
    };
    const adjacent = state.board.topology.vertexById[vertex]?.edges.find((e) => e !== edge) ?? '';
    expect(applyAction(spent, 'p0', { type: 'BUILD_ROAD', edge: adjacent })).toEqual({
      ok: false,
      error: 'NO_PIECES_LEFT',
    });
  });

  it('solo en la fase main y del jugador activo', () => {
    const { state, vertex, edge } = scenario();
    const adjacent = state.board.topology.vertexById[vertex]?.edges.find((e) => e !== edge) ?? '';
    expect(
      applyAction({ ...state, phase: { type: 'roll' } }, 'p0', {
        type: 'BUILD_ROAD',
        edge: adjacent,
      }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(applyAction(state, 'p1', { type: 'BUILD_ROAD', edge: adjacent })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });
});

describe('BUILD_SETTLEMENT', () => {
  /** Dos aristas más allá del poblado inicial: vértice libre que cumple la distancia. */
  function twoAway(state: GameState, farVertex: string, edge: string) {
    const far = state.board.topology.vertexById[farVertex];
    const e2 = far?.edges.find((e) => e !== edge) ?? '';
    const target = state.board.topology.edgeById[e2]?.vertices.find((v) => v !== farVertex) ?? '';
    return { e2, target };
  }

  it('construye conectado por camino propio y respetando la distancia', () => {
    const { state, farVertex, edge } = scenario();
    const { e2, target } = twoAway(state, farVertex, edge);
    const withRoad = apply(state, 'p0', { type: 'BUILD_ROAD', edge: e2 }).state;
    const r = apply(withRoad, 'p0', { type: 'BUILD_SETTLEMENT', vertex: target });
    expect(r.state.buildings[target]).toEqual({ owner: 'p0', kind: 'settlement' });
    expect(r.state.players[0]?.pieces.settlements).toBe(5 - 1);
  });

  it('rechaza sin conexión, demasiado cerca u ocupado', () => {
    const { state, vertex, farVertex, edge } = scenario();
    expect(applyAction(state, 'p0', { type: 'BUILD_SETTLEMENT', vertex: farVertex })).toEqual({
      ok: false,
      error: 'TOO_CLOSE_TO_BUILDING',
    });
    expect(applyAction(state, 'p0', { type: 'BUILD_SETTLEMENT', vertex })).toEqual({
      ok: false,
      error: 'VERTEX_OCCUPIED',
    });
    const { target } = twoAway(state, farVertex, edge);
    expect(applyAction(state, 'p0', { type: 'BUILD_SETTLEMENT', vertex: target })).toEqual({
      ok: false,
      error: 'NOT_CONNECTED',
    });
  });

  it('exige los recursos', () => {
    const { state, farVertex, edge } = scenario();
    const { e2, target } = twoAway(state, farVertex, edge);
    const withRoad = apply(state, 'p0', { type: 'BUILD_ROAD', edge: e2 }).state;
    const poor = setHand(withRoad, 'p0', { r1: 1, r2: 1 });
    expect(applyAction(poor, 'p0', { type: 'BUILD_SETTLEMENT', vertex: target })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
  });
});

describe('BUILD_CITY', () => {
  it('mejora un poblado propio, cobra y devuelve la pieza de poblado', () => {
    const { state, vertex } = scenario();
    const r = apply(state, 'p0', { type: 'BUILD_CITY', vertex });
    expect(r.state.buildings[vertex]).toEqual({ owner: 'p0', kind: 'city' });
    const me = r.state.players[0];
    expect(me?.pieces.cities).toBe(3);
    expect(me?.pieces.settlements).toBe(6);
    expect(me?.hand.r5).toBe(10 - 3);
    expect(me?.hand.r4).toBe(10 - 2);
  });

  it('rechaza si no hay poblado propio, ya es ciudad o faltan recursos', () => {
    const { state, vertex } = scenario();
    expect(applyAction(place(state, vertex, 'p1'), 'p0', { type: 'BUILD_CITY', vertex })).toEqual({
      ok: false,
      error: 'NO_SETTLEMENT_TO_UPGRADE',
    });
    expect(
      applyAction(place(state, vertex, 'p0', 'city'), 'p0', { type: 'BUILD_CITY', vertex }),
    ).toEqual({ ok: false, error: 'NO_SETTLEMENT_TO_UPGRADE' });
    expect(
      applyAction(setHand(state, 'p0', { r4: 2, r5: 2 }), 'p0', { type: 'BUILD_CITY', vertex }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_RESOURCES' });
  });

  it('respeta el límite de 4 ciudades', () => {
    const { state, vertex } = scenario();
    const spent = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p0' ? { ...p, pieces: { ...p.pieces, cities: 0 } } : p,
      ),
    };
    expect(applyAction(spent, 'p0', { type: 'BUILD_CITY', vertex })).toEqual({
      ok: false,
      error: 'NO_PIECES_LEFT',
    });
  });
});
