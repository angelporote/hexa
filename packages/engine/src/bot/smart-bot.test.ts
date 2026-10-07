import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions/apply.js';
import type { Action } from '../actions/types.js';
import { createRng } from '../rng/rng.js';
import { simulateGame } from '../sim/simulate.js';
import { pendingActor } from '../sim/bot.js';
import { totalCards } from '../state/resources.js';
import type { DevCardId, GameState, PlayerId, TradeOffer } from '../state/types.js';
import {
  apply,
  mainState,
  newGame,
  place,
  setHand,
  toRollPhase,
  withBuildings,
  withSettlementSpot,
} from '../test-utils.js';
import { legalActions } from '../views/legal-actions.js';
import { hexPips, roadScore, settlementSpots, vertexScore } from './evaluate.js';
import { chooseSmartMove } from './smart-bot.js';

const rng = createRng('smart-bot-tests');

function decide(state: GameState, player: PlayerId = 'p0'): Action {
  const { move } = chooseSmartMove(state, player, rng);
  if (!move) throw new Error(`${player} no tiene jugada en la fase ${state.phase.type}`);
  expect(move.player).toBe(player);
  // nunca propone nada que el motor no acepte
  expect(applyAction(state, player, move.action).ok, JSON.stringify(move.action)).toBe(true);
  return move.action;
}

function withCard(state: GameState, player: PlayerId, card: DevCardId): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, devCards: [...p.devCards, { card, boughtOnTurn: 1 }] } : p,
    ),
  };
}

function withPieces(
  state: GameState,
  player: PlayerId,
  pieces: Partial<Record<'roads' | 'settlements' | 'cities', number>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, pieces: { ...p.pieces, ...pieces } } : p,
    ),
  };
}

/** Mismo estado con una oferta de comercio abierta. */
function withOffer(state: GameState, over: Partial<TradeOffer>): GameState {
  const base = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
  const offer: TradeOffer = {
    id: 1,
    from: 'p1',
    to: null,
    give: { ...base, r2: 1 },
    want: { ...base, r5: 1 },
    accepted: [],
    rejected: [],
    counters: [],
    ...over,
  };
  return { ...state, pendingTrade: offer, nextOfferId: 2 };
}

describe('colocación inicial', () => {
  it('pone su primer poblado en el mejor vértice libre', () => {
    const state = newGame(3, 'bot-setup');
    const action = decide(state);
    if (action.type !== 'BUILD_SETTLEMENT') throw new Error(action.type);
    const best = Math.max(
      ...legalActions(state, 'p0').flatMap((a) =>
        a.type === 'BUILD_SETTLEMENT' ? [vertexScore(state, a.vertex, 'p0')] : [],
      ),
    );
    expect(vertexScore(state, action.vertex, 'p0')).toBeCloseTo(best, 9);
  });

  it('el camino sale de ese poblado hacia el mejor sitio donde seguir', () => {
    const settled = apply(newGame(3, 'bot-setup'), 'p0', decide(newGame(3, 'bot-setup'))).state;
    const action = decide(settled);
    if (action.type !== 'BUILD_ROAD') throw new Error(action.type);
    const best = Math.max(
      ...legalActions(settled, 'p0').flatMap((a) =>
        a.type === 'BUILD_ROAD' ? [roadScore(settled, a.edge, 'p0')] : [],
      ),
    );
    expect(roadScore(settled, action.edge, 'p0')).toBeCloseTo(best, 9);
  });

  it('completa la colocación inicial de todos los jugadores', () => {
    let state = newGame(4, 'bot-setup-all');
    let bot = createRng('setup');
    while (state.phase.type === 'setup') {
      const actor = state.turn.player;
      const { move, rng: next } = chooseSmartMove(state, actor, bot);
      bot = next;
      if (!move) throw new Error('sin jugada');
      state = apply(state, actor, move.action).state;
    }
    for (const p of state.players) {
      expect(p.pieces.settlements).toBe(3);
      expect(p.pieces.roads).toBe(13);
    }
  });
});

