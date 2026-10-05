import type { HexId } from './hex.js';
import type { EdgeId, Topology, VertexId } from './topology.js';

// Identificadores neutros; sus nombres visibles viven en `packages/theme`.
export const RESOURCE_IDS = ['r1', 'r2', 'r3', 'r4', 'r5'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

/** Un terreno produce el recurso de igual id, o nada (`none`). */
export type TerrainId = ResourceId | 'none';

/** Puerto general (`any`) o específico de un recurso. */
export type PortKind = ResourceId | 'any';

export interface BoardHex {
  readonly terrain: TerrainId;
  /** Ficha numérica (2–12, sin el 7); `null` en terrenos que no producen. */
  readonly number: number | null;
}

export interface Port {
  readonly kind: PortKind;
  readonly edge: EdgeId;
  /** Vértices de la arista del puerto: quien construya en ellos obtiene el puerto. */
  readonly vertices: readonly [VertexId, VertexId];
}

export interface Board {
  readonly mapId: string;
  readonly topology: Topology;
  readonly hexes: Readonly<Record<HexId, BoardHex>>;
  readonly ports: readonly Port[];
}
