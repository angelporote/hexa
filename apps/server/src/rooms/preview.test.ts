import { describe, expect, it } from 'vitest';
import { silentLogger } from '../logger.js';
import { MemoryRoomStore } from '../store/room-store.js';
import { RoomManager } from './room-manager.js';
import type { ManagerResult } from './room-manager.js';

function must<T>(r: ManagerResult<T>) {
  if (!r.ok) throw new Error(`falló: ${r.error}`);
  return r.value;
}

/** Sala de 2 jugadores con la partida empezada, más un espectador: conexiones h, a, b y s. */
function started() {
  let tokens = 0;
  const manager = new RoomManager({
    store: new MemoryRoomStore(),
    logger: silentLogger,
    clock: () => 1,
    randomInt: () => 0,
    token: () => `token-${String(++tokens).padStart(20, '0')}`,
    seed: () => 'preview-seed',
    roomTtlMs: 1000,
  });
  const { data } = must(manager.createRoom('h'));
  for (const id of ['a', 'b']) {
    must(manager.join(id, { protocolVersion: 1, code: data.code, role: 'player', name: id }));
    must(manager.updateLobby(id, { protocolVersion: 1, ready: true }));
  }
  must(manager.join('s', { protocolVersion: 1, code: data.code, role: 'spectator' }));
  must(manager.start('h'));
  return manager;
}

describe('game:preview', () => {
  it('el jugador de turno lo reenvía a todos los demás, no a sí mismo', () => {
    const manager = started();
    const out = must(manager.preview('a', { kind: 'vertex', id: 'v3' })).out;
    expect(out.map((m) => m.to).sort()).toEqual(['b', 'h', 's']);
    for (const m of out) {
      expect(m).toMatchObject({
        event: 'game:preview',
        payload: { playerId: 'p0', target: { kind: 'vertex', id: 'v3' } },
      });
    }
  });

  it('se puede borrar enviando null', () => {
    const manager = started();
    const out = must(manager.preview('a', null)).out;
    expect(out[0]).toMatchObject({ payload: { playerId: 'p0', target: null } });
  });

  it('no lo puede enviar quien no tiene el turno, ni el host, ni un espectador', () => {
    const manager = started();
    const target = { kind: 'hex', id: 'h0,0' } as const;
    expect(manager.preview('b', target)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(manager.preview('h', target)).toEqual({ ok: false, error: 'NOT_A_PLAYER' });
    expect(manager.preview('s', target)).toEqual({ ok: false, error: 'NOT_A_PLAYER' });
    expect(manager.preview('nadie', target)).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('no se puede usar antes de empezar la partida y no altera la partida', () => {
    const manager = new RoomManager({
      store: new MemoryRoomStore(),
      logger: silentLogger,
      clock: () => 1,
      randomInt: () => 0,
      token: () => 'x'.repeat(20),
      seed: () => 's',
      roomTtlMs: 1,
    });
    const { data } = must(manager.createRoom('h'));
    must(manager.join('a', { protocolVersion: 1, code: data.code, role: 'player', name: 'A' }));
    expect(manager.preview('a', null)).toEqual({ ok: false, error: 'GAME_NOT_STARTED' });

    const live = started();
    // con randomInt = 0 el código de sala es siempre AAAA
    const before = JSON.stringify(live.getRoom('AAAA'));
    must(live.preview('a', { kind: 'edge', id: 'e1' }));
    expect(JSON.stringify(live.getRoom('AAAA'))).toBe(before);
  });
});
