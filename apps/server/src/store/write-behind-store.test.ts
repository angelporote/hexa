import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../logger.js';
import { tradeRoom } from '../testing/trade-room.js';
import type { RoomData, RoomStore } from './room-store.js';
import { WriteBehindStore } from './write-behind-store.js';

/** Almacén de prueba: anota cada escritura y puede fallar o retrasarse a voluntad. */
class RecordingStore implements RoomStore {
  saved: RoomData[] = [];
  deleted: string[] = [];
  fail = false;
  closed = false;
  /** Si no es `null`, las escrituras no terminan hasta llamar a `release`. */
  gate: Promise<void> | null = null;
  release: () => void = () => undefined;

  async save(room: RoomData): Promise<void> {
    if (this.gate) await this.gate;
    if (this.fail) throw new Error('Redis caído');
    this.saved.push(room);
  }

  async delete(code: string): Promise<void> {
    if (this.fail) throw new Error('Redis caído');
    this.deleted.push(code);
  }

  loadAll(): Promise<RoomData[]> {
    return Promise.resolve(this.saved);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  hold(): void {
    this.gate = new Promise<void>((resolve) => {
      this.release = () => {
        this.gate = null;
        resolve();
      };
    });
  }
}

const room = (code: string, lastActivity: number): RoomData => ({
  ...tradeRoom({}).room,
  code,
  lastActivity,
});

let inner: RecordingStore;
let errors: object[];
let store: WriteBehindStore;

beforeEach(() => {
  vi.useFakeTimers();
  inner = new RecordingStore();
  errors = [];
  store = new WriteBehindStore(inner, {
    logger: { ...silentLogger, error: (o: object) => void errors.push(o) },
    retryMs: 100,
    maxRetryMs: 400,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WriteBehindStore', () => {
  it('save no espera al almacén: devuelve enseguida y escribe después', async () => {
    inner.hold();
    await store.save(room('AAAA', 1)); // no se cuelga aunque el almacén esté detenido
    expect(inner.saved).toEqual([]);
    expect(store.pendingCount).toBe(1);
    inner.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.saved.map((r) => r.code)).toEqual(['AAAA']);
    expect(store.pendingCount).toBe(0);
  });

  it('junta las escrituras de una misma sala y guarda solo la última', async () => {
    await store.save(room('AAAA', 1));
    await store.save(room('AAAA', 2));
    await store.save(room('AAAA', 3));
    await store.save(room('BBBB', 9));
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.saved.map((r) => [r.code, r.lastActivity])).toEqual([
      ['AAAA', 3],
      ['BBBB', 9],
    ]);
  });

  it('una versión que llega mientras se escribe la anterior se guarda después, en orden', async () => {
    inner.hold();
    await store.save(room('AAAA', 1));
    await vi.advanceTimersByTimeAsync(0); // empieza a escribir la v1, bloqueada
    await store.save(room('AAAA', 2));
    inner.release();
    await vi.advanceTimersByTimeAsync(10);
    expect(inner.saved.map((r) => r.lastActivity)).toEqual([1, 2]);
    expect(store.pendingCount).toBe(0);
  });

  it('borrar cancela el guardado pendiente de esa sala', async () => {
    await store.save(room('AAAA', 1));
    await store.delete('AAAA');
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.saved).toEqual([]);
    expect(inner.deleted).toEqual(['AAAA']);
  });

  it('guardar después de borrar deja la sala guardada', async () => {
    await store.delete('AAAA');
    await store.save(room('AAAA', 5));
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.deleted).toEqual([]);
    expect(inner.saved.map((r) => r.lastActivity)).toEqual([5]);
  });

  it('si el almacén falla reintenta con espera creciente y acaba guardando lo último', async () => {
    inner.fail = true;
    await store.save(room('AAAA', 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ event: 'persist_failed', code: 'AAAA' });

    // nuevas jugadas durante la caída no fuerzan intentos: manda la espera de reintento
    await store.save(room('AAAA', 2));
    await vi.advanceTimersByTimeAsync(50);
    expect(errors).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60); // 100 ms desde el primer fallo
    expect(errors).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(200); // el siguiente reintento espera el doble
    expect(errors).toHaveLength(3);
    expect(store.pendingCount).toBe(1);

    inner.fail = false;
    await vi.advanceTimersByTimeAsync(400); // la espera máxima es 400 ms
    expect(inner.saved.map((r) => r.lastActivity)).toEqual([2]);
    expect(store.pendingCount).toBe(0);
  });

  it('tras recuperarse, vuelve a escribir sin esperas', async () => {
    inner.fail = true;
    await store.save(room('AAAA', 1));
    await vi.advanceTimersByTimeAsync(0);
    inner.fail = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(store.pendingCount).toBe(0);
    await store.save(room('AAAA', 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.saved.map((r) => r.lastActivity)).toEqual([1, 2]);
  });

  it('close vuelca lo pendiente y cierra el almacén', async () => {
    await store.save(room('AAAA', 1));
    await store.save(room('BBBB', 2));
    await store.close();
    expect(inner.saved.map((r) => r.code).sort()).toEqual(['AAAA', 'BBBB']);
    expect(inner.closed).toBe(true);
  });

  it('close reintenta hasta que el almacén vuelve', async () => {
    inner.fail = true;
    await store.save(room('AAAA', 1));
    const closing = store.close();
    await vi.advanceTimersByTimeAsync(200);
    inner.fail = false;
    await vi.advanceTimersByTimeAsync(100);
    await closing;
    expect(inner.saved.map((r) => r.code)).toEqual(['AAAA']);
    expect(inner.closed).toBe(true);
  });

  it('close no se queda colgado si el almacén no vuelve: avisa y sale', async () => {
    inner.fail = true;
    await store.save(room('AAAA', 1));
    const closing = store.close();
    await vi.advanceTimersByTimeAsync(6000);
    await closing;
    expect(store.pendingCount).toBe(1);
    expect(inner.closed).toBe(true);
    expect(errors.some((e) => (e as { event?: string }).event === 'flush_incomplete')).toBe(true);
  });

  it('loadAll lee del almacén', async () => {
    await inner.save(room('AAAA', 1));
    expect((await store.loadAll()).map((r) => r.code)).toEqual(['AAAA']);
  });
});
