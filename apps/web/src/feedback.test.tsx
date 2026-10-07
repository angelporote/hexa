import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { getPlayerView } from '@hexa/engine';
import type { ResourceCounts } from '@hexa/engine';
import { Board } from './board/Board.js';
import { useRollHighlight } from './board/use-roll-highlight.js';
import { Hand } from './controller/Hand.js';
import { useGains } from './controller/use-gains.js';
import { GameScreen } from './host/GameScreen.js';
import type { ConnectionSnapshot } from './net/connection.js';
import { Providers, makeConnection, roomOf, setupGame } from './testing.js';
import css from './styles.css?raw';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const hand = (over: Partial<ResourceCounts> = {}): ResourceCounts => ({
  r1: 0,
  r2: 0,
  r3: 0,
  r4: 0,
  r5: 0,
  ...over,
});

describe('useGains', () => {
  it('la primera lectura no cuenta como ganancia', () => {
    const { result } = renderHook(({ h }) => useGains(h), { initialProps: { h: hand({ r1: 3 }) } });
    expect(result.current).toEqual({});
  });

  it('muestra lo que sube cada recurso y no lo que baja o se queda igual', () => {
    const { result, rerender } = renderHook(({ h }) => useGains(h), {
      initialProps: { h: hand({ r1: 3, r2: 2, r3: 1 }) },
    });
    rerender({ h: hand({ r1: 5, r2: 1, r3: 1, r4: 1 }) });
    expect(Object.keys(result.current).sort()).toEqual(['r1', 'r4']);
    expect(result.current.r1?.amount).toBe(2);
    expect(result.current.r4?.amount).toBe(1);
  });

  it('desaparece pasado el tiempo', () => {
    const { result, rerender } = renderHook(({ h }) => useGains(h, 1000), {
      initialProps: { h: hand() },
    });
    rerender({ h: hand({ r2: 2 }) });
    expect(result.current.r2?.amount).toBe(2);
    act(() => void vi.advanceTimersByTime(999));
    expect(result.current.r2).toBeDefined();
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current).toEqual({});
  });

  it('una ganancia nueva reanima el aviso (clave distinta) y alarga la espera', () => {
    const { result, rerender } = renderHook(({ h }) => useGains(h, 1000), {
      initialProps: { h: hand() },
    });
    rerender({ h: hand({ r1: 1 }) });
    const first = result.current.r1?.key;
    act(() => void vi.advanceTimersByTime(600));
    rerender({ h: hand({ r1: 3 }) });
    expect(result.current.r1?.amount).toBe(2);
    expect(result.current.r1?.key).not.toBe(first);
    act(() => void vi.advanceTimersByTime(600)); // 1,2 s desde la primera, pero 0,6 s desde la última
    expect(result.current.r1).toBeDefined();
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current).toEqual({});
  });

  it('una vista idéntica no cambia nada', () => {
    const { result, rerender } = renderHook(({ h }) => useGains(h), {
      initialProps: { h: hand({ r1: 1 }) },
    });
    rerender({ h: hand({ r1: 1 }) });
    expect(result.current).toEqual({});
  });
});

