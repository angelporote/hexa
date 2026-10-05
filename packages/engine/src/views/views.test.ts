import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions/apply.js';
import type { Action } from '../actions/types.js';
import { createRng, nextInt } from '../rng/rng.js';
import {
  apply,
  autoSetup,
  forceRoll,
  newGame,
  place,
  setHand,
  toRollPhase,
} from '../test-utils.js';
import type { GameState } from '../state/types.js';
import { legalActions } from './legal-actions.js';
import { getPlayerView } from './player-view.js';

describe('legalActions', () => {
  it('al empezar, solo el jugador activo puede colocar un poblado, en cualquier vértice libre', () => {
    const s = newGame(3);
    const mine = legalActions(s, 'p0');
    expect(mine).toHaveLength(54);
    expect(mine.every((a) => a.type === 'BUILD_SETTLEMENT')).toBe(true);
    expect(legalActions(s, 'p1')).toEqual([]);
  });

  it('tras el poblado inicial, solo los caminos pegados a él', () => {
    let s = newGame(3);
    const v = s.board.topology.vertices.find((x) => x.edges.length === 3);
    if (!v) throw new Error('sin vértice');
    s = apply(s, 'p0', { type: 'BUILD_SETTLEMENT', vertex: v.id }).state;
    const acts = legalActions(s, 'p0');
    expect(acts.map((a) => (a.type === 'BUILD_ROAD' ? a.edge : null)).sort()).toEqual(
      [...v.edges].sort(),
    );
  });

  it('en la fase de tirada ofrece tirar (y no construir)', () => {
    const s = toRollPhase(newGame(3));
    expect(legalActions(s, 'p0')).toEqual([{ type: 'ROLL' }]);
    expect(legalActions(s, 'p1')).toEqual([]);
  });

  it('en main ofrece terminar turno, y construir solo si se puede pagar', () => {
    let s = autoSetup(newGame(3));
    s = { ...s, phase: { type: 'main' } };
    s = setHand(s, 'p0', {});
    const poor = legalActions(s, 'p0');
    expect(poor).toContainEqual({ type: 'END_TURN' });
    expect(
      poor.some(
        (a) => a.type === 'BUILD_ROAD' || a.type === 'BUILD_CITY' || a.type === 'BANK_TRADE',
      ),
    ).toBe(false);
    const rich = legalActions(setHand(s, 'p0', { r1: 5, r2: 5, r3: 5, r4: 5, r5: 5 }), 'p0');
    expect(rich.some((a) => a.type === 'BUILD_ROAD')).toBe(true);
    expect(rich.some((a) => a.type === 'BUILD_CITY')).toBe(true);
    expect(rich).toContainEqual({ type: 'BUY_DEV_CARD' });
    expect(rich).toContainEqual({ type: 'BANK_TRADE', give: 'r1', want: 'r2' });
  });

  it('descarte: enumera todas las combinaciones válidas de la cantidad exacta', () => {
    let s = toRollPhase(newGame(3));
    s = setHand(s, 'p1', { r1: 5, r2: 4 });
    s = apply(forceRoll(s, 7), 'p0', { type: 'ROLL' }).state;
    const acts = legalActions(s, 'p1');
    // repartir 4 cartas entre r1 (0..4) y r2 (0..4)
    expect(acts).toHaveLength(5);
    for (const a of acts) {
      if (a.type !== 'DISCARD') throw new Error('se esperaba DISCARD');
      expect(Object.values(a.resources).reduce((x, y) => x + y, 0)).toBe(4);
    }
    expect(legalActions(s, 'p0')).toEqual([]);
  });

  it('ladrón: cada hexágono distinto del actual, con cada víctima posible', () => {
    let s = toRollPhase(newGame(3));
    const hex = s.board.topology.hexes.find((h) => h.id !== s.robber);
    if (!hex) throw new Error('sin hexágono');
    s = place(place(s, hex.vertices[0] ?? '', 'p1'), hex.vertices[3] ?? '', 'p2');
    s = setHand(setHand(s, 'p1', { r1: 1 }), 'p2', { r2: 1 });
    s = { ...s, phase: { type: 'robber', returnTo: 'main' } };
    const acts = legalActions(s, 'p0');
    const onHex = acts.filter((a) => a.type === 'MOVE_ROBBER' && a.hex === hex.id);
    expect(onHex).toHaveLength(2);
    expect(acts.filter((a) => a.type === 'MOVE_ROBBER' && a.hex === s.robber)).toHaveLength(0);
    expect(acts.every((a) => a.type === 'MOVE_ROBBER')).toBe(true);
  });

  it('con una oferta abierta ofrece responder, cancelar y confirmar según el jugador', () => {
    let s = autoSetup(newGame(3));
    s = { ...s, phase: { type: 'main' } };
    s = setHand(setHand(s, 'p0', { r1: 2 }), 'p1', { r2: 1 });
    s = apply(s, 'p0', {
      type: 'OFFER_TRADE',
      to: null,
      give: { r1: 1, r2: 0, r3: 0, r4: 0, r5: 0 },
      want: { r1: 0, r2: 1, r3: 0, r4: 0, r5: 0 },
    }).state;
    expect(legalActions(s, 'p1')).toEqual([
      { type: 'ACCEPT_TRADE', offerId: 1 },
      { type: 'REJECT_TRADE', offerId: 1 },
    ]);
    s = apply(s, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 }).state;
    const mine = legalActions(s, 'p0');
    expect(mine).toContainEqual({ type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' });
    expect(mine).toContainEqual({ type: 'CANCEL_TRADE', offerId: 1 });
    expect(mine.some((a) => a.type === 'OFFER_TRADE')).toBe(false);
  });

  it('al terminar la partida no hay acciones', () => {
    const s = { ...newGame(3), phase: { type: 'ended' } as const };
    expect(legalActions(s, 'p0')).toEqual([]);
  });

  it('coherencia: en una partida aleatoria toda acción legal se aplica con éxito', () => {
    let s = newGame(3, 'legal-playout');
    let rng = createRng('picker');
    let steps = 0;
    while (s.phase.type !== 'ended' && steps < 600) {
      const actors = s.players.map((p) => p.id);
      const options: { player: string; action: Action }[] = [];
      for (const id of actors)
        for (const action of legalActions(s, id)) options.push({ player: id, action });
      if (options.length === 0) throw new Error(`sin acciones legales en ${s.phase.type}`);
      for (const o of options) expect(applyAction(s, o.player, o.action).ok).toBe(true);
      const pick = nextInt(rng, options.length);
      rng = pick.rng;
      const chosen = options[pick.value];
      if (!chosen) break;
      s = apply(s, chosen.player, chosen.action).state;
      steps++;
    }
    expect(steps).toBeGreaterThan(50);
  });
});

describe('getPlayerView', () => {
  function scenario(): GameState {
    let s = autoSetup(newGame(3, 'views'));
    s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 5 } };
    s = setHand(setHand(s, 'p0', { r1: 2, r3: 1 }), 'p1', { r2: 3, r5: 2 });
    return {
      ...s,
      players: s.players.map((p) =>
        p.id === 'p1'
          ? {
              ...p,
              devCards: [
                { card: 'point' as const, boughtOnTurn: 1 },
                { card: 'army' as const, boughtOnTurn: 5 },
              ],
            }
          : p,
      ),
    };
  }

  it('el jugador ve su mano y sus cartas con la marca de jugable', () => {
    const v = getPlayerView(scenario(), 'p1');
    expect(v.you?.hand).toEqual({ r1: 0, r2: 3, r3: 0, r4: 0, r5: 2 });
    expect(v.you?.devCards).toEqual([
      { card: 'point', playable: true },
      { card: 'army', playable: false },
    ]);
    expect(v.you?.totalPoints).toBe(3);
  });

  it('de los demás solo ve totales', () => {
    const v = getPlayerView(scenario(), 'p0');
    const p1 = v.players.find((p) => p.id === 'p1');
    expect(p1?.resourceCount).toBe(5);
    expect(p1?.devCardCount).toBe(2);
    expect(Object.keys(p1 ?? {})).not.toContain('hand');
    expect(p1?.points).toBe(2); // sin la carta de punto
  });

  it('no filtra semilla, RNG, mazo ni registro', () => {
    const json = JSON.stringify(getPlayerView(scenario(), 'p0'));
    for (const secret of ['"seed"', '"rng"', '"devDeck"', '"log"']) {
      expect(json).not.toContain(secret);
    }
    expect(getPlayerView(scenario(), 'p0').deckSize).toBe(25);
  });

  it('la vista no depende de lo oculto: manos ajenas, orden del mazo, semilla y RNG', () => {
    const a = scenario();
    const b: GameState = {
      ...a,
      seed: 'otra',
      rng: createRng('otro'),
      devDeck: [...a.devDeck].reverse(),
      log: [],
      players: a.players.map((p) =>
        p.id === 'p1'
          ? {
              ...p,
              hand: { r1: 5, r2: 0, r3: 0, r4: 0, r5: 0 },
              devCards: [
                { card: 'monopoly' as const, boughtOnTurn: 2 },
                { card: 'monopoly' as const, boughtOnTurn: 1 },
              ],
            }
          : p,
      ),
    };
    const sameCounts = getPlayerView(a, 'p0');
    const swapped = getPlayerView(b, 'p0');
    // los totales coinciden (5 cartas y 2 de desarrollo), así que la vista debe ser idéntica,
    // salvo los puntos públicos de p1 que no cambian (no hay cartas de punto visibles)
    expect(swapped).toEqual(sameCounts);
    expect(getPlayerView(b, 'host')).toEqual(getPlayerView(a, 'host'));
  });

  it('host y espectadores no ven manos ni acciones', () => {
    for (const viewer of ['host', 'spectator'] as const) {
      const v = getPlayerView(scenario(), viewer);
      expect(v.you).toBeNull();
      expect(v.legalActions).toEqual([]);
      expect(v.canOfferTrade).toBe(false);
    }
  });

  it('incluye acciones legales solo para su dueño y canOfferTrade en su turno', () => {
    const s = scenario();
    expect(getPlayerView(s, 'p0').legalActions.length).toBeGreaterThan(0);
    expect(getPlayerView(s, 'p0').canOfferTrade).toBe(true);
    expect(getPlayerView(s, 'p1').legalActions).toEqual([]);
    expect(getPlayerView(s, 'p1').canOfferTrade).toBe(false);
  });

  it('al acabar la partida se revelan los puntos totales', () => {
    const s = { ...scenario(), phase: { type: 'ended' } as const, winner: 'p0' };
    const p1 = getPlayerView(s, 'p0').players.find((p) => p.id === 'p1');
    expect(p1?.points).toBe(3);
  });

  it('es serializable en JSON', () => {
    const v = getPlayerView(scenario(), 'p0');
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});
