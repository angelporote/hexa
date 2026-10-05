import { PROTOCOL_VERSION, ackSchemas, serverMessageSchemas } from '@hexa/protocol';
import type {
  AckFor,
  ClientEventName,
  RoomState,
  ServerEventName,
  SessionData,
} from '@hexa/protocol';
import type { GameEvent, PlayerView } from '@hexa/engine';
import type { SessionStore } from './session-store.js';
import type { Transport } from './transport.js';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface LoggedEvent {
  readonly id: number;
  readonly seq: number;
  readonly event: GameEvent;
}

export interface ConnectionSnapshot {
  readonly status: ConnectionStatus;
  /** Se está intentando recuperar la sesión guardada (tras conectar o reconectar). */
  readonly resuming: boolean;
  readonly session: SessionData | null;
  readonly room: RoomState | null;
  readonly view: PlayerView | null;
  readonly seq: number;
  readonly events: readonly LoggedEvent[];
  /** Última tirada de dados; `key` cambia con cada una para poder reanimarla. */
  readonly diceRoll: { readonly dice: readonly [number, number]; readonly key: number } | null;
  /** Otro dispositivo ha tomado esta sesión. */
  readonly replaced: boolean;
  /** La sesión guardada ya no sirve (sala caducada o token inválido). */
  readonly resumeFailed: boolean;
}

const INITIAL: ConnectionSnapshot = {
  status: 'idle',
  resuming: false,
  session: null,
  room: null,
  view: null,
  seq: -1,
  events: [],
  diceRoll: null,
  replaced: false,
  resumeFailed: false,
};

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_LOGGED_EVENTS = 300;
/** Si el servidor no reconoce la sesión por estos motivos, no tiene sentido volver a intentarlo. */
const DEAD_SESSION_ERRORS = new Set(['INVALID_SESSION', 'ROOM_NOT_FOUND']);

export type Ack<K extends ClientEventName> = AckFor<K> | { ok: false; error: string };

/**
 * Conexión con el servidor: mantiene la sesión, reconecta y expone un estado inmutable para
 * `useSyncExternalStore`. Todo lo que llega del servidor se valida antes de usarse.
 */
export class GameConnection {
  private snapshot: ConnectionSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private sessionKey = 'default';
  private eventCounter = 0;
  private started = false;

  constructor(
    private readonly transport: Transport,
    private readonly store: SessionStore,
  ) {
    transport.onConnect(() => {
      this.update({ status: 'connected' });
      void this.resume();
    });
    transport.onDisconnect(() => {
      if (!this.snapshot.replaced) this.update({ status: 'reconnecting', resuming: false });
    });
    transport.onServerEvent('room:state', (p) => this.onRoomState(p));
    transport.onServerEvent('game:view', (p) => this.onView(p));
    transport.onServerEvent('game:events', (p) => this.onEvents(p));
    transport.onServerEvent('error', (p) => this.onError(p));
  }

  // ── Estado observable ──────────────────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  private update(patch: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────────────────

  /** Abre la conexión. `sessionKey` distingue la sesión guardada de la pantalla y la del móvil. */
  start(sessionKey: string): void {
    this.sessionKey = sessionKey;
    if (this.started) return;
    this.started = true;
    this.update({ status: 'connecting' });
    this.transport.connect();
  }

  stop(): void {
    this.started = false;
    this.transport.close();
    this.snapshot = INITIAL;
    for (const listener of this.listeners) listener();
  }

  /** Sesión guardada para esta clave, sin conectar. */
  storedSession(): SessionData | null {
    return this.store.get(this.sessionKey);
  }

  private async resume(): Promise<void> {
    const stored = this.store.get(this.sessionKey);
    if (!stored) {
      this.update({ resuming: false });
      return;
    }
    this.update({ resuming: true });
    const ack = await this.request('session:resume', { code: stored.code, token: stored.token });
    if (ack.ok) {
      this.adopt(ack.data);
      this.update({ resuming: false, resumeFailed: false });
    } else if (DEAD_SESSION_ERRORS.has(ack.error)) {
      this.store.remove(this.sessionKey);
      this.update({ resuming: false, session: null, resumeFailed: true });
    } else {
      // Un fallo transitorio (p. ej. tiempo agotado) no invalida el token guardado.
      this.update({ resuming: false });
    }
  }

