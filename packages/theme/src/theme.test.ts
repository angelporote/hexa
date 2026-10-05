import { describe, expect, it } from 'vitest';
import { DEV_CARD_IDS, RESOURCE_IDS } from '@hexa/engine';
import {
  LOCALES,
  PLAYER_COLOR_IDS,
  devCardName,
  glyphs,
  playerColor,
  playerColors,
  resourceName,
  terrainColors,
  terrainName,
} from './index.js';

describe('tema', () => {
  it('define color e icono para cada terreno del motor', () => {
    for (const id of [...RESOURCE_IDS, 'none'] as const) {
      expect(terrainColors[id].fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(glyphs[id].length).toBeGreaterThan(5);
    }
  });

  it('nombra todos los recursos y cartas en cada idioma, sin repetidos', () => {
    for (const locale of LOCALES) {
      const names = RESOURCE_IDS.map((r) => resourceName(locale, r));
      expect(new Set(names).size).toBe(RESOURCE_IDS.length);
      expect(names.every((n) => n.length > 0)).toBe(true);
      const cards = DEV_CARD_IDS.map((c) => devCardName(locale, c));
      expect(new Set(cards).size).toBe(DEV_CARD_IDS.length);
      expect(terrainName(locale, 'none').length).toBeGreaterThan(0);
    }
  });

  it('los colores de jugador son distintos entre sí y hay uno de reserva para ids desconocidos', () => {
    const fills = PLAYER_COLOR_IDS.map((c) => playerColors[c].fill);
    expect(new Set(fills).size).toBe(PLAYER_COLOR_IDS.length);
    expect(playerColor('c9').fill).toMatch(/^#/);
  });

  it('los terrenos productores se distinguen por color', () => {
    const fills = RESOURCE_IDS.map((r) => terrainColors[r].fill);
    expect(new Set(fills).size).toBe(RESOURCE_IDS.length);
  });
});
