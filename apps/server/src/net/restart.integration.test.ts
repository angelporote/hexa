import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRng, getPlayerView, nextInt } from '@hexa/engine';
import type { RngState } from '@hexa/engine';
import { silentLogger } from '../logger.js';
import { replayGame } from '../rooms/replay.js';
import { connectRedis, RedisRoomStore } from '../store/redis-room-store.js';
import type { KeyValueClient } from '../store/redis-room-store.js';
import { WriteBehindStore } from '../store/write-behind-store.js';
import { chooseAction } from '../testing/bot-client.js';
import { FakeKeyValueClient } from '../testing/fake-kv.js';
import { TestClient, startTestServer, until } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';

const FAST = { rateLimit: { burst: 100_000, perSecond: 100_000 }, botDelayMs: 1 };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Cómo se guardan las salas entre «reinicios»: cada `open()` es un servidor nuevo sin memoria. */
interface Persistence {
  open(): Promise<WriteBehindStore>;
  /** Solo el cliente falso permite simular una caída. */
  readonly fake: FakeKeyValueClient | null;
  cleanup(): Promise<void>;
}

const wrap = (client: KeyValueClient, prefix: string): WriteBehindStore =>
  new WriteBehindStore(
    new RedisRoomStore(client, { prefix, ttlMs: 3_600_000, logger: silentLogger }),
    { logger: silentLogger, retryMs: 20, maxRetryMs: 100 },
  );

function fakePersistence(): Persistence {
  const kv = new FakeKeyValueClient();
  return {
    fake: kv,
    open: () => Promise.resolve(wrap(kv, 'hexa:room:')),
    cleanup: () => Promise.resolve(),
  };
}

function redisPersistence(url: string): Persistence {
  const prefix = `hexa-test:${randomUUID()}:`;
  return {
    fake: null,
    open: async () => wrap(await connectRedis(url, silentLogger), prefix),
    async cleanup() {
      const client = await connectRedis(url, silentLogger);
      for (const key of await client.keys(prefix)) await client.del(key);
      await client.close();
    },
  };
}

const redisUrl = process.env['REDIS_URL'];
const backends: [string, () => Persistence][] = [['cliente falso', fakePersistence]];
if (redisUrl) backends.push(['Redis real', () => redisPersistence(redisUrl)]);

let servers: TestServer[] = [];
const clients: TestClient[] = [];
let persistence: Persistence | null = null;

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => undefined);
  await persistence?.cleanup();
  persistence = null;
});

async function boot(options: { clock?: () => number } = {}): Promise<TestServer> {
  if (!persistence) throw new Error('sin persistencia');
  const server = await startTestServer({
    seed: () => 'restart-seed',
    config: FAST,
    store: await persistence.open(),
    ...options,
  });
  servers.push(server);
  return server;
}

/** Apaga un servidor como lo haría SIGTERM: desconecta, vuelca lo pendiente y cierra el almacén. */
async function shutdown(server: TestServer): Promise<void> {
  await server.close();
  servers = servers.filter((s) => s !== server);
  for (const c of clients.splice(0)) c.close();
}

async function connect(server: TestServer): Promise<TestClient> {
  const c = await TestClient.connect(server.url);
  clients.push(c);
  return c;
}

const logLength = (server: TestServer, code: string): number =>
  server.handle.manager.getRoom(code)?.game?.snapshot.log.length ?? 0;

