import { playerColor, playerMarkPath, playerRoadDash } from '@hexa/theme';
import type { Point } from './geometry.js';

const SETTLEMENT = 'M-9 8 V-2 L0 -11 L9 -2 V8 Z';
const CITY = 'M-13 9 V0 H-4 V-9 L2 -15 L8 -9 V0 H13 V9 Z';

/** Dónde va la forma del jugador dentro de cada edificio: centro y escala (el trazado va de −1 a 1). */
const MARK_ON = {
  settlement: { x: 0, y: 2.5, scale: 3.8 },
  city: { x: 0, y: 4.5, scale: 3.4 },
} as const;

/** Poblado o ciudad sobre un vértice, con el color del jugador y su forma dentro. */
export function Building({
  at,
  kind,
  color,
  id,
}: {
  at: Point;
  kind: 'settlement' | 'city';
  color: string;
  id: string;
}) {
  const swatch = playerColor(color);
  return (
    <g className="pop" transform={`translate(${at.x} ${at.y})`} data-building={id}>
      <path
        d={kind === 'city' ? CITY : SETTLEMENT}
        fill={swatch.fill}
        stroke="#fff"
        strokeWidth={2.4}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
      <path
        d={kind === 'city' ? CITY : SETTLEMENT}
        fill="none"
        stroke={swatch.stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path
        className="piece-mark"
        d={playerMarkPath(color)}
        transform={`translate(${MARK_ON[kind].x} ${MARK_ON[kind].y}) scale(${MARK_ON[kind].scale})`}
        fill="#fff"
        stroke={swatch.stroke}
        strokeWidth={0.35}
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * Camino sobre una arista, algo recortado en los extremos para no tapar los edificios. Lleva una
 * línea central con un trazo propio de cada jugador, para distinguirlos sin depender del color.
 */
export function Road({ a, b, color, id }: { a: Point; b: Point; color: string; id: string }) {
  const swatch = playerColor(color);
  const dash = playerRoadDash(color);
  const trim = 0.16;
  const x1 = a.x + (b.x - a.x) * trim;
  const y1 = a.y + (b.y - a.y) * trim;
  const x2 = b.x + (a.x - b.x) * trim;
  const y2 = b.y + (a.y - b.y) * trim;
  return (
    <g className="pop" data-road={id}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={11} strokeLinecap="round" />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={swatch.stroke}
        strokeWidth={9}
        strokeLinecap="round"
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={swatch.fill}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line
        className="road-pattern"
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#fff"
        strokeWidth={1.8}
        strokeOpacity={0.95}
        {...(dash ? { strokeDasharray: dash } : {})}
      />
    </g>
  );
}

/** Ladrón: peón oscuro con contorno claro, colocado en la parte baja del hexágono. */
export function Robber({ at }: { at: Point }) {
  return (
    <g className="robber" transform={`translate(${at.x - 22} ${at.y + 16})`} aria-label="robber">
      <path
        d="M0 -14 a6.5 6.5 0 1 0 0.01 0 Z M-9 14 Q-9 2 0 -1 Q9 2 9 14 Z"
        fill="#262a33"
        stroke="#fff"
        strokeWidth={2}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </g>
  );
}
