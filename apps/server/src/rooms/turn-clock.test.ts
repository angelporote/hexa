import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legalActions } from '@hexa/engine';
import type { Action } from '@hexa/engine';
import { BotDriver } from '../bots/bot-driver.js';
import { silentLogger } from '../logger.js';
import { storeWith, tradeRoom } from '../testing/trade-room.js';
import { MemoryRoomStore } from '../store/room-store.js';
import { RoomManager } from './room-manager.js';
import type { ManagerResult, OutMessage } from './room-manager.js';
import { TurnTimer } from './turn-timer.js';

const UNIT = 100; // «un segundo» del temporizador dura 100 ms en estos tests

function make(store = new MemoryRoomStore()) {
  let now = 1_000_000;
  let tokens = 0;
  const manager = new RoomManager({
    store,
    logger: silentLogger,
    clock: () => now,
    randomInt: () => 0,
    token: () => `token-${String(++tokens).padStart(20, '0')}`,
    seed: () => 'clock-seed',
    roomTtlMs: 60_000,
    turnTimerUnitMs: UNIT,
  });
  return { manager, advance: (ms: number) => (now += ms), now: () => now };
}

function must<T>(r: ManagerResult<T>): { data: T; out: OutMessage[] } {
  if (!r.ok) throw new Error(`falló: ${r.error}`);
  return r.value;
}

/** Sala con pantalla principal `h`, jugadores `a` y `b` (y `bots` bots), ya empezada. */
function startedRoom(seconds: number | null, bots = 0) {
  const s = make();
  const { manager } = s;
  const code = must(manager.createRoom('h')).data.code;
  for (const [id, name] of [
    ['a', 'Ana'],
    ['b', 'Berta'],
  ] as const) {
    must(manager.join(id, { protocolVersion: 1, code, role: 'player', name }));
    must(manager.updateLobby(id, { protocolVersion: 1, ready: true }));
  }
  for (let i = 0; i < bots; i++) must(manager.addBot('h'));
  if (seconds !== null) {
    must(manager.setOptions('h', { protocolVersion: 1, turnTimerSeconds: seconds }));
  }
  must(manager.start('h'));
  return { ...s, code };
}

const clockMsg = (out: OutMessage[], to: string) => {
  const m = out.find((x) => x.to === to && x.event === 'game:view');
  return m?.event === 'game:view' ? m.payload.clock : undefined;
};
const stateMsg = (out: OutMessage[], to: string) => {
  const m = out.find((x) => x.to === to && x.event === 'room:state');
  return m?.event === 'room:state' ? m.payload : undefined;
};
const firstLegal = (manager: RoomManager, code: string, player: string): Action => {
  const state = manager.getRoom(code)?.game?.snapshot;
  const action = state ? legalActions(state, player)[0] : undefined;
  if (!action) throw new Error(`${player} no tiene jugadas`);
  return action;
};
const seatOf = (manager: RoomManager, code: string, id: string) =>
  manager.getRoom(code)?.seats.find((s) => s.playerId === id);
const tokenOf = (manager: RoomManager, code: string, id: string): string =>
  seatOf(manager, code, id)?.token ?? '';

/** Sala recuperada del almacén en plena fase de descarte con temporizador de 30 s. */
async function discardRoom(owed: Record<string, number>, options: { botSeat?: string } = {}) {
  const { room, state } = tradeRoom({});
  const store = await storeWith({
    ...room,
    turnTimerSeconds: 30,
    seats: room.seats.map((s) => (s.playerId === options.botSeat ? { ...s, bot: true } : s)),
    game: room.game
      ? { ...room.game, snapshot: { ...state, phase: { type: 'discard' as const, owed } } }
      : null,
  });
  const made = make(store);
  await made.manager.hydrate();
  return made;
}