  private adopt(session: SessionData): void {
    this.store.set(this.sessionKey, session);
    this.update({ session });
  }

  // ── Peticiones ─────────────────────────────────────────────────────────────────────────

  /** Envía un mensaje con la versión del protocolo y devuelve su respuesta validada. */
  async request<K extends ClientEventName>(
    event: K,
    payload: Record<string, unknown> = {},
  ): Promise<Ack<K>> {
    let response: unknown;
    try {
      response = await this.transport.request(
        event,
        { protocolVersion: PROTOCOL_VERSION, ...payload },
        REQUEST_TIMEOUT_MS,
      );
    } catch {
      return { ok: false, error: 'TIMEOUT' };
    }
    const parsed = ackSchemas[event].safeParse(response);
    if (!parsed.success) return { ok: false, error: 'INVALID_MESSAGE' };
    return parsed.data as Ack<K>;
  }

  async createRoom(): Promise<Ack<'room:create'>> {
    const ack = await this.request('room:create');
    if (ack.ok) this.adopt(ack.data);
    return ack;
  }

  async join(code: string, name: string, color?: string): Promise<Ack<'room:join'>> {
    const ack = await this.request('room:join', {
      code,
      role: 'player',
      name,
      ...(color ? { color } : {}),
    });
    if (ack.ok) this.adopt(ack.data);
    return ack;
  }

  /** Abandona la sala y olvida la sesión guardada. */
  async leave(): Promise<void> {
    await this.request('room:leave');
    this.store.remove(this.sessionKey);
    this.update({ session: null, room: null, view: null, seq: -1, events: [], diceRoll: null });
  }

  // ── Mensajes del servidor ──────────────────────────────────────────────────────────────

  private reject(event: ServerEventName, issue: unknown): void {
    console.warn(`Mensaje descartado (${event}):`, issue);
  }

  private onRoomState(payload: unknown): void {
    const parsed = serverMessageSchemas['room:state'].safeParse(payload);
    if (!parsed.success) return this.reject('room:state', parsed.error.issues[0]);
    this.update({ room: parsed.data });
  }

  private onView(payload: unknown): void {
    const parsed = serverMessageSchemas['game:view'].safeParse(payload);
    if (!parsed.success) return this.reject('game:view', parsed.error.issues[0]);
    // Una vista más antigua que la que ya tenemos llega fuera de orden: se ignora.
    if (parsed.data.seq < this.snapshot.seq) return;
    this.update({ view: parsed.data.view, seq: parsed.data.seq });
  }

  private onEvents(payload: unknown): void {
    const parsed = serverMessageSchemas['game:events'].safeParse(payload);
    if (!parsed.success) return this.reject('game:events', parsed.error.issues[0]);
    const { seq, events } = parsed.data;
    const logged = events.map((event): LoggedEvent => ({ id: ++this.eventCounter, seq, event }));
    let diceRoll = this.snapshot.diceRoll;
    for (const entry of logged) {
      if (entry.event.type === 'DICE_ROLLED') diceRoll = { dice: entry.event.dice, key: entry.id };
    }
    this.update({
      events: [...this.snapshot.events, ...logged].slice(-MAX_LOGGED_EVENTS),
      diceRoll,
    });
  }

  private onError(payload: unknown): void {
    const parsed = serverMessageSchemas.error.safeParse(payload);
    if (!parsed.success) return this.reject('error', parsed.error.issues[0]);
    if (parsed.data.error === 'SESSION_REPLACED') {
      // Otro dispositivo tomó el relevo: dejamos de reconectar para no pelearnos con él.
      this.update({ replaced: true, status: 'offline', resuming: false });
      this.transport.close();
    }
  }
}
