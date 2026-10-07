import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { canCounterTrade, legalActions } from '../views/legal-actions.js';
import { getPlayerView } from '../views/player-view.js';
import { apply, newGame, setHand } from '../test-utils.js';
import type { GameState } from '../state/types.js';

const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
const give = { ...none, r1: 2 };
const want = { ...none, r2: 1 };

/** p0 ofrece 2 de r1 por 1 de r2 a todos. p1 tiene r2 y r3; p2 tiene r2; p3 no tiene nada. */
function offered(): GameState {
  let s = newGame(4);
  s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 2 } };
  s = setHand(s, 'p0', { r1: 3, r5: 1 });
  s = setHand(s, 'p1', { r2: 2, r3: 2 });
  s = setHand(s, 'p2', { r2: 1 });
  s = setHand(s, 'p3', {});
  return apply(s, 'p0', { type: 'OFFER_TRADE', to: null, give, want }).state;
}

describe('COUNTER_TRADE', () => {
  it('un destinatario propone otras condiciones, que quedan visibles en la oferta', () => {
    const r = apply(offered(), 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 2 },
      want: { ...none, r1: 1 },
    });
    expect(r.state.pendingTrade?.counters).toEqual([
      { from: 'p1', give: { ...none, r3: 2 }, want: { ...none, r1: 1 } },
    ]);
    expect(r.events).toEqual([{ type: 'TRADE_COUNTERED', player: 'p1', offerId: 1 }]);
  });

  it('sustituye a su respuesta anterior: aceptar, rechazar o contraofertar son excluyentes', () => {
    let s = apply(offered(), 'p1', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    expect(s.pendingTrade?.accepted).toEqual(['p1']);
    s = apply(s, 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 1 },
      want: { ...none, r1: 1 },
    }).state;
    expect(s.pendingTrade?.accepted).toEqual([]);
    expect(s.pendingTrade?.counters).toHaveLength(1);
    // una segunda contraoferta reemplaza a la primera
    s = apply(s, 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 2 },
      want: { ...none, r1: 1 },
    }).state;
    expect(s.pendingTrade?.counters).toHaveLength(1);
    expect(s.pendingTrade?.counters[0]?.give.r3).toBe(2);
    // y rechazar o aceptar de nuevo retira la contraoferta
    s = apply(s, 'p1', { type: 'REJECT_TRADE', offerId: 1 }).state;
    expect(s.pendingTrade?.counters).toEqual([]);
    expect(s.pendingTrade?.rejected).toEqual(['p1']);
    s = apply(s, 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 1 },
      want: { ...none, r1: 1 },
    }).state;
    expect(s.pendingTrade?.rejected).toEqual([]);
  });

  it('valida cantidades, solape de recursos y que quien contraoferta tenga lo que da', () => {
    const s = offered();
    const counter = (g: object, w: object) =>
      applyAction(s, 'p1', {
        type: 'COUNTER_TRADE',
        offerId: 1,
        give: { ...none, ...g },
        want: { ...none, ...w },
      });
    expect(counter({}, { r1: 1 })).toEqual({ ok: false, error: 'INVALID_TRADE' });
    expect(counter({ r3: 1 }, {})).toEqual({ ok: false, error: 'INVALID_TRADE' });
    expect(counter({ r3: 1 }, { r3: 1 })).toEqual({ ok: false, error: 'INVALID_TRADE' });
    expect(counter({ r3: -1 }, { r1: 1 })).toEqual({ ok: false, error: 'INVALID_TRADE' });
    expect(counter({ r3: 5 }, { r1: 1 })).toEqual({ ok: false, error: 'NOT_ENOUGH_RESOURCES' });
  });

  it('solo los destinatarios, y con la oferta abierta', () => {
    const s = offered();
    const action = {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 1 },
      want: { ...none, r1: 1 },
    } as const;
    expect(applyAction(s, 'p0', action)).toEqual({ ok: false, error: 'NOT_A_RECIPIENT' });
    expect(applyAction(s, 'p1', { ...action, offerId: 9 })).toEqual({
      ok: false,
      error: 'NO_SUCH_OFFER',
    });
    const targeted = apply({ ...s, pendingTrade: null }, 'p0', {
      type: 'OFFER_TRADE',
      to: ['p2'],
      give,
      want,
    }).state;
    expect(
      applyAction(targeted, 'p1', { ...action, offerId: targeted.pendingTrade?.id ?? 0 }),
    ).toEqual({
      ok: false,
      error: 'NOT_A_RECIPIENT',
    });
  });
});