describe('opción de temporizador (lobby:setOptions)', () => {
  it('solo quien administra la fija, y solo antes de empezar', () => {
    const { manager } = make();
    const code = must(manager.createRoom('h')).data.code;
    must(manager.join('a', { protocolVersion: 1, code, role: 'player', name: 'Ana' }));
    const set = (conn: string, turnTimerSeconds: number | null) =>
      manager.setOptions(conn, { protocolVersion: 1, turnTimerSeconds });

    expect(set('a', 60)).toEqual({ ok: false, error: 'NOT_HOST' });
    const done = must(set('h', 60));
    expect(manager.getRoom(code)?.turnTimerSeconds).toBe(60);
    expect(stateMsg(done.out, 'a')).toMatchObject({ options: { turnTimerSeconds: 60 } });
    expect(stateMsg(done.out, 'h')).toMatchObject({ options: { turnTimerSeconds: 60 } });
    must(set('h', null));
    expect(manager.getRoom(code)?.turnTimerSeconds).toBeNull();

    must(manager.updateLobby('a', { protocolVersion: 1, ready: true }));
    must(manager.addBot('h'));
    must(manager.start('h'));
    expect(set('h', 30)).toEqual({ ok: false, error: 'GAME_ALREADY_STARTED' });
  });

  it('en una sala sin pantalla principal la fija quien la creó', () => {
    const { manager } = make();
    const code = must(manager.createRoom('a', { role: 'player', name: 'Ana' })).data.code;
    must(manager.join('b', { protocolVersion: 1, code, role: 'player', name: 'Berta' }));
    expect(manager.setOptions('b', { protocolVersion: 1, turnTimerSeconds: 45 })).toEqual({
      ok: false,
      error: 'NOT_HOST',
    });
    must(manager.setOptions('a', { protocolVersion: 1, turnTimerSeconds: 45 }));
    expect(manager.getRoom(code)?.turnTimerSeconds).toBe(45);
  });
});

describe('reloj de turno', () => {
  it('sin temporizador no hay reloj, ni siquiera con una partida en marcha', () => {
    const { manager, code } = startedRoom(null);
    expect(manager.clockOf(code)).toBeNull();
    const view = must(
      manager.resume('a2', { protocolVersion: 1, code, token: tokenOf(manager, code, 'p0') }),
    );
    expect(clockMsg(view.out, 'a2')).toBeNull();
  });

  it('arranca con la partida: pone en juego a quien tiene que mover y se lo cuenta a todos', () => {
    const { manager, code, now } = startedRoom(30);
    expect(manager.clockOf(code)).toEqual({ actors: ['p0'], deadline: now() + 30 * UNIT });

    const join = must(
      manager.resume('a2', { protocolVersion: 1, code, token: tokenOf(manager, code, 'p0') }),
    );
    expect(clockMsg(join.out, 'a2')).toEqual({ actors: ['p0'], remainingMs: 30 * UNIT });
  });

  it('cada acción reinicia el plazo y el tiempo restante baja con el reloj', () => {
    const { manager, code, advance, now } = startedRoom(30);
    advance(1000);
    const spectate = must(manager.join('s', { protocolVersion: 1, code, role: 'spectator' }));
    expect(clockMsg(spectate.out, 's')).toEqual({ actors: ['p0'], remainingMs: 30 * UNIT - 1000 });

    must(manager.action('a', firstLegal(manager, code, 'p0')));
    const clock = manager.clockOf(code);
    expect(clock?.deadline).toBe(now() + 30 * UNIT);
  });

  it('un cambio que no es una acción (conectarse, desconectarse) no reinicia el plazo', () => {
    const { manager, code, advance } = startedRoom(30);
    const before = manager.clockOf(code);
    advance(500);
    manager.disconnect('a');
    must(manager.resume('a2', { protocolVersion: 1, code, token: tokenOf(manager, code, 'p0') }));
    expect(manager.clockOf(code)).toEqual(before);
  });

  it('los bots no corren contra el reloj', () => {
    // con 2 humanos y 2 bots, el reloj solo existe cuando le toca a una persona
    const { manager, code } = startedRoom(30, 2);
    for (let i = 0; i < 12; i++) {
      const state = manager.getRoom(code)?.game?.snapshot;
      if (!state) throw new Error('sin partida');
      const turn = state.turn.player;
      const seat = seatOf(manager, code, turn);
      expect(manager.clockOf(code)?.actors ?? []).toEqual(seat?.bot ? [] : [turn]);
      const move = firstLegal(manager, code, turn);
      if (seat?.bot) must(manager.botAction(code, turn, move));
      else must(manager.action(turn === 'p0' ? 'a' : 'b', move));
    }
  });

  it('en la fase de descarte corre contra quienes deben descartar, sin contar bots ni al resto', async () => {
    const { manager, now } = await discardRoom({ p1: 2, p3: 1, p2: 3 }, { botSeat: 'p3' });
    // p3 es un bot: solo p1 y p2 están en juego; p0 (de turno) no tiene que mover
    expect(manager.clockOf('TRDE')).toEqual({ actors: ['p1', 'p2'], deadline: now() + 30 * UNIT });
  });

  it('al recuperar salas guardadas cada partida recupera un plazo completo', async () => {
    const { room } = tradeRoom({});
    const store = await storeWith({ ...room, turnTimerSeconds: 20 });
    const { manager, now } = make(store);
    await manager.hydrate();
    expect(manager.clockOf('TRDE')).toEqual({ actors: ['p0'], deadline: now() + 20 * UNIT });
  });

  it('las salas guardadas antes de esta función se recuperan sin temporizador y sin sustitutos', async () => {
    const { room } = tradeRoom({});
    const legacy: Record<string, unknown> = {
      ...room,
      seats: room.seats.map((s) => {
        const copy: Record<string, unknown> = { ...s };
        delete copy['auto'];
        return copy;
      }),
    };
    delete legacy['turnTimerSeconds'];
    const store = new MemoryRoomStore();
    await store.save(legacy as unknown as typeof room);
    const { manager } = make(store);
    await manager.hydrate();
    const restored = manager.getRoom('TRDE');
    expect(restored?.turnTimerSeconds).toBeNull();
    expect(restored?.seats.every((s) => s.auto === false)).toBe(true);
    expect(manager.clockOf('TRDE')).toBeNull();
  });

  it('la sala barrida pierde su reloj', () => {
    const { manager, code, advance } = startedRoom(30);
    manager.disconnect('a');
    manager.disconnect('b');
    manager.disconnect('h');
    advance(61_000);
    expect(manager.sweep()).toEqual([code]);
    expect(manager.clockOf(code)).toBeNull();
  });
});