/** Los humanos juegan al azar (solo con la vista al día) hasta que el registro llega a `target`. */
async function play(
  server: TestServer,
  code: string,
  humans: TestClient[],
  rng: RngState,
  target: number,
): Promise<RngState> {
  const deadline = Date.now() + 60_000;
  let state = rng;
  while (logLength(server, code) < target) {
    if (Date.now() > deadline) throw new Error(`no se llega a ${target} acciones`);
    const len = logLength(server, code);
    const actors = humans.filter((c) => c.seq === len && (c.view?.legalActions.length ?? 0) > 0);
    if (actors.length === 0) {
      await sleep(3);
      continue;
    }
    const pick = nextInt(state, actors.length);
    state = pick.rng;
    const actor = actors[pick.value];
    if (!actor?.view) throw new Error('sin vista');
    const choice = chooseAction(actor.view, state);
    if (!choice) throw new Error('sin elección');
    state = choice.rng;
    await actor.request('game:action', { action: choice.action });
  }
  return state;
}

/** Ana crea la sala a distancia y entran Luis y un bot. Sin empezar la partida. */
async function lobbyRoom(server: TestServer) {
  const ana = await connect(server);
  const code = await ana.createRoom({ role: 'player', name: 'Ana', color: 'c2' });
  const luis = await connect(server);
  expect(await luis.join(code, 'Luis')).toMatchObject({ ok: true });
  expect(await ana.request('lobby:addBot')).toEqual({ ok: true, data: {} });
  await until(() => ana.state?.seats.length === 3, 3000, 'tres asientos');
  return { ana, luis, code };
}

async function startedRoom(server: TestServer) {
  const room = await lobbyRoom(server);
  for (const c of [room.ana, room.luis]) await c.request('lobby:update', { ready: true });
  expect(await room.ana.request('lobby:start')).toEqual({ ok: true, data: {} });
  await until(() => room.ana.view !== null && room.luis.view !== null, 3000, 'vistas iniciales');
  return room;
}

/** Los mismos jugadores en el servidor nuevo, con los tokens que ya tenían. */
async function reconnect(
  server: TestServer,
  code: string,
  tokens: string[],
): Promise<TestClient[]> {
  const back: TestClient[] = [];
  for (const token of tokens) {
    const c = await connect(server);
    expect(await c.resume(code, token)).toMatchObject({ ok: true });
    back.push(c);
  }
  return back;
}

function mustGame(server: TestServer, code: string) {
  const game = server.handle.manager.getRoom(code)?.game;
  if (!game) throw new Error('sin partida');
  return game;
}

