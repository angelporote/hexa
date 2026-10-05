import { err, ok } from '../result.js';
import type { Result } from '../result.js';
import { shuffle } from '../rng/rng.js';
import type { RngState } from '../rng/rng.js';
import { hexId, hexNeighbor } from './hex.js';
import type { HexId } from './hex.js';
import type { MapTemplate } from './map-template.js';
import { buildTopology } from './topology.js';
import type { Board, BoardHex, Port, TerrainId } from './types.js';
import { RESOURCE_IDS } from './types.js';

export interface GenerateOptions {
  /** Impide que dos fichas de máxima probabilidad (6 y 8) queden en hexágonos contiguos. */
  readonly avoidAdjacentHotNumbers: boolean;
}

export type GenerateError = 'NO_VALID_LAYOUT';

const HOT_NUMBERS: ReadonlySet<number> = new Set([6, 8]);
const MAX_ATTEMPTS = 1000;

/**
 * Genera un tablero a partir de una plantilla. Es determinista: la misma plantilla, estado de
 * RNG y opciones producen el mismo tablero. Devuelve también el RNG avanzado.
 */
export function generateBoard(
  template: MapTemplate,
  rng: RngState,
  options: GenerateOptions = { avoidAdjacentHotNumbers: true },
): Result<{ board: Board; rng: RngState }, GenerateError> {
  const topology = buildTopology(template.hexes);
  let state = rng;

  const terrainPool: TerrainId[] = [];
  for (const id of RESOURCE_IDS) {
    for (let i = 0; i < template.terrains[id]; i++) terrainPool.push(id);
  }
  for (let i = 0; i < template.terrains.none; i++) terrainPool.push('none');
  const shuffledTerrain = shuffle(state, terrainPool);
  state = shuffledTerrain.rng;

  const hexIds = topology.hexes.map((h) => h.id);
  const terrainOf = new Map<HexId, TerrainId>();
  hexIds.forEach((id, i) => terrainOf.set(id, shuffledTerrain.value[i] ?? 'none'));
  const producing = hexIds.filter((id) => terrainOf.get(id) !== 'none');

  const neighborsOf = new Map<HexId, HexId[]>();
  for (const h of topology.hexes) {
    const list: HexId[] = [];
    for (let d = 0; d < 6; d++) {
      const n = hexId(hexNeighbor(h, d));
      if (topology.hexById[n]) list.push(n);
    }
    neighborsOf.set(h.id, list);
  }

  let numberOf: Map<HexId, number> | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !numberOf; attempt++) {
    const shuffled = shuffle(state, template.numbers);
    state = shuffled.rng;
    const candidate = new Map<HexId, number>();
    producing.forEach((id, i) => {
      const n = shuffled.value[i];
      if (n !== undefined) candidate.set(id, n);
    });
    const clash =
      options.avoidAdjacentHotNumbers &&
      producing.some((id) => {
        const n = candidate.get(id);
        if (n === undefined || !HOT_NUMBERS.has(n)) return false;
        return (neighborsOf.get(id) ?? []).some((o) => {
          const m = candidate.get(o);
          return m !== undefined && HOT_NUMBERS.has(m);
        });
      });
    if (!clash) numberOf = candidate;
  }
  if (!numberOf) return err('NO_VALID_LAYOUT');

  const shuffledPorts = shuffle(state, template.portKinds);
  state = shuffledPorts.rng;
  const ports: Port[] = template.ports.map((slot, i) => {
    const hex = topology.hexById[hexId(slot)];
    const edgeId = hex?.edges[slot.dir];
    const edge = edgeId === undefined ? undefined : topology.edgeById[edgeId];
    const kind = shuffledPorts.value[i];
    if (!edge || edgeId === undefined || kind === undefined) {
      throw new Error('Plantilla incoherente: debería haberse validado con parseMapTemplate');
    }
    return { kind, edge: edgeId, vertices: edge.vertices };
  });

  const hexes: Record<HexId, BoardHex> = {};
  for (const id of hexIds) {
    hexes[id] = { terrain: terrainOf.get(id) ?? 'none', number: numberOf.get(id) ?? null };
  }

  return ok({ board: { mapId: template.id, topology, hexes, ports }, rng: state });
}
