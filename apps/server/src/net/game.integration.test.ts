import { afterEach, describe, expect, it } from 'vitest';
import { createRng, getPlayerView, nextInt } from '@hexa/engine';
import type { PlayerView } from '@hexa/engine';
import { replayGame } from '../rooms/replay.js';
import { chooseAction } from '../testing/bot-client.js';
import { TestClient, startTestServer, until } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';

// Los bots mandan mensajes mucho más deprisa que una persona: se relaja el límite por socket.
const FAST = { rateLimit: { burst: 100_000, perSecond: 100_000 } };

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

/** Claves que jamás deben llegar a un cliente (fuera de la vista propia). */
const SECRET_KEYS = ['seed', 'rng', 'devDeck', 'log', 'token', 'hostToken', 'spectatorTokens'];

function leaks(value: unknown, path = '$', allowHand = false): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = `${path}.${key}`;
    if (SECRET_KEYS.includes(key)) found.push(here);
    if (key === 'hand' && !allowHand) found.push(here);
    found.push(...leaks(child, here, allowHand || (key === 'you' && path === '$.view')));
  }
  return found;
}

interface Room {
  host: TestClient;
  players: TestClient[];
  spectator: TestClient;
  code: string;
}

/** Sala con host, 4 jugadores listos y un espectador, con inspectores de seguridad en todos. */
async function lobby(playerCount = 4): Promise<Room> {
  const host = await connect();
  const code = await host.createRoom();
  const players: TestClient[] = [];
  for (let i = 0; i < playerCount; i++) {
    const p = await connect();
    expect(await p.join(code, `Bot${i}`)).toMatchObject({ ok: true });
    expect(await p.request('lobby:update', { ready: true })).toMatchObject({ ok: true });
    players.push(p);
  }
  const spectator = await connect();
  expect(await spectator.request('room:join', { code, role: 'spectator' })).toMatchObject({
    ok: true,
  });
  spectator.code = code;
  return { host, players, spectator, code };
}

/** Comprueba cada mensaje recibido: sin secretos, vista propia correcta y seq consecutivo. */
function guard(client: TestClient, expectedYou: string | null, problems: string[]): void {
  let last = -1;
  client.inspect = (event, payload) => {
    if (event === 'room:state' || event === 'error') {
      if (JSON.stringify(payload).includes('"token"'))
        problems.push(`${expectedYou}: token en ${event}`);
      return;
    }
    const bad = leaks(payload);
    if (bad.length > 0) problems.push(`${expectedYou ?? 'observador'}: ${bad.join(', ')}`);
    if (event === 'game:view') {
      const { seq, view } = payload as { seq: number; view: PlayerView };
      if (view.you?.id !== expectedYou && !(view.you === null && expectedYou === null)) {
        problems.push(`vista de otro jugador: esperado ${expectedYou}, recibido ${view.you?.id}`);
      }
      if (last !== -1 && seq !== last + 1) problems.push(`salto de seq ${last} → ${seq}`);
      last = seq;
    }
  };
}

describe('partida completa por red', () => {
  it('4 bots juegan hasta el final, con una desconexión a mitad, sin filtrar información oculta', async () => {
    const srv = await startTestServer({ seed: () => 'integration-seed', config: FAST });
    server = srv;
    const room = await lobby(4);
    const problems: string[] = [];
    room.players.forEach((p, i) => guard(p, `p${i}`, problems));
    guard(room.host, null, problems);
    guard(room.spectator, null, problems);

    expect(await room.players[0]?.request('lobby:start')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await room.host.request('lobby:start')).toMatchObject({ ok: true });
    await until(() => room.players.every((p) => p.view !== null), 3000, 'vistas iniciales');
    expect(room.host.view?.you).toBeNull();

    let rng = createRng('integration-bots');
    let steps = 0;
    let reconnected = false;
    let seq = 0;
    const live = (): TestClient[] =>
      [...room.players, room.host, room.spectator].filter((c) => c.socket.connected);

    while (room.players[0]?.view?.phase.type !== 'ended') {
      if (steps++ > 5000) throw new Error('la partida no termina');

      // A mitad de partida un jugador pierde la conexión y vuelve con su token.
      if (steps === 150 && !reconnected) {
        reconnected = true;
        const victim = room.players[1];
        if (!victim) throw new Error('sin jugador');
        const { token, code, playerId } = victim;
        victim.close();
        await until(
          () => room.host.state?.seats.some((s) => !s.connected) === true,
          3000,
          'caída visible',
        );
        const fresh = await connect();
        guard(fresh, playerId, problems);
        expect(await fresh.resume(code, token)).toMatchObject({ ok: true, data: { playerId } });
        await until(() => fresh.view !== null && fresh.seq === seq, 3000, 'vista recuperada');
        const current = srv.handle.manager.getRoom(code)?.game?.snapshot;
        if (!current) throw new Error('sin partida');
        expect(fresh.view).toEqual(getPlayerView(current, playerId ?? ''));
        room.players[1] = fresh;
        await until(
          () => room.host.state?.seats.every((s) => s.connected) === true,
          3000,
          'vuelta visible',
        );
      }

      const actors = room.players.filter((p) => (p.view?.legalActions.length ?? 0) > 0);
      if (actors.length === 0)
        throw new Error(`nadie puede actuar en la fase ${room.players[0]?.view?.phase.type}`);
      const selected = nextInt(rng, actors.length);
      rng = selected.rng;
      const actor = actors[selected.value];
      if (!actor?.view) throw new Error('actor sin vista');
      const choice = chooseAction(actor.view, rng);
      if (!choice) throw new Error('sin elección');
      rng = choice.rng;

      const ack = await actor.request('game:action', { action: choice.action });
      expect(ack, `${choice.action.type} de ${actor.playerId}`).toEqual({ ok: true, data: {} });
      seq++;
      await until(() => live().every((c) => c.seq >= seq), 3000, `seq ${seq}`);
    }

    expect(problems).toEqual([]);
    const game = srv.handle.manager.getRoom(room.code)?.game;
    expect(game?.snapshot.phase.type).toBe('ended');
    expect(game?.snapshot.winner).not.toBeNull();
    expect(srv.handle.manager.getRoom(room.code)?.status).toBe('ended');
    if (!game) throw new Error('sin partida');

    // Las vistas finales coinciden exactamente con la proyección del estado del servidor.
    for (const p of room.players) {
      expect(p.view).toEqual(getPlayerView(game.snapshot, p.playerId ?? ''));
    }
    expect(room.host.view).toEqual(getPlayerView(game.snapshot, 'host'));
    expect(room.spectator.view).toEqual(getPlayerView(game.snapshot, 'spectator'));

    // El registro reproduce la partida y la tirada de dados llegó a todos como evento público.
    expect(replayGame(game)).toEqual(game.snapshot);
    expect(room.spectator.gameEvents.some((e) => e.type === 'DICE_ROLLED')).toBe(true);
    expect(room.spectator.gameEvents.some((e) => e.type === 'GAME_WON')).toBe(true);
    expect(room.host.state?.status).toBe('ended');
  }, 120_000);
});

