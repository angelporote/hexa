import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../logger.js';
import { FakeKeyValueClient } from '../testing/fake-kv.js';
import { tradeRoom } from '../testing/trade-room.js';
import { connectRedis, describeError, RedisRoomStore } from './redis-room-store.js';
import type { KeyValueClient } from './redis-room-store.js';
import type { RoomData } from './room-store.js';

interface Backend {
  readonly name: string;
  make(): Promise<{ client: KeyValueClient; prefix: string; cleanup(): Promise<void> }>;
}

const backends: Backend[] = [
  {
    name: 'cliente falso',
    make: () =>
      Promise.resolve({
        client: new FakeKeyValueClient(),
        prefix: 'hexa:room:',
        cleanup: () => Promise.resolve(),
      }),
  },
];

// Con `REDIS_URL` (la CI levanta un Redis) el mismo contrato se comprueba contra uno de verdad.
const redisUrl = process.env['REDIS_URL'];
if (redisUrl) {
  backends.push({
    name: 'Redis real',
    async make() {
      const client = await connectRedis(redisUrl, silentLogger);
      const prefix = `hexa-test:${randomUUID()}:`;
      return {
        client,
        prefix,
        async cleanup() {
          for (const key of await client.keys(prefix)) await client.del(key);
          await client.close();
        },
      };
    },
  });
}

const lobby = (code: string): RoomData => ({
  ...tradeRoom({}).room,
  code,
  status: 'lobby',
  game: null,
});
const playing = (code: string): RoomData => ({ ...tradeRoom({ p1: { r2: 3 } }).room, code });
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe.each(backends)('RedisRoomStore ($name)', ({ make }) => {
  async function setup(ttlMs = 60_000) {
    const { client, prefix, cleanup } = await make();
    const warnings: object[] = [];
    const store = new RedisRoomStore(client, {
      prefix,
      ttlMs,
      logger: { ...silentLogger, warn: (o: object) => void warnings.push(o) },
    });
    return { client, prefix, store, warnings, cleanup };
  }

  it('guarda y recupera una sala con partida igual que estaba', async () => {
    const { store, cleanup } = await setup();
    try {
      const room = playing('AAAA');
      await store.save(room);
      expect(await store.loadAll()).toEqual([room]);
    } finally {
      await cleanup();
    }
  });

  it('guardar de nuevo reemplaza la sala; borrar la quita', async () => {
    const { store, cleanup } = await setup();
    try {
      await store.save(lobby('AAAA'));
      await store.save({ ...lobby('AAAA'), lastActivity: 99 });
      await store.save(lobby('BBBB'));
      const rooms = await store.loadAll();
      expect(rooms.map((r) => [r.code, r.lastActivity]).sort()).toEqual([
        ['AAAA', 99],
        ['BBBB', 1],
      ]);
      await store.delete('AAAA');
      expect((await store.loadAll()).map((r) => r.code)).toEqual(['BBBB']);
      await store.delete('NADA'); // borrar lo que no existe no es un error
    } finally {
      await cleanup();
    }
  });

  it('ignora claves ajenas y descarta con aviso las ilegibles', async () => {
    const { client, prefix, store, warnings, cleanup } = await setup();
    try {
      await store.save(lobby('AAAA'));
      await client.set('otra-app:AAAA', JSON.stringify(lobby('OTRA')), 60_000);
      await client.set(`${prefix}ROTA`, '{esto no es json', 60_000);
      await client.set(`${prefix}RARA`, JSON.stringify({ code: 'RARA' }), 60_000);
      expect((await store.loadAll()).map((r) => r.code)).toEqual(['AAAA']);
      expect(warnings.map((w) => (w as { key: string }).key).sort()).toEqual([
        `${prefix}RARA`,
        `${prefix}ROTA`,
      ]);
      await client.del('otra-app:AAAA');
    } finally {
      await cleanup();
    }
  });

  it('recupera muchas salas aunque se lean por lotes', async () => {
    const { store, cleanup } = await setup();
    try {
      const codes = Array.from({ length: 250 }, (_, i) => `S${String(i).padStart(3, '0')}`);
      await Promise.all(codes.map((code) => store.save(lobby(code))));
      const loaded = (await store.loadAll()).map((r) => r.code).sort();
      expect(loaded).toEqual(codes);
    } finally {
      await cleanup();
    }
  });

  it('las salas caducan solas pasado el TTL', async () => {
    const { store, cleanup } = await setup(80);
    try {
      await store.save(lobby('AAAA'));
      expect(await store.loadAll()).toHaveLength(1);
      await sleep(200);
      expect(await store.loadAll()).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('cada guardado renueva la caducidad', async () => {
    const { store, cleanup } = await setup(300);
    try {
      await store.save(lobby('AAAA'));
      await sleep(200);
      await store.save(lobby('AAAA'));
      await sleep(200); // 400 ms desde el primer guardado: sin renovar ya habría caducado
      expect(await store.loadAll()).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});

describe('describeError', () => {
  it('desenvuelve el AggregateError de una conexión rechazada', () => {
    const refused = new AggregateError(
      [
        new Error('connect ECONNREFUSED ::1:6379'),
        new Error('connect ECONNREFUSED 127.0.0.1:6379'),
      ],
      '',
    );
    expect(describeError(refused)).toBe(
      'connect ECONNREFUSED ::1:6379; connect ECONNREFUSED 127.0.0.1:6379',
    );
  });

  it('usa el mensaje de un Error, el nombre si no lo tiene, o el texto de cualquier otra cosa', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError(new AggregateError([], ''))).toBe('AggregateError');
    expect(describeError('texto')).toBe('texto');
  });
});

describe('RedisRoomStore (detalles del cliente)', () => {
  it('usa el prefijo por defecto y pasa el TTL configurado', async () => {
    const client = new FakeKeyValueClient();
    const store = new RedisRoomStore(client, { logger: silentLogger, ttlMs: 12_345 });
    await store.save(lobby('AAAA'));
    expect([...client.ttls]).toEqual([['hexa:room:AAAA', 12_345]]);
  });

  it('close cierra la conexión', async () => {
    const client = new FakeKeyValueClient();
    await new RedisRoomStore(client, { logger: silentLogger, ttlMs: 1000 }).close();
    expect(client.closed).toBe(true);
  });

  it('si Redis falla, save y loadAll rechazan (el gestor lo registra; no arranca a ciegas)', async () => {
    const client = new FakeKeyValueClient();
    const store = new RedisRoomStore(client, { logger: silentLogger, ttlMs: 1000 });
    client.down = true;
    await expect(store.save(lobby('AAAA'))).rejects.toThrow('Redis no disponible');
    await expect(store.loadAll()).rejects.toThrow('Redis no disponible');
  });
});
