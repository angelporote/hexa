import { describe, expect, it } from 'vitest';
import { applyAction, createConfig, createGame, getPlayerView } from '@hexa/engine';
import type { Action, GameState, PlayerView } from '@hexa/engine';
import {
  findBankTrade,
  findDiscard,
  findPlenty,
  forcedMode,
  has,
  isMyTurn,
  legalEdges,
  legalVertices,
  ofType,
  robberOptions,
  sameCounts,
} from './legal.js';
import { setupGame } from '../testing.js';

const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

function viewOf(state: GameState, player: string): PlayerView {
  return getPlayerView(state, player);
}

describe('derivación de la interfaz desde legalActions', () => {
  it('ofType y has filtran por tipo', () => {
    const legal: Action[] = [
      { type: 'ROLL' },
      { type: 'BUILD_ROAD', edge: 'e1' },
      { type: 'BUILD_ROAD', edge: 'e2' },
    ];
    expect(ofType(legal, 'BUILD_ROAD').map((a) => a.edge)).toEqual(['e1', 'e2']);
    expect(has(legal, 'ROLL')).toBe(true);
    expect(has(legal, 'END_TURN')).toBe(false);
  });

  it('agrupa vértices, aristas y opciones del ladrón', () => {
    const legal: Action[] = [
      { type: 'BUILD_SETTLEMENT', vertex: 'v1' },
      { type: 'BUILD_CITY', vertex: 'v2' },
      { type: 'BUILD_ROAD', edge: 'e1' },
      { type: 'MOVE_ROBBER', hex: 'h1', victim: null },
      { type: 'MOVE_ROBBER', hex: 'h2', victim: 'p1' },
      { type: 'MOVE_ROBBER', hex: 'h2', victim: 'p2' },
    ];
    expect([...legalVertices(legal, 'BUILD_SETTLEMENT')]).toEqual(['v1']);
    expect([...legalVertices(legal, 'BUILD_CITY')]).toEqual(['v2']);
    expect([...legalEdges(legal)]).toEqual(['e1']);
    expect(robberOptions(legal).get('h1')).toEqual([null]);
    expect(robberOptions(legal).get('h2')).toEqual(['p1', 'p2']);
  });

  it('busca descartes y cambios por contenido, y la abundancia sin importar el orden', () => {
    const legal: Action[] = [
      { type: 'DISCARD', resources: { ...none, r1: 2 } },
      { type: 'BANK_TRADE', give: 'r1', want: 'r2' },
      { type: 'PLAY_PLENTY', resources: ['r1', 'r3'] },
    ];
    expect(findDiscard(legal, { ...none, r1: 2 })).toBeDefined();
    expect(findDiscard(legal, { ...none, r1: 1 })).toBeUndefined();
    expect(findBankTrade(legal, 'r1', 'r2')).toBeDefined();
    expect(findBankTrade(legal, 'r2', 'r1')).toBeUndefined();
    expect(findPlenty(legal, 'r3', 'r1')).toBeDefined();
    expect(findPlenty(legal, 'r1', 'r1')).toBeUndefined();
    expect(sameCounts(none, { ...none })).toBe(true);
    expect(sameCounts(none, { ...none, r5: 1 })).toBe(false);
  });
});

describe('forcedMode', () => {
  it('en la colocación inicial: primero poblado y después camino, solo para quien le toca', () => {
    let state = setupGameStart();
    expect(forcedMode(viewOf(state, 'p0'))).toEqual({ kind: 'settlement' });
    expect(forcedMode(viewOf(state, 'p1'))).toBeNull();
    const vertex = viewOf(state, 'p0').legalActions.find((a) => a.type === 'BUILD_SETTLEMENT');
    if (vertex?.type !== 'BUILD_SETTLEMENT') throw new Error('sin poblado legal');
    state = applySimple(state, 'p0', vertex);
    expect(forcedMode(viewOf(state, 'p0'))).toEqual({ kind: 'road', remaining: null });
  });

  it('en la fase de tirada no fuerza nada y se sabe de quién es el turno', () => {
    const state = setupGame();
    expect(forcedMode(viewOf(state, 'p0'))).toBeNull();
    expect(isMyTurn(viewOf(state, 'p0'))).toBe(true);
    expect(isMyTurn(viewOf(state, 'p1'))).toBe(false);
    expect(isMyTurn(getPlayerView(state, 'host'))).toBe(false);
  });

  it('fuerza el ladrón, los caminos gratis y el descarte', () => {
    const base = setupGame();
    const robber = viewOf({ ...base, phase: { type: 'robber', returnTo: 'main' } }, 'p0');
    expect(forcedMode(robber)).toEqual({ kind: 'robber' });
    expect(
      forcedMode(viewOf({ ...base, phase: { type: 'robber', returnTo: 'main' } }, 'p1')),
    ).toBeNull();

    const roads = viewOf(
      { ...base, phase: { type: 'roadBuilding', remaining: 2, returnTo: 'main' } },
      'p0',
    );
    expect(forcedMode(roads)).toEqual({ kind: 'road', remaining: 2 });

    const hand = { ...none, r1: 5, r2: 4 };
    const owing: GameState = {
      ...base,
      phase: { type: 'discard', owed: { p1: 4 } },
      players: base.players.map((p) => (p.id === 'p1' ? { ...p, hand } : p)),
    };
    expect(forcedMode(viewOf(owing, 'p1'))).toEqual({ kind: 'discard', owed: 4 });
    expect(forcedMode(viewOf(owing, 'p2'))).toBeNull();
    expect(forcedMode(getPlayerView(owing, 'host'))).toBeNull();
  });
});

function setupGameStart(): GameState {
  return createGame(createConfig(['p0', 'p1', 'p2']), 'legal-tests');
}

function applySimple(state: GameState, player: string, action: Action): GameState {
  const r = applyAction(state, player, action);
  if (!r.ok) throw new Error(r.error);
  return r.value.state;
}