describe('plazo agotado (expireClock)', () => {
  it('no actúa antes de tiempo ni sobre un reloj ya reiniciado', () => {
    const { manager, code, advance } = startedRoom(30);
    const { deadline } = manager.clockOf(code) ?? { deadline: 0 };
    expect(manager.expireClock(code, deadline)).toEqual({ ok: false, error: 'NO_CLOCK' }); // aún no vence
    advance(30 * UNIT);
    expect(manager.expireClock(code, deadline + 1)).toEqual({ ok: false, error: 'NO_CLOCK' }); // otro plazo
    expect(manager.expireClock('ZZZZ', deadline)).toEqual({ ok: false, error: 'NO_CLOCK' });
    expect(seatOf(manager, code, 'p0')?.auto).toBe(false);
  });

  it('sustituye a quien debía mover: queda marcado, todos lo ven y el reloj se detiene', () => {
    const { manager, code, advance } = startedRoom(30);
    const { deadline } = manager.clockOf(code) ?? { deadline: 0 };
    advance(30 * UNIT);
    const { out } = must(manager.expireClock(code, deadline));

    expect(seatOf(manager, code, 'p0')?.auto).toBe(true);
    expect(seatOf(manager, code, 'p1')?.auto).toBe(false);
    for (const to of ['h', 'a', 'b']) {
      expect(stateMsg(out, to)?.seats.map((s) => s.auto)).toEqual([true, false]);
    }
    expect(manager.clockOf(code)).toBeNull(); // ya no hay ninguna persona que deba mover
    expect(clockMsg(out, 'a')).toBeNull();
  });

  it('en el descarte sustituye a todos los que debían descartar', async () => {
    const { manager, advance } = await discardRoom({ p1: 2, p2: 1 });
    const { deadline } = manager.clockOf('TRDE') ?? { deadline: 0 };
    advance(30 * UNIT);
    must(manager.expireClock('TRDE', deadline));
    expect(manager.getRoom('TRDE')?.seats.map((s) => s.auto)).toEqual([false, true, true, false]);
  });

  it('el sustituido pasa a ser un asiento que el bot puede jugar; una persona no', () => {
    const { manager, code, advance } = startedRoom(30);
    const { deadline } = manager.clockOf(code) ?? { deadline: 0 };
    expect(manager.botAction(code, 'p0', firstLegal(manager, code, 'p0'))).toEqual({
      ok: false,
      error: 'NOT_A_BOT',
    });
    advance(30 * UNIT);
    must(manager.expireClock(code, deadline));
    must(manager.botAction(code, 'p0', firstLegal(manager, code, 'p0')));
    expect(manager.botAction(code, 'p1', firstLegal(manager, code, 'p0'))).toEqual({
      ok: false,
      error: 'NOT_A_BOT',
    });
  });
});

