// Temática provisional de `hexa`: nombres, colores e iconos de recursos, cartas y jugadores.
// El motor solo usa identificadores neutros (`r1`…`r5`); todo lo visible vive aquí, así que
// cambiar de ambientación no toca las reglas.
import type { DevCardId, ResourceId, TerrainId } from '@hexa/engine';

export const THEME_NAME = 'provisional';

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'];

/** Ids de color de jugador; coinciden con `PLAYER_COLORS` del protocolo. */
export const PLAYER_COLOR_IDS = ['c1', 'c2', 'c3', 'c4'] as const;
export type PlayerColorId = (typeof PLAYER_COLOR_IDS)[number];

export interface Swatch {
  readonly fill: string;
  readonly stroke: string;
}

/** Fondo del mar sobre el que se dibuja el tablero. */
export const SEA_COLOR = '#17384f';

export const terrainColors: Readonly<Record<TerrainId, Swatch>> = {
  r1: { fill: '#3e8e6a', stroke: '#276348' },
  r2: { fill: '#c0623f', stroke: '#8c4228' },
  r3: { fill: '#a9cf6b', stroke: '#7ba043' },
  r4: { fill: '#e8c547', stroke: '#b99726' },
  r5: { fill: '#7a86b6', stroke: '#535f8c' },
  none: { fill: '#e6dcc3', stroke: '#bfb28f' },
};

/** Iconos como trazados SVG en una cuadrícula de 24 × 24. */
export const glyphs: Readonly<Record<TerrainId, string>> = {
  r1: 'M12 2 L19 12 H15 L20 20 H4 L9 12 H5 Z',
  r2: 'M3 6 H21 V11 H3 Z M3 13 H11 V18 H3 Z M13 13 H21 V18 H13 Z',
  r3: 'M7 19 a4 4 0 0 1 0 -8 a5 5 0 0 1 10 -1 a4.5 4.5 0 0 1 0 9 Z',
  r4: 'M12 2 C9 6 9 9 12 11 C15 9 15 6 12 2 Z M12 12 C9 16 9 19 12 21 C15 19 15 16 12 12 Z',
  r5: 'M12 2 L21 10 L12 22 L3 10 Z',
  none: 'M2 19 Q8 8 12 14 T22 12 V20 H2 Z',
};

/**
 * Colores de jugador elegidos para distinguirse también con daltonismo: la distancia entre
 * cualquier par (ΔE) supera 35 con protanopía, deuteranopía y tritanopía (lo comprueba un test).
 * Aun así el color nunca va solo: cada jugador tiene además una forma y un trazo de camino propios.
 */
export const playerColors: Readonly<Record<PlayerColorId, Swatch>> = {
  c1: { fill: '#e03a63', stroke: '#7a1030' },
  c2: { fill: '#7a6cf0', stroke: '#352a9c' },
  c3: { fill: '#f5b800', stroke: '#8f6a00' },
  c4: { fill: '#4cc9e0', stroke: '#1a7587' },
};

const FALLBACK_SWATCH: Swatch = { fill: '#9aa5b1', stroke: '#52606d' };

export function playerColor(id: string): Swatch {
  return playerColors[id as PlayerColorId] ?? FALLBACK_SWATCH;
}

export type PlayerMark = 'circle' | 'square' | 'triangle' | 'diamond';

/** Forma que acompaña al color de cada jugador (tablero, tarjetas, selector de color…). */
export const playerMarks: Readonly<Record<PlayerColorId, PlayerMark>> = {
  c1: 'circle',
  c2: 'square',
  c3: 'triangle',
  c4: 'diamond',
};

/** Trazados de las formas en una cuadrícula de −1 a 1, para escalarlas donde haga falta. */
export const markPaths: Readonly<Record<PlayerMark, string>> = {
  circle: 'M0 -1 A1 1 0 1 1 0 1 A1 1 0 1 1 0 -1 Z',
  square: 'M-0.85 -0.85 H0.85 V0.85 H-0.85 Z',
  triangle: 'M0 -1 L1 0.85 L-1 0.85 Z',
  diamond: 'M0 -1.05 L1 0 L0 1.05 L-1 0 Z',
};

export function playerMark(id: string): PlayerMark {
  return playerMarks[id as PlayerColorId] ?? 'circle';
}

export function playerMarkPath(id: string): string {
  return markPaths[playerMark(id)];
}

/**
 * Trazo (`stroke-dasharray`) de la línea central de los caminos de cada jugador: continuo,
 * rayas, puntos y raya-punto. `null` = línea continua.
 */
export const roadDashes: Readonly<Record<PlayerColorId, string | null>> = {
  c1: null,
  c2: '5 4',
  c3: '2 4',
  c4: '8 3 2 3',
};

export function playerRoadDash(id: string): string | null {
  return roadDashes[id as PlayerColorId] ?? null;
}

const resourceNames: Readonly<Record<Locale, Readonly<Record<ResourceId, string>>>> = {
  es: { r1: 'Madera', r2: 'Arcilla', r3: 'Lana', r4: 'Cereal', r5: 'Mineral' },
  en: { r1: 'Lumber', r2: 'Clay', r3: 'Wool', r4: 'Grain', r5: 'Ore' },
};

const devCardNames: Readonly<Record<Locale, Readonly<Record<DevCardId, string>>>> = {
  es: {
    army: 'Ejército',
    roads: 'Caminos',
    plenty: 'Abundancia',
    monopoly: 'Monopolio',
    point: 'Punto',
  },
  en: {
    army: 'Army',
    roads: 'Roads',
    plenty: 'Plenty',
    monopoly: 'Monopoly',
    point: 'Point',
  },
};

export function resourceName(locale: Locale, id: ResourceId): string {
  return resourceNames[locale][id];
}

export function devCardName(locale: Locale, id: DevCardId): string {
  return devCardNames[locale][id];
}

export function terrainName(locale: Locale, id: TerrainId): string {
  const desert = { es: 'Páramo', en: 'Wasteland' } as const;
  return id === 'none' ? desert[locale] : resourceName(locale, id);
}
