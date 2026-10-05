import { describe, expect, it } from 'vitest';
import { applyAction } from './apply.js';
import { COSTS } from '../rules/costs.js';
import { apply, forceRoll, newGame, place, setHand } from '../test-utils.js';
import type { DevCardId, GameState } from '../state/types.js';
import { totalCards } from '../state/resources.js';

const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

function mainPhase(): GameState {
  const s = newGame(3);
  return { ...s, phase: { type: 'main' }, turn: { ...s.turn, number: 5 } };
}

function withCards(state: GameState, player: string, cards: [DevCardId, number][]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player
        ? {
            ...p,
            devCards: [
              ...p.devCards,
              ...cards.map(([card, boughtOnTurn]) => ({ card, boughtOnTurn })),
            ],
          }
        : p,
    ),
  };
}

describe('BUY_DEV_CARD', () => {
  it('roba la carta superior, cobra el coste y no la deja jugar ese turno', () => {
    let s = setHand(mainPhase(), 'p0', { r3: 1, r4: 1, r5: 1 });
    const top = s.devDeck[0];
    const r = apply(s, 'p0', { type: 'BUY_DEV_CARD' });
    s = r.state;
    expect(s.devDeck).toHaveLength(24);
    expect(s.players[0]?.devCards).toEqual([{ card: top, boughtOnTurn: 5 }]);
    expect(totalCards(s.players[0]?.hand ?? none)).toBe(0);
    expect(s.bank.r3).toBe(19 + COSTS.devCard.r3);
    expect(r.events).toEqual([{ type: 'DEV_CARD_BOUGHT', player: 'p0' }]);
  });

  it('rechaza sin recursos, con el mazo vacío o fuera de la fase main', () => {
    const s = mainPhase();
    expect(applyAction(s, 'p0', { type: 'BUY_DEV_CARD' })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
    const rich = setHand(s, 'p0', { r3: 1, r4: 1, r5: 1 });
    expect(applyAction({ ...rich, devDeck: [] }, 'p0', { type: 'BUY_DEV_CARD' })).toEqual({
      ok: false,
      error: 'DECK_EMPTY',
    });
    expect(
      applyAction({ ...rich, phase: { type: 'roll' } }, 'p0', { type: 'BUY_DEV_CARD' }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(applyAction(rich, 'p1', { type: 'BUY_DEV_CARD' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });
});

describe('restricciones al jugar cartas', () => {
  it('no se puede jugar la carta comprada en el mismo turno', () => {
    const s = withCards(mainPhase(), 'p0', [['army', 5]]);
    expect(applyAction(s, 'p0', { type: 'PLAY_ARMY' })).toEqual({
      ok: false,
      error: 'DEV_CARD_BOUGHT_THIS_TURN',
    });
  });

  it('sí se puede si hay otra igual comprada en un turno anterior', () => {
    const s = withCards(mainPhase(), 'p0', [
      ['army', 5],
      ['army', 2],
    ]);
    const r = apply(s, 'p0', { type: 'PLAY_ARMY' });
    expect(r.state.players[0]?.devCards).toEqual([{ card: 'army', boughtOnTurn: 5 }]);
  });

  it('máximo una carta por turno', () => {
    const s = withCards(mainPhase(), 'p0', [
      ['plenty', 1],
      ['monopoly', 1],
    ]);
    const once = apply(s, 'p0', { type: 'PLAY_MONOPOLY', resource: 'r1' }).state;
    expect(applyAction(once, 'p0', { type: 'PLAY_PLENTY', resources: ['r1', 'r2'] })).toEqual({
      ok: false,
      error: 'DEV_CARD_ALREADY_PLAYED',
    });
  });

  it('el límite se reinicia al siguiente turno', () => {
    const s = withCards(mainPhase(), 'p0', [
      ['monopoly', 1],
      ['monopoly', 1],
    ]);
    let t = apply(s, 'p0', { type: 'PLAY_MONOPOLY', resource: 'r1' }).state;
    t = apply(t, 'p0', { type: 'END_TURN' }).state;
    for (const who of ['p1', 'p2']) {
      t = apply(forceRoll(t, 6), who, { type: 'ROLL' }).state;
      t = apply(t, who, { type: 'END_TURN' }).state;
    }
    t = apply(forceRoll(t, 6), 'p0', { type: 'ROLL' }).state;
    expect(applyAction(t, 'p0', { type: 'PLAY_MONOPOLY', resource: 'r2' }).ok).toBe(true);
  });

  it('no se juega una carta que no se tiene ni en turno ajeno ni en fases ajenas', () => {
    const s = withCards(mainPhase(), 'p0', [['army', 1]]);
    expect(applyAction(s, 'p0', { type: 'PLAY_MONOPOLY', resource: 'r1' })).toEqual({
      ok: false,
      error: 'NO_SUCH_DEV_CARD',
    });
    expect(applyAction(s, 'p1', { type: 'PLAY_ARMY' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(
      applyAction({ ...s, phase: { type: 'discard', owed: { p1: 4 } } }, 'p0', {
        type: 'PLAY_ARMY',
      }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('se puede jugar antes de tirar los dados', () => {
    const s = { ...withCards(mainPhase(), 'p0', [['army', 1]]), phase: { type: 'roll' } as const };
    const r = apply(s, 'p0', { type: 'PLAY_ARMY' });
    expect(r.state.phase).toEqual({ type: 'robber', returnTo: 'roll' });
  });
});

describe('efectos', () => {
  it('ejército: suma al contador y abre el movimiento del ladrón', () => {
    const s = withCards(mainPhase(), 'p0', [['army', 1]]);
    const r = apply(s, 'p0', { type: 'PLAY_ARMY' });
    expect(r.state.players[0]?.armiesPlayed).toBe(1);
    expect(r.state.phase).toEqual({ type: 'robber', returnTo: 'main' });
  });

  it('abundancia: toma 2 recursos del banco', () => {
    const s = withCards(mainPhase(), 'p0', [['plenty', 1]]);
    const r = apply(s, 'p0', { type: 'PLAY_PLENTY', resources: ['r1', 'r1'] });
    expect(r.state.players[0]?.hand.r1).toBe(2);
    expect(r.state.bank.r1).toBe(17);
  });

  it('abundancia: rechaza si el banco no tiene lo pedido', () => {
    const s = withCards({ ...mainPhase(), bank: { ...none, r1: 1, r2: 5 } }, 'p0', [['plenty', 1]]);
    expect(applyAction(s, 'p0', { type: 'PLAY_PLENTY', resources: ['r1', 'r1'] })).toEqual({
      ok: false,
      error: 'BANK_LACKS_RESOURCES',
    });
    expect(applyAction(s, 'p0', { type: 'PLAY_PLENTY', resources: ['r1', 'r2'] }).ok).toBe(true);
  });

  it('monopolio: recoge todo un recurso de los demás', () => {
    let s = withCards(mainPhase(), 'p0', [['monopoly', 1]]);
    s = setHand(setHand(s, 'p1', { r2: 3, r1: 1 }), 'p2', { r2: 2 });
    const r = apply(s, 'p0', { type: 'PLAY_MONOPOLY', resource: 'r2' });
    expect(r.state.players[0]?.hand.r2).toBe(5);
    expect(r.state.players[1]?.hand).toEqual({ ...none, r1: 1 });
    expect(r.state.players[2]?.hand.r2).toBe(0);
    expect(r.events).toContainEqual({
      type: 'MONOPOLY_COLLECTED',
      player: 'p0',
      resource: 'r2',
      total: 5,
    });
  });

  describe('caminos', () => {
    function roadScenario() {
      let s = withCards(mainPhase(), 'p0', [['roads', 1]]);
      const v = s.board.topology.vertices.find((x) => x.neighbors.length === 3);
      if (!v) throw new Error('sin vértice');
      s = place(s, v.id, 'p0');
      return { s, v };
    }

    it('permite colocar dos caminos gratis y vuelve a la fase main', () => {
      const { s, v } = roadScenario();
      let t = apply(s, 'p0', { type: 'PLAY_ROADS' }).state;
      expect(t.phase).toEqual({ type: 'roadBuilding', remaining: 2, returnTo: 'main' });
      const e1 = v.edges[0] ?? '';
      t = apply(t, 'p0', { type: 'BUILD_ROAD', edge: e1 }).state;
      expect(t.phase).toEqual({ type: 'roadBuilding', remaining: 1, returnTo: 'main' });
      t = apply(t, 'p0', { type: 'BUILD_ROAD', edge: v.edges[1] ?? '' }).state;
      expect(t.phase).toEqual({ type: 'main' });
      expect(totalCards(t.players[0]?.hand ?? none)).toBe(0);
      expect(t.players[0]?.pieces.roads).toBe(13);
    });

    it('los caminos gratis también deben estar conectados', () => {
      const { s } = roadScenario();
      const t = apply(s, 'p0', { type: 'PLAY_ROADS' }).state;
      const far = t.board.topology.edges.find(
        (e) =>
          !t.board.topology.vertexById[e.vertices[0]]?.edges.some((x) => t.roads[x]) &&
          e.vertices.every((v) => !t.buildings[v]),
      );
      expect(applyAction(t, 'p0', { type: 'BUILD_ROAD', edge: far?.id ?? '' })).toEqual({
        ok: false,
        error: 'NOT_CONNECTED',
      });
    });

    it('si solo queda una pieza, coloca un camino y termina', () => {
      const { s, v } = roadScenario();
      const one = {
        ...s,
        players: s.players.map((p) =>
          p.id === 'p0' ? { ...p, pieces: { ...p.pieces, roads: 1 } } : p,
        ),
      };
      let t = apply(one, 'p0', { type: 'PLAY_ROADS' }).state;
      expect(t.phase).toEqual({ type: 'roadBuilding', remaining: 1, returnTo: 'main' });
      t = apply(t, 'p0', { type: 'BUILD_ROAD', edge: v.edges[0] ?? '' }).state;
      expect(t.phase).toEqual({ type: 'main' });
    });

    it('sin sitio donde construir, la carta no se juega', () => {
      const s = withCards(mainPhase(), 'p0', [['roads', 1]]);
      expect(applyAction(s, 'p0', { type: 'PLAY_ROADS' })).toEqual({
        ok: false,
        error: 'NO_LEGAL_PLACEMENT',
      });
    });
  });
});

describe('END_TURN', () => {
  it('pasa al siguiente jugador, que debe tirar, y rota tras el último', () => {
    let s = mainPhase();
    s = apply(s, 'p0', { type: 'END_TURN' }).state;
    expect(s.turn).toEqual({ player: 'p1', number: 6, lastRoll: null, devCardPlayed: false });
    expect(s.phase).toEqual({ type: 'roll' });
    s = { ...s, phase: { type: 'main' }, turn: { ...s.turn, player: 'p2' } };
    expect(apply(s, 'p2', { type: 'END_TURN' }).state.turn.player).toBe('p0');
  });

  it('solo en la fase main y por el jugador activo', () => {
    const s = mainPhase();
    expect(applyAction(s, 'p1', { type: 'END_TURN' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(applyAction({ ...s, phase: { type: 'roll' } }, 'p0', { type: 'END_TURN' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
  });
});