describe('volver a la partida', () => {
  function absent() {
    const room = startedRoom(30);
    const { deadline } = room.manager.clockOf(room.code) ?? { deadline: 0 };
    room.advance(30 * UNIT);
    must(room.manager.expireClock(room.code, deadline));
    return room;
  }

  it('seat:return devuelve el asiento y reinicia el reloj', () => {
    const { manager, code, now } = absent();
    expect(manager.clockOf(code)).toBeNull();
    const { out } = must(manager.returnToGame('a'));
    expect(seatOf(manager, code, 'p0')?.auto).toBe(false);
    expect(stateMsg(out, 'h')?.seats[0]?.auto).toBe(false);
    expect(manager.clockOf(code)).toEqual({ actors: ['p0'], deadline: now() + 30 * UNIT });
    expect(clockMsg(out, 'a')).toEqual({ actors: ['p0'], remainingMs: 30 * UNIT });
  });

  it('actuar también es volver: la jugada se aplica con el asiento ya recuperado', () => {
    const { manager, code } = absent();
    const length = manager.getRoom(code)?.game?.snapshot.log.length ?? 0;
    must(manager.action('a', firstLegal(manager, code, 'p0')));
    expect(seatOf(manager, code, 'p0')?.auto).toBe(false);
    expect(manager.getRoom(code)?.game?.snapshot.log.length).toBe(length + 1);
  });

  it('volver sin estar sustituido no cambia nada; el host y los espectadores no pueden', () => {
    const { manager, code } = startedRoom(30);
    const before = manager.getRoom(code);
    expect(must(manager.returnToGame('b')).out).toEqual([]);
    expect(manager.getRoom(code)).toBe(before);
    expect(manager.returnToGame('h')).toEqual({ ok: false, error: 'NOT_A_PLAYER' });
    must(manager.join('s', { protocolVersion: 1, code, role: 'spectator' }));
    expect(manager.returnToGame('s')).toEqual({ ok: false, error: 'NOT_A_PLAYER' });
    expect(manager.returnToGame('nadie')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('reconectar por sí solo no devuelve el asiento', () => {
    const { manager, code } = absent();
    manager.disconnect('a');
    must(manager.resume('a2', { protocolVersion: 1, code, token: tokenOf(manager, code, 'p0') }));
    expect(seatOf(manager, code, 'p0')?.auto).toBe(true);
  });
});

describe('TurnTimer con el conductor de bots', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Todo con relojes falsos: el reloj de la sala es `Date.now`, que Vitest controla. */
  function wired(seconds: number) {
    const store = new MemoryRoomStore();
    const manager = new RoomManager({
      store,
      logger: silentLogger,
      clock: () => Date.now(),
      randomInt: () => 0,
      token: (() => {
        let n = 0;
        return () => `token-${String(++n).padStart(20, '0')}`;
      })(),
      seed: () => 'wired-seed',
      roomTtlMs: 3_600_000,
      turnTimerUnitMs: UNIT,
    });
    const delivered: OutMessage[] = [];
    const deliver = (out: readonly OutMessage[]) => void delivered.push(...out);
    const timer = new TurnTimer(manager, deliver, silentLogger, () => Date.now());
    const bots = new BotDriver(manager, deliver, silentLogger, { delayMs: 5 });
    const code = must(manager.createRoom('h')).data.code;
    for (const [id, name] of [
      ['a', 'Ana'],
      ['b', 'Berta'],
    ] as const) {
      must(manager.join(id, { protocolVersion: 1, code, role: 'player', name }));
      must(manager.updateLobby(id, { protocolVersion: 1, ready: true }));
    }
    must(manager.setOptions('h', { protocolVersion: 1, turnTimerSeconds: seconds }));
    must(manager.start('h'));
    return { manager, timer, bots, code, delivered };
  }

  const logLen = (m: RoomManager, code: string) => m.getRoom(code)?.game?.snapshot.log.length ?? 0;

  it('al agotarse el plazo un bot juega por el ausente, y sigue haciéndolo en sus turnos', () => {
    const { manager, code, timer, bots } = wired(10);
    vi.advanceTimersByTime(10 * UNIT - 1);
    expect(seatOf(manager, code, 'p0')?.auto).toBe(false);
    expect(logLen(manager, code)).toBe(0);

    vi.advanceTimersByTime(2);
    expect(seatOf(manager, code, 'p0')?.auto).toBe(true);

    // los dos jugadores colocan; p1 sigue siendo persona, así que tras sus jugadas su reloj corre
    vi.advanceTimersByTime(6); // pausa del bot
    expect(manager.getRoom(code)?.game?.snapshot.log[0]?.player).toBe('p0');
    for (let i = 0; i < 20 && logLen(manager, code) < 8; i++) {
      const state = manager.getRoom(code)?.game?.snapshot;
      if (state?.turn.player === 'p1') must(manager.action('b', firstLegal(manager, code, 'p1')));
      vi.advanceTimersByTime(6);
    }
    const players = new Set(manager.getRoom(code)?.game?.snapshot.log.map((e) => e.player));
    expect(players).toEqual(new Set(['p0', 'p1']));
    expect(seatOf(manager, code, 'p0')?.auto).toBe(true);
    expect(seatOf(manager, code, 'p1')?.auto).toBe(false);
    timer.stop();
    bots.stop();
  });

  it('el reloj se reinicia con cada acción: quien juega con normalidad no es sustituido', () => {
    const { manager, code, timer, bots } = wired(10);
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(7 * UNIT); // casi todo el plazo
      const turn = manager.getRoom(code)?.game?.snapshot.turn.player ?? 'p0';
      must(manager.action(turn === 'p0' ? 'a' : 'b', firstLegal(manager, code, turn)));
    }
    expect(logLen(manager, code)).toBe(4);
    expect(manager.getRoom(code)?.seats.some((s) => s.auto)).toBe(false);
    timer.stop();
    bots.stop();
  });

  it('el aviso llega a los clientes con el estado de la sala y las vistas', () => {
    const { manager, code, timer, bots, delivered } = wired(10);
    must(manager.resume('a2', { protocolVersion: 1, code, token: tokenOf(manager, code, 'p0') }));
    delivered.length = 0;
    vi.advanceTimersByTime(10 * UNIT);
    expect(stateMsg(delivered, 'a2')?.seats[0]).toMatchObject({ playerId: 'p0', auto: true });
    expect(clockMsg(delivered, 'a2')).toBeNull();
    timer.stop();
    bots.stop();
  });

  it('volver detiene al bot: tras seat:return la jugada vuelve a ser de la persona', () => {
    const { manager, code, timer, bots } = wired(10);
    vi.advanceTimersByTime(10 * UNIT + 6);
    expect(seatOf(manager, code, 'p0')?.auto).toBe(true);
    must(manager.returnToGame('a'));
    const length = logLen(manager, code);
    vi.advanceTimersByTime(5 * UNIT); // el bot no mueve por quien ha vuelto
    expect(logLen(manager, code)).toBe(length);
    expect(manager.clockOf(code)?.actors).toEqual(['p0']);
    timer.stop();
    bots.stop();
  });

  it('una sala recuperada del almacén con plazo vuelve a armarse', async () => {
    const { room } = tradeRoom({});
    const store = await storeWith({ ...room, turnTimerSeconds: 10 });
    const manager = new RoomManager({
      store,
      logger: silentLogger,
      clock: () => Date.now(),
      randomInt: () => 0,
      token: () => 'x'.repeat(24),
      seed: () => 's',
      roomTtlMs: 3_600_000,
      turnTimerUnitMs: UNIT,
    });
    await manager.hydrate();
    const timer = new TurnTimer(
      manager,
      () => undefined,
      silentLogger,
      () => Date.now(),
    );
    timer.checkAll();
    vi.advanceTimersByTime(10 * UNIT + 1);
    expect(manager.getRoom('TRDE')?.seats[0]?.auto).toBe(true);
    timer.stop();
  });
});
