import { describe, expect, it } from 'vitest';
import css from './styles.css?raw';

// jsdom no calcula tamaños, así que se vigila lo que declara el CSS: todo control táctil debe medir
// al menos 44 × 44 px (la guía de Apple y el criterio AAA 2.5.5 de WCAG). Las medidas reales se
// comprueban a mano en el móvil (docs/devices.md).

const MIN = 44;

/** Declaraciones de la primera regla cuyo selector incluye exactamente `selector`. */
function declarations(selector: string): Record<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, ''); // sin comentarios
  for (const [, selectors, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = (selectors ?? '').split(',').map((x) => x.trim());
    if (!list.includes(selector)) continue;
    return Object.fromEntries(
      (body ?? '')
        .split(';')
        .map((d) => d.split(':').map((x) => x.trim()))
        .filter((d): d is [string, string] => d.length === 2 && d[0] !== '' && d[1] !== undefined),
    );
  }
  throw new Error(`No hay una regla para «${selector}»`);
}

const px = (value: string | undefined): number => (value?.endsWith('px') ? parseFloat(value) : NaN);

describe('tamaños táctiles', () => {
  it.each(['.btn', '.btn-sm', '.lang-btn', '.link-btn'])(
    '%s mide al menos 44 px de alto',
    (selector) => {
      expect(px(declarations(selector)['min-height'])).toBeGreaterThanOrEqual(MIN);
    },
  );

  it.each(['.btn-icon', '.lang-btn'])('%s mide al menos 44 px de ancho', (selector) => {
    expect(px(declarations(selector)['min-width'])).toBeGreaterThanOrEqual(MIN);
  });

  it('las muestras grandes de color (selector de color) miden 44 × 44', () => {
    const large = declarations('.swatch-lg');
    expect(px(large['width'])).toBeGreaterThanOrEqual(MIN);
    expect(px(large['height'])).toBeGreaterThanOrEqual(MIN);
  });

  it('el desplegable de costes tiene relleno vertical suficiente (≥ 0,7 rem a cada lado)', () => {
    const summary = declarations('.costs summary');
    expect(parseFloat(summary['padding-block'] ?? '0')).toBeGreaterThanOrEqual(0.7);
  });

  it('el analizador detecta una regla que no existe', () => {
    expect(() => declarations('.no-existe')).toThrow('No hay una regla');
  });
});
