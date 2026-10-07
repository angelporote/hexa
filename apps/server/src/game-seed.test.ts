import { afterEach, describe, expect, it } from 'vitest';
import { TestClient, startTestServer, until } from './testing/harness.js';
import type { TestServer } from './testing/harness.js';

let server: TestServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

/** Una sala de 2 jugadores (host + 2 bots) ya empezada; devuelve la semilla y el tablero que ve el host. */
async function startedGame(): Promise<{ seed: string; board: string }> {
  if (!server) throw new Error('servidor no iniciado');
  const host = await TestClient.connect(server.url);
  clients.push(host);
  const code = await host.createRoom();
  await host.request('lobby:addBot');
  await host.request('lobby:addBot');
  await until(() => host.state?.seats.length === 2, 2000, 'dos bots');
  expect(await host.request('lobby:start')).toEqual({ ok: true, data: {} });
  await until(() => host.view !== null, 2000, 'vista del host');
  const seed = server.handle.manager.getRoom(code)?.game?.seed ?? '';
  return { seed, board: JSON.stringify(host.view?.board.hexes) };
}

describe('GAME_SEED', () => {
  it('con semilla fija, todas las partidas tienen el mismo tablero y la misma semilla', async () => {
    server = await startTestServer({ config: { gameSeed: 'e2e-231', botDelayMs: 100_000 } });
    const first = await startedGame();
    const second = await startedGame();
    expect(first.seed).toBe('e2e-231');
    expect(second.seed).toBe('e2e-231');
    expect(second.board).toBe(first.board);
  });

  it('sin ella, cada partida tiene su propia semilla y su propio tablero', async () => {
    server = await startTestServer({ config: { gameSeed: null, botDelayMs: 100_000 } });
    const first = await startedGame();
    const second = await startedGame();
    expect(first.seed).not.toBe(second.seed);
    expect(second.board).not.toBe(first.board);
  });
});
