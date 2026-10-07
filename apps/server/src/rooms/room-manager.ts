import { applyAction, createConfig, createGame, err, getPlayerView, ok } from '@hexa/engine';
import type { Action, GameEvent, GameState, PlayerId, Result } from '@hexa/engine';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START, PLAYER_COLORS } from '@hexa/protocol';
import type {
  ClientPayloads,
  PreviewTarget,
  ErrorCode,
  PlayerColor,
  Role,
  RoomState,
  ServerEventName,
  ServerPayloads,
  SessionData,
} from '@hexa/protocol';
import type { Logger } from '../logger.js';
import type { RoomData, RoomStore, SeatData } from '../store/room-store.js';
import { generateRoomCode } from './codes.js';

export type ConnectionId = string;

/** Mensaje que el gestor pide enviar; la capa de red lo entrega al socket correspondiente. */
export type OutMessage = {
  [K in ServerEventName]: {
    readonly to: ConnectionId;
    readonly event: K;
    readonly payload: ServerPayloads[K];
  };
}[ServerEventName];

export interface Success<T> {
  readonly data: T;
  readonly out: OutMessage[];
}
export type ManagerResult<T> = Result<Success<T>, ErrorCode>;

interface Connection {
  readonly id: ConnectionId;
  readonly code: string;
  readonly role: Role;
  readonly playerId: PlayerId | null;
  readonly token: string;
}

export interface RoomManagerDeps {
  readonly store: RoomStore;
  readonly logger: Logger;
  readonly clock: () => number;
  readonly randomInt: (maxExclusive: number) => number;
  readonly token: () => string;
  readonly seed: () => string;
  readonly roomTtlMs: number;
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

/**
 * Lógica de salas independiente de la red: recibe intenciones de conexiones identificadas y
 * devuelve la respuesta más los mensajes a enviar. Las salas viven en memoria y se persisten
 * en el `RoomStore` tras cada cambio.
 */
export class RoomManager {
  private readonly rooms = new Map<string, RoomData>();
  private readonly connections = new Map<ConnectionId, Connection>();
  private readonly byRoom = new Map<string, Set<ConnectionId>>();
  private readonly listeners: ((code: string) => void)[] = [];

  constructor(private readonly deps: RoomManagerDeps) {}

  // ── Ciclo de vida ──────────────────────────────────────────────────────────────────────

  /** Recupera las salas del almacén al arrancar. */
  async hydrate(): Promise<number> {
    const saved = await this.deps.store.loadAll();
    for (const room of saved) this.rooms.set(room.code, room);
    return saved.length;
  }

