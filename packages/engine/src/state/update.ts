import { emptyCounts } from './resources.js';
import type { ResourceCounts } from './resources.js';
import type { GameState, PlayerId, PlayerState } from './types.js';
import { RESOURCE_IDS } from '../board/types.js';

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`Jugador desconocido: ${id}`);
  return p;
}

export function mapPlayer(
  state: GameState,
  id: PlayerId,
  fn: (p: PlayerState) => PlayerState,
): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? fn(p) : p)) };
}

/** Pasa `counts` del banco a la mano del jugador. El llamador garantiza que el banco cubre. */
export function giveFromBank(state: GameState, id: PlayerId, counts: ResourceCounts): GameState {
  const bank = emptyCounts();
  for (const r of RESOURCE_IDS) bank[r] = state.bank[r] - counts[r];
  const next = mapPlayer(state, id, (p) => {
    const hand = emptyCounts();
    for (const r of RESOURCE_IDS) hand[r] = p.hand[r] + counts[r];
    return { ...p, hand };
  });
  return { ...next, bank };
}

/** Índice de asiento que coloca en el paso `index` de la colocación inicial (ida y vuelta). */
export function setupSeat(playerCount: number, index: number): number {
  return index < playerCount ? index : 2 * playerCount - 1 - index;
}

/** El jugador paga `cost` al banco. El llamador garantiza que la mano lo cubre. */
export function payToBank(state: GameState, id: PlayerId, cost: ResourceCounts): GameState {
  const bank = emptyCounts();
  for (const r of RESOURCE_IDS) bank[r] = state.bank[r] + cost[r];
  const next = mapPlayer(state, id, (p) => {
    const hand = emptyCounts();
    for (const r of RESOURCE_IDS) hand[r] = p.hand[r] - cost[r];
    return { ...p, hand };
  });
  return { ...next, bank };
}
