import { afterEach, describe, expect, it } from 'vitest';
import { applyAction, chooseSmartMove, createGame, createRng } from '@hexa/engine';
import { TestClient, startTestServer, until } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';
import { replayGame } from '../rooms/replay.js';

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

describe('bots del servidor', () => {
  it('el host añade y quita bots; solo el host puede', async () => {
    server = await startTestServer({ config: { botDelayMs: 1 } });
    const host = await connect();
    const code = await host.createRoom();
    const ana = await connect();
    await ana.join(code, 'Ana');

    expect(await ana.request('lobby:addBot')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await host.request('lobby:addBot')).toEqual({ ok: true, data: {} });
    expect(await host.request('lobby:addBot')).toEqual({ ok: true, data: {} });
    await until(() => host.state?.seats.length === 3, 2000, 'dos bots');
    expect(host.state?.seats.filter((s) => s.bot).map((s) => s.name)).toEqual(['Bot 1', 'Bot 2']);
    expect(host.state?.seats.filter((s) => s.bot).every((s) => s.ready && s.connected)).toBe(true);

    expect(await host.request('lobby:addBot')).toEqual({ ok: true, data: {} });
    expect(await host.request('lobby:addBot')).toEqual({ ok: false, error: 'ROOM_FULL' });
    expect(await host.request('lobby:removeBot', { playerId: 'p0' })).toEqual({
      ok: false,
      error: 'NOT_A_BOT',
    });
    expect(await ana.request('lobby:removeBot', { playerId: 'p1' })).toEqual({
      ok: false,
      error: 'NOT_HOST',
    });
    expect(await host.request('lobby:removeBot', { playerId: 'p1' })).toEqual({
      ok: true,
      data: {},
    });
    await until(() => host.state?.seats.length === 3, 2000, 'bot quitado');
    expect(host.state?.seats.map((s) => s.name)).toEqual(['Ana', 'Bot 2', 'Bot 3']);
  });

  it('una partida de 4 bots se juega sola hasta el final y el host la ve en tiempo real', async () => {
    server = await startTestServer({
      seed: () => 'bots-seed',
      config: { botDelayMs: 0 },
    });
    const host = await connect();
    const code = await host.createRoom();
    const spectator = await connect();
    expect(await spectator.request('room:join', { code, role: 'spectator' })).toMatchObject({
      ok: true,
    });
    for (let i = 0; i < 4; i++) await host.request('lobby:addBot');
    await until(() => host.state?.seats.length === 4, 2000, 'cuatro bots');
    expect(await host.request('lobby:start')).toEqual({ ok: true, data: {} });

    await until(() => host.view?.phase.type === 'ended', 90_000, 'fin de la partida');
    expect(host.view?.winner).not.toBeNull();
    expect(host.view?.you).toBeNull();
    // Todo lo que ocurrió llegó como eventos públicos, en orden y sin saltos de seq.
    expect(host.gameEvents.some((e) => e.type === 'DICE_ROLLED')).toBe(true);
    expect(host.gameEvents.some((e) => e.type === 'GAME_WON')).toBe(true);
    expect(spectator.seq).toBe(host.seq);

    const game = server.handle.manager.getRoom(code)?.game;
    if (!game) throw new Error('sin partida');
    expect(replayGame(game)).toEqual(game.snapshot);
    expect(game.snapshot.log.length).toBe(host.seq);
  }, 120_000);

  it('cada jugada de los bots es la del bot razonable para ese estado y esa semilla', async () => {
    server = await startTestServer({ seed: () => 'smart-driver-seed', config: { botDelayMs: 0 } });
    const host = await connect();
    const code = await host.createRoom();
    for (let i = 0; i < 4; i++) await host.request('lobby:addBot');
    await until(() => host.state?.seats.length === 4, 2000, 'cuatro bots');
    expect(await host.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => host.view?.phase.type === 'ended', 90_000, 'fin de la partida');

    const game = server.handle.manager.getRoom(code)?.game;
    if (!game) throw new Error('sin partida');
    let state = createGame(game.config, game.seed);
    game.actions.forEach((entry, i) => {
      const { move } = chooseSmartMove(state, entry.player, createRng(`bot:${game.seed}:${i}`));
      expect(move?.action, `jugada ${i} de ${entry.player}`).toEqual(entry.action);
      const next = applyAction(state, entry.player, entry.action);
      if (!next.ok) throw new Error(`la jugada ${i} falla: ${next.error}`);
      state = next.value.state;
    });
    expect(state).toEqual(game.snapshot);
    // el bot razonable no negocia con jugadores
    expect(game.actions.some((e) => e.action.type === 'OFFER_TRADE')).toBe(false);
  }, 120_000);

  it('un humano y tres bots: el bot responde a la fase de descarte y no bloquea la partida', async () => {
    server = await startTestServer({
      seed: () => 'mixed-seed',
      config: { botDelayMs: 0 },
    });
    const host = await connect();
    const code = await host.createRoom();
    const human = await connect();
    await human.join(code, 'Humana');
    await human.request('lobby:update', { ready: true });
    for (let i = 0; i < 3; i++) await host.request('lobby:addBot');
    expect(await host.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => human.view !== null, 3000, 'vista de la jugadora');

    // La humana no actúa: los bots avanzan hasta que le toca a ella y esperan su jugada.
    await until(
      () =>
        (human.view?.legalActions.length ?? 0) > 0 && human.view?.turn.player === human.playerId,
      30_000,
      'turno de la humana',
    );
    const before = human.seq;
    const action = human.view?.legalActions[0];
    if (!action) throw new Error('sin acciones');
    expect(await human.request('game:action', { action })).toEqual({ ok: true, data: {} });
    await until(() => human.seq > before, 3000, 'vista tras actuar');
  }, 60_000);
});