  /** Avisa de cada cambio en una sala (lo usa el conductor de bots para saber cuándo actuar). */
  onChange(listener: (code: string) => void): void {
    this.listeners.push(listener);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Códigos de todas las salas, para recorrerlas (p. ej. tras recuperarlas del almacén). */
  codes(): string[] {
    return [...this.rooms.keys()];
  }

  getRoom(code: string): RoomData | undefined {
    return this.rooms.get(code);
  }

  connectionCount(code: string): number {
    return this.byRoom.get(code)?.size ?? 0;
  }

  /** Elimina las salas sin conexiones y sin actividad reciente; sus códigos quedan libres. */
  sweep(): string[] {
    const now = this.deps.clock();
    const closed: string[] = [];
    for (const room of this.rooms.values()) {
      const idle = now - room.lastActivity > this.deps.roomTtlMs;
      if (idle && this.connectionCount(room.code) === 0) {
        this.rooms.delete(room.code);
        this.byRoom.delete(room.code);
        this.persistDelete(room.code);
        closed.push(room.code);
        this.deps.logger.info({ event: 'room_expired', code: room.code }, 'sala caducada');
      }
    }
    return closed;
  }

  // ── Salas, roles y sesiones ────────────────────────────────────────────────────────────

  createRoom(conn: ConnectionId): ManagerResult<SessionData> {
    if (this.connections.has(conn)) return err('ALREADY_IN_ROOM');
    const code = generateRoomCode((c) => this.rooms.has(c), this.deps.randomInt);
    if (code === null) {
      this.deps.logger.error({ event: 'room_codes_exhausted' }, 'sin códigos libres');
      return err('SERVER_ERROR');
    }
    const now = this.deps.clock();
    const room: RoomData = {
      code,
      createdAt: now,
      lastActivity: now,
      status: 'lobby',
      hostToken: this.deps.token(),
      seats: [],
      spectatorTokens: [],
      nextPlayerNumber: 0,
      game: null,
    };
    this.rooms.set(code, room);
    this.persist(room);
    this.attach({ id: conn, code, role: 'host', playerId: null, token: room.hostToken });
    this.deps.logger.info({ event: 'room_created', code }, 'sala creada');
    return ok({
      data: { code, token: room.hostToken, role: 'host', playerId: null },
      out: this.broadcastState(room),
    });
  }

  join(conn: ConnectionId, msg: ClientPayloads['room:join']): ManagerResult<SessionData> {
    if (this.connections.has(conn)) return err('ALREADY_IN_ROOM');
    const room = this.rooms.get(msg.code);
    if (!room) return err('ROOM_NOT_FOUND');

    if (msg.role === 'spectator') {
      const token = this.deps.token();
      const next = this.touch(room, { spectatorTokens: [...room.spectatorTokens, token] });
      this.attach({ id: conn, code: next.code, role: 'spectator', playerId: null, token });
      return ok({
        data: { code: next.code, token, role: 'spectator', playerId: null },
        out: [...this.broadcastState(next), ...this.viewFor(next, conn)],
      });
    }

    if (room.status !== 'lobby') return err('GAME_ALREADY_STARTED');
    if (room.seats.length >= MAX_PLAYERS) return err('ROOM_FULL');
    const name = (msg.name ?? '').trim();
    if (room.seats.some((s) => normalizeName(s.name) === normalizeName(name))) {
      return err('NAME_TAKEN');
    }
    const taken = new Set(room.seats.map((s) => s.color));
    let color: PlayerColor | undefined = msg.color;
    if (color !== undefined && taken.has(color)) return err('COLOR_TAKEN');
    color ??= PLAYER_COLORS.find((c) => !taken.has(c));
    if (color === undefined) return err('ROOM_FULL');

    const seat: SeatData = {
      playerId: `p${room.nextPlayerNumber}`,
      name,
      color,
      ready: false,
      bot: false,
      token: this.deps.token(),
    };
    const next = this.touch(room, {
      seats: [...room.seats, seat],
      nextPlayerNumber: room.nextPlayerNumber + 1,
    });
    this.attach({
      id: conn,
      code: next.code,
      role: 'player',
      playerId: seat.playerId,
      token: seat.token,
    });
    this.deps.logger.info(
      { event: 'player_joined', code: next.code, playerId: seat.playerId },
      'jugador unido',
    );
    return ok({
      data: { code: next.code, token: seat.token, role: 'player', playerId: seat.playerId },
      out: this.broadcastState(next),
    });
  }

  /** Recupera un asiento (o el rol de host/espectador) con su token; sustituye a la conexión anterior. */
  resume(conn: ConnectionId, msg: ClientPayloads['session:resume']): ManagerResult<SessionData> {
    if (this.connections.has(conn)) return err('ALREADY_IN_ROOM');
    const room = this.rooms.get(msg.code);
    if (!room) return err('ROOM_NOT_FOUND');

    let role: Role;
    let playerId: PlayerId | null = null;
    if (msg.token === room.hostToken) {
      role = 'host';
    } else {
      const seat = room.seats.find((s) => s.token === msg.token);
      if (seat) {
        role = 'player';
        playerId = seat.playerId;
      } else if (room.spectatorTokens.includes(msg.token)) {
        role = 'spectator';
      } else {
        return err('INVALID_SESSION');
      }
    }

    // Si la identidad ya estaba conectada (p. ej. un móvil que reconecta antes de que caduque el
    // socket anterior), la conexión nueva toma el relevo.
    const out: OutMessage[] = [];
    for (const id of [...(this.byRoom.get(room.code) ?? [])]) {
      if (this.connections.get(id)?.token === msg.token) {
        this.detach(id);
        out.push({ to: id, event: 'error', payload: { error: 'SESSION_REPLACED' } });
      }
    }

    const next = this.touch(room, {});
    this.attach({ id: conn, code: next.code, role, playerId, token: msg.token });
    this.deps.logger.info(
      { event: 'session_resumed', code: next.code, role, playerId },
      'sesión recuperada',
    );
    return ok({
      data: { code: next.code, token: msg.token, role, playerId },
      out: [...out, ...this.broadcastState(next), ...this.viewFor(next, conn)],
    });
  }

  leave(conn: ConnectionId): ManagerResult<Record<string, never>> {
    const c = this.connections.get(conn);
    const room = c ? this.rooms.get(c.code) : undefined;
    if (!c || !room) return err('NOT_IN_ROOM');

    this.detach(conn);
    // En el lobby, un jugador que se va libera su asiento; en partida lo conserva (puede volver).
    let patch: Partial<RoomData> = {};
    if (c.role === 'player' && room.status === 'lobby') {
      patch = { seats: room.seats.filter((s) => s.playerId !== c.playerId) };
    } else if (c.role === 'spectator') {
      patch = { spectatorTokens: room.spectatorTokens.filter((t) => t !== c.token) };
    }
    const next = this.touch(room, patch);
    return ok({ data: {}, out: this.broadcastState(next) });
  }

  /** Un corte de conexión conserva el asiento: el jugador puede volver con su token. */
  disconnect(conn: ConnectionId): OutMessage[] {
    const c = this.connections.get(conn);
    if (!c) return [];
    this.detach(conn);
    const room = this.rooms.get(c.code);
    return room ? this.broadcastState(room) : [];
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────────────────

  updateLobby(
    conn: ConnectionId,
    msg: ClientPayloads['lobby:update'],
  ): ManagerResult<Record<string, never>> {
    const found = this.require(conn);
    if (!found.ok) return found;
    const { room, c } = found.value;
    if (c.role !== 'player') return err('NOT_A_PLAYER');
    if (room.status !== 'lobby') return err('GAME_ALREADY_STARTED');

    const name = msg.name?.trim();
    if (
      name !== undefined &&
      room.seats.some(
        (s) => s.playerId !== c.playerId && normalizeName(s.name) === normalizeName(name),
      )
    ) {
      return err('NAME_TAKEN');
    }
    if (
      msg.color !== undefined &&
      room.seats.some((s) => s.playerId !== c.playerId && s.color === msg.color)
    ) {
      return err('COLOR_TAKEN');
    }
    const seats = room.seats.map((s) =>
      s.playerId === c.playerId
        ? {
            ...s,
            name: name ?? s.name,
            color: msg.color ?? s.color,
            ready: msg.ready ?? s.ready,
          }
        : s,
    );
    const next = this.touch(room, { seats });
    return ok({ data: {}, out: this.broadcastState(next) });
  }

  start(conn: ConnectionId): ManagerResult<Record<string, never>> {
    const found = this.require(conn);
    if (!found.ok) return found;
    const { room, c } = found.value;
    if (c.role !== 'host') return err('NOT_HOST');
    if (room.status !== 'lobby') return err('GAME_ALREADY_STARTED');
    if (room.seats.length < MIN_PLAYERS_TO_START) return err('NOT_ENOUGH_PLAYERS');
    if (!room.seats.every((s) => s.ready)) return err('PLAYERS_NOT_READY');

    const seed = this.deps.seed();
    const config = createConfig(room.seats.map((s) => s.playerId));
    const snapshot = createGame(config, seed);
    const next = this.touch(room, {
      status: 'playing',
      game: { seed, config, actions: [], snapshot },
    });
    this.deps.logger.info(
      { event: 'game_started', code: next.code, players: next.seats.length },
      'partida iniciada',
    );
    return ok({ data: {}, out: [...this.broadcastState(next), ...this.broadcastViews(next)] });
  }

  /** El host añade un bot al lobby: un asiento controlado por el servidor, siempre listo. */
  addBot(conn: ConnectionId): ManagerResult<Record<string, never>> {
    const found = this.require(conn);
    if (!found.ok) return found;
    const { room, c } = found.value;
    if (c.role !== 'host') return err('NOT_HOST');
    if (room.status !== 'lobby') return err('GAME_ALREADY_STARTED');
    if (room.seats.length >= MAX_PLAYERS) return err('ROOM_FULL');

    const names = new Set(room.seats.map((s) => normalizeName(s.name)));
    let n = 1;
    while (names.has(normalizeName(`Bot ${n}`))) n++;
    const color = PLAYER_COLORS.find((x) => !room.seats.some((s) => s.color === x));
    if (color === undefined) return err('ROOM_FULL');
    const seat: SeatData = {
      playerId: `p${room.nextPlayerNumber}`,
      name: `Bot ${n}`,
      color,
      ready: true,
      bot: true,
      token: this.deps.token(),
    };
    const next = this.touch(room, {
      seats: [...room.seats, seat],
      nextPlayerNumber: room.nextPlayerNumber + 1,
    });
    return ok({ data: {}, out: this.broadcastState(next) });
  }

  removeBot(conn: ConnectionId, playerId: PlayerId): ManagerResult<Record<string, never>> {
    const found = this.require(conn);
    if (!found.ok) return found;
    const { room, c } = found.value;
    if (c.role !== 'host') return err('NOT_HOST');
    if (room.status !== 'lobby') return err('GAME_ALREADY_STARTED');
    const seat = room.seats.find((s) => s.playerId === playerId);
    if (!seat?.bot) return err('NOT_A_BOT');
    const next = this.touch(room, { seats: room.seats.filter((s) => s.playerId !== playerId) });
    return ok({ data: {}, out: this.broadcastState(next) });
  }

  // ── Partida ────────────────────────────────────────────────────────────────────────────

  /** El jugador se toma siempre de la conexión, nunca del mensaje: nadie actúa por otro. */
  action(conn: ConnectionId, action: Action): ManagerResult<Record<string, never>> {
    const found = this.require(conn);
    if (!found.ok) return found;
    const { room, c } = found.value;
    if (c.role !== 'player' || c.playerId === null) return err('NOT_A_PLAYER');
    return this.applyFor(room, c.playerId, action);
  }

  /**
   * Enseña a los demás lo que el jugador de turno está a punto de elegir (no cambia el juego ni
   * se guarda). Solo lo puede enviar quien tiene el turno.
   */
  preview(conn: ConnectionId, target: PreviewTarget | null): ManagerResult<Record<string, never>> {
    const found = this.require(conn);
    if (!found.ok) return found;
    const { room, c } = found.value;
    if (c.role !== 'player' || c.playerId === null) return err('NOT_A_PLAYER');
    if (!room.game) return err('GAME_NOT_STARTED');
    if (room.game.snapshot.turn.player !== c.playerId) return err('NOT_YOUR_TURN');
    const playerId = c.playerId;
    const out: OutMessage[] = this.connectionsOf(room.code)
      .filter((x) => x.id !== conn)
      .map((x) => ({ to: x.id, event: 'game:preview' as const, payload: { playerId, target } }));
    return ok({ data: {}, out });
  }

  /**
   * Cancela por tiempo la oferta de comercio abierta, en nombre de su oferente. Es una acción
   * normal del juego (queda en el registro), no un estado especial.
   */
  expireTrade(code: string, offerId: number): ManagerResult<Record<string, never>> {
    const room = this.rooms.get(code);
    const offer = room?.game?.snapshot.pendingTrade;
    if (!room || !offer || offer.id !== offerId) return err('NO_SUCH_OFFER');
    return this.applyFor(room, offer.from, { type: 'CANCEL_TRADE', offerId });
  }

  /** Acción de un bot del servidor: solo vale para asientos marcados como bot. */
  botAction(
    code: string,
    playerId: PlayerId,
    action: Action,
  ): ManagerResult<Record<string, never>> {
    const room = this.rooms.get(code);
    if (!room) return err('ROOM_NOT_FOUND');
    if (!room.seats.some((s) => s.playerId === playerId && s.bot)) return err('NOT_A_BOT');
    return this.applyFor(room, playerId, action);
  }

  private applyFor(
    room: RoomData,
    playerId: PlayerId,
    action: Action,
  ): ManagerResult<Record<string, never>> {
    if (!room.game) return err('GAME_NOT_STARTED');
    const result = applyAction(room.game.snapshot, playerId, action);
    if (!result.ok) {
      this.deps.logger.debug({
        event: 'action_rejected',
        code: room.code,
        playerId,
        type: action.type,
        error: result.error,
      });
      return err(result.error);
    }
    const state: GameState = result.value.state;
    const entry = state.log[state.log.length - 1];
    if (!entry) throw new Error('unreachable: la acción aplicada no quedó registrada');
    const next = this.touch(room, {
      status: state.phase.type === 'ended' ? 'ended' : 'playing',
      game: {
        ...room.game,
        actions: [...room.game.actions, entry],
        snapshot: state,
      },
    });
    if (next.status === 'ended') {
      this.deps.logger.info(
        { event: 'game_ended', code: next.code, winner: state.winner },
        'partida terminada',
      );
    }
    return ok({
      data: {},
      out: [
        ...this.broadcastEvents(next, result.value.events),
        ...this.broadcastViews(next),
        ...(next.status === 'ended' ? this.broadcastState(next) : []),
      ],
    });
  }

  // ── Internos ───────────────────────────────────────────────────────────────────────────

  private require(conn: ConnectionId): Result<{ room: RoomData; c: Connection }, ErrorCode> {
    const c = this.connections.get(conn);
    const room = c ? this.rooms.get(c.code) : undefined;
    if (!c || !room) return err('NOT_IN_ROOM');
    return ok({ room, c });
  }

  private attach(c: Connection): void {
    this.connections.set(c.id, c);
    let set = this.byRoom.get(c.code);
    if (!set) this.byRoom.set(c.code, (set = new Set()));
    set.add(c.id);
  }

  private detach(id: ConnectionId): void {
    const c = this.connections.get(id);
    if (!c) return;
    this.connections.delete(id);
    this.byRoom.get(c.code)?.delete(id);
  }

  /** Aplica un cambio a la sala, anota la actividad y persiste. */
  private touch(room: RoomData, patch: Partial<RoomData>): RoomData {
    const next: RoomData = { ...room, ...patch, lastActivity: this.deps.clock() };
    this.rooms.set(next.code, next);
    this.persist(next);
    for (const listener of this.listeners) listener(next.code);
    return next;
  }

  private persist(room: RoomData): void {
    this.deps.store.save(room).catch((error: unknown) => {
      this.deps.logger.error(
        { event: 'persist_failed', code: room.code, error: String(error) },
        'no se pudo guardar la sala',
      );
    });
  }

  private persistDelete(code: string): void {
    this.deps.store.delete(code).catch((error: unknown) => {
      this.deps.logger.error(
        { event: 'persist_failed', code, error: String(error) },
        'no se pudo borrar la sala',
      );
    });
  }

  private connectionsOf(code: string): Connection[] {
    return [...(this.byRoom.get(code) ?? [])].flatMap((id) => {
      const c = this.connections.get(id);
      return c ? [c] : [];
    });
  }

  private roomStateFor(room: RoomData, c: Connection): RoomState {
    const live = this.connectionsOf(room.code);
    return {
      code: room.code,
      status: room.status,
      hostConnected: live.some((x) => x.role === 'host'),
      seats: room.seats.map((s) => ({
        playerId: s.playerId,
        name: s.name,
        color: s.color,
        ready: s.ready,
        connected: s.bot || live.some((x) => x.playerId === s.playerId),
        bot: s.bot,
      })),
      spectators: live.filter((x) => x.role === 'spectator').length,
      you: { role: c.role, playerId: c.playerId },
    };
  }

  private broadcastState(room: RoomData): OutMessage[] {
    return this.connectionsOf(room.code).map((c) => ({
      to: c.id,
      event: 'room:state' as const,
      payload: this.roomStateFor(room, c),
    }));
  }

  private viewFor(room: RoomData, conn: ConnectionId): OutMessage[] {
    const c = this.connections.get(conn);
    if (!c || !room.game) return [];
    const state = room.game.snapshot;
    const viewer =
      c.role === 'player' && c.playerId !== null
        ? c.playerId
        : c.role === 'host'
          ? 'host'
          : 'spectator';
    return [
      {
        to: conn,
        event: 'game:view',
        payload: { seq: state.log.length, view: getPlayerView(state, viewer) },
      },
    ];
  }

  private broadcastViews(room: RoomData): OutMessage[] {
    return this.connectionsOf(room.code).flatMap((c) => this.viewFor(room, c.id));
  }

  private broadcastEvents(room: RoomData, events: readonly GameEvent[]): OutMessage[] {
    const seq = room.game?.snapshot.log.length ?? 0;
    return this.connectionsOf(room.code).map((c) => ({
      to: c.id,
      event: 'game:events' as const,
      payload: { seq, events: [...events] },
    }));
  }
}
