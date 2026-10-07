import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createConfig, createGame, getPlayerView } from '@hexa/engine';
import type { PreviewTarget } from '@hexa/protocol';
import { Board } from '../board/Board.js';
import { Providers, hostView, makeConnection, setupGame } from '../testing.js';
import { ZoomableBoard, cameraViewBox } from './ZoomableBoard.js';

afterEach(cleanup);

function renderZoomable(onPick: (t: PreviewTarget) => void) {
  // al empezar la partida, p0 puede colocar un poblado en cualquier vértice libre
  const view = getPlayerView(createGame(createConfig(['p0', 'p1', 'p2']), 'zoom'), 'p0');
  const vertices = new Set(
    view.legalActions.flatMap((a) => (a.type === 'BUILD_SETTLEMENT' ? [a.vertex] : [])),
  );
  const utils = render(
    <Providers connection={makeConnection().connection}>
      <ZoomableBoard
        board={view.board}
        buildings={view.buildings}
        roads={view.roads}
        robber={view.robber}
        colorOf={() => 'c1'}
        locale="es"
        label="tablero"
        interaction={{ vertices, selected: null, color: 'c1', onPick }}
      />
    </Providers>,
  );
  const svg = utils.container.querySelector('svg') as SVGSVGElement;
  const frame = utils.container.querySelector('.zoom-frame') as HTMLElement;
  const box = () => svg.getAttribute('viewBox')?.split(' ').map(Number) ?? [];
  return { ...utils, svg, frame, box, vertex: [...vertices][0] ?? '' };
}

describe('<ZoomableBoard />', () => {
  it('los botones acercan, alejan y recuperan la vista completa', () => {
    const { box } = renderZoomable(() => undefined);
    const [, , w0, h0] = box();
    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    const [, , w1, h1] = box();
    expect(w1).toBeCloseTo((w0 ?? 0) / 1.5, 3);
    expect(h1).toBeCloseTo((h0 ?? 0) / 1.5, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }));
    expect(box()[2]).toBeCloseTo((w0 ?? 0) / 1.5, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Ver todo el tablero' }));
    expect(box()[2]).toBeCloseTo(w0 ?? 0, 3);
  });

  it('no se aleja más allá del tablero entero ni se acerca sin límite', () => {
    const { box } = renderZoomable(() => undefined);
    const [, , w0] = box();
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }));
    expect(box()[2]).toBeCloseTo(w0 ?? 0, 3);
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    expect(box()[2]).toBeCloseTo((w0 ?? 0) / 4, 3);
  });

  it('la rueda también hace zoom', () => {
    const { frame, box } = renderZoomable(() => undefined);
    const [, , w0] = box();
    fireEvent.wheel(frame, { deltaY: -100 });
    expect(box()[2]).toBeLessThan(w0 ?? 0);
  });

  it('un toque corto elige la posición', () => {
    const onPick = vi.fn();
    const { container, frame, vertex } = renderZoomable(onPick);
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 101, clientY: 100 });
    fireEvent.click(container.querySelector(`[data-target-vertex="${vertex}"]`) as Element);
    expect(onPick).toHaveBeenCalledWith({ kind: 'vertex', id: vertex });
  });

  it('arrastrar el tablero no elige nada por accidente y sí lo desplaza', () => {
    const onPick = vi.fn();
    const { container, frame, vertex, box } = renderZoomable(onPick);
    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    const [x0, y0] = box();
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 260, clientY: 230 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 260, clientY: 230 });
    fireEvent.click(container.querySelector(`[data-target-vertex="${vertex}"]`) as Element);
    expect(onPick).not.toHaveBeenCalled();
    const [x1, y1] = box();
    expect(x1 !== x0 || y1 !== y0).toBe(true);
    // el siguiente toque vuelve a funcionar
    fireEvent.pointerDown(frame, { pointerId: 2, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(frame, { pointerId: 2, clientX: 50, clientY: 50 });
    fireEvent.click(container.querySelector(`[data-target-vertex="${vertex}"]`) as Element);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('el pellizco con dos dedos cambia el zoom', () => {
    const { frame, box } = renderZoomable(() => undefined);
    const [, , w0] = box();
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(frame, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(frame, { pointerId: 2, clientX: 300, clientY: 100 }); // separa los dedos ×2
    expect(box()[2]).toBeLessThan((w0 ?? 0) * 0.6);
    fireEvent.pointerUp(frame, { pointerId: 1 });
    fireEvent.pointerUp(frame, { pointerId: 2 });
  });
});

describe('cameraViewBox', () => {
  it('con zoom 2 la ventana mide la mitad y está centrada en la cámara', () => {
    const base = { x: -100, y: -50, w: 200, h: 100 };
    expect(cameraViewBox({ cx: 0, cy: 0, scale: 2 }, base)).toEqual({
      x: -50,
      y: -25,
      w: 100,
      h: 50,
    });
  });
});

describe('vista previa en el host', () => {
  function renderPreview(preview: { target: PreviewTarget; color: string } | null) {
    const view = hostView(setupGame());
    return render(
      <Board
        board={view.board}
        buildings={view.buildings}
        roads={view.roads}
        robber={view.robber}
        colorOf={() => 'c1'}
        locale="es"
        label="tablero"
        preview={preview}
      />,
    );
  }

  it('dibuja una marca sobre el vértice, la arista o el hexágono que se está eligiendo', () => {
    const view = hostView(setupGame());
    const vertex = Object.keys(view.board.topology.vertexById)[0] ?? '';
    const edge = Object.keys(view.board.topology.edgeById)[0] ?? '';
    const hex = view.board.topology.hexes[0]?.id ?? '';
    for (const [kind, id] of [
      ['vertex', vertex],
      ['edge', edge],
      ['hex', hex],
    ] as const) {
      const { container, unmount } = renderPreview({ target: { kind, id }, color: 'c2' });
      expect(container.querySelectorAll(`[data-preview="${kind}"]`)).toHaveLength(1);
      unmount();
    }
  });

  it('sin vista previa, o con un id desconocido, no dibuja nada', () => {
    expect(renderPreview(null).container.querySelectorAll('.preview-mark')).toHaveLength(0);
    cleanup();
    const unknown = renderPreview({ target: { kind: 'vertex', id: 'nope' }, color: 'c1' });
    expect(unknown.container.querySelectorAll('.preview-mark')).toHaveLength(0);
  });
});
