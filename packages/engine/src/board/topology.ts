import { compareHex, hexId, hexNeighbor } from './hex.js';
import type { HexCoord, HexId } from './hex.js';

export type VertexId = string;
export type EdgeId = string;

export interface HexNode extends HexCoord {
  readonly id: HexId;
  /** Vértices por esquina (0..5), ver `HEX_DIRECTIONS`. */
  readonly vertices: readonly VertexId[];
  /** Aristas por dirección (0..5); la arista `i` une las esquinas `i - 1` e `i`. */
  readonly edges: readonly EdgeId[];
}

export interface VertexNode {
  readonly id: VertexId;
  /** Hexágonos del tablero que tocan el vértice (1 a 3). */
  readonly hexes: readonly HexId[];
  readonly edges: readonly EdgeId[];
  readonly neighbors: readonly VertexId[];
}

export interface EdgeNode {
  readonly id: EdgeId;
  readonly vertices: readonly [VertexId, VertexId];
  /** Hexágonos del tablero a ambos lados de la arista (1 o 2). */
  readonly hexes: readonly HexId[];
}

export interface Topology {
  readonly hexes: readonly HexNode[];
  readonly vertices: readonly VertexNode[];
  readonly edges: readonly EdgeNode[];
  readonly hexById: Readonly<Record<HexId, HexNode>>;
  readonly vertexById: Readonly<Record<VertexId, VertexNode>>;
  readonly edgeById: Readonly<Record<EdgeId, EdgeNode>>;
}

interface MutableVertex {
  id: VertexId;
  hexes: HexId[];
  edges: EdgeId[];
  neighbors: VertexId[];
}

interface MutableEdge {
  id: EdgeId;
  vertices: [VertexId, VertexId];
  hexes: HexId[];
}

/**
 * Construye el grafo de vértices y aristas de una forma de tablero.
 *
 * Un vértice se identifica por los tres hexágonos (del tablero o no) que lo rodean, y una
 * arista por los dos que la separan; así los elementos compartidos se deduplican sin usar
 * coordenadas de punto flotante. Los ids (`v0`, `e0`…) se asignan en orden de aparición, por
 * lo que son deterministas para una misma lista de hexágonos.
 */
export function buildTopology(coords: readonly HexCoord[]): Topology {
  const onBoard = new Set<HexId>();
  for (const c of coords) {
    const id = hexId(c);
    if (onBoard.has(id)) throw new Error(`Hexágono duplicado: ${id}`);
    onBoard.add(id);
  }

  const vertexByKey = new Map<string, MutableVertex>();
  const edgeByKey = new Map<string, MutableEdge>();
  const vertexList: MutableVertex[] = [];
  const edgeList: MutableEdge[] = [];
  const hexNodes: HexNode[] = [];

  const vertexFor = (a: HexCoord, b: HexCoord, c: HexCoord): MutableVertex => {
    const triple = [a, b, c].sort(compareHex);
    const key = triple.map(hexId).join('|');
    let v = vertexByKey.get(key);
    if (!v) {
      v = {
        id: `v${vertexList.length}`,
        hexes: triple.map(hexId).filter((id) => onBoard.has(id)),
        edges: [],
        neighbors: [],
      };
      vertexByKey.set(key, v);
      vertexList.push(v);
    }
    return v;
  };

  for (const c of coords) {
    const id = hexId(c);
    const corners: VertexId[] = [];
    for (let i = 0; i < 6; i++) {
      corners.push(vertexFor(c, hexNeighbor(c, i), hexNeighbor(c, i + 1)).id);
    }

    const edges: EdgeId[] = [];
    for (let i = 0; i < 6; i++) {
      const other = hexNeighbor(c, i);
      const key = [c, other].sort(compareHex).map(hexId).join('|');
      let e = edgeByKey.get(key);
      if (!e) {
        const a = corners[(i + 5) % 6];
        const b = corners[i];
        if (a === undefined || b === undefined) throw new Error('unreachable');
        e = {
          id: `e${edgeList.length}`,
          vertices: [a, b],
          hexes: [c, other].map(hexId).filter((h) => onBoard.has(h)),
        };
        edgeByKey.set(key, e);
        edgeList.push(e);
      }
      edges.push(e.id);
    }

    hexNodes.push({ ...c, id, vertices: corners, edges });
  }

  const vertexById: Record<VertexId, MutableVertex> = {};
  for (const v of vertexList) vertexById[v.id] = v;
  for (const e of edgeList) {
    const [a, b] = e.vertices;
    const va = vertexById[a];
    const vb = vertexById[b];
    if (!va || !vb) throw new Error('unreachable');
    va.edges.push(e.id);
    vb.edges.push(e.id);
    va.neighbors.push(b);
    vb.neighbors.push(a);
  }

  const edgeById: Record<EdgeId, EdgeNode> = {};
  for (const e of edgeList) edgeById[e.id] = e;
  const hexById: Record<HexId, HexNode> = {};
  for (const h of hexNodes) hexById[h.id] = h;

  return {
    hexes: hexNodes,
    vertices: vertexList,
    edges: edgeList,
    hexById,
    vertexById,
    edgeById,
  };
}
