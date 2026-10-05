import type { EdgeId, VertexId } from '../board/topology.js';
import type { GameState, PlayerId } from '../state/types.js';

export function vertexExists(state: GameState, vertex: VertexId): boolean {
  return state.board.topology.vertexById[vertex] !== undefined;
}

export function edgeExists(state: GameState, edge: EdgeId): boolean {
  return state.board.topology.edgeById[edge] !== undefined;
}

/** Regla de distancia: ningún edificio en los vértices contiguos. */
export function respectsDistanceRule(state: GameState, vertex: VertexId): boolean {
  const v = state.board.topology.vertexById[vertex];
  if (!v) return false;
  return v.neighbors.every((n) => state.buildings[n] === undefined);
}

/** Algún camino del jugador toca el vértice. */
export function touchesOwnRoad(state: GameState, player: PlayerId, vertex: VertexId): boolean {
  const v = state.board.topology.vertexById[vertex];
  if (!v) return false;
  return v.edges.some((e) => state.roads[e] === player);
}

/**
 * Un camino nuevo debe enlazar con la red del jugador: por un edificio propio o por un camino
 * propio en un extremo no bloqueado por un edificio ajeno.
 */
export function roadConnects(state: GameState, player: PlayerId, edge: EdgeId): boolean {
  const e = state.board.topology.edgeById[edge];
  if (!e) return false;
  for (const vertex of e.vertices) {
    const building = state.buildings[vertex];
    if (building) {
      if (building.owner === player) return true;
      continue; // bloqueado por un edificio ajeno
    }
    const v = state.board.topology.vertexById[vertex];
    if (v?.edges.some((other) => other !== edge && state.roads[other] === player)) return true;
  }
  return false;
}
