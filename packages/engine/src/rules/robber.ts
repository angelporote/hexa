import type { HexId } from '../board/hex.js';
import { totalCards } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer } from '../state/update.js';

/** Jugadores a quienes `mover` puede robar si el ladrón se coloca en `hex`. */
export function robberVictims(state: GameState, hex: HexId, mover: PlayerId): PlayerId[] {
  const node = state.board.topology.hexById[hex];
  if (!node) return [];
  const victims = new Set<PlayerId>();
  for (const vertex of node.vertices) {
    const building = state.buildings[vertex];
    if (!building || building.owner === mover) continue;
    if (totalCards(getPlayer(state, building.owner).hand) > 0) victims.add(building.owner);
  }
  return [...victims];
}

/** Hexágonos donde se puede colocar el ladrón: cualquiera salvo donde ya está. */
export function robberTargets(state: GameState): HexId[] {
  return state.board.topology.hexes.map((h) => h.id).filter((id) => id !== state.robber);
}
