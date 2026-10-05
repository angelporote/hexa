import { describe, expect, it } from 'vitest';
import { newGame, apply, autoSetup } from '../test-utils.js';
import { checkInvariants } from './invariants.js';
import { simulateGame } from './simulate.js';

describe('invariantes', () => {
  it('un estado recién creado y uno tras la colocación cumplen todas', () => {
    expect(checkInvariants(newGame(4))).toEqual([]);
    expect(checkInvariants(autoSetup(newGame(4)))).toEqual([]);
  });

  it('detectan recursos creados de la nada', () => {
    const s = newGame(3);
    const bad = {
      ...s,
      players: s.players.map((p, i) => (i === 0 ? { ...p, hand: { ...p.hand, r1: 1 } } : p)),
    };
    expect(checkInvariants(bad).join()).toContain('recurso r1');
  });

  it('detectan la regla de distancia rota y piezas mal contadas', () => {
    const s = autoSetup(newGame(3));
    const v = s.board.topology.vertices.find((x) => s.buildings[x.id]);
    const neighbor = v?.neighbors[0] ?? '';
    const bad = {
      ...s,
      buildings: { ...s.buildings, [neighbor]: { owner: 'p0', kind: 'settlement' as const } },
    };
    const problems = checkInvariants(bad).join();
    expect(problems).toContain('regla de distancia');
    expect(problems).toContain('poblados mal contados');
  });

  it('detectan bonificaciones desactualizadas', () => {
    const s = newGame(3);
    expect(checkInvariants({ ...s, awards: { longestRoad: 'p0', largestArmy: null } })).not.toEqual(
      [],
    );
  });

  it('el estado tras una acción válida sigue cumpliéndolas', () => {
    const s = newGame(3);
    const v = s.board.topology.vertices[0];
    const next = apply(s, 'p0', { type: 'BUILD_SETTLEMENT', vertex: v?.id ?? '' }).state;
    expect(checkInvariants(next)).toEqual([]);
  });
});

describe('simulateGame', () => {
  it('juega partidas completas sin violaciones y es determinista', () => {
    for (let i = 0; i < 6; i++) {
      const report = simulateGame(`sim-${i}`, 3 + (i % 2));
      expect(report.violations).toEqual([]);
      expect(report.finished).toBe(true);
      expect(report.winner).not.toBeNull();
      expect(Math.max(...Object.values(report.points))).toBeGreaterThanOrEqual(10);
    }
    expect(simulateGame('same', 4)).toEqual(simulateGame('same', 4));
  }, 60000);
});
