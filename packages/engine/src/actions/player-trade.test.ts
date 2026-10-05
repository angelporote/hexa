import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { apply, newGame, setHand } from '../test-utils.js';
import type { GameState } from '../state/types.js';

const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
const give = { ...none, r1: 2 };
const want = { ...none, r2: 1 };

function base(): GameState {
  let s = newGame(4);
  s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 2 } };
  s = setHand(s, 'p0', { r1: 3 });
  s = setHand(s, 'p1', { r2: 2 });
  s = setHand(s, 'p2', { r2: 1 });
  return setHand(s, 'p3', {});
}

function offered(to: string[] | null = null): GameState {
  return apply(base(), 'p0', { type: 'OFFER_TRADE', to, give, want }).state;
}

describe('OFFER_TRADE', () => {
  it('crea una oferta visible con id y sin respuestas', () => {
    const r = apply(base(), 'p0', { type: 'OFFER_TRADE', to: null, give, want });
    expect(r.state.pendingTrade).toEqual({
      id: 1,
      from: 'p0',
      to: null,
      give,
      want,
      accepted: [],
      rejected: [],
    });
    expect(r.state.nextOfferId).toBe(2);
    expect(r.events[0]?.type).toBe('TRADE_OFFERED');
  });

  it('puede dirigirse a un jugador concreto', () => {
    expect(offered(['p1']).pendingTrade?.to).toEqual(['p1']);
  });

  it('solo el jugador activo, en fase main y con una oferta a la vez', () => {
    expect(
      applyAction(base(), 'p1', { type: 'OFFER_TRADE', to: null, give: want, want: give }),
    ).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(
      applyAction({ ...base(), phase: { type: 'roll' } }, 'p0', {
        type: 'OFFER_TRADE',
        to: null,
        give,
        want,
      }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(applyAction(offered(), 'p0', { type: 'OFFER_TRADE', to: null, give, want })).toEqual({
      ok: false,
      error: 'TRADE_PENDING',
    });
  });

  it('valida cantidades, solapes, destinatarios y que el oferente tenga lo ofrecido', () => {
    const s = base();
    const bad = (a: Parameters<typeof applyAction>[2]) => applyAction(s, 'p0', a);
    expect(bad({ type: 'OFFER_TRADE', to: null, give: none, want })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(bad({ type: 'OFFER_TRADE', to: null, give, want: none })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(bad({ type: 'OFFER_TRADE', to: null, give, want: { ...none, r1: 1 } })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(bad({ type: 'OFFER_TRADE', to: null, give: { ...none, r1: -1, r3: 3 }, want })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(bad({ type: 'OFFER_TRADE', to: [], give, want })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(bad({ type: 'OFFER_TRADE', to: ['p0'], give, want })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(bad({ type: 'OFFER_TRADE', to: ['zz'], give, want })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(bad({ type: 'OFFER_TRADE', to: null, give: { ...none, r1: 4 }, want })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
  });
});

describe('responder', () => {
  it('aceptar y rechazar quedan registrados y se pueden cambiar de opinión', () => {
    let s = offered();
    s = apply(s, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    s = apply(s, 'p3', { type: 'REJECT_TRADE', offerId: 1 }).state;
    expect(s.pendingTrade?.accepted).toEqual(['p1']);
    expect(s.pendingTrade?.rejected).toEqual(['p3']);
    s = apply(s, 'p1', { type: 'REJECT_TRADE', offerId: 1 }).state;
    expect(s.pendingTrade?.accepted).toEqual([]);
    expect(s.pendingTrade?.rejected).toEqual(['p3', 'p1']);
  });

  it('no se puede aceptar sin tener lo pedido ni repetir la misma respuesta', () => {
    const s = offered();
    expect(applyAction(s, 'p3', { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
    const once = apply(s, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    expect(applyAction(once, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'ALREADY_RESPONDED',
    });
  });

  it('solo responden los destinatarios; el oferente no', () => {
    const s = offered(['p1']);
    expect(applyAction(s, 'p2', { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'NOT_A_RECIPIENT',
    });
    expect(applyAction(s, 'p0', { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'NOT_A_RECIPIENT',
    });
  });

  it('ofertas inexistentes o ya cerradas', () => {
    expect(applyAction(offered(), 'p1', { type: 'ACCEPT_TRADE', offerId: 99 })).toEqual({
      ok: false,
      error: 'NO_SUCH_OFFER',
    });
    expect(applyAction(base(), 'p1', { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'NO_SUCH_OFFER',
    });
  });
});

describe('cancelar y confirmar', () => {
  it('el oferente puede cancelar; los demás no', () => {
    const s = offered();
    expect(applyAction(s, 'p1', { type: 'CANCEL_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(apply(s, 'p0', { type: 'CANCEL_TRADE', offerId: 1 }).state.pendingTrade).toBeNull();
  });

  it('confirmar intercambia las cartas con quien aceptó y cierra la oferta', () => {
    let s = offered();
    s = apply(s, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    s = apply(s, 'p2', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    const r = apply(s, 'p0', { type: 'CONFIRM_TRADE', offerId: 1, with: 'p2' });
    expect(r.state.pendingTrade).toBeNull();
    expect(r.state.players[0]?.hand).toEqual({ ...none, r1: 1, r2: 1 });
    expect(r.state.players[2]?.hand).toEqual({ ...none, r1: 2 });
    expect(r.state.players[1]?.hand).toEqual({ ...none, r2: 2 });
    expect(r.events).toEqual([{ type: 'TRADE_COMPLETED', offerId: 1, from: 'p0', with: 'p2' }]);
  });

  it('el intercambio conserva el total de cartas', () => {
    let s = offered();
    s = apply(s, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    const after = apply(s, 'p0', { type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' }).state;
    const sum = (st: GameState) =>
      st.players.reduce((n, p) => n + Object.values(p.hand).reduce((a, b) => a + b, 0), 0);
    expect(sum(after)).toBe(sum(s));
  });

  it('no se confirma con quien no aceptó, ni cuando las manos ya no alcanzan', () => {
    let s = offered();
    s = apply(s, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    expect(applyAction(s, 'p0', { type: 'CONFIRM_TRADE', offerId: 1, with: 'p2' })).toEqual({
      ok: false,
      error: 'NOT_ACCEPTED',
    });
    expect(applyAction(s, 'p1', { type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(
      applyAction(setHand(s, 'p1', {}), 'p0', { type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_RESOURCES' });
    expect(
      applyAction(setHand(s, 'p0', {}), 'p0', { type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_RESOURCES' });
  });

  it('la oferta caduca al terminar el turno', () => {
    const s = apply(offered(), 'p0', { type: 'END_TURN' }).state;
    expect(s.pendingTrade).toBeNull();
  });
});
