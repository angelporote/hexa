// Solo para tests: un transporte falso donde el test decide cuándo conecta y qué responde.
import type { ServerEventName } from '@hexa/protocol';
import type { Transport } from './transport.js';

export class FakeTransport implements Transport {
  connected = false;
  closed = false;
  sent: { event: string; payload: Record<string, unknown> }[] = [];
  responses = new Map<string, unknown>();
  failNext = false;
  private onConnectCb: () => void = () => undefined;
  private onDisconnectCb: () => void = () => undefined;
  private handlers = new Map<string, (payload: unknown) => void>();

  connect(): void {
    this.connected = true;
    this.onConnectCb();
  }
  close(): void {
    this.closed = true;
    this.connected = false;
  }
  onConnect(callback: () => void): void {
    this.onConnectCb = callback;
  }
  onDisconnect(callback: () => void): void {
    this.onDisconnectCb = callback;
  }
  onServerEvent(event: ServerEventName, callback: (payload: unknown) => void): void {
    this.handlers.set(event, callback);
  }
  request(event: string, payload: unknown): Promise<unknown> {
    this.sent.push({ event, payload: payload as Record<string, unknown> });
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('timeout'));
    }
    return Promise.resolve(this.responses.get(event) ?? { ok: false, error: 'SERVER_ERROR' });
  }

  /** Simula un mensaje del servidor. */
  emit(event: ServerEventName, payload: unknown): void {
    this.handlers.get(event)?.(payload);
  }
  /** Simula la caída de la conexión. */
  drop(): void {
    this.connected = false;
    this.onDisconnectCb();
  }
  /** Simula la vuelta de la conexión. */
  reconnect(): void {
    this.connected = true;
    this.onConnectCb();
  }
}
