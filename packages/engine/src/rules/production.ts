import { RESOURCE_IDS } from '../board/types.js';
import type { ResourceId } from '../board/types.js';
import { emptyCounts } from '../state/resources.js';
import type { ResourceCounts } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';

export interface Production {
  /** Lo que recibe cada jugador (solo los que reciben algo). */
  readonly gains: Readonly<Record<PlayerId, ResourceCounts>>;
  /** Recursos que el banco no pudo repartir por falta de existencias. */
  readonly shortages: readonly ResourceId[];
}

/**
 * Producción de una tirada: cada poblado produce 1 y cada ciudad 2 del recurso de los
 * hexágonos adyacentes con esa ficha (salvo el ocupado por el ladrón).
 *
 * Escasez: si el banco no cubre la demanda de un recurso, se reparte lo que queda solo cuando
 * un único jugador lo reclama; si lo reclaman varios, nadie lo recibe.
 */
export function computeProduction(state: GameState, total: number): Production {
  const demand: Record<ResourceId, Record<PlayerId, number>> = {
    r1: {},
    r2: {},
    r3: {},
    r4: {},
    r5: {},
  };

  for (const hex of state.board.topology.hexes) {
    const tile = state.board.hexes[hex.id];
    if (!tile || tile.number !== total || tile.terrain === 'none' || state.robber === hex.id) {
      continue;
    }
    for (const vertexId of hex.vertices) {
      const building = state.buildings[vertexId];
      if (!building) continue;
      const amount = building.kind === 'city' ? 2 : 1;
      const byPlayer = demand[tile.terrain];
      byPlayer[building.owner] = (byPlayer[building.owner] ?? 0) + amount;
    }
  }

  const gains: Record<PlayerId, Record<ResourceId, number>> = {};
  const shortages: ResourceId[] = [];
  for (const resource of RESOURCE_IDS) {
    const entries = Object.entries(demand[resource]);
    const requested = entries.reduce((sum, [, n]) => sum + n, 0);
    if (requested === 0) continue;

    const available = state.bank[resource];
    let grants = entries;
    if (requested > available) {
      shortages.push(resource);
      const [only] = entries;
      grants = entries.length === 1 && only ? [[only[0], available]] : [];
    }
    for (const [player, amount] of grants) {
      if (amount <= 0) continue;
      const hand = (gains[player] ??= emptyCounts());
      hand[resource] += amount;
    }
  }
  return { gains, shortages };
}