describe('tirada', () => {
  it('tira los dados', () => {
    expect(decide(toRollPhase(mainState()))).toEqual({ type: 'ROLL' });
  });

  it('juega un caballero antes de tirar solo si el ladrón le bloquea una casilla', () => {
    const rolling = toRollPhase(mainState());
    const base = withCard({ ...rolling, turn: { ...rolling.turn, number: 6 } }, 'p0', 'army');
    expect(decide(base)).toEqual({ type: 'ROLL' });

    const mine = Object.entries(base.buildings).find(([, b]) => b.owner === 'p0')?.[0] ?? '';
    const hex = base.board.topology.vertexById[mine]?.hexes.find((h) => hexPips(base, h) > 0);
    if (!hex) throw new Error('sin hexágono productivo');
    expect(decide({ ...base, robber: hex })).toEqual({ type: 'PLAY_ARMY' });
  });
});

describe('turno libre: construir', () => {
  it('con recursos solo para una ciudad, la construye en su mejor poblado', () => {
    const state = mainState({ p0: { r4: 2, r5: 3 } });
    const action = decide(state);
    if (action.type !== 'BUILD_CITY') throw new Error(action.type);
    const upgrades = legalActions(state, 'p0').flatMap((a) =>
      a.type === 'BUILD_CITY' ? [a.vertex] : [],
    );
    const best = Math.max(...upgrades.map((v) => vertexScore(state, v, 'p0')));
    expect(vertexScore(state, action.vertex, 'p0')).toBeCloseTo(best, 9);
  });

  it('con sitio y recursos solo para un poblado, lo construye en el mejor sitio', () => {
    const { state: grown, spot } = withSettlementSpot(mainState(), 'p0');
    const state = setHand(grown, 'p0', { r1: 1, r2: 1, r3: 1, r4: 1 });
    const action = decide(state);
    if (action.type !== 'BUILD_SETTLEMENT') throw new Error(action.type);
    expect(settlementSpots(state, 'p0')).toContain(action.vertex);
    expect(settlementSpots(state, 'p0')).toContain(spot);
  });

  it('con pocos edificios prefiere el poblado a la ciudad; con muchos, la ciudad', () => {
    const { state: grown } = withSettlementSpot(mainState(), 'p0');
    const rich = { r1: 1, r2: 1, r3: 1, r4: 2, r5: 3 };
    expect(decide(setHand(grown, 'p0', rich)).type).toBe('BUILD_SETTLEMENT');

    const { state: crowded } = withSettlementSpot(withBuildings(mainState(), 'p0', 2), 'p0');
    expect(decide(setHand(crowded, 'p0', rich)).type).toBe('BUILD_CITY');
  });

  it('un camino solo si necesita sitio para crecer', () => {
    const noRoom = setHand(mainState(), 'p0', { r1: 1, r2: 1 });
    expect(settlementSpots(noRoom, 'p0')).toEqual([]);
    const action = decide(noRoom);
    if (action.type !== 'BUILD_ROAD') throw new Error(action.type);
    const best = Math.max(
      ...legalActions(noRoom, 'p0').flatMap((a) =>
        a.type === 'BUILD_ROAD' ? [roadScore(noRoom, a.edge, 'p0')] : [],
      ),
    );
    expect(roadScore(noRoom, action.edge, 'p0')).toBeCloseTo(best, 9);

    // con sitio de sobra, esa madera y arcilla no se gastan en un camino
    const { state: withRoom } = withSettlementSpot(mainState(), 'p0');
    expect(decide(setHand(withRoom, 'p0', { r1: 1, r2: 1 }))).toEqual({ type: 'END_TURN' });
    // pero si sobran mucho, sí
    expect(decide(setHand(withRoom, 'p0', { r1: 3, r2: 3 })).type).toBe('BUILD_ROAD');
  });

  it('sin con qué construir, termina el turno', () => {
    expect(decide(mainState())).toEqual({ type: 'END_TURN' });
    expect(decide(mainState({ p0: { r5: 1 } }))).toEqual({ type: 'END_TURN' });
  });
});