describe.each(backends)('reinicio del servidor (%s)', (_name, makePersistence) => {
  it('una partida en curso se recupera tal cual y se puede seguir jugando', async () => {
    persistence = makePersistence();
    const first = await boot();
    const { ana, luis, code } = await startedRoom(first);
    const rng = await play(first, code, [ana, luis], createRng('restart-humans'), 30);
    const tokens = [ana.token, luis.token];
    const seatsBefore = first.handle.manager
      .getRoom(code)
      ?.seats.map((s) => [s.playerId, s.name, s.bot]);
    await shutdown(first);

    // el servidor nuevo no comparte memoria con el anterior: solo ve el almacén
    const second = await boot();
    const restored = second.handle.manager.getRoom(code);
    expect(restored).toMatchObject({ status: 'playing', hostless: true, ownerId: 'p0' });
    expect(restored?.seats.map((s) => [s.playerId, s.name, s.bot])).toEqual(seatsBefore);
    const game = mustGame(second, code);
    expect(game.snapshot.log.length).toBeGreaterThanOrEqual(30);
    expect(replayGame(game)).toEqual(game.snapshot);

    const [ana2, luis2] = await reconnect(second, code, tokens);
    if (!ana2 || !luis2) throw new Error('sin clientes');
    expect([ana2.playerId, luis2.playerId]).toEqual(['p0', 'p1']);
    await until(
      () => [ana2, luis2].every((c) => c.seq === logLength(second, code)),
      3000,
      'vistas al día',
    );
    // cada jugador ve lo mismo que antes del reinicio: su mano y el estado público
    expect(ana2.view).toEqual(getPlayerView(mustGame(second, code).snapshot, 'p0'));
    expect(luis2.view).toEqual(getPlayerView(mustGame(second, code).snapshot, 'p1'));

    // la partida sigue: los humanos juegan y el bot (que no tiene cliente) también
    const resumedAt = logLength(second, code);
    await play(second, code, [ana2, luis2], rng, resumedAt + 40);
    const after = mustGame(second, code);
    expect(after.snapshot.log.slice(resumedAt).some((e) => e.player === 'p2')).toBe(true);
    expect(replayGame(after)).toEqual(after.snapshot);
  }, 90_000);

  it('una sala en el lobby se recupera y se puede empezar después', async () => {
    persistence = makePersistence();
    const first = await boot();
    const { ana, luis, code } = await lobbyRoom(first);
    await luis.request('lobby:update', { ready: true });
    const tokens = [ana.token, luis.token];
    await shutdown(first);

    const second = await boot();
    expect(second.handle.manager.getRoom(code)?.status).toBe('lobby');
    const [ana2, luis2] = await reconnect(second, code, tokens);
    if (!ana2 || !luis2) throw new Error('sin clientes');
    await until(() => ana2.state?.seats.length === 3, 3000, 'asientos recuperados');
    expect(ana2.state?.you).toMatchObject({ role: 'player', playerId: 'p0', admin: true });
    expect(ana2.state?.seats.map((s) => [s.name, s.ready])).toEqual([
      ['Ana', false],
      ['Luis', true],
      [expect.any(String) as string, true],
    ]);
    expect(luis2.state?.you.admin).toBe(false);

    expect(await ana2.request('lobby:update', { ready: true })).toEqual({ ok: true, data: {} });
    expect(await ana2.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => ana2.view !== null && luis2.view !== null, 3000, 'vistas');
    expect(ana2.view?.you?.id).toBe('p0');
  });

  it('una sala caducada y barrida no reaparece tras otro reinicio', async () => {
    persistence = makePersistence();
    let now = 1_000_000;
    const first = await boot({ clock: () => now });
    const { ana, code } = await lobbyRoom(first);
    const token = ana.token;
    await shutdown(first);

    // pasa más tiempo que el TTL de la sala sin nadie dentro: la barrida la borra también del almacén
    now += 7 * 60 * 60 * 1000;
    const second = await boot({ clock: () => now });
    expect(second.handle.manager.getRoom(code)).toBeDefined();
    expect(second.handle.manager.sweep()).toEqual([code]);
    await shutdown(second); // el cierre vuelca el borrado pendiente

    const third = await boot({ clock: () => now });
    expect(third.handle.manager.getRoom(code)).toBeUndefined();
    const c = await connect(third);
    expect(await c.resume(code, token)).toMatchObject({ ok: false });
  });
});

describe('Redis caído durante la partida', () => {
  it('las partidas no se paran; al volver Redis queda guardado el último estado', async () => {
    persistence = fakePersistence();
    const kv = persistence.fake;
    if (!kv) throw new Error('sin cliente falso');
    const first = await boot();
    const { ana, luis, code } = await startedRoom(first);
    await play(first, code, [ana, luis], createRng('outage-humans'), 16);
    await until(() => kv.sets > 0, 3000, 'primer guardado');

    kv.down = true;
    const setsBefore = kv.sets;
    await play(first, code, [ana, luis], createRng('outage-more'), 40); // 24 jugadas sin almacén
    const during = logLength(first, code);
    expect(during).toBeGreaterThanOrEqual(40);
    expect(kv.sets).toBe(setsBefore); // nada pudo escribirse mientras estuvo caído

    // vuelve Redis y se apaga el servidor: el cierre vuelca la última versión de la sala
    kv.down = false;
    const tokens = [ana.token, luis.token];
    await shutdown(first);

    const second = await boot();
    expect(logLength(second, code)).toBeGreaterThanOrEqual(during);
    const [ana2] = await reconnect(second, code, tokens);
    expect(ana2?.playerId).toBe('p0');
  }, 90_000);
});
