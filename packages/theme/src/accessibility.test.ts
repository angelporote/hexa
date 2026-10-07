import { describe, expect, it } from 'vitest';
import {
  PLAYER_COLOR_IDS,
  markPaths,
  playerColors,
  playerMark,
  playerMarkPath,
  playerRoadDash,
  roadDashes,
} from './index.js';

// ── Simulación de daltonismo y medidas de color ──────────────────────────────────────────
// Matrices de Machado, Oliveira y Fernandes (2009), severidad total, aplicadas en RGB lineal.

type Rgb = readonly [number, number, number];
type Matrix = readonly [Rgb, Rgb, Rgb];

const VISION: Readonly<Record<string, Matrix>> = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const parse = (hex: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function simulate(hex: string, matrix: Matrix): Rgb {
  const [r, g, b] = parse(hex).map(linear) as unknown as Rgb;
  const out = matrix.map((row) => Math.min(1, Math.max(0, row[0] * r + row[1] * g + row[2] * b)));
  return out as unknown as Rgb;
}

/** Color en CIELAB (D65) a partir de RGB lineal. */
function lab([r, g, b]: Rgb): Rgb {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Distancia ΔE76 entre dos colores: por debajo de ~10 casi no se distinguen. */
const deltaE = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Contraste WCAG entre dos colores (1 a 21). */
function contrast(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const [r, g, b2] = parse(hex).map(linear) as unknown as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('colores de jugador y daltonismo', () => {
  const fills = PLAYER_COLOR_IDS.map((id) => playerColors[id].fill);

  it.each(Object.keys(VISION))('se distinguen entre sí con visión %s (ΔE ≥ 35)', (mode) => {
    const matrix = VISION[mode];
    if (!matrix) throw new Error(mode);
    const labs = fills.map((fill) => lab(simulate(fill, matrix)));
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) {
        const a = labs[i];
        const b = labs[j];
        if (!a || !b) throw new Error('sin color');
        expect(
          deltaE(a, b),
          `${PLAYER_COLOR_IDS[i]} y ${PLAYER_COLOR_IDS[j]}`,
        ).toBeGreaterThanOrEqual(35);
      }
    }
  });

  it('cada color tiene su contorno más oscuro, para recortarse sobre cualquier fondo', () => {
    for (const id of PLAYER_COLOR_IDS) {
      const { fill, stroke } = playerColors[id];
      expect(contrast(stroke, '#ffffff')).toBeGreaterThan(contrast(fill, '#ffffff'));
    }
  });

  it('se ven sobre los fondos oscuros de la interfaz (contraste ≥ 3:1)', () => {
    // Mantener en sintonía con `--bg`, `--panel` y `--panel-2` de apps/web/src/styles.css.
    for (const surface of ['#0e1a24', '#162734', '#1d3345']) {
      for (const id of PLAYER_COLOR_IDS) {
        expect(
          contrast(playerColors[id].fill, surface),
          `${id} sobre ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('formas y trazos: el color nunca es la única pista', () => {
  it('cada jugador tiene una forma distinta, con su trazado', () => {
    const marks = PLAYER_COLOR_IDS.map((id) => playerMark(id));
    expect(new Set(marks).size).toBe(PLAYER_COLOR_IDS.length);
    for (const id of PLAYER_COLOR_IDS) {
      expect(playerMarkPath(id)).toBe(markPaths[playerMark(id)]);
      expect(markPaths[playerMark(id)]).toMatch(/^M/);
    }
    expect(new Set(Object.values(markPaths)).size).toBe(Object.keys(markPaths).length);
  });

  it('cada jugador tiene un trazo de camino distinto (uno puede ser continuo)', () => {
    const dashes = PLAYER_COLOR_IDS.map((id) => roadDashes[id]);
    expect(new Set(dashes).size).toBe(PLAYER_COLOR_IDS.length);
    expect(dashes.filter((d) => d === null)).toHaveLength(1);
  });

  it('un id desconocido recibe una forma y un trazo de reserva', () => {
    expect(playerMark('c9')).toBe('circle');
    expect(playerMarkPath('c9')).toMatch(/^M/);
    expect(playerRoadDash('c9')).toBeNull();
    expect(playerRoadDash('c2')).toBe(roadDashes.c2);
  });
});