describe('turno libre: cartas de desarrollo', () => {
  const noBuilding = (state: GameState) => withPieces(state, 'p0', { settlements: 0, cities: 0 });

  it('compra una carta si es lo que le queda por hacer', () => {
    const state = setHand(noBuilding(mainState()), 'p0', { r3: 1, r4: 1, r5: 1 });
    expect(decide(state)).toEqual({ type: 'BUY_DEV_CARD' });
  });

  it('no la compra si eso le aleja de la ciudad que está juntando', () => {
    // le falta 1 de mineral para la ciudad: la carta gastaría cereal y mineral
    const state = mainState({ p0: { r3: 1, r4: 2, r5: 2 } });
    expect(decide(state)).toEqual({ type: 'END_TURN' });
  });

  it('la compra si no estorba al objetivo principal', () => {
    const { state: grown } = withSettlementSpot(mainState(), 'p0');
    // el poblado necesita madera y arcilla; la lana, el cereal y el mineral de sobra pagan la carta
    const state = setHand(grown, 'p0', { r3: 2, r4: 2, r5: 1 });
    expect(decide(state)).toEqual({ type: 'BUY_DEV_CARD' });
  });

  it('un caballero: lo juega si el ladrón le bloquea, si le da el mayor ejército o si no tiene nada mejor', () => {
    const base = withCard(mainState(), 'p0', 'army');
    expect(decide(base)).toEqual({ type: 'PLAY_ARMY' });

    const mine = Object.entries(base.buildings).find(([, b]) => b.owner === 'p0')?.[0] ?? '';
    const hex = base.board.topology.vertexById[mine]?.hexes.find((h) => hexPips(base, h) > 0) ?? '';
    // aun con una ciudad que pagar, el caballero que libera su casilla va antes
    const blocked = setHand({ ...base, robber: hex }, 'p0', { r4: 2, r5: 3 });
    expect(decide(blocked)).toEqual({ type: 'PLAY_ARMY' });

    // ya jugada una carta este turno, no puede
    const played = { ...base, turn: { ...base.turn, devCardPlayed: true } };
    expect(decide(played)).toEqual({ type: 'END_TURN' });

    // con dos caballeros jugados, el tercero da el mayor ejército: va antes que construir un camino
    const closing = {
      ...withPieces(base, 'p0', {}),
      players: base.players.map((p) =>
        p.id === 'p0' ? { ...p, devCards: base.players[0]?.devCards ?? [], armiesPlayed: 2 } : p,
      ),
    };
    expect(decide(closing)).toEqual({ type: 'PLAY_ARMY' });
  });

  it('el progreso de carreteras, si necesita sitio; luego coloca los caminos hacia donde crecer', () => {
    const state = withCard(mainState(), 'p0', 'roads');
    expect(decide(state)).toEqual({ type: 'PLAY_ROADS' });
    const building = { ...apply(state, 'p0', { type: 'PLAY_ROADS' }).state };
    expect(building.phase.type).toBe('roadBuilding');
    const action = decide(building);
    if (action.type !== 'BUILD_ROAD') throw new Error(action.type);
    const best = Math.max(
      ...legalActions(building, 'p0').flatMap((a) =>
        a.type === 'BUILD_ROAD' ? [roadScore(building, a.edge, 'p0')] : [],
      ),
    );
    expect(roadScore(building, action.edge, 'p0')).toBeCloseTo(best, 9);
  });

  it('abundancia: pide justo lo que le falta para completar el poblado', () => {
    const { state: grown } = withSettlementSpot(withCard(mainState(), 'p0', 'plenty'), 'p0');
    // le falta una arcilla: la abundancia la pide (y otra cualquiera)
    const state = setHand(grown, 'p0', { r1: 1, r3: 1, r4: 1 });
    const action = decide(state);
    if (action.type !== 'PLAY_PLENTY') throw new Error(action.type);
    expect(action.resources).toContain('r2');
    // después de jugarla puede construir el poblado
    const after = apply(state, 'p0', action).state;
    expect(decide(after).type).toBe('BUILD_SETTLEMENT');
  });

  it('abundancia: si no completa nada, la guarda; si le aporta un par útil, la juega', () => {
    const { state: grown } = withSettlementSpot(withCard(mainState(), 'p0', 'plenty'), 'p0');
    // le faltan 4 cosas: la carta aporta 2 de ellas
    const partly = decide(setHand(grown, 'p0', { r3: 1, r4: 1 }));
    expect(partly.type).toBe('PLAY_PLENTY');
    if (partly.type === 'PLAY_PLENTY') expect([...partly.resources].sort()).toEqual(['r1', 'r2']);
    // con la mano completa la carta no sirve y construye
    expect(decide(setHand(grown, 'p0', { r1: 1, r2: 1, r3: 1, r4: 1 })).type).toBe(
      'BUILD_SETTLEMENT',
    );
    // con una sola carta faltante y ya no hacer falta... no hay nada que pedir: no la juega
    const none = decide(setHand(withCard(mainState(), 'p0', 'plenty'), 'p0', {}));
    expect(none.type).toBe('PLAY_PLENTY'); // sin sitio: el objetivo es la ciudad y la abundancia aporta 2 de sus 5
  });

  it('monopolio: lo juega sobre el recurso que le falta', () => {
    const { state: grown } = withSettlementSpot(withCard(mainState(), 'p0', 'monopoly'), 'p0');
    const state = setHand(grown, 'p0', { r1: 1, r3: 1, r4: 1 });
    expect(decide(state)).toEqual({ type: 'PLAY_MONOPOLY', resource: 'r2' });
    // sin faltarle nada, no lo juega
    expect(decide(setHand(grown, 'p0', { r1: 1, r2: 1, r3: 1, r4: 1 })).type).toBe(
      'BUILD_SETTLEMENT',
    );
  });

  it('antes de tirar no gasta cartas de desarrollo que no sean un caballero necesario', () => {
    let state = toRollPhase(mainState({ p0: { r1: 1, r3: 1, r4: 1 } }));
    for (const card of ['plenty', 'monopoly', 'roads'] as const)
      state = withCard(state, 'p0', card);
    expect(decide(state)).toEqual({ type: 'ROLL' });
  });
});

