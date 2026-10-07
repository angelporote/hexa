import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PLAYER_COLORS } from '@hexa/protocol';
import { markPaths, playerColors, playerMark, roadDashes } from '@hexa/theme';
import { Building, Road } from '../board/Pieces.js';
import { Providers, makeConnection } from '../testing.js';
import { ColorPicker } from './ColorPicker.js';
import { Swatch } from './Swatch.js';

afterEach(cleanup);

const inBoard = (node: React.ReactNode) =>
  render(
    <svg>
      <title>tablero</title>
      {node}
    </svg>,
  );

describe('<Swatch />: color y forma', () => {
  it('dibuja la forma del jugador con su color, y es decorativa', () => {
    for (const c of PLAYER_COLORS) {
      const { container } = render(<Swatch color={c} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      const path = svg?.querySelector('path');
      expect(path?.getAttribute('d')).toBe(markPaths[playerMark(c)]);
      expect(path?.getAttribute('fill')).toBe(playerColors[c].fill);
      expect(path?.getAttribute('stroke')).toBe(playerColors[c].stroke);
      cleanup();
    }
  });

  it('los cuatro jugadores tienen cuatro siluetas distintas', () => {
    const shapes = PLAYER_COLORS.map((c) => {
      const { container } = render(<Swatch color={c} />);
      const d = container.querySelector('path')?.getAttribute('d');
      cleanup();
      return d;
    });
    expect(new Set(shapes).size).toBe(4);
  });

  it('admite tamaño grande y estado bloqueado', () => {
    const { container } = render(<Swatch color="c2" large taken />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBe('swatch swatch-lg taken');
  });

  it('un color desconocido sigue dibujando algo', () => {
    const { container } = render(<Swatch color="zzz" />);
    expect(container.querySelector('path')?.getAttribute('d')).toBe(markPaths.circle);
  });
});

describe('piezas del tablero', () => {
  it('cada edificio lleva dentro la forma de su jugador, además de su color', () => {
    const marks = PLAYER_COLORS.map((c) => {
      const { container } = inBoard(
        <Building at={{ x: 0, y: 0 }} kind="settlement" color={c} id={`v-${c}`} />,
      );
      const d = container.querySelector('.piece-mark')?.getAttribute('d');
      cleanup();
      return d;
    });
    expect(new Set(marks).size).toBe(4);
    expect(marks[0]).toBe(markPaths.circle);
  });

  it('la forma cabe en el poblado y en la ciudad, que son de tamaño distinto', () => {
    const transform = (kind: 'settlement' | 'city') => {
      const { container } = inBoard(<Building at={{ x: 0, y: 0 }} kind={kind} color="c1" id="v" />);
      const t = container.querySelector('.piece-mark')?.getAttribute('transform');
      cleanup();
      return t;
    };
    expect(transform('settlement')).toMatch(/^translate\(0 2\.5\) scale\(/);
    expect(transform('city')).toMatch(/^translate\(0 4\.5\) scale\(/);
  });

  it('cada camino lleva una línea central con un trazo propio; uno es continuo', () => {
    const dashes = PLAYER_COLORS.map((c) => {
      const { container } = inBoard(
        <Road a={{ x: 0, y: 0 }} b={{ x: 40, y: 0 }} color={c} id={`e-${c}`} />,
      );
      const line = container.querySelector('.road-pattern');
      expect(line).not.toBeNull();
      const dash = line?.getAttribute('stroke-dasharray') ?? null;
      cleanup();
      return dash;
    });
    expect(dashes).toEqual(PLAYER_COLORS.map((c) => roadDashes[c]));
    expect(new Set(dashes).size).toBe(4);
    expect(dashes.filter((d) => d === null)).toHaveLength(1);
  });
});

describe('<ColorPicker />', () => {
  it('cada opción muestra su forma y las ocupadas se atenúan y se bloquean', () => {
    const { container } = render(
      <Providers connection={makeConnection().connection}>
        <ColorPicker legend="Color" value="c1" onChange={() => undefined} taken={new Set(['c3'])} />
      </Providers>,
    );
    const options = [...container.querySelectorAll('.color-option')];
    expect(options).toHaveLength(4);
    const shapes = options.map((o) => o.querySelector('svg path')?.getAttribute('d'));
    expect(new Set(shapes).size).toBe(4);
    expect((screen.getByLabelText('Ámbar') as HTMLInputElement).disabled).toBe(true);
    expect(options[2]?.querySelector('svg')?.getAttribute('class')).toContain('taken');
    expect(options[0]?.className).toContain('selected');
  });
});
