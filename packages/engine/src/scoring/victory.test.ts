import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions/apply.js';
import {
  apply,
  findChain,
  giveRoads,
  newGame,
  place,
  setHand,
  toRollPhase,
} from '../test-utils.js';
import { publicPoints, totalPoints } from './points.js';
import type { GameState } from '../state/types.js';

/** `n` puntos en edificios para `player`: ciudades (2) y, si sobra uno, un poblado. */
function withBuildingPoints(state: GameState, player: string, n: number): GameState {
  const free = state.board.topology.vertices.filter((v) => !state.buildings[v.id]);
  const picked: string[] = [];
  for (const v of free) {
    if (picked.every((p) => !state.board.topology.vertexById[p]?.neighbors.includes(v.id)))
      picked.push(v.id);
  }
  let s = state;
  let remaining = n;
  for (const id of picked) {
    if (remaining <= 0) break;
    const city = remaining >= 2;
    s = place(s, id, player, city ? 'city' : 'settlement');
    remaining -= city ? 2 : 1;
  }
  if (remaining > 0) throw new Error('no caben tantos edificios');
  return s;
}

const withPointCards = (s: GameState, player: string, n: number): GameState => ({
  ...s,
  players: s.players.map((p) =>
    p.id === player
      ? {
          ...p,
          devCards: Array.from({ length: n }, () => ({ card: 'point' as const, boughtOnTurn: 0 })),
        }
      : p,
  ),
});

describe('puntos', () => {
  it('poblado 1, ciudad 2, camino más largo 2, mayor ejército 2', () => {
    let s = newGame(3);
    s = withBuildingPoints(s, 'p0', 3); // ciudad + poblado
    expect(publicPoints(s, 'p0')).toBe(3);
    s = { ...s, awards: { longestRoad: 'p0', largestArmy: 'p0' } };
    expect(publicPoints(s, 'p0')).toBe(7);
    expect(publicPoints(s, 'p1')).toBe(0);
  });

  it('las cartas de punto solo cuentan en el total, no en lo público', () => {
    const s = withPointCards(withBuildingPoints(newGame(3), 'p0', 4), 'p0', 2);
    expect(publicPoints(s, 'p0')).toBe(4);
    expect(totalPoints(s, 'p0')).toBe(6);
  });
});

describe('victoria', () => {
  it('con 10 puntos en el turno propio, gana tras la acción', () => {
    let s = withBuildingPoints(toRollPhase(newGame(3)), 'p0', 9);
    s = withPointCards(s, 'p0', 1);
    const r = apply(s, 'p0', { type: 'ROLL' });
    expect(r.state.winner).toBe('p0');
    expect(r.state.phase).toEqual({ type: 'ended' });
    expect(r.events.at(-1)).toEqual({ type: 'GAME_WON', player: 'p0', points: 10 });
  });

  it('con 9 no gana', () => {
    const s = withBuildingPoints(toRollPhase(newGame(3)), 'p0', 9);
    const r = apply(s, 'p0', { type: 'ROLL' });
    expect(r.state.winner).toBeNull();
    expect(r.state.phase.type).not.toBe('ended');
  });

  it('construir una ciudad que da el décimo punto termina la partida', () => {
    let s = withBuildingPoints(newGame(3), 'p0', 8);
    // un poblado propio extra para mejorarlo: 8 + 1 (poblado) = 9, ciudad -> 10
    const free = s.board.topology.vertices.find(
      (v) => !s.buildings[v.id] && v.neighbors.every((n) => !s.buildings[n]),
    );
    if (!free) throw new Error('sin vértice');
    s = place(s, free.id, 'p0');
    s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 4 } };
    s = setHand(s, 'p0', { r4: 2, r5: 3 });
    const r = apply(s, 'p0', { type: 'BUILD_CITY', vertex: free.id });
    expect(r.state.winner).toBe('p0');
    expect(r.state.phase).toEqual({ type: 'ended' });
  });

  it('tras terminar, ninguna acción es válida', () => {
    let s = withPointCards(withBuildingPoints(toRollPhase(newGame(3)), 'p0', 9), 'p0', 1);
    s = apply(s, 'p0', { type: 'ROLL' }).state;
    expect(applyAction(s, 'p0', { type: 'END_TURN' })).toEqual({ ok: false, error: 'GAME_OVER' });
    expect(applyAction(s, 'p1', { type: 'ROLL' })).toEqual({ ok: false, error: 'GAME_OVER' });
  });

  it('quien alcanza 10 en turno ajeno gana al empezar su turno', () => {
    // p1 suma 10 puntos durante el turno de p0 (p. ej. por una bonificación): gana en su turno
    let s = withBuildingPoints(newGame(3), 'p1', 10);
    s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, player: 'p0', number: 3 } };
    const r = apply(s, 'p0', { type: 'END_TURN' });
    expect(r.state.winner).toBe('p1');
    expect(r.state.phase).toEqual({ type: 'ended' });
  });

  it('no se comprueba en la colocación inicial', () => {
    const s = withBuildingPoints(newGame(3), 'p0', 10);
    const v = s.board.topology.vertices.find(
      (x) => !s.buildings[x.id] && x.neighbors.every((n) => !s.buildings[n]),
    );
    const r = apply(s, 'p0', { type: 'BUILD_SETTLEMENT', vertex: v?.id ?? '' });
    expect(r.state.winner).toBeNull();
    expect(r.state.phase.type).toBe('setup');
  });

  it('la bonificación de camino más largo puede dar la victoria', () => {
    let s = withBuildingPoints(newGame(3), 'p0', 8);
    const chain = findChain(s, 5);
    s = giveRoads(s, 'p0', chain.edges.slice(0, 4));
    s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 6 } };
    s = setHand(s, 'p0', { r1: 1, r2: 1 });
    // El camino puede toparse con edificios propios, pero no con ajenos; no hay ajenos aquí.
    const r = apply(s, 'p0', { type: 'BUILD_ROAD', edge: chain.edges[4] ?? '' });
    expect(r.state.awards.longestRoad).toBe('p0');
    expect(r.state.winner).toBe('p0');
  });
});
