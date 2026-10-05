import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { tradeRatios } from '../rules/ports.js';
import { apply, newGame, place, setHand } from '../test-utils.js';
import type { GameState } from '../state/types.js';
import type { PortKind } from '../board/types.js';

function mainPhase(): GameState {
  const s = newGame(3);
  return { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 3 } };
}

/** Coloca un poblado de `player` en un vértice del primer puerto de la clase indicada. */
function withPort(state: GameState, player: string, kind: PortKind): GameState {
  const port = state.board.ports.find((p) => p.kind === kind);
  if (!port) throw new Error(`sin puerto ${kind}`);
  return place(state, port.vertices[0], player);
}

describe('tarifas de comercio', () => {
  it('sin puertos es 4:1', () => {
    expect(tradeRatios(mainPhase(), 'p0')).toEqual({ r1: 4, r2: 4, r3: 4, r4: 4, r5: 4 });
  });

  it('un puerto general da 3:1 en todo', () => {
    expect(tradeRatios(withPort(mainPhase(), 'p0', 'any'), 'p0')).toEqual({
      r1: 3,
      r2: 3,
      r3: 3,
      r4: 3,
      r5: 3,
    });
  });

  it('un puerto específico da 2:1 solo en su recurso', () => {
    expect(tradeRatios(withPort(mainPhase(), 'p0', 'r2'), 'p0')).toEqual({
      r1: 4,
      r2: 2,
      r3: 4,
      r4: 4,
      r5: 4,
    });
  });

  it('se combinan: el mejor ratio gana', () => {
    const s = withPort(withPort(mainPhase(), 'p0', 'any'), 'p0', 'r5');
    expect(tradeRatios(s, 'p0').r5).toBe(2);
    expect(tradeRatios(s, 'p0').r1).toBe(3);
  });

  it('el puerto de otro jugador no cuenta', () => {
    expect(tradeRatios(withPort(mainPhase(), 'p1', 'any'), 'p0').r1).toBe(4);
  });

  it('el puerto cuenta tanto con poblado como con ciudad', () => {
    const port = mainPhase().board.ports.find((p) => p.kind === 'r1');
    const s = place(mainPhase(), port?.vertices[1] ?? '', 'p0', 'city');
    expect(tradeRatios(s, 'p0').r1).toBe(2);
  });
});

describe('BANK_TRADE', () => {
  it('4:1 por defecto: entrega 4 y recibe 1', () => {
    const s = setHand(mainPhase(), 'p0', { r1: 5 });
    const r = apply(s, 'p0', { type: 'BANK_TRADE', give: 'r1', want: 'r3' });
    expect(r.state.players[0]?.hand).toEqual({ r1: 1, r2: 0, r3: 1, r4: 0, r5: 0 });
    expect(r.state.bank.r1).toBe(23);
    expect(r.state.bank.r3).toBe(18);
    expect(r.events).toEqual([
      { type: 'BANK_TRADED', player: 'p0', give: 'r1', giveCount: 4, want: 'r3' },
    ]);
  });

  it('usa el ratio del puerto (2:1)', () => {
    const s = setHand(withPort(mainPhase(), 'p0', 'r4'), 'p0', { r4: 2 });
    const r = apply(s, 'p0', { type: 'BANK_TRADE', give: 'r4', want: 'r5' });
    expect(r.state.players[0]?.hand.r5).toBe(1);
    expect(r.state.players[0]?.hand.r4).toBe(0);
  });

  it('rechaza sin cartas suficientes, mismo recurso, banco vacío, fase o turno erróneos', () => {
    const s = setHand(mainPhase(), 'p0', { r1: 3 });
    expect(applyAction(s, 'p0', { type: 'BANK_TRADE', give: 'r1', want: 'r2' })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
    const rich = setHand(mainPhase(), 'p0', { r1: 8 });
    expect(applyAction(rich, 'p0', { type: 'BANK_TRADE', give: 'r1', want: 'r1' })).toEqual({
      ok: false,
      error: 'INVALID_TRADE',
    });
    expect(
      applyAction({ ...rich, bank: { ...rich.bank, r2: 0 } }, 'p0', {
        type: 'BANK_TRADE',
        give: 'r1',
        want: 'r2',
      }),
    ).toEqual({ ok: false, error: 'BANK_LACKS_RESOURCES' });
    expect(
      applyAction({ ...rich, phase: { type: 'roll' } }, 'p0', {
        type: 'BANK_TRADE',
        give: 'r1',
        want: 'r2',
      }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(applyAction(rich, 'p1', { type: 'BANK_TRADE', give: 'r1', want: 'r2' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });
});
