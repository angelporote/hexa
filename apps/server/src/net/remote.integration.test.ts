import { afterEach, describe, expect, it } from 'vitest';
import { createRng, getPlayerView, nextInt } from '@hexa/engine';
import type { PlayerView } from '@hexa/engine';
import { replayGame } from '../rooms/replay.js';
import { chooseAction } from '../testing/bot-client.js';
import { TestClient, startTestServer, until } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';

const FAST = { rateLimit: { burst: 100_000, perSecond: 100_000 }, botDelayMs: 1 };

let server: TestServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

async function connect(): Promise<TestClient> {
  if (!server) throw new Error('servidor no iniciado');
  const c = await TestClient.connect(server.url);
  clients.push(c);
  return c;
}

const SECRETS = [
  'seed',
  'rng',
  'devDeck',
  'log',
  'token',
  'hostToken',
  'spectatorTokens',
  'hostless',
  'ownerId',
];

/** Rutas donde aparece algo que un observador nunca debe recibir (secretos o manos). */
function leaks(value: unknown, path = '$', allowHand = false): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = `${path}.${key}`;
    if (SECRETS.includes(key)) found.push(here);
    if (key === 'hand' && !allowHand) found.push(here);
    found.push(...leaks(child, here, allowHand || (key === 'you' && path === '$.view')));
  }
  return found;
}

function watch(client: TestClient, who: string, problems: string[]): void {
  let last = -1;
  client.inspect = (event, payload) => {
    if (event === 'room:state' || event === 'error' || event === 'game:preview') return;
    const bad = leaks(payload);
    if (bad.length > 0) problems.push(`${who}: ${bad.join(', ')}`);
    if (event === 'game:view') {
      const { seq, view } = payload as { seq: number; view: PlayerView };
      if (who.startsWith('espectador') && view.you !== null)
        problems.push(`${who}: recibió una vista privada`);
      if (last !== -1 && seq !== last + 1) problems.push(`${who}: salto de seq ${last} → ${seq}`);
      last = seq;
    }
  };
}

/** Crea una sala a distancia: `Ana` la crea y `Luis` y `Marta` entran por código, sin pantalla principal. */
async function remoteRoom(botCount = 1) {
  const ana = await connect();
  const code = await ana.createRoom({ role: 'player', name: 'Ana', color: 'c2' });
  const luis = await connect();
  expect(await luis.join(code, 'Luis')).toMatchObject({ ok: true, data: { playerId: 'p1' } });
  const marta = await connect();
  expect(await marta.join(code, 'Marta')).toMatchObject({ ok: true, data: { playerId: 'p2' } });
  for (let i = 0; i < botCount; i++)
    expect(await ana.request('lobby:addBot')).toEqual({ ok: true, data: {} });
  for (const c of [ana, luis, marta])
    expect(await c.request('lobby:update', { ready: true })).toEqual({ ok: true, data: {} });
  return { ana, luis, marta, code };
}

