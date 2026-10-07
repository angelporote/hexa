// Solo para tests: una sala en mitad de partida con las manos y las ofertas que haga falta.
import { applyAction, createConfig, createGame } from '@hexa/engine';
import type { Action, GameState, ResourceCounts } from '@hexa/engine';
import { MemoryRoomStore } from '../store/room-store.js';
import type { RoomData, SeatData } from '../store/room-store.js';

export const none: ResourceCounts = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

export interface TradeRoom {
  readonly room: RoomData;
  readonly state: GameState;
  /** Token de cada asiento (`p0`…) y del host, para reconectar con `session:resume`. */
  readonly tokens: Record<string, string>;
}

/**
 * Partida de 4 jugadores en la fase principal del turno de `p0`, con las manos indicadas. Los
 * recursos se sacan del banco para que se cumplan las invariantes de conservación.
 */
export function tradeRoom(
  hands: Record<string, Partial<ResourceCounts>>,
  after: { player: string; action: Action }[] = [],
): TradeRoom {
  const ids = ['p0', 'p1', 'p2', 'p3'];
  let state = createGame(createConfig(ids), 'trade-room-seed');
  const bank = { ...state.bank };
  state = {
    ...state,
    phase: { type: 'main' },
    turn: { player: 'p0', number: 3, lastRoll: null, devCardPlayed: false },
    players: state.players.map((p) => {
      const hand = { ...none, ...hands[p.id] };
      for (const r of Object.keys(hand) as (keyof ResourceCounts)[]) bank[r] -= hand[r];
      return { ...p, hand };
    }),
  };
  state = { ...state, bank };
  for (const { player, action } of after) {
    const result = applyAction(state, player, action);
    if (!result.ok) throw new Error(`${action.type} de ${player} falló: ${result.error}`);
    state = result.value.state;
  }

  const tokens: Record<string, string> = { host: 'host-token-'.padEnd(24, 'h') };
  const seats: SeatData[] = ids.map((id, i) => {
    tokens[id] = `${id}-token-`.padEnd(24, String(i));
    return {
      playerId: id,
      name: `Jugador ${i}`,
      color: (['c1', 'c2', 'c3', 'c4'] as const)[i] ?? 'c1',
      ready: true,
      bot: false,
      auto: false,
      token: tokens[id] ?? '',
    };
  });
  const room: RoomData = {
    code: 'TRDE',
    createdAt: 1,
    lastActivity: 1,
    status: 'playing',
    hostToken: tokens['host'] ?? '',
    hostless: false,
    ownerId: null,
    turnTimerSeconds: null,
    seats,
    spectatorTokens: [],
    nextPlayerNumber: 4,
    game: { seed: 'trade-room-seed', config: state.config, actions: [], snapshot: state },
  };
  return { room, state, tokens };
}

/** Almacén ya cargado con la sala, listo para que un servidor la recupere con `hydrate`. */
export async function storeWith(room: RoomData): Promise<MemoryRoomStore> {
  const store = new MemoryRoomStore();
  await store.save(room);
  return store;
}
