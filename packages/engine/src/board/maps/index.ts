import { parseMapTemplate } from '../map-template.js';
import type { MapTemplate } from '../map-template.js';
import base19 from './base-19.json' with { type: 'json' };

function load(data: unknown): MapTemplate {
  const parsed = parseMapTemplate(data);
  if (!parsed.ok) throw new Error(`Mapa incluido no válido: ${parsed.error.join('; ')}`);
  return parsed.value;
}

/** Mapa base de 19 hexágonos, 18 fichas y 9 puertos. */
export const BASE_MAP: MapTemplate = load(base19);
