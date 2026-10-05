import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Board } from './Board.js';
import { hostView, setupGame } from '../testing.js';

afterEach(cleanup);

function renderBoard(locale: 'es' | 'en' = 'es') {
  const view = hostView(setupGame());
  const owners = new Map(view.players.map((p, i) => [p.id, `c${(i % 4) + 1}`]));
  const utils = render(
    <Board
      board={view.board}
      buildings={view.buildings}
      roads={view.roads}
      robber={view.robber}
      colorOf={(id) => owners.get(id) ?? 'c1'}
      locale={locale}
      label="tablero"
    />,
  );
  return { view, ...utils };
}

describe('<Board />', () => {
  it('dibuja los 19 hexágonos, 9 puertos y el ladrón', () => {
    const { container } = renderBoard();
    expect(container.querySelectorAll('.hex')).toHaveLength(19);
    expect(container.querySelectorAll('.port')).toHaveLength(9);
    expect(container.querySelectorAll('.robber')).toHaveLength(1);
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('tablero');
  });

  it('dibuja cada camino y edificio de la vista, con el color de su dueño', () => {
    const { container, view } = renderBoard();
    expect(container.querySelectorAll('[data-road]')).toHaveLength(Object.keys(view.roads).length);
    expect(container.querySelectorAll('[data-building]')).toHaveLength(
      Object.keys(view.buildings).length,
    );
    expect(Object.keys(view.buildings)).toHaveLength(6);
    // los tres jugadores usan colores distintos
    const strokes = new Set(
      [...container.querySelectorAll('[data-building] path')].map((p) => p.getAttribute('fill')),
    );
    expect(strokes.size).toBeGreaterThanOrEqual(3);
  });

  it('muestra la ficha numérica de los 18 terrenos productores y ninguna en el estéril', () => {
    const { container } = renderBoard();
    const tokens = [...container.querySelectorAll('.hex')]
      .map((hex) => hex.querySelector('circle'))
      .filter(Boolean);
    // cada ficha lleva un círculo de fondo y puntos; contamos hexágonos con texto numérico
    const withNumber = [...container.querySelectorAll('.hex')].filter((hex) =>
      hex.querySelector('text'),
    );
    expect(withNumber).toHaveLength(18);
    expect(tokens.length).toBe(18);
  });

  it('el título de cada hexágono usa el idioma activo', () => {
    const es = renderBoard('es');
    const titlesEs = [...es.container.querySelectorAll('.hex title')].map((t) => t.textContent);
    expect(titlesEs.some((t) => t?.startsWith('Madera'))).toBe(true);
    cleanup();
    const en = renderBoard('en');
    const titlesEn = [...en.container.querySelectorAll('.hex title')].map((t) => t.textContent);
    expect(titlesEn.some((t) => t?.startsWith('Lumber'))).toBe(true);
  });
});