describe('seguridad en partida', () => {
  it('nadie puede actuar por otro, ni el host ni el espectador, ni ver manos ajenas', async () => {
    server = await startTestServer({ seed: () => 'security-seed', config: FAST });
    const room = await lobby(3);
    await room.host.request('lobby:start');
    await until(
      () => room.players.every((p) => p.view !== null) && room.spectator.view !== null,
      3000,
      'vistas',
    );

    const turnPlayer = room.players.find((p) => p.view?.turn.player === p.playerId);
    const other = room.players.find((p) => p !== turnPlayer);
    if (!turnPlayer?.view || !other) throw new Error('sin jugadores');
    const action = turnPlayer.view.legalActions[0];
    if (!action) throw new Error('sin acciones');

    // El jugador de turno puede; los demás reciben error del motor y el host/espectador, NOT_A_PLAYER.
    expect(await other.request('game:action', { action })).toMatchObject({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(await room.host.request('game:action', { action })).toEqual({
      ok: false,
      error: 'NOT_A_PLAYER',
    });
    expect(await room.spectator.request('game:action', { action })).toEqual({
      ok: false,
      error: 'NOT_A_PLAYER',
    });
    // Un campo `player` colado en el mensaje no sirve para suplantar: el esquema lo rechaza.
    expect(
      await other.raw('game:action', { protocolVersion: 1, action, player: turnPlayer.playerId }),
    ).toEqual({ ok: false, error: 'INVALID_MESSAGE' });
    expect(await turnPlayer.request('game:action', { action })).toEqual({ ok: true, data: {} });

    // La elección a medias del jugador de turno llega al host y a los demás, no a sí mismo.
    const target = { kind: 'vertex', id: 'v1' };
    expect(await turnPlayer.request('game:preview', { target })).toEqual({ ok: true, data: {} });
    await until(
      () => (room.host.events['game:preview']?.length ?? 0) > 0,
      3000,
      'vista previa en el host',
    );
    expect(room.host.events['game:preview']?.[0]).toEqual({
      playerId: turnPlayer.playerId,
      target,
    });
    expect(room.spectator.events['game:preview']).toHaveLength(1);
    expect(turnPlayer.events['game:preview']).toBeUndefined();
    expect(await other.request('game:preview', { target })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });

    // Cada jugador solo conoce el contenido de su propia mano.
    for (const p of room.players) {
      const view = p.view;
      expect(view?.you?.id).toBe(p.playerId);
      for (const pub of view?.players ?? []) expect('hand' in pub).toBe(false);
    }
    expect(room.spectator.view?.you).toBeNull();
    expect(room.spectator.view?.legalActions).toEqual([]);
  });

  it('un espectador que entra con la partida empezada recibe la vista pública', async () => {
    server = await startTestServer({ seed: () => 'late-spectator', config: FAST });
    const room = await lobby(2);
    await room.host.request('lobby:start');
    const late = await connect();
    expect(await late.request('room:join', { code: room.code, role: 'spectator' })).toMatchObject({
      ok: true,
    });
    await until(() => late.view !== null, 3000, 'vista del espectador tardío');
    expect(late.view?.you).toBeNull();
    expect(await (await connect()).join(room.code, 'Tarde')).toEqual({
      ok: false,
      error: 'GAME_ALREADY_STARTED',
    });
  });
});
