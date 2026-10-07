// Solo para tests: un Redis mínimo en memoria con caducidad y un interruptor para simular una caída.
import type { KeyValueClient } from '../store/redis-room-store.js';

export class FakeKeyValueClient implements KeyValueClient {
  /** Mientras sea `true`, toda operación falla como lo haría un Redis inalcanzable. */
  down = false;
  closed = false;
  /** Número de `set` y de `del` aceptados, para comprobar cuántas escrituras llegan. */
  sets = 0;
  dels = 0;
  /** Último `ttlMs` recibido por clave. */
  readonly ttls = new Map<string, number>();
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private check(): void {
    if (this.down) throw new Error('Redis no disponible');
  }

  set(key: string, value: string, ttlMs: number): Promise<void> {
    try {
      this.check();
    } catch (error) {
      return Promise.reject(error as Error);
    }
    this.sets++;
    this.ttls.set(key, ttlMs);
    this.data.set(key, { value, expiresAt: this.now() + ttlMs });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    try {
      this.check();
    } catch (error) {
      return Promise.reject(error as Error);
    }
    this.dels++;
    this.data.delete(key);
    return Promise.resolve();
  }

  keys(prefix: string): Promise<string[]> {
    try {
      this.check();
    } catch (error) {
      return Promise.reject(error as Error);
    }
    return Promise.resolve(
      [...this.data.entries()]
        .filter(([key, entry]) => key.startsWith(prefix) && entry.expiresAt > this.now())
        .map(([key]) => key),
    );
  }

  getMany(keys: readonly string[]): Promise<(string | null)[]> {
    try {
      this.check();
    } catch (error) {
      return Promise.reject(error as Error);
    }
    return Promise.resolve(
      keys.map((key) => {
        const entry = this.data.get(key);
        return entry && entry.expiresAt > this.now() ? entry.value : null;
      }),
    );
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  /** Escribe un valor sin pasar por el almacén (para meter basura o salas antiguas). */
  poke(key: string, value: string, ttlMs = 60_000): void {
    this.data.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  get size(): number {
    return this.data.size;
  }
}
