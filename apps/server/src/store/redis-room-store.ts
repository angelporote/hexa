import { createClient } from '@redis/client';
import type { Logger } from '../logger.js';
import { parseRoomData } from './room-data.js';
import type { RoomData, RoomStore } from './room-store.js';

/** Lo mínimo que se usa de Redis; permite sustituirlo por uno en memoria en los tests. */
export interface KeyValueClient {
  /** Guarda `value` y lo hace caducar pasados `ttlMs`. */
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Claves que empiezan por `prefix`. */
  keys(prefix: string): Promise<string[]>;
  /** Valores en el mismo orden que `keys`; `null` si la clave ya no existe. */
  getMany(keys: readonly string[]): Promise<(string | null)[]>;
  close(): Promise<void>;
}

export interface RedisRoomStoreOptions {
  readonly logger: Logger;
  /** Cada guardado renueva la caducidad: una sala abandonada desaparece sola. */
  readonly ttlMs: number;
  readonly prefix?: string;
}

const READ_BATCH = 100;

/** Una sala por clave (`hexa:room:CODIGO`), serializada como JSON y con caducidad. */
export class RedisRoomStore implements RoomStore {
  private readonly prefix: string;

  constructor(
    private readonly client: KeyValueClient,
    private readonly options: RedisRoomStoreOptions,
  ) {
    this.prefix = options.prefix ?? 'hexa:room:';
  }

  save(room: RoomData): Promise<void> {
    return this.client.set(this.key(room.code), JSON.stringify(room), this.options.ttlMs);
  }

  delete(code: string): Promise<void> {
    return this.client.del(this.key(code));
  }

  async loadAll(): Promise<RoomData[]> {
    const keys = [...new Set(await this.client.keys(this.prefix))];
    const rooms: RoomData[] = [];
    for (let i = 0; i < keys.length; i += READ_BATCH) {
      const batch = keys.slice(i, i + READ_BATCH);
      const values = await this.client.getMany(batch);
      values.forEach((raw, j) => {
        // Pudo caducar o borrarse entre listar y leer.
        if (raw === null) return;
        const room = parseRoomData(raw);
        if (room) rooms.push(room);
        else {
          this.options.logger.warn(
            { event: 'room_discarded', key: batch[j] },
            'sala guardada ilegible: se descarta',
          );
        }
      });
    }
    return rooms;
  }

  close(): Promise<void> {
    return this.client.close();
  }

  private key(code: string): string {
    return `${this.prefix}${code}`;
  }
}

/** El texto útil de un error: node-redis agrupa los fallos de conexión en un `AggregateError` mudo. */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors.map(describeError).filter(Boolean).join('; ');
    return inner || error.message || error.name;
  }
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

const CONNECT_TIMEOUT_MS = 10_000;

/** Conecta con Redis; falla si no responde, para que un arranque mal configurado se note enseguida. */
export async function connectRedis(url: string, logger: Logger): Promise<KeyValueClient> {
  const client = createClient({
    url,
    // Sin cola de espera: con Redis caído los comandos fallan al instante (el almacén de escritura
    // diferida reintenta) en lugar de quedarse colgados y bloquear el apagado.
    disableOfflineQueue: true,
    socket: { reconnectStrategy: (retries: number) => Math.min(retries * 200, 5000) },
  });
  client.on('error', (error: unknown) => {
    logger.error({ event: 'redis_error', error: describeError(error) }, 'error de Redis');
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis no responde en ${CONNECT_TIMEOUT_MS / 1000} s`)),
      CONNECT_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([client.connect(), timeout]);
  } catch (error) {
    client.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
  }

  return {
    async set(key, value, ttlMs) {
      await client.set(key, value, { expiration: { type: 'PX', value: ttlMs } });
    },
    async del(key) {
      await client.del(key);
    },
    async keys(prefix) {
      const found: string[] = [];
      for await (const page of client.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 })) {
        found.push(...page);
      }
      return found;
    },
    async getMany(keys) {
      if (keys.length === 0) return [];
      const values = await client.mGet([...keys]);
      return values.map((v) => (v === null ? null : String(v)));
    },
    async close() {
      await client.close();
    },
  };
}
