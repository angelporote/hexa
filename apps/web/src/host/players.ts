import type { PlayerView } from '@hexa/engine';
import type { RoomState, Seat } from '@hexa/protocol';

export interface PlayerInfo {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly bot: boolean;
  /** Sustituido por un bot por no haber movido a tiempo. */
  readonly auto: boolean;
  readonly connected: boolean;
}

/** Datos de presentación de cada jugador (nombre, color…), indexados por id. */
export function playerInfos(
  room: RoomState | null,
  view: PlayerView | null,
): Map<string, PlayerInfo> {
  const map = new Map<string, PlayerInfo>();
  const seats: readonly Seat[] = room?.seats ?? [];
  for (const seat of seats) {
    map.set(seat.playerId, {
      id: seat.playerId,
      name: seat.name,
      color: seat.color,
      bot: seat.bot,
      auto: seat.auto,
      connected: seat.connected,
    });
  }
  // Si aún no hay datos de sala, al menos se puede mostrar a los jugadores de la vista.
  for (const p of view?.players ?? []) {
    if (!map.has(p.id)) {
      map.set(p.id, {
        id: p.id,
        name: p.id,
        color: 'c1',
        bot: false,
        auto: false,
        connected: true,
      });
    }
  }
  return map;
}

export function nameOf(infos: ReadonlyMap<string, PlayerInfo>, id: string): string {
  return infos.get(id)?.name ?? id;
}

export function colorOf(infos: ReadonlyMap<string, PlayerInfo>, id: string): string {
  return infos.get(id)?.color ?? 'c1';
}
