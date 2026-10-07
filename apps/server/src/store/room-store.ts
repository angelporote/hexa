import type { GameConfig, GameState, LogEntry, PlayerId } from '@hexa/engine';
import type { PlayerColor } from '@hexa/protocol';

export interface SeatData {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly color: PlayerColor;
  readonly ready: boolean;
  /** Asiento controlado por el servidor (siempre «conectado» y listo). */
  readonly bot: boolean;
  /** Token secreto del asiento: permite recuperar el asiento al reconectar. */
  readonly token: string;
}

/** Semilla + configuración + acciones bastan para reconstruir la partida; `snapshot` evita reaplicarlas. */
export interface GameRecord {
  readonly seed: string;
  readonly config: GameConfig;
  readonly actions: readonly LogEntry[];
  readonly snapshot: GameState;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended';

/** Datos persistentes de una sala: JSON puro, sin sockets. */
export interface RoomData {
  readonly code: string;
  readonly createdAt: number;
  readonly lastActivity: number;
  readonly status: RoomStatus;
  readonly hostToken: string;
  /** Sala creada por un jugador a distancia: no tiene pantalla principal. */
  readonly hostless: boolean;
  /** Jugador que administra una sala sin pantalla principal (`null` si no aplica). */
  readonly ownerId: PlayerId | null;
  readonly seats: readonly SeatData[];
  readonly spectatorTokens: readonly string[];
  readonly nextPlayerNumber: number;
  readonly game: GameRecord | null;
}

/**
 * Almacén de salas. El gestor mantiene las salas en memoria y escribe aquí tras cada cambio;
 * al arrancar las recupera con `loadAll`. La implementación en memoria es la de desarrollo;
 * en la fase 7 se sustituirá por Redis sin tocar el gestor.
 */
export interface RoomStore {
  save(room: RoomData): Promise<void>;
  delete(code: string): Promise<void>;
  loadAll(): Promise<RoomData[]>;
}

export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomData>();

  save(room: RoomData): Promise<void> {
    this.rooms.set(room.code, room);
    return Promise.resolve();
  }

  delete(code: string): Promise<void> {
    this.rooms.delete(code);
    return Promise.resolve();
  }

  loadAll(): Promise<RoomData[]> {
    return Promise.resolve([...this.rooms.values()]);
  }
}
