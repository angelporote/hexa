import { afterEach, describe, expect, it } from 'vitest';
import { createRng, getPlayerView } from '@hexa/engine';
import { replayGame } from '../rooms/replay.js';
import { chooseAction } from '../testing/bot-client.js';
import { TestClient, startTestServer, until } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';

// «Un segundo» del temporizador dura 50 ms: un plazo de 15 s son 750 ms.
const FAST = {
  rateLimit: { burst: 100_000, perSecond: 100_000 },
  botDelayMs: 1,
  turnTimerUnitMs: 50,
};

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

/** Ana crea la sala a distancia, entran Luis y un bot. Sin empezar. */
async function room(timerSeconds: number | null) {
  const ana = await connect();
  const code = await ana.createRoom({ role: 'player', name: 'Ana', color: 'c2' });
  const luis = await connect();
  expect(await luis.join(code, 'Luis')).toMatchObject({ ok: true });
  expect(await ana.request('lobby:addBot')).toEqual({ ok: true, data: {} });
  if (timerSeconds !== null) {
    expect(await ana.request('lobby:setOptions', { turnTimerSeconds: timerSeconds })).toEqual({
      ok: true,
      data: {},
    });
  }
  for (const c of [ana, luis]) await c.request('lobby:update', { ready: true });
  await until(() => ana.state?.seats.length === 3, 3000, 'tres asientos');
  return { ana, luis, code };
}

const seatAuto = (c: TestClient, id: string) => c.state?.seats.find((s) => s.playerId === id)?.auto;

describe('lobby:setOptions por la red', () => {
  it('lo fija quien administra y lo ven todos; los demás reciben NOT_HOST', async () => {
    server = await startTestServer({ config: FAST });
    const { ana, luis } = await room(null);
    expect(await luis.request('lobby:setOptions', { turnTimerSeconds: 60 })).toEqual({
      ok: false,
      error: 'NOT_HOST',
    });
    expect(await ana.request('lobby:setOptions', { turnTimerSeconds: 60 })).toEqual({
      ok: true,
      data: {},
    });
    await until(() => luis.state?.options.turnTimerSeconds === 60, 3000, 'opción visible');
    expect(ana.state?.options).toEqual({ turnTimerSeconds: 60 });
    expect(await ana.request('lobby:setOptions', { turnTimerSeconds: null })).toEqual({
      ok: true,
      data: {},
    });
    await until(() => luis.state?.options.turnTimerSeconds === null, 3000, 'opción quitada');
  });

  it('rechaza plazos fuera de rango o mal formados', async () => {
    server = await startTestServer({ config: FAST });
    const { ana } = await room(null);
    for (const bad of [5, 601, 12.5, '60', undefined]) {
      expect(
        await ana.raw('lobby:setOptions', { protocolVersion: 1, turnTimerSeconds: bad }),
      ).toEqual({ ok: false, error: 'INVALID_MESSAGE' });
    }
  });
});

describe('temporizador de turno por la red', () => {
  it('quien no mueve a tiempo es sustituido por un bot, y vuelve con seat:return', async () => {
    server = await startTestServer({ seed: () => 'timer-seed', config: FAST });
    const { ana, luis, code } = await room(15);
    expect(await ana.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => ana.view !== null && luis.view !== null, 3000, 'vistas');

    // al empezar, el reloj corre contra Ana (p0) y todos lo ven
    const first = ana.events['game:view']?.[0] as {
      clock: { actors: string[]; remainingMs: number };
    };
    expect(first.clock.actors).toEqual(['p0']);
    expect(first.clock.remainingMs).toBeGreaterThan(500);
    expect(first.clock.remainingMs).toBeLessThanOrEqual(750);
    expect(seatAuto(ana, 'p0')).toBe(false);

    // Ana no hace nada: pasado el plazo un bot juega por ella
    await until(() => seatAuto(luis, 'p0') === true, 4000, 'Ana sustituida');
    await until(
      () => (server?.handle.manager.getRoom(code)?.game?.snapshot.log.length ?? 0) >= 2,
      3000,
      'el bot juega por Ana',
    );
    const log = server.handle.manager.getRoom(code)?.game?.snapshot.log ?? [];
    expect(log[0]?.player).toBe('p0');
    expect(seatAuto(luis, 'p1')).toBe(false);

    // vuelve: recupera el asiento y su reloj vuelve a correr
    expect(await ana.request('seat:return')).toEqual({ ok: true, data: {} });
    await until(() => seatAuto(luis, 'p0') === false, 3000, 'Ana de vuelta');
    expect(ana.state?.seats[0]?.auto).toBe(false);
    expect(await luis.request('seat:return')).toEqual({ ok: true, data: {} }); // sin efecto
  });

  it('una partida con una persona ausente llega al final y se puede reproducir', async () => {
    const failures: object[] = [];
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: (o: object) => void failures.push(o),
    };
    server = await startTestServer({ seed: () => 'absent-seed', config: FAST, logger });
    const { ana, luis, code } = await room(15);
    expect(await ana.request('lobby:start')).toEqual({ ok: true, data: {} });
    await until(() => ana.view !== null && luis.view !== null, 3000, 'vistas');

    // Ana no vuelve a tocar nada; Luis juega con normalidad
    let rng = createRng('absent-human');
    const logLength = () => server?.handle.manager.getRoom(code)?.game?.snapshot.log.length ?? 0;
    const deadline = Date.now() + 120_000;
    while (luis.view?.phase.type !== 'ended') {
      if (Date.now() > deadline)
        throw new Error(`no termina (fallos: ${JSON.stringify(failures)})`);
      if (luis.seq !== logLength() || (luis.view?.legalActions.length ?? 0) === 0) {
        await new Promise((resolve) => setTimeout(resolve, 3));
        continue;
      }
      const choice = chooseAction(luis.view as NonNullable<typeof luis.view>, rng);
      if (!choice) throw new Error('sin elección');
      rng = choice.rng;
      await luis.request('game:action', { action: choice.action });
    }

    const game = server.handle.manager.getRoom(code)?.game;
    if (!game) throw new Error('sin partida');
    expect(game.snapshot.winner).not.toBeNull();
    expect(replayGame(game)).toEqual(game.snapshot);
    // Ana jugó solo por medio del bot; la partida no se paró nunca
    expect(game.snapshot.log.some((e) => e.player === 'p0')).toBe(true);
    expect(seatAuto(luis, 'p0')).toBe(true);
    expect(failures).toEqual([]);
    expect(ana.view).toEqual(getPlayerView(game.snapshot, 'p0'));
  }, 150_000);
});