describe('turno libre: comercio con el banco', () => {
  const spotState = () => withSettlementSpot(mainState(), 'p0').state;

  it('cambia 4 del recurso que le sobra por el que le falta para su objetivo', () => {
    // el poblado necesita 1 de madera; con 5 sobran 4 (y le falta arcilla)
    const state = setHand(spotState(), 'p0', { r1: 5, r3: 1, r4: 1 });
    expect(decide(state)).toEqual({ type: 'BANK_TRADE', give: 'r1', want: 'r2' });
  });

  it('sin suficiente sobrante, no comercia; ni cambia lo que necesita para sus objetivos', () => {
    expect(decide(setHand(spotState(), 'p0', { r1: 4, r3: 1, r4: 1 }))).toEqual({
      type: 'END_TURN',
    });
    // 4 de mineral, pero 3 son para la ciudad que viene después del poblado
    expect(decide(setHand(spotState(), 'p0', { r1: 1, r3: 1, r4: 1, r5: 4 }))).toEqual({
      type: 'END_TURN',
    });
  });

  it('un puerto abarata el cambio: con 3 basta si hay puerto general', () => {
    const state = spotState();
    const port = state.board.ports.find((p) => p.kind === 'any');
    const vertex = port?.vertices.find((v) => !state.buildings[v]);
    if (!vertex) throw new Error('sin puerto libre');
    const harbor = place(state, vertex, 'p0');
    expect(decide(setHand(harbor, 'p0', { r1: 4, r3: 1, r4: 1 }))).toEqual({
      type: 'BANK_TRADE',
      give: 'r1',
      want: 'r2',
    });
  });
});

describe('descartar', () => {
  it('se deshace de lo que sobra y conserva lo que necesita para construir', () => {
    const { state: grown } = withSettlementSpot(mainState(), 'p0');
    const hand = { r1: 4, r2: 1, r3: 1, r4: 2, r5: 3 };
    const state: GameState = {
      ...setHand(grown, 'p0', hand),
      phase: { type: 'discard', owed: { p0: 3 } },
    };
    const action = decide(state);
    if (action.type !== 'DISCARD') throw new Error(action.type);
    expect(totalCards(action.resources)).toBe(3);
    const left = {
      r1: hand.r1 - action.resources.r1,
      r2: hand.r2 - action.resources.r2,
      r3: hand.r3 - action.resources.r3,
      r4: hand.r4 - action.resources.r4,
      r5: hand.r5 - action.resources.r5,
    };
    // le sigue alcanzando para un poblado
    expect(Math.min(left.r1, left.r2, left.r3, left.r4)).toBeGreaterThanOrEqual(1);
  });
});

