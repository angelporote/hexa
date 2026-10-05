import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { robberTargets, robberVictims } from '../rules/robber.js';
import { apply, forceRoll, newGame, place, setHand, toRollPhase } from '../test-utils.js';
import { createRng } from '../rng/rng.js';
import { totalCards } from '../state/resources.js';
import type { GameState } from '../state/types.js';

const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

/** Un hexágono distinto del actual con un vértice dado, para colocar víctimas. */
function targetHex(state: GameState) {
  const hex = state.board.topology.hexes.find((h) => h.id !== state.robber);
  if (!hex) throw new Error('sin hexágono');
  return hex;
}

describe('descarte tras un 7', () => {
  function discardState(): GameState {
    let s = toRollPhase(newGame(3));
    s = setHand(s, 'p1', { r1: 5, r2: 4 }); // debe 4
    s = setHand(s, 'p2', { r3: 8 }); // debe 4
    return apply(forceRoll(s, 7), 'p0', { type: 'ROLL' }).state;
  }

  it('cada jugador obligado descarta en cualquier orden y luego se mueve el ladrón', () => {
    let s = discardState();
    expect(s.phase).toEqual({ type: 'discard', owed: { p1: 4, p2: 4 } });
    s = apply(s, 'p2', { type: 'DISCARD', resources: { ...none, r3: 4 } }).state;
    expect(s.phase).toEqual({ type: 'discard', owed: { p1: 4 } });
    expect(s.bank.r3).toBe(23);
    s = apply(s, 'p1', { type: 'DISCARD', resources: { ...none, r1: 2, r2: 2 } }).state;
    expect(s.phase).toEqual({ type: 'robber', returnTo: 'main' });
    expect(totalCards(s.players[1]?.hand ?? none)).toBe(5);
  });

  it('rechaza cantidades erróneas, cartas que no tiene y jugadores sin deuda', () => {
    const s = discardState();
    expect(applyAction(s, 'p1', { type: 'DISCARD', resources: { ...none, r1: 3 } })).toEqual({
      ok: false,
      error: 'WRONG_DISCARD_AMOUNT',
    });
    expect(applyAction(s, 'p1', { type: 'DISCARD', resources: { ...none, r3: 4 } })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
    expect(
      applyAction(s, 'p1', { type: 'DISCARD', resources: { ...none, r1: 5, r2: -1 } }),
    ).toEqual({ ok: false, error: 'WRONG_DISCARD_AMOUNT' });
    expect(applyAction(s, 'p0', { type: 'DISCARD', resources: none })).toEqual({
      ok: false,
      error: 'NOTHING_TO_DISCARD',
    });
  });

  it('no se puede mover el ladrón mientras falta algún descarte', () => {
    const s = discardState();
    const hex = targetHex(s);
    expect(applyAction(s, 'p0', { type: 'MOVE_ROBBER', hex: hex.id, victim: null })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
  });
});

describe('mover el ladrón', () => {
  function robberState(): { s: GameState; hexId: string } {
    let s = toRollPhase(newGame(3));
    const hex = targetHex(s);
    s = place(s, hex.vertices[0] ?? '', 'p1');
    s = place(s, hex.vertices[3] ?? '', 'p2');
    s = setHand(s, 'p1', { r1: 2 });
    s = setHand(s, 'p2', {}); // sin cartas: no es víctima válida
    s = { ...s, phase: { type: 'robber', returnTo: 'main' } };
    return { s, hexId: hex.id };
  }

  it('calcula víctimas: adyacentes, ajenas y con cartas', () => {
    const { s, hexId } = robberState();
    expect(robberVictims(s, hexId, 'p0')).toEqual(['p1']);
    expect(robberVictims(s, hexId, 'p1')).toEqual([]);
    expect(robberTargets(s)).not.toContain(s.robber);
    expect(robberTargets(s)).toHaveLength(18);
  });

  it('mueve el ladrón y roba una carta al azar de la víctima', () => {
    const { s, hexId } = robberState();
    const r = apply(s, 'p0', { type: 'MOVE_ROBBER', hex: hexId, victim: 'p1' });
    expect(r.state.robber).toBe(hexId);
    expect(r.state.phase).toEqual({ type: 'main' });
    expect(r.state.players[0]?.hand.r1).toBe(1);
    expect(r.state.players[1]?.hand.r1).toBe(1);
    expect(r.events.map((e) => e.type)).toEqual(['ROBBER_MOVED', 'CARD_STOLEN']);
  });

  it('el evento de robo no revela qué carta se robó', () => {
    const { s, hexId } = robberState();
    const r = apply(s, 'p0', { type: 'MOVE_ROBBER', hex: hexId, victim: 'p1' });
    const stolen = r.events.find((e) => e.type === 'CARD_STOLEN');
    expect(Object.keys(stolen ?? {}).sort()).toEqual(['thief', 'type', 'victim']);
  });

  it('el robo elige entre todas las cartas con igual probabilidad', () => {
    const { s, hexId } = robberState();
    const mixed = setHand(s, 'p1', { r1: 1, r2: 1 });
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = apply({ ...mixed, rng: createRng(`steal-${i}`) }, 'p0', {
        type: 'MOVE_ROBBER',
        hex: hexId,
        victim: 'p1',
      });
      seen.add(r.state.players[0]?.hand.r1 === 1 ? 'r1' : 'r2');
    }
    expect(seen.size).toBe(2);
  });

  it('sin víctimas posibles, la víctima debe ser null', () => {
    const { s } = robberState();
    const empty = state0(s);
    expect(
      applyAction(empty.s, 'p0', { type: 'MOVE_ROBBER', hex: empty.hex, victim: null }).ok,
    ).toBe(true);
    expect(
      applyAction(empty.s, 'p0', { type: 'MOVE_ROBBER', hex: empty.hex, victim: 'p1' }),
    ).toEqual({ ok: false, error: 'INVALID_VICTIM' });
  });

  it('exige víctima válida cuando la hay', () => {
    const { s, hexId } = robberState();
    expect(applyAction(s, 'p0', { type: 'MOVE_ROBBER', hex: hexId, victim: null })).toEqual({
      ok: false,
      error: 'INVALID_VICTIM',
    });
    expect(applyAction(s, 'p0', { type: 'MOVE_ROBBER', hex: hexId, victim: 'p2' })).toEqual({
      ok: false,
      error: 'INVALID_VICTIM',
    });
    expect(applyAction(s, 'p0', { type: 'MOVE_ROBBER', hex: hexId, victim: 'p0' })).toEqual({
      ok: false,
      error: 'INVALID_VICTIM',
    });
  });

  it('debe moverse a otro hexágono existente, en su turno y en su fase', () => {
    const { s, hexId } = robberState();
    expect(applyAction(s, 'p0', { type: 'MOVE_ROBBER', hex: s.robber, victim: null })).toEqual({
      ok: false,
      error: 'ROBBER_MUST_MOVE',
    });
    expect(applyAction(s, 'p0', { type: 'MOVE_ROBBER', hex: 'nope', victim: null })).toEqual({
      ok: false,
      error: 'INVALID_HEX',
    });
    expect(applyAction(s, 'p1', { type: 'MOVE_ROBBER', hex: hexId, victim: 'p2' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(
      applyAction({ ...s, phase: { type: 'main' } }, 'p0', {
        type: 'MOVE_ROBBER',
        hex: hexId,
        victim: 'p1',
      }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('con returnTo roll vuelve a la fase de tirada', () => {
    const { s, hexId } = robberState();
    const r = apply({ ...s, phase: { type: 'robber', returnTo: 'roll' } }, 'p0', {
      type: 'MOVE_ROBBER',
      hex: hexId,
      victim: 'p1',
    });
    expect(r.state.phase).toEqual({ type: 'roll' });
  });
});

/** Variante sin edificios alrededor del hexágono objetivo. */
function state0(s: GameState): { s: GameState; hex: string } {
  const hex = s.board.topology.hexes.find(
    (h) => h.id !== s.robber && h.vertices.every((v) => !s.buildings[v]),
  );
  if (!hex) throw new Error('sin hexágono libre');
  return { s, hex: hex.id };
}
