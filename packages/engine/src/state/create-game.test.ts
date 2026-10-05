import { describe, expect, it } from 'vitest';
import { createConfig } from './config.js';
import { createGame } from './create-game.js';
import { totalCards } from './resources.js';

const players = ['p0', 'p1', 'p2', 'p3'];

describe('createGame', () => {
  it('crea el estado inicial esperado', () => {
    const s = createGame(createConfig(players), 'seed');
    expect(s.players.map((p) => p.id)).toEqual(players);
    expect(s.phase).toEqual({ type: 'setup', index: 0, step: 'settlement', lastSettlement: null });
    expect(s.turn.player).toBe('p0');
    expect(s.winner).toBeNull();
    expect(Object.keys(s.buildings)).toHaveLength(0);
    expect(Object.keys(s.roads)).toHaveLength(0);
    expect(s.log).toHaveLength(0);
  });

  it('banco de 19 por recurso, manos vacías y piezas completas', () => {
    const s = createGame(createConfig(players), 'seed');
    expect(s.bank).toEqual({ r1: 19, r2: 19, r3: 19, r4: 19, r5: 19 });
    for (const p of s.players) {
      expect(totalCards(p.hand)).toBe(0);
      expect(p.pieces).toEqual({ roads: 15, settlements: 5, cities: 4 });
    }
  });

  it('mazo de desarrollo de 25 cartas con la composición configurada', () => {
    const s = createGame(createConfig(players), 'seed');
    expect(s.devDeck).toHaveLength(25);
    expect(s.devDeck.filter((c) => c === 'army')).toHaveLength(14);
    expect(s.devDeck.filter((c) => c === 'point')).toHaveLength(5);
  });

  it('el ladrón empieza en el terreno sin producción', () => {
    const s = createGame(createConfig(players), 'seed');
    expect(s.board.hexes[s.robber]?.terrain).toBe('none');
  });

  it('es determinista y serializable en JSON', () => {
    const a = createGame(createConfig(players), 'same');
    const b = createGame(createConfig(players), 'same');
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(createGame(createConfig(players), 'other').board).not.toEqual(a.board);
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => createGame(createConfig(['solo']), 's')).toThrow();
    expect(() => createGame(createConfig(['a', 'a']), 's')).toThrow();
    expect(() => createGame(createConfig(['a', 'b', 'c', 'd', 'e']), 's')).toThrow();
  });
});
