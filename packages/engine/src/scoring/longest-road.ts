import type { EdgeId, VertexId } from '../board/topology.js';
import type { GameState, PlayerId } from '../state/types.js';

/**
 * Longitud del camino continuo más largo de un jugador.
 *
 * Es el recorrido más largo que no repite aristas (puede pasar de nuevo por un vértice, de modo
 * que un ciclo cuenta entero). Un edificio ajeno en un vértice corta el camino: se puede llegar
 * hasta él pero no seguir al otro lado. Con ≤ 15 caminos por jugador, la búsqueda exhaustiva
 * es instantánea.
 */
export function longestRoadLength(state: GameState, player: PlayerId): number {
  const { vertexById, edgeById } = state.board.topology;
  const own = new Set<EdgeId>();
  for (const [edge, owner] of Object.entries(state.roads)) if (owner === player) own.add(edge);
  if (own.size === 0) return 0;

  const blocked = (vertex: VertexId): boolean => {
    const building = state.buildings[vertex];
    return building !== undefined && building.owner !== player;
  };

  const used = new Set<EdgeId>();
  let best = 0;

  const walk = (vertex: VertexId, length: number): void => {
    if (length > best) best = length;
    const node = vertexById[vertex];
    if (!node) return;
    for (const edgeId of node.edges) {
      if (!own.has(edgeId) || used.has(edgeId)) continue;
      const edge = edgeById[edgeId];
      if (!edge) continue;
      const next = edge.vertices[0] === vertex ? edge.vertices[1] : edge.vertices[0];
      used.add(edgeId);
      if (blocked(next)) {
        if (length + 1 > best) best = length + 1;
      } else {
        walk(next, length + 1);
      }
      used.delete(edgeId);
    }
  };

  const starts = new Set<VertexId>();
  for (const edgeId of own) {
    const edge = edgeById[edgeId];
    if (edge) for (const v of edge.vertices) starts.add(v);
  }
  for (const start of starts) walk(start, 0);
  return best;
}
