// Utilidades solo para tests: un servidor real en un puerto libre y clientes Socket.IO tipados.
import type { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { ackSchemas, PROTOCOL_VERSION } from '@hexa/protocol';
import type { ClientEventName, RoomState, ServerEventName } from '@hexa/protocol';
import type { PlayerView, GameEvent } from '@hexa/engine';
import { buildServer } from '../app.js';
import type { ServerHandle, ServerOptions } from '../app.js';

export interface TestServer {
  readonly handle: ServerHandle;
  readonly url: string;
  close(): Promise<void>;
}

export async function startTestServer(options: ServerOptions = {}): Promise<TestServer> {
  const handle = await buildServer(options);
  await handle.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = handle.app.server.address() as AddressInfo;
  return { handle, url: `http://127.0.0.1:${port}`, close: () => handle.close() };
}

export async function until(
  condition: () => boolean,
  timeoutMs = 3000,
  label = 'condición',
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Tiempo agotado esperando: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export type Ack = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export class TestClient {
  readonly events: Record<string, unknown[]> = {};
  state: RoomState | null = null;
  view: PlayerView | null = null;
  seq = -1;
  gameEvents: GameEvent[] = [];
  token = '';
  code = '';
  playerId: string | null = null;
  /** Se llama con cada mensaje del servidor antes de procesarlo; útil para inspeccionarlo. */
  inspect: ((event: ServerEventName, payload: unknown) => void) | null = null;

  private constructor(readonly socket: Socket) {
    const names: ServerEventName[] = [
      'room:state',
      'game:view',
      'game:events',
      'game:preview',
      'error',
    ];
    for (const name of names) {
      socket.on(name, (payload: unknown) => {
        this.inspect?.(name, payload);
        (this.events[name] ??= []).push(payload);
        if (name === 'room:state') this.state = payload as RoomState;
        if (name === 'game:view') {
          const p = payload as { seq: number; view: PlayerView };
          this.view = p.view;
          this.seq = p.seq;
        }
        if (name === 'game:events')
          this.gameEvents.push(...(payload as { events: GameEvent[] }).events);
      });
    }
  }

  static async connect(url: string): Promise<TestClient> {
    const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return new TestClient(socket);
  }

  /** Envía un mensaje con la versión del protocolo y devuelve la respuesta ya validada. */
  async request(event: ClientEventName, payload: Record<string, unknown> = {}): Promise<Ack> {
    const response = await this.raw(event, { protocolVersion: PROTOCOL_VERSION, ...payload });
    const parsed = ackSchemas[event].safeParse(response);
    if (!parsed.success)
      throw new Error(`Respuesta mal formada a ${event}: ${JSON.stringify(response)}`);
    return response as Ack;
  }

  /** Envía el payload tal cual, sin añadir nada. */
  raw(event: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  /** Crea una sala; con `{ role: 'player', name }` la crea un jugador a distancia (sin pantalla). */
  async createRoom(extra: Record<string, unknown> = {}): Promise<string> {
    const r = await this.request('room:create', extra);
    if (!r.ok) throw new Error(`room:create falló: ${r.error}`);
    this.code = r.data['code'] as string;
    this.token = r.data['token'] as string;
    this.playerId = (r.data['playerId'] as string | null | undefined) ?? null;
    return this.code;
  }

  async join(code: string, name: string, extra: Record<string, unknown> = {}): Promise<Ack> {
    const r = await this.request('room:join', { code, role: 'player', name, ...extra });
    if (r.ok) {
      this.code = code;
      this.token = r.data['token'] as string;
      this.playerId = r.data['playerId'] as string | null;
    }
    return r;
  }

  async resume(code: string, token: string): Promise<Ack> {
    const r = await this.request('session:resume', { code, token });
    if (r.ok) {
      this.code = code;
      this.token = token;
      this.playerId = r.data['playerId'] as string | null;
    }
    return r;
  }

  close(): void {
    this.socket.close();
  }
}
