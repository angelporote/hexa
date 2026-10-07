import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { Board, useBoardLayout } from '../board/Board.js';
import type { BoardProps, Interaction, ViewBox } from '../board/Board.js';
import { useI18n } from '../i18n/index.js';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
/** Un gesto que se mueve más de esto (en píxeles) es un arrastre, no un toque. */
const DRAG_THRESHOLD = 8;

interface Camera {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
}

function clampCamera(camera: Camera, base: ViewBox): Camera {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.scale));
  const w = base.w / scale;
  const h = base.h / scale;
  return {
    scale,
    cx: Math.min(base.x + base.w - w / 2, Math.max(base.x + w / 2, camera.cx)),
    cy: Math.min(base.y + base.h - h / 2, Math.max(base.y + h / 2, camera.cy)),
  };
}

export function cameraViewBox(camera: Camera, base: ViewBox): ViewBox {
  const w = base.w / camera.scale;
  const h = base.h / camera.scale;
  return { x: camera.cx - w / 2, y: camera.cy - h / 2, w, h };
}

/**
 * Tablero con zoom (botones, rueda y pellizco) y desplazamiento arrastrando. Un toque corto
 * elige una posición; un arrastre no, para no elegir por accidente al mover el tablero.
 */
export function ZoomableBoard(
  props: Omit<BoardProps, 'viewBox' | 'interaction'> & { interaction?: Interaction },
) {
  const { interaction, ...boardProps } = props;
  const { t } = useI18n();
  const layout = useBoardLayout(props.board);
  const base = layout.viewBox;
  const [camera, setCamera] = useState<Camera>({
    cx: base.x + base.w / 2,
    cy: base.y + base.h / 2,
    scale: 1,
  });
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, pinchDistance: 0, pinchScale: 1 });

  const update = useCallback((next: Camera) => setCamera(clampCamera(next, base)), [base]);

  const view = cameraViewBox(camera, base);

  /** Unidades del dibujo por píxel de pantalla (el SVG se ajusta con `meet`). */
  const unitsPerPixel = (): number => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return 1;
    return Math.max(view.w / rect.width, view.h / rect.height);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { ...gesture.current, moved: false, startX: e.clientX, startY: e.clientY };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        ...gesture.current,
        moved: true,
        pinchDistance: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
        pinchScale: camera.scale,
      };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b && gesture.current.pinchDistance > 0) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        update({
          ...camera,
          scale: gesture.current.pinchScale * (distance / gesture.current.pinchDistance),
        });
      }
      return;
    }
    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;
    if (!gesture.current.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) gesture.current.moved = true;
    if (gesture.current.moved && camera.scale > 1) {
      const k = unitsPerPixel();
      update({
        ...camera,
        cx: camera.cx - (e.clientX - previous.x) * k,
        cy: camera.cy - (e.clientY - previous.y) * k,
      });
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    update({ ...camera, scale: camera.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15) });
  };

  const zoom = (factor: number) => update({ ...camera, scale: camera.scale * factor });
  const fit = () => update({ cx: base.x + base.w / 2, cy: base.y + base.h / 2, scale: 1 });

  const guarded: Interaction | undefined = interaction && {
    ...interaction,
    onPick: (target) => {
      if (!gesture.current.moved) interaction.onPick(target);
    },
  };

  return (
    <div className="zoom-board">
      <div
        ref={frame}
        className="zoom-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onWheel={onWheel}
      >
        <Board {...boardProps} viewBox={view} {...(guarded ? { interaction: guarded } : {})} />
      </div>
      <div className="zoom-controls">
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => zoom(1.5)}
          aria-label={t('ctl.zoomIn')}
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => zoom(1 / 1.5)}
          aria-label={t('ctl.zoomOut')}
        >
          −
        </button>
        <button type="button" className="btn btn-icon" onClick={fit} aria-label={t('ctl.zoomFit')}>
          ⤢
        </button>
      </div>
    </div>
  );
}
