import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@hexa/protocol';
import type { SessionData } from '@hexa/protocol';
import { GameConnection } from './connection.js';
import { FakeTransport } from './fake-transport.js';
import { memorySessionStore } from './session-store.js';

const session: SessionData = { code: 'ABCD', token: 'x'.repeat(24), role: 'host', playerId: null };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(stored?: SessionData) {
  const transport = new FakeTransport();
  const store = memorySessionStore();
  if (stored) store.set('host', stored);
  const connection = new GameConnection(transport, store);
  return { transport, store, connection };
}

const roomState = {
  code: 'ABCD',
  status: 'lobby',
  hostConnected: true,
  hostless: false,
  seats: [],
  spectators: 0,
  options: { turnTimerSeconds: null },
  you: { role: 'host', playerId: null, admin: true },
};

describe('GameConnection', () => {
  it('pasa de connecting a connected al abrir el socket', () => {
    const { connection, transport } = setup();
    expect(connection.getSnapshot().status).toBe('idle');
    connection.start('host');
    expect(transport.connected).toBe(true);
    expect(connection.getSnapshot().status).toBe('connected');
    expect(connection.getSnapshot().resuming).toBe(false);
  });

  it('crear sala adopta y guarda la sesión', async () => {
    const { connection, transport, store } = setup();
    transport.responses.set('room:create', { ok: true, data: session });
    connection.start('host');
    const ack = await connection.createRoom();
    expect(ack.ok).toBe(true);
    expect(connection.getSnapshot().session).toEqual(session);
    expect(store.get('host')).toEqual(session);
    expect(transport.sent[0]).toEqual({
      event: 'room:create',
      payload: { protocolVersion: PROTOCOL_VERSION },
    });
  });

  it('al conectar recupera la sesión guardada', async () => {
    const { connection, transport } = setup(session);
    transport.responses.set('session:resume', { ok: true, data: session });
    connection.start('host');
    expect(connection.getSnapshot().resuming).toBe(true);
    await flush();
    expect(connection.getSnapshot().resuming).toBe(false);
    expect(connection.getSnapshot().session).toEqual(session);
    expect(transport.sent[0]).toEqual({
      event: 'session:resume',
      payload: { protocolVersion: PROTOCOL_VERSION, code: 'ABCD', token: session.token },
    });
  });

  it('descarta una sesión que el servidor ya no reconoce', async () => {
    const { connection, transport, store } = setup(session);
    transport.responses.set('session:resume', { ok: false, error: 'ROOM_NOT_FOUND' });
    connection.start('host');
    await flush();
    expect(store.get('host')).toBeNull();
    expect(connection.getSnapshot()).toMatchObject({
      session: null,
      resumeFailed: true,
      resuming: false,
    });
  });

  it('un fallo transitorio al recuperar no borra el token', async () => {
    const { connection, transport, store } = setup(session);
    transport.failNext = true;
    connection.start('host');
    await flush();
    expect(store.get('host')).toEqual(session);
    expect(connection.getSnapshot().resuming).toBe(false);
  });

  it('tras una caída marca reconnecting y al volver recupera la sesión sola', async () => {
    const { connection, transport } = setup();
    transport.responses.set('room:create', { ok: true, data: session });
    connection.start('host');
    await connection.createRoom();
    transport.drop();
    expect(connection.getSnapshot().status).toBe('reconnecting');
    transport.responses.set('session:resume', { ok: true, data: session });
    transport.reconnect();
    expect(connection.getSnapshot().status).toBe('connected');
    await flush();
    expect(transport.sent.at(-1)?.event).toBe('session:resume');
  });

  it('guarda el estado de sala y la vista, e ignora vistas más antiguas', () => {
    const { connection, transport } = setup();
    connection.start('host');
    transport.emit('room:state', roomState);
    expect(connection.getSnapshot().room?.code).toBe('ABCD');

    const view = (n: number) => ({
      phase: { type: 'roll' },
      board: {},
      legalActions: [],
      marker: n,
    });
    transport.emit('game:view', { seq: 5, view: view(5) });
    transport.emit('game:view', { seq: 4, view: view(4) });
    expect(connection.getSnapshot().seq).toBe(5);
    expect((connection.getSnapshot().view as unknown as { marker: number }).marker).toBe(5);
    transport.emit('game:view', { seq: 6, view: view(6) });
    expect(connection.getSnapshot().seq).toBe(6);
  });

  it('acumula los eventos con id creciente y recuerda la última tirada', () => {
    const { connection, transport } = setup();
    connection.start('host');
    transport.emit('game:events', {
      seq: 1,
      events: [
        { type: 'DICE_ROLLED', player: 'p0', dice: [2, 5], total: 7 },
        { type: 'TURN_STARTED', player: 'p1', number: 2 },
      ],
    });
    transport.emit('game:events', {
      seq: 2,
      events: [{ type: 'DICE_ROLLED', player: 'p1', dice: [1, 1], total: 2 }],
    });
    const snap = connection.getSnapshot();
    expect(snap.events.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(snap.diceRoll).toEqual({ dice: [1, 1], key: 3 });
  });

  it('limita el registro de eventos', () => {
    const { connection, transport } = setup();
    connection.start('host');
    const batch = Array.from({ length: 200 }, () => ({ type: 'TRADE_CANCELLED', offerId: 1 }));
    transport.emit('game:events', { seq: 1, events: batch });
    transport.emit('game:events', { seq: 2, events: batch });
    expect(connection.getSnapshot().events).toHaveLength(300);
  });

  it('descarta mensajes del servidor mal formados sin romperse', () => {
    const { connection, transport } = setup();
    connection.start('host');
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      transport.emit('room:state', { code: 'no' });
      transport.emit('game:view', { seq: 'x', view: 1 });
      transport.emit('game:events', { events: 'no' });
      transport.emit('error', 42);
    } finally {
      console.warn = warn;
    }
    expect(connection.getSnapshot().room).toBeNull();
    expect(connection.getSnapshot().view).toBeNull();
  });

  it('SESSION_REPLACED cierra la conexión y no reintenta', () => {
    const { connection, transport } = setup();
    connection.start('host');
    transport.emit('error', { error: 'SESSION_REPLACED' });
    expect(connection.getSnapshot()).toMatchObject({ replaced: true, status: 'offline' });
    expect(transport.closed).toBe(true);
    transport.drop();
    expect(connection.getSnapshot().status).toBe('offline');
  });

  it('una petición sin respuesta a tiempo devuelve TIMEOUT y una respuesta rara, INVALID_MESSAGE', async () => {
    const { connection, transport } = setup();
    connection.start('host');
    transport.failNext = true;
    expect(await connection.request('lobby:start')).toEqual({ ok: false, error: 'TIMEOUT' });
    transport.responses.set('lobby:start', { ok: 'quizá' });
    expect(await connection.request('lobby:start')).toEqual({
      ok: false,
      error: 'INVALID_MESSAGE',
    });
    transport.responses.set('lobby:start', { ok: false, error: 'NOT_ENOUGH_PLAYERS' });
    expect(await connection.request('lobby:start')).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_PLAYERS',
    });
  });

  it('salir olvida la sesión y vacía el estado', async () => {
    const { connection, transport, store } = setup();
    transport.responses.set('room:create', { ok: true, data: session });
    transport.responses.set('room:leave', { ok: true, data: {} });
    connection.start('host');
    await connection.createRoom();
    transport.emit('room:state', roomState);
    await connection.leave();
    expect(store.get('host')).toBeNull();
    expect(connection.getSnapshot()).toMatchObject({ session: null, room: null, view: null });
  });

  it('notifica a los suscriptores y permite darse de baja', () => {
    const { connection, transport } = setup();
    let calls = 0;
    const off = connection.subscribe(() => calls++);
    connection.start('host');
    const before = calls;
    expect(before).toBeGreaterThan(0);
    off();
    transport.emit('room:state', roomState);
    expect(calls).toBe(before);
  });

  it('guarda la vista previa del jugador de turno y la borra con la siguiente vista', () => {
    const { connection, transport } = setup();
    connection.start('host');
    const view = (n: number) => ({
      phase: { type: 'roll' },
      board: {},
      legalActions: [],
      marker: n,
    });
    transport.emit('game:view', { seq: 1, view: view(1) });
    transport.emit('game:preview', { playerId: 'p0', target: { kind: 'vertex', id: 'v7' } });
    expect(connection.getSnapshot().preview).toEqual({
      playerId: 'p0',
      target: { kind: 'vertex', id: 'v7' },
    });
    // una vista repetida (misma seq, p. ej. al reconectar) no la borra
    transport.emit('game:view', { seq: 1, view: view(1) });
    expect(connection.getSnapshot().preview).not.toBeNull();
    // una vista nueva sí: ya se ha actuado
    transport.emit('game:view', { seq: 2, view: view(2) });
    expect(connection.getSnapshot().preview).toBeNull();
    // y el jugador puede retirarla
    transport.emit('game:preview', { playerId: 'p0', target: { kind: 'hex', id: 'h0,0' } });
    transport.emit('game:preview', { playerId: 'p0', target: null });
    expect(connection.getSnapshot().preview).toBeNull();
  });

  it('ignora vistas previas mal formadas', () => {
    const { connection, transport } = setup();
    connection.start('host');
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      transport.emit('game:preview', { playerId: 'p0', target: { kind: 'planet', id: 'x' } });
    } finally {
      console.warn = warn;
    }
    expect(connection.getSnapshot().preview).toBeNull();
  });

  it('abrir la conexión con otra clave de sesión la reinicia y recupera la sesión de esa clave', async () => {
    const { connection, transport, store } = setup(session);
    transport.responses.set('session:resume', { ok: true, data: session });
    connection.start('host');
    await flush();
    expect(connection.getSnapshot().session).toEqual(session);

    const playerSession = {
      ...session,
      role: 'player' as const,
      playerId: 'p1',
      token: 'p'.repeat(24),
    };
    store.set('player', playerSession);
    transport.responses.set('session:resume', { ok: true, data: playerSession });
    connection.start('player');
    await flush();
    expect(transport.closed).toBe(true);
    expect(connection.getSnapshot().session).toEqual(playerSession);
    expect(
      transport.sent.filter((m) => m.event === 'session:resume').map((m) => m.payload['token']),
    ).toEqual([session.token, playerSession.token]);
  });
});
