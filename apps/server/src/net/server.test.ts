import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@hexa/protocol';
import { TestClient, startTestServer, until } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';

let server: TestServer | null = null;
const clients: TestClient[] = [];

async function boot(options: Parameters<typeof startTestServer>[0] = {}): Promise<TestServer> {
  server = await startTestServer(options);
  return server;
}
async function client(): Promise<TestClient> {
  if (!server) throw new Error('servidor no iniciado');
  const c = await TestClient.connect(server.url);
  clients.push(c);
  return c;
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

describe('servidor HTTP y WebSocket', () => {
  it('GET /health responde ok junto al WebSocket', async () => {
    const s = await boot();
    const res = await fetch(`${s.url}/health`);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('crear una sala devuelve código y token, y el host recibe el estado', async () => {
    await boot();
    const host = await client();
    const code = await host.createRoom();
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect(host.token.length).toBeGreaterThanOrEqual(16);
    await until(() => host.state !== null, 2000, 'room:state del host');
    expect(host.state).toMatchObject({
      code,
      status: 'lobby',
      hostConnected: true,
      you: { role: 'host' },
    });
  });

  it('un jugador se une y todos ven el lobby; al desconectarse queda marcado', async () => {
    await boot();
    const host = await client();
    const code = await host.createRoom();
    const ana = await client();
    const joined = await ana.join(code, 'Ana');
    expect(joined).toMatchObject({ ok: true, data: { role: 'player', playerId: 'p0' } });
    await until(() => host.state?.seats.length === 1, 2000, 'host ve a Ana');
    expect(host.state?.seats[0]).toMatchObject({ name: 'Ana', connected: true });

    ana.close();
    await until(() => host.state?.seats[0]?.connected === false, 2000, 'Ana desconectada');
  });

  it('rechaza unirse a una sala inexistente o con nombre repetido', async () => {
    await boot();
    const host = await client();
    const code = await host.createRoom();
    const a = await client();
    expect(await a.join('ZZZZ', 'Ana')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(await a.join(code, 'Ana')).toMatchObject({ ok: true });
    const b = await client();
    expect(await b.join(code, 'ana')).toEqual({ ok: false, error: 'NAME_TAKEN' });
  });
});

describe('validación de mensajes', () => {
  it('descarta eventos desconocidos, versiones distintas y formas inválidas', async () => {
    await boot();
    const c = await client();
    expect(await c.raw('hack:me', { protocolVersion: PROTOCOL_VERSION })).toEqual({
      ok: false,
      error: 'UNKNOWN_MESSAGE',
    });
    expect(await c.raw('room:create', { protocolVersion: 99 })).toEqual({
      ok: false,
      error: 'PROTOCOL_VERSION_MISMATCH',
    });
    expect(await c.raw('room:create', {})).toEqual({ ok: false, error: 'INVALID_MESSAGE' });
    expect(
      await c.raw('room:join', { protocolVersion: PROTOCOL_VERSION, code: 'ABCD', role: 'player' }),
    ).toEqual({ ok: false, error: 'INVALID_MESSAGE' });
    expect(
      await c.raw('game:action', { protocolVersion: PROTOCOL_VERSION, action: { type: 'CHEAT' } }),
    ).toEqual({ ok: false, error: 'INVALID_MESSAGE' });
    // tras todo eso la conexión sigue viva y utilizable
    expect(await c.createRoom()).toMatch(/^[A-Z]{4}$/);
  });

  it('sin callback de respuesta, el error llega como evento `error`', async () => {
    await boot();
    const c = await client();
    c.socket.emit('room:create', { protocolVersion: 99 });
    await until(() => (c.events['error']?.length ?? 0) > 0, 2000, 'evento error');
    expect(c.events['error']?.[0]).toEqual({ error: 'PROTOCOL_VERSION_MISMATCH' });
  });

  it('no se puede actuar sin estar en una sala', async () => {
    await boot();
    const c = await client();
    expect(await c.request('game:action', { action: { type: 'ROLL' } })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
    expect(await c.request('lobby:start')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });
});

describe('robustez', () => {
  it('limita los mensajes por socket', async () => {
    await boot({ config: { rateLimit: { burst: 5, perSecond: 1 } } });
    const c = await client();
    const answers = await Promise.all(
      Array.from({ length: 30 }, () => c.raw('room:leave', { protocolVersion: PROTOCOL_VERSION })),
    );
    const limited = answers.filter((a) => (a as { error?: string }).error === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThan(15);
    expect(answers.length - limited.length).toBeLessThanOrEqual(8);
  });

  it('corta la conexión de quien insiste en saturar', async () => {
    await boot({ config: { rateLimit: { burst: 2, perSecond: 1 } } });
    const c = await client();
    const closed = new Promise<void>((resolve) => c.socket.once('disconnect', () => resolve()));
    for (let i = 0; i < 300; i++)
      c.socket.emit('room:leave', { protocolVersion: PROTOCOL_VERSION });
    await closed;
    expect(c.socket.connected).toBe(false);
  });

  it('cierra la conexión ante un mensaje demasiado grande', async () => {
    await boot();
    const c = await client();
    const closed = new Promise<void>((resolve) => c.socket.once('disconnect', () => resolve()));
    c.socket.emit('room:create', {
      protocolVersion: PROTOCOL_VERSION,
      basura: 'x'.repeat(64 * 1024),
    });
    await closed;
    expect(c.socket.connected).toBe(false);
  });

  it('el temporizador de limpieza elimina salas abandonadas y libera el código', async () => {
    const s = await boot({ config: { roomTtlMs: 150, sweepIntervalMs: 50 } });
    const host = await client();
    const code = await host.createRoom();
    expect(s.handle.manager.getRoom(code)).toBeDefined();
    host.close();
    await until(() => s.handle.manager.getRoom(code) === undefined, 3000, 'sala caducada');
    const other = await client();
    expect(await other.join(code, 'Ana')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('reanuda la sesión por red con el token y sustituye a la conexión anterior', async () => {
    await boot();
    const host = await client();
    const code = await host.createRoom();
    const ana = await client();
    await ana.join(code, 'Ana');
    const token = ana.token;

    const again = await client();
    const resumed = await again.resume(code, token);
    expect(resumed).toMatchObject({ ok: true, data: { role: 'player', playerId: 'p0' } });
    await until(() => (ana.events['error']?.length ?? 0) > 0, 2000, 'aviso de sesión sustituida');
    expect(ana.events['error']?.[0]).toEqual({ error: 'SESSION_REPLACED' });
    expect(await again.resume(code, 'x'.repeat(24))).toEqual({
      ok: false,
      error: 'ALREADY_IN_ROOM',
    });
    const intruder = await client();
    expect(await intruder.resume(code, 'x'.repeat(24))).toEqual({
      ok: false,
      error: 'INVALID_SESSION',
    });
  });
});