describe('<Hand />: recursos recibidos', () => {
  const you = () => {
    const base = getPlayerView(setupGame(), 'p1').you;
    if (!base) throw new Error('sin vista');
    return base;
  };
  const mount = (h: ResourceCounts) =>
    render(
      <Providers connection={makeConnection().connection}>
        <Hand you={{ ...you(), hand: h }} />
      </Providers>,
    );

  it('enseña +N sobre lo que sube y lo anuncia a los lectores de pantalla', () => {
    const view = render(
      <Providers connection={makeConnection().connection}>
        <Hand you={{ ...you(), hand: hand({ r1: 1 }) }} />
      </Providers>,
    );
    expect(view.container.querySelector('.gain')).toBeNull();
    view.rerender(
      <Providers connection={makeConnection().connection}>
        <Hand you={{ ...you(), hand: hand({ r1: 3, r3: 1 }) }} />
      </Providers>,
    );
    const badges = [...view.container.querySelectorAll('.gain')].map((n) => n.textContent);
    expect(badges.sort()).toEqual(['+1', '+2']);
    expect(view.container.querySelector('.gain')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Recibes 2 Madera, 1 Lana');
    act(() => void vi.advanceTimersByTime(2000));
    expect(view.container.querySelector('.gain')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('al abrir el mando con cartas no hay avisos', () => {
    const { container } = mount(hand({ r1: 4, r5: 2 }));
    expect(container.querySelector('.gain')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('useRollHighlight', () => {
  const roll = (total: number, key: number) => ({ dice: [total - 1, 1] as const, key });

  it('no resalta una tirada que ya existía al montarse', () => {
    const { result } = renderHook(({ r }) => useRollHighlight(r), {
      initialProps: { r: roll(8, 1) },
    });
    expect(result.current).toBeNull();
  });

  it('resalta la ficha de una tirada nueva y la retira pasado el tiempo', () => {
    const { result, rerender } = renderHook(({ r }) => useRollHighlight(r, 1000), {
      initialProps: { r: null as ReturnType<typeof roll> | null },
    });
    expect(result.current).toBeNull();
    rerender({ r: roll(9, 1) });
    expect(result.current).toBe(9);
    act(() => void vi.advanceTimersByTime(1001));
    expect(result.current).toBeNull();
  });

  it('el 7 no resalta nada y quita lo anterior', () => {
    const { result, rerender } = renderHook(({ r }) => useRollHighlight(r, 5000), {
      initialProps: { r: null as ReturnType<typeof roll> | null },
    });
    rerender({ r: roll(6, 1) });
    expect(result.current).toBe(6);
    rerender({ r: roll(7, 2) });
    expect(result.current).toBeNull();
  });

  it('una tirada nueva sustituye a la anterior', () => {
    const { result, rerender } = renderHook(({ r }) => useRollHighlight(r, 5000), {
      initialProps: { r: null as ReturnType<typeof roll> | null },
    });
    rerender({ r: roll(4, 1) });
    rerender({ r: roll(10, 2) });
    expect(result.current).toBe(10);
  });
});

describe('tablero: hexágonos que producen', () => {
  const view = getPlayerView(setupGame(), 'p0');
  const board = (highlight: number | null, robber = view.robber) =>
    render(
      <svg>
        <title>t</title>
        <Board
          board={view.board}
          buildings={view.buildings}
          roads={view.roads}
          robber={robber}
          colorOf={() => 'c1'}
          locale="es"
          label="tablero"
          highlight={highlight}
        />
      </svg>,
    );
  const pulsing = (container: HTMLElement) =>
    [...container.querySelectorAll('.hex.pulse')].map((n) => n.getAttribute('data-hex'));

  it('laten los hexágonos con la ficha de la tirada', () => {
    const wanted = Object.entries(view.board.hexes)
      .filter(([id, tile]) => tile.number === 8 && id !== view.robber)
      .map(([id]) => id)
      .sort();
    expect(wanted.length).toBeGreaterThan(0);
    expect(pulsing(board(8).container).sort()).toEqual(wanted);
  });

  it('el hexágono que tapa el ladrón no late: no produce', () => {
    const robberHex = Object.entries(view.board.hexes).find(([, tile]) => tile.number === 8)?.[0];
    if (!robberHex) throw new Error('sin hexágono con ficha 8');
    expect(pulsing(board(8, robberHex).container)).not.toContain(robberHex);
  });

  it('sin tirada que resaltar, no late ninguno', () => {
    expect(pulsing(board(null).container)).toEqual([]);
  });
});

describe('<GameScreen />: resaltado tras tirar', () => {
  const state = setupGame();
  const hostView = getPlayerView(state, 'host');
  const snapshot = (diceRoll: ConnectionSnapshot['diceRoll']): ConnectionSnapshot => ({
    status: 'connected',
    resuming: false,
    session: null,
    room: roomOf('playing'),
    view: hostView,
    seq: 10,
    clock: null,
    events: [],
    diceRoll,
    preview: null,
    replaced: false,
    resumeFailed: false,
  });
  const ui = (s: ConnectionSnapshot) => (
    <Providers connection={makeConnection().connection}>
      <GameScreen view={hostView} snapshot={s} />
    </Providers>
  );

  it('al llegar una tirada nueva laten los hexágonos con esa ficha, y luego dejan de latir', () => {
    const { container, rerender } = render(ui(snapshot(null)));
    expect(container.querySelectorAll('.hex.pulse')).toHaveLength(0);
    rerender(ui(snapshot({ dice: [4, 4], key: 7 })));
    const pulses = container.querySelectorAll('.hex.pulse').length;
    expect(pulses).toBe(
      Object.entries(hostView.board.hexes).filter(
        ([id, tile]) => tile.number === 8 && id !== hostView.robber,
      ).length,
    );
    act(() => void vi.advanceTimersByTime(4000));
    expect(container.querySelectorAll('.hex.pulse')).toHaveLength(0);
  });
});

describe('estilos del feedback', () => {
  it('quien pide movimiento reducido no ve animaciones ni transiciones en ningún sitio', () => {
    const block =
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{([^}]*)\}/.exec(
        css,
      );
    expect(block, 'falta la regla global de movimiento reducido').not.toBeNull();
    expect(block?.[1]).toContain('animation-duration: 0.001ms !important');
    expect(block?.[1]).toContain('transition-duration: 0.001ms !important');
  });

  it('las animaciones nuevas existen', () => {
    expect(css).toContain('@keyframes gain-up');
    expect(css).toContain('@keyframes hex-pulse');
    expect(css).toContain('.hex.pulse polygon');
  });
});
