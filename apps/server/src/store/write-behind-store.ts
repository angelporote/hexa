import type { Logger } from '../logger.js';
import type { RoomData, RoomStore } from './room-store.js';

const DELETE = Symbol('delete');
type Pending = RoomData | typeof DELETE;

export interface WriteBehindOptions {
  readonly logger: Logger;
  /** Espera tras un fallo antes de reintentar; se duplica con cada fallo seguido hasta `maxRetryMs`. */
  readonly retryMs?: number;
  readonly maxRetryMs?: number;
}

/**
 * Escritura diferida sobre otro `RoomStore`: `save` y `delete` no esperan al almacén. Solo se
 * guarda la última versión de cada sala (cada una es una instantánea completa, así que las
 * intermedias sobran), las escrituras de un mismo instante se juntan y, si el almacén falla, la
 * sala queda pendiente y se reintenta con espera creciente. Así una caída de Redis no frena las
 * partidas ni acumula memoria sin límite, y al volver se escribe el estado más reciente.
 * `close()` vuelca lo pendiente: el servidor lo llama al apagarse.
 */
export class WriteBehindStore implements RoomStore {
  private readonly pending = new Map<string, Pending>();
  private readonly retryMs: number;
  private readonly maxRetryMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private failures = 0;
  private closed = false;

  constructor(
    private readonly inner: RoomStore,
    private readonly options: WriteBehindOptions,
  ) {
    this.retryMs = options.retryMs ?? 500;
    this.maxRetryMs = options.maxRetryMs ?? 10_000;
  }

  save(room: RoomData): Promise<void> {
    this.enqueue(room.code, room);
    return Promise.resolve();
  }

  delete(code: string): Promise<void> {
    this.enqueue(code, DELETE);
    return Promise.resolve();
  }

  async loadAll(): Promise<RoomData[]> {
    return this.inner.loadAll();
  }

  /** Salas con escrituras sin confirmar. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Espera a que no quede nada pendiente; con el almacén caído, hasta `timeoutMs`. */
  async flush(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.pending.size > 0) {
      await this.run();
      if (this.pending.size === 0) return;
      if (Date.now() >= deadline) {
        this.options.logger.error(
          { event: 'flush_incomplete', pending: this.pending.size },
          'quedaron salas sin guardar al cerrar',
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
    this.cancelTimer();
    await this.inner.close?.();
  }

  private enqueue(code: string, value: Pending): void {
    this.pending.set(code, value);
    // Tras un fallo manda la espera creciente: no se fuerza un intento con cada jugada.
    if (this.failures === 0) this.schedule(0);
  }

  private schedule(delayMs: number): void {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
    this.timer.unref();
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Un solo volcado a la vez; quien llega mientras otro está en curso espera a que termine. */
  private run(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    const batch = [...this.pending.entries()];
    const results = await Promise.allSettled(
      batch.map(([code, value]) =>
        value === DELETE ? this.inner.delete(code) : this.inner.save(value),
      ),
    );
    let failed = 0;
    results.forEach((result, i) => {
      const entry = batch[i];
      if (!entry) return;
      const [code, value] = entry;
      if (result.status === 'rejected') {
        failed++;
        this.options.logger.error(
          { event: 'persist_failed', code, error: String(result.reason) },
          'no se pudo guardar la sala; se reintentará',
        );
        return;
      }
      // Si mientras tanto llegó una versión más nueva, sigue pendiente.
      if (this.pending.get(code) === value) this.pending.delete(code);
    });

    if (failed > 0) {
      this.failures++;
      this.schedule(Math.min(this.retryMs * 2 ** (this.failures - 1), this.maxRetryMs));
    } else {
      this.failures = 0;
      if (this.pending.size > 0) this.schedule(0);
    }
  }
}