describe('sala a distancia (sin pantalla principal)', () => {
  it('se crea desde el navegador de un jugador; solo él administra y no hay host', async () => {
    server = await startTestServer({ config: FAST });
    const { ana, luis, code } = await remoteRoom(0);
    expect(ana.code).toMatch(/^[A-Z]{4}$/);
    expect(ana.playerId).toBe('p0');
    await until(() => ana.state?.seats.length === 3, 3000, 'tres jugadores');
    expect(ana.state).toMatchObject({
      hostConnected: false,
      you: { role: 'player', playerId: 'p0', admin: true },
    });
    expect(luis.state).toMatchObject({ hostConnected: false, you: { admin: false } });

    // quien no administra no puede añadir bots ni empezar
    expect(await luis.request('lobby:addBot')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await luis.request('lobby:start')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await ana.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => [ana, luis].every((c) => c.view !== null), 3000, 'vistas');
    expect(ana.view?.you?.id).toBe('p0');
    expect(luis.view?.you?.id).toBe('p1');
    expect(server.handle.manager.getRoom(code)?.hostless).toBe(true);
  });

  it('el nombre es obligatorio para crear una sala como jugador', async () => {
    server = await startTestServer({ config: FAST });
    const c = await connect();
    expect(await c.raw('room:create', { protocolVersion: 1, role: 'player' })).toEqual({
      ok: false,
      error: 'INVALID_MESSAGE',
    });
    expect(await c.raw('room:create', { protocolVersion: 1, role: 'player', name: '  ' })).toEqual({
      ok: false,
      error: 'INVALID_MESSAGE',
    });
    expect(await c.raw('room:create', { protocolVersion: 1, role: 'jefe', name: 'Ana' })).toEqual({
      ok: false,
      error: 'INVALID_MESSAGE',
    });
  });

  it('3 jugadores a distancia + 1 bot juegan una partida completa con 2 espectadores', async () => {
    const failures: object[] = [];
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: (o: object) => void failures.push(o),
    };
    server = await startTestServer({ seed: () => 'remote-game-seed', config: FAST, logger });
    const { ana, luis, marta, code } = await remoteRoom(1);
    const spectators: TestClient[] = [];
    for (let i = 0; i < 2; i++) {
      const s = await connect();
      expect(await s.request('room:join', { code, role: 'spectator' })).toMatchObject({ ok: true });
      spectators.push(s);
    }
    const problems: string[] = [];
    [ana, luis, marta].forEach((c, i) => watch(c, `jugador ${i}`, problems));
    spectators.forEach((c, i) => watch(c, `espectador ${i}`, problems));
    const humans = [ana, luis, marta];

    expect(await ana.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => humans.every((c) => c.view !== null), 3000, 'vistas iniciales');

    let rng = createRng('remote-humans');
    const deadline = Date.now() + 150_000;
    const logLength = () => server?.handle.manager.getRoom(code)?.game?.snapshot.log.length ?? 0;
    while (ana.view?.phase.type !== 'ended') {
      if (Date.now() > deadline) {
        throw new Error(
          `la partida no termina (fallos: ${JSON.stringify(failures)}; fase ${ana.view?.phase.type})`,
        );
      }
      // solo actúa quien tiene la vista al día: así se evitan jugadas sobre un estado ya superado
      const len = logLength();
      const actors = humans.filter((c) => c.seq === len && (c.view?.legalActions.length ?? 0) > 0);
      if (actors.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 3));
        continue;
      }
      const pick = nextInt(rng, actors.length);
      rng = pick.rng;
      const actor = actors[pick.value];
      if (!actor?.view) throw new Error('sin vista');
      const choice = chooseAction(actor.view, rng);
      if (!choice) throw new Error('sin elección');
      rng = choice.rng;
      const ack = await actor.request('game:action', { action: choice.action });
      expect(ack, `${choice.action.type} de ${actor.playerId}`).toEqual({ ok: true, data: {} });
    }

    expect(problems).toEqual([]);
    await until(
      () => spectators.every((s) => s.view?.phase.type === 'ended'),
      5000,
      'los espectadores ven el final',
    );
    const game = server.handle.manager.getRoom(code)?.game;
    if (!game) throw new Error('sin partida');
    expect(game.snapshot.winner).not.toBeNull();
    expect(replayGame(game)).toEqual(game.snapshot);
    for (const s of spectators) {
      expect(s.view).toEqual(getPlayerView(game.snapshot, 'spectator'));
      expect(s.view?.legalActions).toEqual([]);
    }
    for (const c of humans) expect(c.view).toEqual(getPlayerView(game.snapshot, c.playerId ?? ''));
    // sin pantalla principal en ningún momento
    expect(ana.state?.hostConnected).toBe(false);
    expect(ana.state?.status).toBe('ended');
  }, 180_000);

  it('sala mixta: pantalla principal, jugadores presenciales y remotos en la misma sala', async () => {
    server = await startTestServer({ seed: () => 'mixed-seed', config: FAST });
    const host = await connect();
    const code = await host.createRoom();
    // dos «presenciales» (móviles junto a la pantalla) y dos «remotos» (otros navegadores): para el
    // servidor son lo mismo, entran por código y reciben cada uno su vista
    const names = ['Presencial A', 'Presencial B', 'Remoto C', 'Remoto D'];
    const players: TestClient[] = [];
    for (const name of names) {
      const c = await connect();
      expect(await c.join(code, name)).toMatchObject({ ok: true });
      expect(await c.request('lobby:update', { ready: true })).toMatchObject({ ok: true });
      players.push(c);
    }
    await until(() => host.state?.seats.length === 4, 3000, 'cuatro jugadores');
    expect(host.state).toMatchObject({ hostConnected: true, you: { role: 'host', admin: true } });
    expect(players.every((p) => p.state?.you.admin === false)).toBe(true);
    expect(await players[2]?.request('lobby:start')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await host.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => players.every((p) => p.view !== null) && host.view !== null, 3000, 'vistas');

    // todos ven el mismo tablero, cada jugador solo su mano, y el host ninguna
    expect(new Set(players.map((p) => JSON.stringify(p.view?.board))).size).toBe(1);
    expect(JSON.stringify(host.view?.board)).toBe(JSON.stringify(players[0]?.view?.board));
    players.forEach((p, i) => expect(p.view?.you?.id).toBe(`p${i}`));
    expect(host.view?.you).toBeNull();

    // la colocación inicial avanza igual para quien está presente que para quien juega a distancia
    for (let i = 0; i < 8; i++) {
      const actor = players.find((p) => (p.view?.legalActions.length ?? 0) > 0);
      if (!actor?.view) throw new Error('nadie puede actuar');
      const action = actor.view.legalActions[0];
      const seq = host.seq;
      expect(await actor.request('game:action', { action })).toEqual({ ok: true, data: {} });
      await until(
        () => host.seq > seq && players.every((p) => p.seq === host.seq),
        3000,
        `jugada ${i}`,
      );
    }
    expect(Object.keys(host.view?.buildings ?? {}).length).toBeGreaterThanOrEqual(4);
  });
});
