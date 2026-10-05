import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { computeProduction } from '../rules/production.js';
import { apply, forceRoll, newGame, place, setHand, toRollPhase } from '../test-utils.js';
import type { GameState } from '../state/types.js';
import { totalCards } from '../state/resources.js';
import type { ResourceId } from '../board/types.js';

/** Un hexágono productor con ficha, junto con dos de sus vértices. */
function producingHex(state: GameState, number?: number) {
  const hex = state.board.topology.hexes.find((h) => {
    const t = state.board.hexes[h.id];
    return t && t.terrain !== 'none' && (number === undefined || t.number === number);
  });
  if (!hex) throw new Error('sin hexágono productor');
  const tile = state.board.hexes[hex.id];
  return { hex, number: tile?.number ?? 0, terrain: tile?.terrain as ResourceId };
}

describe('producción', () => {
  it('un poblado produce 1 y una ciudad 2 del recurso adyacente', () => {
    let state = toRollPhase(newGame(2));
    const { hex, number, terrain } = producingHex(state);
    const [a, b] = [hex.vertices[0] ?? '', hex.vertices[2] ?? ''];
    state = place(place(state, a, 'p0', 'settlement'), b, 'p1', 'city');
    const p = computeProduction(state, number);
    // otros hexágonos con la misma ficha pueden sumar; comprobamos al menos lo del hexágono
    expect((p.gains['p0']?.[terrain] ?? 0) >= 1).toBe(true);
    expect((p.gains['p1']?.[terrain] ?? 0) >= 2).toBe(true);
  });

  it('el ladrón bloquea la producción de su hexágono', () => {
    let state = toRollPhase(newGame(2));
    const { hex, number } = producingHex(state);
    state = place(state, hex.vertices[0] ?? '', 'p0');
    const sameNumber = state.board.topology.hexes.filter(
      (h) => state.board.hexes[h.id]?.number === number,
    );
    const free = computeProduction(state, number);
    const blocked = computeProduction({ ...state, robber: hex.id }, number);
    const total = (g: typeof free.gains) => Object.values(g).reduce((s, c) => s + totalCards(c), 0);
    expect(total(free.gains)).toBeGreaterThan(total(blocked.gains));
    expect(sameNumber.length).toBeGreaterThan(0);
  });

  it('escasez: con varios jugadores reclamando, nadie recibe ese recurso', () => {
    let state = toRollPhase(newGame(2));
    const { hex, number, terrain } = producingHex(state);
    state = place(place(state, hex.vertices[0] ?? '', 'p0'), hex.vertices[2] ?? '', 'p1');
    state = { ...state, bank: { ...state.bank, [terrain]: 1 } };
    const p = computeProduction(state, number);
    expect(p.shortages).toContain(terrain);
    expect(p.gains['p0']?.[terrain] ?? 0).toBe(0);
    expect(p.gains['p1']?.[terrain] ?? 0).toBe(0);
  });

  it('escasez: con un solo jugador recibe lo que quede en el banco', () => {
    let state = toRollPhase(newGame(2));
    const { hex, number, terrain } = producingHex(state);
    state = place(state, hex.vertices[0] ?? '', 'p0', 'city');
    state = { ...state, bank: { ...state.bank, [terrain]: 1 } };
    const p = computeProduction(state, number);
    expect(p.shortages).toContain(terrain);
    expect(p.gains['p0']?.[terrain]).toBe(1);
  });
});

describe('ROLL', () => {
  it('reparte recursos, pasa a main y registra la tirada', () => {
    let state = toRollPhase(newGame(2));
    const { hex, number, terrain } = producingHex(state);
    state = place(state, hex.vertices[0] ?? '', 'p0');
    state = forceRoll(state, number);
    const before = totalCards(state.players[0]?.hand ?? { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 });
    const { state: next, events } = apply(state, 'p0', { type: 'ROLL' });
    expect(next.phase).toEqual({ type: 'main' });
    expect(next.turn.lastRoll).not.toBeNull();
    expect(events[0]?.type).toBe('DICE_ROLLED');
    expect(
      totalCards(next.players[0]?.hand ?? { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 }),
    ).toBeGreaterThan(before);
    const bankDelta = 19 - next.bank[terrain];
    expect(bankDelta).toBeGreaterThan(0);
  });

  it('conserva los recursos totales entre banco y manos', () => {
    let state = toRollPhase(newGame(3));
    const { hex, number } = producingHex(state);
    state = place(place(state, hex.vertices[0] ?? '', 'p0', 'city'), hex.vertices[3] ?? '', 'p1');
    const total = (s: GameState) =>
      Object.values(s.bank).reduce((a, b) => a + b, 0) +
      s.players.reduce((sum, p) => sum + totalCards(p.hand), 0);
    const { state: next } = apply(forceRoll(state, number), 'p0', { type: 'ROLL' });
    expect(total(next)).toBe(total(state));
  });

  it('un 7 no produce nada y abre el movimiento del ladrón si nadie debe descartar', () => {
    const state = forceRoll(toRollPhase(newGame(2)), 7);
    const { state: next } = apply(state, 'p0', { type: 'ROLL' });
    expect(next.turn.lastRoll?.[0]).toBeDefined();
    expect(next.phase).toEqual({ type: 'robber', returnTo: 'main' });
  });

  it('un 7 obliga a descartar la mitad a quien supera el límite', () => {
    let state = toRollPhase(newGame(3));
    state = setHand(state, 'p1', { r1: 5, r2: 4 }); // 9 cartas -> 4
    state = setHand(state, 'p2', { r1: 7 }); // 7 cartas: no descarta
    const { state: next } = apply(forceRoll(state, 7), 'p0', { type: 'ROLL' });
    expect(next.phase).toEqual({ type: 'discard', owed: { p1: 4 } });
  });

  it('rechaza tirar fuera de turno, dos veces o en otra fase', () => {
    const state = toRollPhase(newGame(2));
    expect(applyAction(state, 'p1', { type: 'ROLL' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    const rolled = apply(forceRoll(state, 6), 'p0', { type: 'ROLL' }).state;
    expect(applyAction(rolled, 'p0', { type: 'ROLL' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
  });

  it('es reproducible: mismo estado, misma tirada', () => {
    const state = toRollPhase(newGame(2));
    const a = apply(state, 'p0', { type: 'ROLL' }).state;
    const b = apply(state, 'p0', { type: 'ROLL' }).state;
    expect(a).toEqual(b);
  });
});
