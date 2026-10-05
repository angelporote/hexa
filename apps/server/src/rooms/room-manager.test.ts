import { describe, expect, it } from 'vitest';
import type { Action } from '@hexa/engine';
import { silentLogger } from '../logger.js';
import { MemoryRoomStore } from '../store/room-store.js';
import { replayGame } from './replay.js';
import { RoomManager } from './room-manager.js';
import type { ManagerResult, OutMessage } from './room-manager.js';

function setup(overrides: { ttl?: number } = {}) {
  let now = 1_000;
  let tokens = 0;
  let seeds = 0;
  let rnd = 12345;
  const store = new MemoryRoomStore();
  const manager = new RoomManager({
    store,
    logger: silentLogger,
    clock: () => now,
    randomInt: (max) => {
      rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0;
      return rnd % max;
    },
    token: () => `token-${String(++tokens).padStart(20, '0')}`,
    seed: () => `seed-${++seeds}`,
    roomTtlMs: overrides.ttl ?? 10_000,
  });
  return { manager, store, advance: (ms: number) => (now += ms) };
}

function must<T>(r: ManagerResult<T>): { data: T; out: OutMessage[] } {
  if (!r.ok) throw new Error(`falló: ${r.error}`);
  return r.value;
}

/** Sala con host `h` y jugadores `a`, `b`, … ya listos. */
function lobby(count = 2) {
  const s = setup();
  const created = must(s.manager.createRoom('h'));
  const code = created.data.code;
  const players = ['a', 'b', 'c', 'd'].slice(0, count);
  const sessions = players.map(
    (id, i) =>
      must(s.manager.join(id, { protocolVersion: 1, code, role: 'player', name: `Jugador${i}` }))
        .data,
  );
  for (const id of players) must(s.manager.updateLobby(id, { protocolVersion: 1, ready: true }));
  return { ...s, code, players, sessions, host: created.data };
}

const stateOf = (out: OutMessage[], to: string) =>
  out.find((m) => m.to === to && m.event === 'room:state')?.payload;

describe('creación de salas', () => {
  it('crea una sala en lobby con el creador como host y devuelve su token', () => {
    const { manager } = setup();
    const { data, out } = must(manager.createRoom('h'));
    expect(data.role).toBe('host');
    expect(data.code).toMatch(/^[A-Z]{4}$/);
    expect(data.token.length).toBeGreaterThanOrEqual(16);
    expect(manager.getRoom(data.code)?.status).toBe('lobby');
    expect(stateOf(out, 'h')).toMatchObject({
      status: 'lobby',
      hostConnected: true,
      you: { role: 'host' },
    });
  });

  it('cada sala tiene un código distinto y la sala queda persistida', async () => {
    const { manager, store } = setup();
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(must(manager.createRoom(`c${i}`)).data.code);
    expect(codes.size).toBe(50);
    expect((await store.loadAll()).length).toBe(50);
  });

  it('una conexión no puede crear ni unirse a una segunda sala', () => {
    const { manager } = setup();
    const { data } = must(manager.createRoom('h'));
    expect(manager.createRoom('h')).toEqual({ ok: false, error: 'ALREADY_IN_ROOM' });
    expect(manager.join('h', { protocolVersion: 1, code: data.code, role: 'spectator' })).toEqual({
      ok: false,
      error: 'ALREADY_IN_ROOM',
    });
  });
});