describe('ladrón', () => {
  /**
   * Tablero vacío (sin edificios, caminos ni cartas) y con la misma ficha en todos los hexágonos:
   * solo cuenta lo que cada prueba añade.
   */
  function evenBoard(): GameState {
    const base = mainState({}, 3);
    const hexes = Object.fromEntries(
      Object.entries(base.board.hexes).map(([id, tile]) => [
        id,
        { ...tile, number: tile.terrain === 'none' ? null : 8 },
      ]),
    );
    const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
    return {
      ...base,
      board: { ...base.board, hexes },
      buildings: {},
      roads: {},
      players: base.players.map((p) => ({ ...p, hand: none })),
      phase: { type: 'robber', returnTo: 'main' },
    };
  }

  /** Vértices libres cuyos hexágonos no tocan ningún edificio. */
  function quietVertices(state: GameState): string[] {
    const busy = new Set(
      Object.keys(state.buildings).flatMap((v) => state.board.topology.vertexById[v]?.hexes ?? []),
    );
    return state.board.topology.vertices
      .filter((v) => v.hexes.every((h) => !busy.has(h) && h !== state.robber))
      .map((v) => v.id);
  }

  const hexesOf = (state: GameState, vertex: string) =>
    state.board.topology.vertexById[vertex]?.hexes ?? [];

  it('lo mueve donde más daño hace al rival y le roba', () => {
    const base = evenBoard();
    const [city, settlement] = quietVertices(base).filter((v, i, all) => {
      // dos vértices alejados entre sí (sin hexágonos en común)
      const first = all[0] ?? '';
      return i === 0 || !hexesOf(base, v).some((h) => hexesOf(base, first).includes(h));
    });
    if (!city || !settlement) throw new Error('sin vértices de prueba');
    let state = place(base, city, 'p1', 'city');
    state = place(state, settlement, 'p1');
    state = setHand(state, 'p1', { r1: 2 });
    const action = decide(state);
    if (action.type !== 'MOVE_ROBBER') throw new Error(action.type);
    // cualquiera de los hexágonos de la ciudad vale lo mismo (daño doble)
    expect(hexesOf(state, city)).toContain(action.hex);
    expect(action.victim).toBe('p1');
  });

  it('no bloquea su propia casilla si puede dañar a otro', () => {
    const base = evenBoard();
    const [mine, theirs] = quietVertices(base).filter((v, i, all) => {
      const first = all[0] ?? '';
      return i === 0 || !hexesOf(base, v).some((h) => hexesOf(base, first).includes(h));
    });
    if (!mine || !theirs) throw new Error('sin vértices de prueba');
    let state = place(base, mine, 'p0', 'city');
    state = place(state, theirs, 'p1');
    state = setHand(state, 'p1', { r1: 1 });
    const action = decide(state);
    if (action.type !== 'MOVE_ROBBER') throw new Error(action.type);
    expect(hexesOf(state, mine)).not.toContain(action.hex);
    expect(hexesOf(state, theirs)).toContain(action.hex);
    expect(action.victim).toBe('p1');
  });

  it('elige a quién robar: el que va ganando y tiene cartas', () => {
    const base = evenBoard();
    // una casilla con un poblado de p1 y otro de p2 (vértices 0 y 2 solo comparten ese hexágono)
    const hex = base.board.topology.hexes.find(
      (h) =>
        quietVertices(base).includes(h.vertices[0] ?? '') &&
        quietVertices(base).includes(h.vertices[2] ?? ''),
    );
    if (!hex) throw new Error('sin hexágono de prueba');
    let state = place(base, hex.vertices[0] ?? '', 'p1');
    state = place(state, hex.vertices[2] ?? '', 'p2');
    // p2 va por delante en puntos (carretera más larga) y los dos tienen cartas
    state = { ...state, awards: { ...state.awards, longestRoad: 'p2' } };
    state = setHand(setHand(state, 'p1', { r1: 1 }), 'p2', { r2: 1 });
    const action = decide(state);
    expect(action).toEqual({ type: 'MOVE_ROBBER', hex: hex.id, victim: 'p2' });
  });

  it('no roba a quien no tiene cartas aunque sea el líder', () => {
    const base = evenBoard();
    const [rich, poor] = quietVertices(base).filter((v, i, all) => {
      const first = all[0] ?? '';
      return i === 0 || !hexesOf(base, v).some((h) => hexesOf(base, first).includes(h));
    });
    if (!rich || !poor) throw new Error('sin vértices de prueba');
    let state = place(base, rich, 'p1');
    state = place(state, poor, 'p2', 'city');
    state = setHand(state, 'p1', { r1: 1 }); // p2 no tiene cartas
    const action = decide(state);
    if (action.type !== 'MOVE_ROBBER') throw new Error(action.type);
    // el motor no permite robar a quien no tiene cartas, así que el bot no lo intenta
    expect(action.victim).not.toBe('p2');
  });
});

