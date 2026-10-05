import { z } from 'zod';
import { err, ok } from '../result.js';
import type { Result } from '../result.js';
import { hexId, hexNeighbor } from './hex.js';
import { buildTopology } from './topology.js';
import { RESOURCE_IDS } from './types.js';

const coord = z.number().int();
const resource = z.enum(RESOURCE_IDS);

const mapTemplateSchema = z.object({
  id: z.string().min(1),
  hexes: z.array(z.object({ q: coord, r: coord })).min(1),
  /** Cuántos hexágonos hay de cada terreno; la suma debe igualar el número de hexágonos. */
  terrains: z.object({
    r1: z.number().int().min(0),
    r2: z.number().int().min(0),
    r3: z.number().int().min(0),
    r4: z.number().int().min(0),
    r5: z.number().int().min(0),
    none: z.number().int().min(0),
  }),
  /** Fichas numéricas disponibles: una por cada hexágono que produce. */
  numbers: z.array(
    z
      .number()
      .int()
      .min(2)
      .max(12)
      .refine((n) => n !== 7),
  ),
  /** Huecos de puerto: hexágono costero y dirección de su arista exterior. */
  ports: z.array(z.object({ q: coord, r: coord, dir: z.number().int().min(0).max(5) })),
  /** Puertos disponibles para repartir entre los huecos. */
  portKinds: z.array(z.union([resource, z.literal('any')])),
});

export type MapTemplate = z.infer<typeof mapTemplateSchema>;

/** Valida la forma (Zod) y la coherencia del mapa. Devuelve la lista de problemas si falla. */
export function parseMapTemplate(input: unknown): Result<MapTemplate, string[]> {
  const parsed = mapTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const t = parsed.data;
  const problems: string[] = [];

  const ids = new Set(t.hexes.map(hexId));
  if (ids.size !== t.hexes.length) problems.push('hexes: hay coordenadas repetidas');

  const terrainTotal = Object.values(t.terrains).reduce((a, b) => a + b, 0);
  if (terrainTotal !== t.hexes.length) {
    problems.push(`terrains: suman ${terrainTotal} y hay ${t.hexes.length} hexágonos`);
  }
  const producing = t.hexes.length - t.terrains.none;
  if (t.numbers.length !== producing) {
    problems.push(
      `numbers: hay ${t.numbers.length} fichas para ${producing} hexágonos productores`,
    );
  }
  if (t.ports.length !== t.portKinds.length) {
    problems.push(`portKinds: hay ${t.portKinds.length} puertos para ${t.ports.length} huecos`);
  }

  if (problems.length === 0) {
    const topology = buildTopology(t.hexes);
    const usedVertices = new Set<string>();
    const usedEdges = new Set<string>();
    for (const slot of t.ports) {
      const id = hexId(slot);
      const hex = topology.hexById[id];
      if (!hex) {
        problems.push(`ports: ${id} no está en el tablero`);
        continue;
      }
      if (ids.has(hexId(hexNeighbor(slot, slot.dir)))) {
        problems.push(`ports: la arista ${slot.dir} de ${id} no es costera`);
        continue;
      }
      const edgeId = hex.edges[slot.dir];
      const edge = edgeId === undefined ? undefined : topology.edgeById[edgeId];
      if (!edge || edgeId === undefined) continue;
      if (usedEdges.has(edgeId)) problems.push(`ports: arista repetida en ${id}`);
      usedEdges.add(edgeId);
      for (const v of edge.vertices) {
        if (usedVertices.has(v)) problems.push(`ports: dos puertos comparten vértice (${id})`);
        usedVertices.add(v);
      }
    }
  }

  return problems.length > 0 ? err(problems) : ok(t);
}
