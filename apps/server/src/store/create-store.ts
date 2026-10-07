import type { ServerConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { connectRedis, RedisRoomStore } from './redis-room-store.js';
import { MemoryRoomStore } from './room-store.js';
import type { RoomStore } from './room-store.js';
import { WriteBehindStore } from './write-behind-store.js';

/** Redis si hay `REDIS_URL`; en memoria si no (desarrollo: las salas se pierden al reiniciar). */
export async function createStore(config: ServerConfig, logger: Logger): Promise<RoomStore> {
  if (config.redisUrl === null) {
    logger.warn(
      { event: 'store_memory' },
      'sin REDIS_URL: las salas viven en memoria y se pierden al reiniciar',
    );
    return new MemoryRoomStore();
  }
  const client = await connectRedis(config.redisUrl, logger);
  logger.info({ event: 'store_redis' }, 'salas guardadas en Redis');
  return new WriteBehindStore(new RedisRoomStore(client, { logger, ttlMs: config.roomTtlMs }), {
    logger,
  });
}
