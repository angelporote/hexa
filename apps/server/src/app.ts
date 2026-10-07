import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { loadConfig } from './config.js';
import type { ServerConfig } from './config.js';
import { silentLogger } from './logger.js';
import type { Logger } from './logger.js';
import { BotDriver } from './bots/bot-driver.js';
import { attachSocketServer } from './net/socket-server.js';
import { RoomManager } from './rooms/room-manager.js';
import { TradeExpiry } from './rooms/trade-expiry.js';
import { createSeed, createToken, randomInt } from './sessions/tokens.js';
import { MemoryRoomStore } from './store/room-store.js';
import type { RoomStore } from './store/room-store.js';

/** Servidor HTTP mínimo con `GET /health`; sobre él se monta Socket.IO en `buildServer`. */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', () => ({ status: 'ok' }));
  return app;
}

export interface ServerOptions {
  readonly config?: Partial<ServerConfig>;
  readonly logger?: Logger;
  readonly store?: RoomStore;
  readonly clock?: () => number;
  /** Semillas de partida deterministas, para tests. */
  readonly seed?: () => string;
}

export interface ServerHandle {
  readonly app: FastifyInstance;
  readonly io: Server;
  readonly manager: RoomManager;
  readonly config: ServerConfig;
  close(): Promise<void>;
}

/** Ensambla HTTP + WebSocket + gestor de salas. No abre el puerto: eso lo hace quien lo llame. */
export async function buildServer(options: ServerOptions = {}): Promise<ServerHandle> {
  const config: ServerConfig = { ...loadConfig({}), ...options.config };
  const logger = options.logger ?? silentLogger;
  const clock = options.clock ?? Date.now;

  const manager = new RoomManager({
    store: options.store ?? new MemoryRoomStore(),
    logger,
    clock,
    randomInt,
    token: createToken,
    seed: options.seed ?? createSeed,
    roomTtlMs: config.roomTtlMs,
  });
  const restored = await manager.hydrate();
  if (restored > 0) logger.info({ event: 'rooms_restored', count: restored }, 'salas recuperadas');

  const app = buildApp();
  const { io, deliver } = attachSocketServer(app.server, { manager, config, logger, clock });
  const bots = new BotDriver(manager, deliver, logger, { delayMs: config.botDelayMs });
  const tradeExpiry = new TradeExpiry(manager, deliver, logger, config.tradeOfferTtlMs);
  // Las salas recuperadas del almacén pueden tener bots por jugar y ofertas abiertas.
  tradeExpiry.checkAll();
  bots.resumeAll();

  const sweeper = setInterval(() => manager.sweep(), config.sweepIntervalMs);
  sweeper.unref();

  app.addHook('preClose', () => {
    io.local.disconnectSockets(true);
  });
  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    bots.stop();
    tradeExpiry.stop();
    await io.close();
  });

  return { app, io, manager, config, close: () => app.close() };
}