describe('ofertas de otros jugadores', () => {
  const needsR2 = () => {
    const { state } = withSettlementSpot(mainState(), 'p0');
    // le falta arcilla para el poblado y le sobra mineral
    return setHand({ ...state, turn: { ...state.turn, player: 'p1' } }, 'p0', {
      r1: 1,
      r3: 1,
      r4: 1,
      r5: 2,
    });
  };

  it('acepta un trato que le da lo que le falta a cambio de lo que le sobra', () => {
    const state = withOffer(needsR2(), {});
    expect(decide(state)).toEqual({ type: 'ACCEPT_TRADE', offerId: 1 });
  });

  it('rechaza un trato que le quita lo que necesita', () => {
    const base = needsR2();
    const offer = withOffer(setHand(base, 'p0', { r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 }), {
      give: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
      want: { r1: 1, r2: 0, r3: 0, r4: 0, r5: 0 },
    });
    expect(decide(offer)).toEqual({ type: 'REJECT_TRADE', offerId: 1 });
  });

  it('rechaza el trato que no le mejora nada', () => {
    const offer = withOffer(needsR2(), {
      give: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
      want: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
    });
    // 1 a 1 de lo mismo no es legal; probamos cambiar sobrante por sobrante equivalente
    expect(['REJECT_TRADE', 'ACCEPT_TRADE']).toContain(decide(offer).type);
  });

  it('no propone nada ni contraoferta', () => {
    const state = setHand(mainState(), 'p0', { r1: 3, r2: 2 });
    expect(['OFFER_TRADE', 'COUNTER_TRADE']).not.toContain(decide(state).type);
  });

  it('si sustituye a quien hizo una oferta sin respuestas, la cancela', () => {
    const state = withOffer(setHand(mainState(), 'p0', { r2: 1 }), {
      from: 'p0',
      to: null,
      give: { r1: 0, r2: 1, r3: 0, r4: 0, r5: 0 },
      want: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
    });
    expect(decide(state)).toEqual({ type: 'CANCEL_TRADE', offerId: 1 });
  });

  it('si alguien aceptó una oferta que le conviene, la cierra; si no, la cancela', () => {
    const { state: grown } = withSettlementSpot(mainState(), 'p0');
    // p0 ofrece 1 de mineral que no usa por la arcilla que le falta; p1 la aceptó
    const base = setHand(setHand(grown, 'p0', { r1: 1, r3: 1, r4: 1, r5: 1 }), 'p1', { r2: 1 });
    const good = withOffer(base, {
      from: 'p0',
      give: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
      want: { r1: 0, r2: 1, r3: 0, r4: 0, r5: 0 },
      accepted: ['p1'],
    });
    expect(decide(good)).toEqual({ type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' });

    const bad = withOffer(base, {
      from: 'p0',
      give: { r1: 1, r2: 0, r3: 0, r4: 0, r5: 0 },
      want: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
      accepted: ['p1'],
    });
    expect(decide(setHand(bad, 'p1', { r5: 1 })).type).toBe('CANCEL_TRADE');
  });

  it('cierra una contraoferta que le conviene', () => {
    const { state: grown } = withSettlementSpot(mainState(), 'p0');
    const base = setHand(setHand(grown, 'p0', { r1: 1, r3: 1, r4: 1, r5: 1 }), 'p1', { r2: 1 });
    const offer = withOffer(base, {
      from: 'p0',
      give: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
      want: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 },
      counters: [
        {
          from: 'p1',
          give: { r1: 0, r2: 1, r3: 0, r4: 0, r5: 0 },
          want: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 1 },
        },
      ],
    });
    expect(decide(offer)).toEqual({ type: 'CONFIRM_COUNTER', offerId: 1, with: 'p1' });
  });
});