describe('CONFIRM_COUNTER', () => {
  const counterState = (): GameState =>
    apply(offered(), 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 2 },
      want: { ...none, r1: 1 },
    }).state;

  it('el oferente cierra el trato con las condiciones de la contraoferta', () => {
    const r = apply(counterState(), 'p0', { type: 'CONFIRM_COUNTER', offerId: 1, with: 'p1' });
    // p0 entrega lo que p1 pedía (1 de r1) y recibe lo que p1 daba (2 de r3)
    expect(r.state.players[0]?.hand).toEqual({ ...none, r1: 2, r3: 2, r5: 1 });
    expect(r.state.players[1]?.hand).toEqual({ ...none, r1: 1, r2: 2 });
    expect(r.state.pendingTrade).toBeNull();
    expect(r.events).toEqual([{ type: 'TRADE_COMPLETED', offerId: 1, from: 'p0', with: 'p1' }]);
  });

  it('no se puede confirmar sin contraoferta, ni por quien no es el oferente', () => {
    const s = counterState();
    expect(applyAction(s, 'p0', { type: 'CONFIRM_COUNTER', offerId: 1, with: 'p2' })).toEqual({
      ok: false,
      error: 'NO_COUNTER',
    });
    expect(applyAction(s, 'p1', { type: 'CONFIRM_COUNTER', offerId: 1, with: 'p1' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(applyAction(s, 'p0', { type: 'CONFIRM_COUNTER', offerId: 7, with: 'p1' })).toEqual({
      ok: false,
      error: 'NO_SUCH_OFFER',
    });
  });

  it('se vuelven a comprobar las manos de los dos al cerrar', () => {
    const s = counterState();
    expect(
      applyAction(setHand(s, 'p0', {}), 'p0', { type: 'CONFIRM_COUNTER', offerId: 1, with: 'p1' }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_RESOURCES' });
    expect(
      applyAction(setHand(s, 'p1', { r3: 1 }), 'p0', {
        type: 'CONFIRM_COUNTER',
        offerId: 1,
        with: 'p1',
      }),
    ).toEqual({ ok: false, error: 'NOT_ENOUGH_RESOURCES' });
  });

  it('conserva el total de cartas', () => {
    const s = counterState();
    const total = (st: GameState) =>
      st.players.reduce((n, p) => n + Object.values(p.hand).reduce((a, b) => a + b, 0), 0);
    expect(total(apply(s, 'p0', { type: 'CONFIRM_COUNTER', offerId: 1, with: 'p1' }).state)).toBe(
      total(s),
    );
  });
});

describe('contraofertas en las acciones legales y la vista', () => {
  it('el oferente puede confirmar cada contraoferta cubierta; los demás no', () => {
    let s = offered();
    s = apply(s, 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 2 },
      want: { ...none, r1: 1 },
    }).state;
    expect(legalActions(s, 'p0')).toContainEqual({
      type: 'CONFIRM_COUNTER',
      offerId: 1,
      with: 'p1',
    });
    expect(legalActions(s, 'p1').some((a) => a.type === 'CONFIRM_COUNTER')).toBe(false);
    // si la mano del oferente ya no la cubre, deja de ser legal
    expect(legalActions(setHand(s, 'p0', {}), 'p0').some((a) => a.type === 'CONFIRM_COUNTER')).toBe(
      false,
    );
  });

  it('canCounterTrade: destinatarios con cartas, con la oferta abierta', () => {
    const s = offered();
    expect(canCounterTrade(s, 'p1')).toBe(true);
    expect(canCounterTrade(s, 'p0')).toBe(false); // el oferente no
    expect(canCounterTrade(s, 'p3')).toBe(false); // sin cartas que dar
    expect(canCounterTrade({ ...s, pendingTrade: null }, 'p1')).toBe(false);
    expect(getPlayerView(s, 'p1').canCounterTrade).toBe(true);
    expect(getPlayerView(s, 'host').canCounterTrade).toBe(false);
  });

  it('la contraoferta es información pública de la oferta', () => {
    let s = offered();
    s = apply(s, 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 2 },
      want: { ...none, r1: 1 },
    }).state;
    expect(getPlayerView(s, 'p2').pendingTrade?.counters).toHaveLength(1);
    expect(getPlayerView(s, 'host').pendingTrade?.counters[0]?.from).toBe('p1');
  });

  it('una oferta con contraofertas se cancela igual al terminar el turno', () => {
    let s = offered();
    s = apply(s, 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 2 },
      want: { ...none, r1: 1 },
    }).state;
    expect(apply(s, 'p0', { type: 'END_TURN' }).state.pendingTrade).toBeNull();
  });
});