describe('unirse', () => {
  it('un jugador recibe asiento, color y token; todos ven el lobby actualizado', () => {
    const { manager } = setup();
    const { data: host } = must(manager.createRoom('h'));
    const joined = must(
      manager.join('a', { protocolVersion: 1, code: host.code, role: 'player', name: 'Ana' }),
    );
    expect(joined.data).toMatchObject({ role: 'player', playerId: 'p0' });
    expect(stateOf(joined.out, 'h')).toMatchObject({
      seats: [{ name: 'Ana', color: 'c1', ready: false, connected: true }],
    });
    expect(stateOf(joined.out, 'a')).toMatchObject({ you: { role: 'player', playerId: 'p0' } });
  });

  it('asigna colores distintos y respeta el pedido', () => {
    const { manager } = setup();
    const { data: host } = must(manager.createRoom('h'));
    must(
      manager.join('a', {
        protocolVersion: 1,
        code: host.code,
        role: 'player',
        name: 'A',
        color: 'c3',
      }),
    );
    must(manager.join('b', { protocolVersion: 1, code: host.code, role: 'player', name: 'B' }));
    expect(manager.getRoom(host.code)?.seats.map((s) => s.color)).toEqual(['c3', 'c1']);
    expect(
      manager.join('c', {
        protocolVersion: 1,
        code: host.code,
        role: 'player',
        name: 'C',
        color: 'c3',
      }),
    ).toEqual({ ok: false, error: 'COLOR_TAKEN' });
  });

  it('rechaza sala inexistente, nombre repetido (sin distinguir mayúsculas) y sala llena', () => {
    const { manager } = setup();
    const { data: host } = must(manager.createRoom('h'));
    expect(
      manager.join('x', { protocolVersion: 1, code: 'ZZZZ', role: 'player', name: 'X' }),
    ).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    must(manager.join('a', { protocolVersion: 1, code: host.code, role: 'player', name: 'Ana' }));
    expect(
      manager.join('b', { protocolVersion: 1, code: host.code, role: 'player', name: ' ANA ' }),
    ).toEqual({ ok: false, error: 'NAME_TAKEN' });
    for (const [i, id] of ['b', 'c', 'd'].entries()) {
      must(
        manager.join(id, { protocolVersion: 1, code: host.code, role: 'player', name: `P${i}` }),
      );
    }
    expect(
      manager.join('e', { protocolVersion: 1, code: host.code, role: 'player', name: 'Extra' }),
    ).toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('los espectadores entran sin ocupar asiento y se cuentan', () => {
    const { manager } = setup();
    const { data: host } = must(manager.createRoom('h'));
    const spec = must(
      manager.join('s', { protocolVersion: 1, code: host.code, role: 'spectator' }),
    );
    expect(spec.data).toMatchObject({ role: 'spectator', playerId: null });
    expect(stateOf(spec.out, 'h')).toMatchObject({ spectators: 1, seats: [] });
  });
});

describe('lobby', () => {
  it('un jugador cambia nombre, color y estado de listo; los demás lo ven', () => {
    const { manager, code } = lobby(2);
    const r = must(
      manager.updateLobby('a', { protocolVersion: 1, name: 'Nuevo', color: 'c4', ready: false }),
    );
    expect(manager.getRoom(code)?.seats[0]).toMatchObject({
      name: 'Nuevo',
      color: 'c4',
      ready: false,
    });
    expect(stateOf(r.out, 'b')).toMatchObject({ seats: [{ name: 'Nuevo' }, {}] });
  });

  it('rechaza nombres y colores ya cogidos por otros, y a quien no es jugador', () => {
    const { manager } = lobby(2);
    expect(manager.updateLobby('a', { protocolVersion: 1, name: 'jugador1' })).toEqual({
      ok: false,
      error: 'NAME_TAKEN',
    });
    expect(manager.updateLobby('h', { protocolVersion: 1, ready: true })).toEqual({
      ok: false,
      error: 'NOT_A_PLAYER',
    });
    expect(manager.updateLobby('nadie', { protocolVersion: 1, ready: true })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('salir del lobby libera el asiento', () => {
    const { manager, code } = lobby(3);
    must(manager.leave('b'));
    expect(manager.getRoom(code)?.seats.map((s) => s.name)).toEqual(['Jugador0', 'Jugador2']);
    // el asiento liberado puede ocuparse y los ids no se reutilizan
    must(manager.join('z', { protocolVersion: 1, code, role: 'player', name: 'Nuevo' }));
    expect(manager.getRoom(code)?.seats.map((s) => s.playerId)).toEqual(['p0', 'p2', 'p3']);
  });

  it('una desconexión conserva el asiento pero lo marca como desconectado', () => {
    const { manager, code } = lobby(2);
    const out = manager.disconnect('a');
    expect(stateOf(out, 'h')).toMatchObject({ seats: [{ connected: false }, { connected: true }] });
    expect(manager.getRoom(code)?.seats).toHaveLength(2);
  });
});

describe('inicio de partida', () => {
  it('solo el host, con 2 o más jugadores y todos listos', () => {
    const s = setup();
    const { data: host } = must(s.manager.createRoom('h'));
    must(s.manager.join('a', { protocolVersion: 1, code: host.code, role: 'player', name: 'A' }));
    expect(s.manager.start('h')).toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });
    must(s.manager.join('b', { protocolVersion: 1, code: host.code, role: 'player', name: 'B' }));
    expect(s.manager.start('h')).toEqual({ ok: false, error: 'PLAYERS_NOT_READY' });
    must(s.manager.updateLobby('a', { protocolVersion: 1, ready: true }));
    must(s.manager.updateLobby('b', { protocolVersion: 1, ready: true }));
    expect(s.manager.start('a')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(s.manager.start('h').ok).toBe(true);
    expect(s.manager.start('h')).toEqual({ ok: false, error: 'GAME_ALREADY_STARTED' });
  });

  it('crea la partida y envía a cada conexión su vista personal', () => {
    const { manager, code } = lobby(3);
    const r = must(manager.start('h'));
    const room = manager.getRoom(code);
    expect(room?.status).toBe('playing');
    expect(room?.game?.seed).toBe('seed-1');
    const views = r.out.filter((m) => m.event === 'game:view');
    expect(views.map((v) => v.to).sort()).toEqual(['a', 'b', 'c', 'h']);
    for (const m of views) {
      if (m.event !== 'game:view') continue;
      const you = m.payload.view.you;
      expect(you === null ? m.to === 'h' : m.to !== 'h').toBe(true);
    }
  });

  it('cierra la entrada de nuevos jugadores pero admite espectadores', () => {
    const { manager, code } = lobby(2);
    must(manager.start('h'));
    expect(manager.join('x', { protocolVersion: 1, code, role: 'player', name: 'Tarde' })).toEqual({
      ok: false,
      error: 'GAME_ALREADY_STARTED',
    });
    const spec = must(manager.join('s', { protocolVersion: 1, code, role: 'spectator' }));
    const view = spec.out.find((m) => m.event === 'game:view');
    expect(view && view.event === 'game:view' && view.payload.view.you).toBeNull();
    expect(manager.updateLobby('a', { protocolVersion: 1, ready: false })).toEqual({
      ok: false,
      error: 'GAME_ALREADY_STARTED',
    });
  });
});

describe('sesiones y reconexión', () => {
  it('un jugador recupera su asiento y su vista con el token', () => {
    const { manager, code, sessions } = lobby(2);
    must(manager.start('h'));
    manager.disconnect('a');
    const r = must(
      manager.resume('a2', { protocolVersion: 1, code, token: sessions[0]?.token ?? '' }),
    );
    expect(r.data).toMatchObject({ role: 'player', playerId: 'p0' });
    const view = r.out.find((m) => m.to === 'a2' && m.event === 'game:view');
    expect(view && view.event === 'game:view' && view.payload.view.you?.id).toBe('p0');
    expect(stateOf(r.out, 'h')).toMatchObject({
      seats: [{ connected: true }, { connected: true }],
    });
  });

  it('el host y los espectadores también pueden reanudar', () => {
    const { manager, code, host } = lobby(2);
    manager.disconnect('h');
    expect(
      must(manager.resume('h2', { protocolVersion: 1, code, token: host.token })).data.role,
    ).toBe('host');
    const spec = must(manager.join('s', { protocolVersion: 1, code, role: 'spectator' }));
    manager.disconnect('s');
    expect(
      must(manager.resume('s2', { protocolVersion: 1, code, token: spec.data.token })).data.role,
    ).toBe('spectator');
  });

  it('la conexión nueva sustituye a la anterior de la misma identidad', () => {
    const { manager, code, sessions } = lobby(2);
    const r = must(
      manager.resume('a2', { protocolVersion: 1, code, token: sessions[0]?.token ?? '' }),
    );
    expect(r.out).toContainEqual({
      to: 'a',
      event: 'error',
      payload: { error: 'SESSION_REPLACED' },
    });
    expect(manager.connectionCount(code)).toBe(3); // h, b, a2
    // la conexión antigua ya no puede actuar
    expect(manager.updateLobby('a', { protocolVersion: 1, ready: false })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('rechaza tokens inválidos, salas inexistentes y tokens de otra sala', () => {
    const { manager, code, sessions } = lobby(2);
    expect(
      manager.resume('x', { protocolVersion: 1, code, token: 'falso'.padEnd(20, 'x') }),
    ).toEqual({ ok: false, error: 'INVALID_SESSION' });
    expect(
      manager.resume('x', { protocolVersion: 1, code: 'ZZZZ', token: sessions[0]?.token ?? '' }),
    ).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    const other = must(manager.createRoom('h2')).data.code;
    expect(
      manager.resume('x', { protocolVersion: 1, code: other, token: sessions[0]?.token ?? '' }),
    ).toEqual({ ok: false, error: 'INVALID_SESSION' });
  });

  it('abandonar durante la partida conserva el asiento', () => {
    const { manager, code, sessions } = lobby(2);
    must(manager.start('h'));
    must(manager.leave('a'));
    expect(manager.getRoom(code)?.seats).toHaveLength(2);
    expect(
      manager.resume('a2', { protocolVersion: 1, code, token: sessions[0]?.token ?? '' }).ok,
    ).toBe(true);
  });
});

describe('acciones de juego', () => {
  /** Partida iniciada; `a` y `b` se reconectan como `a-v` y `b-v` para recibir su vista. */
  function started() {
    const l = lobby(2);
    must(l.manager.start('h'));
    const views = new Map<string, Action[]>();
    for (const [i, id] of ['a', 'b'].entries()) {
      const r = must(
        l.manager.resume(`${id}-v`, {
          protocolVersion: 1,
          code: l.code,
          token: l.sessions[i]?.token ?? '',
        }),
      );
      views.set(id, legalOf(r.out, `${id}-v`));
    }
    return { ...l, views };
  }

  function legalOf(out: OutMessage[], to: string): Action[] {
    const m = out.find((x) => x.to === to && x.event === 'game:view');
    if (!m || m.event !== 'game:view') throw new Error('sin vista');
    return [...m.payload.view.legalActions];
  }

  it('aplica la acción con el jugador de la conexión y reparte eventos y vistas', () => {
    const l = started();
    const action = l.views.get('a')?.[0];
    if (!action) throw new Error('sin acciones legales');
    const r = must(l.manager.action('a-v', action));
    expect(
      r.out
        .filter((m) => m.event === 'game:events')
        .map((m) => m.to)
        .sort(),
    ).toEqual(['a-v', 'b-v', 'h']);
    const views = r.out.filter((m) => m.event === 'game:view');
    expect(views).toHaveLength(3);
    for (const m of views) if (m.event === 'game:view') expect(m.payload.seq).toBe(1);
    const room = l.manager.getRoom(l.code);
    expect(room?.game?.actions).toEqual([{ player: 'p0', action }]);
  });

  it('rechaza las acciones ilegales con el código de error del motor', () => {
    const l = started();
    expect(l.manager.action('b-v', { type: 'ROLL' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(l.manager.action('a-v', { type: 'ROLL' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(l.manager.getRoom(l.code)?.game?.actions).toHaveLength(0);
  });

  it('el host y los espectadores no pueden actuar; sin partida tampoco', () => {
    const l = started();
    expect(l.manager.action('h', { type: 'ROLL' })).toEqual({ ok: false, error: 'NOT_A_PLAYER' });
    const s = lobby(2);
    expect(s.manager.action('a', { type: 'ROLL' })).toEqual({
      ok: false,
      error: 'GAME_NOT_STARTED',
    });
    expect(s.manager.action('nadie', { type: 'ROLL' })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('la instantánea guardada coincide con reaplicar semilla + acciones', () => {
    const l = started();
    const first = l.views.get('a')?.[0];
    if (!first) throw new Error('sin acciones legales');
    const r = must(l.manager.action('a-v', first));
    const second = legalOf(r.out, 'a-v')[0];
    if (!second) throw new Error('sin segunda acción');
    must(l.manager.action('a-v', second));
    const game = l.manager.getRoom(l.code)?.game;
    if (!game) throw new Error('sin partida');
    expect(game.actions).toHaveLength(2);
    expect(replayGame(game)).toEqual(game.snapshot);
  });
});

describe('caducidad y recuperación', () => {
  it('elimina salas sin conexiones tras el TTL y libera su código', () => {
    const s = setup({ ttl: 5_000 });
    const { data } = must(s.manager.createRoom('h'));
    s.manager.disconnect('h');
    s.advance(4_000);
    expect(s.manager.sweep()).toEqual([]);
    s.advance(2_000);
    expect(s.manager.sweep()).toEqual([data.code]);
    expect(s.manager.getRoom(data.code)).toBeUndefined();
    expect(s.manager.join('x', { protocolVersion: 1, code: data.code, role: 'spectator' })).toEqual(
      { ok: false, error: 'ROOM_NOT_FOUND' },
    );
  });

  it('no elimina salas con alguien conectado, por antiguas que sean', () => {
    const s = setup({ ttl: 1_000 });
    const { data } = must(s.manager.createRoom('h'));
    s.advance(10_000);
    expect(s.manager.sweep()).toEqual([]);
    expect(s.manager.getRoom(data.code)).toBeDefined();
  });

  it('la actividad aplaza la caducidad', () => {
    const s = setup({ ttl: 5_000 });
    const { data } = must(s.manager.createRoom('h'));
    must(s.manager.join('a', { protocolVersion: 1, code: data.code, role: 'player', name: 'A' }));
    s.manager.disconnect('h');
    s.manager.disconnect('a');
    s.advance(4_000);
    const spec = must(
      s.manager.join('s', { protocolVersion: 1, code: data.code, role: 'spectator' }),
    );
    s.manager.disconnect('s');
    expect(spec.data.code).toBe(data.code);
    s.advance(4_000);
    expect(s.manager.sweep()).toEqual([]);
  });

  it('hydrate recupera las salas guardadas', async () => {
    const s = setup();
    const { data } = must(s.manager.createRoom('h'));
    await Promise.resolve();
    const fresh = new RoomManager({
      store: s.store,
      logger: silentLogger,
      clock: () => 0,
      randomInt: () => 0,
      token: () => 'x'.repeat(20),
      seed: () => 's',
      roomTtlMs: 1,
    });
    expect(await fresh.hydrate()).toBe(1);
    expect(fresh.getRoom(data.code)?.hostToken).toBe(data.token);
    expect(fresh.resume('h', { protocolVersion: 1, code: data.code, token: data.token }).ok).toBe(
      true,
    );
  });
});