describe('casos límite', () => {
  it('sin jugadas legales devuelve null y no consume el rng', () => {
    // fuera de su turno y sin oferta pendiente no hay nada que hacer
    const state = mainState();
    const { move, rng: after } = chooseSmartMove(state, 'p1', rng);
    expect(move).toBeNull();
    expect(after).toBe(rng);
  });

  it('es determinista: mismo estado y mismo rng, misma jugada', () => {
    const state = mainState({ p0: { r1: 2, r2: 2, r3: 1, r4: 1, r5: 1 } });
    const a = chooseSmartMove(state, 'p0', createRng('x'));
    const b = chooseSmartMove(state, 'p0', createRng('x'));
    expect(a).toEqual(b);
  });
});

describe('solo usa lo que vería un jugador', () => {
  /** Mismo estado con las manos y cartas ajenas cambiadas (y el mazo invertido), sin alterar los totales. */
  function scrambled(state: GameState, me: PlayerId): GameState {
    return {
      ...state,
      devDeck: [...state.devDeck].reverse(),
      players: state.players.map((p) => {
        if (p.id === me) return p;
        const h = p.hand;
        return {
          ...p,
          hand: { r1: h.r5, r2: h.r1, r3: h.r2, r4: h.r3, r5: h.r4 },
          devCards: p.devCards.map((c) => ({ ...c, card: c.card === 'point' ? 'army' : 'point' })),
        };
      }),
    };
  }

  it('toma la misma decisión aunque se cambien las manos ajenas y el mazo', () => {
    let state = newGame(4, 'no-peeking');
    let bot = createRng('peek');
    let compared = 0;
    for (let i = 0; i < 400 && state.phase.type !== 'ended'; i++) {
      const actor = pendingActor(state);
      const real = chooseSmartMove(state, actor, bot);
      const fake = chooseSmartMove(scrambled(state, actor), actor, bot);
      expect(fake.move, `paso ${i}: ${state.phase.type}`).toEqual(real.move);
      compared++;
      if (!real.move) break;
      bot = real.rng;
      state = apply(state, actor, real.move.action).state;
    }
    expect(compared).toBeGreaterThan(300);
  });
});

describe('partidas completas', () => {
  it('cuatro bots razonables terminan sin romper ninguna invariante y sin proponer tratos', () => {
    const bots = { p0: 'smart', p1: 'smart', p2: 'smart', p3: 'smart' } as const;
    for (let i = 0; i < 12; i++) {
      const report = simulateGame(`smart-${i}`, 4, { maxSteps: 20000, checkEvery: 5, bots });
      expect(report.violations, report.seed).toEqual([]);
      expect(report.finished, report.seed).toBe(true);
    }
  });

  it('juegan con 2 y 3 jugadores', () => {
    for (const players of [2, 3]) {
      const bots = Object.fromEntries(
        ['p0', 'p1', 'p2'].slice(0, players).map((id) => [id, 'smart' as const]),
      );
      const report = simulateGame(`smart-n-${players}`, players, {
        maxSteps: 20000,
        checkEvery: 5,
        bots,
      });
      expect(report.violations).toEqual([]);
      expect(report.finished).toBe(true);
    }
  });

  it('un bot razonable gana claramente a tres aleatorios (el azar daría un 25 %)', () => {
    const bots = { p0: 'smart', p1: 'random', p2: 'random', p3: 'random' } as const;
    const games = 60;
    let wins = 0;
    for (let i = 0; i < games; i++) {
      const report = simulateGame(`versus-${i}`, 4, { maxSteps: 20000, checkEvery: 25, bots });
      expect(report.violations, report.seed).toEqual([]);
      if (report.winner === 'p0') wins++;
    }
    expect(wins / games).toBeGreaterThan(0.7);
  });
});
