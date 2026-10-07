import { playerColor } from '@hexa/theme';
import type { Point } from './geometry.js';
import { polygonPoints } from './geometry.js';

/** Posición legal sobre un vértice: se puede tocar. `r` amplía la zona táctil. */
export function VertexTarget({
  at,
  selected,
  color,
  id,
  onPick,
}: {
  at: Point;
  selected: boolean;
  color: string;
  id: string;
  onPick: () => void;
}) {
  const swatch = playerColor(color);
  return (
    <g className={selected ? 'target selected' : 'target'} data-target-vertex={id} onClick={onPick}>
      <circle cx={at.x} cy={at.y} r={28} fill="transparent" />
      <circle
        className="target-ring"
        cx={at.x}
        cy={at.y}
        r={selected ? 13 : 10}
        fill={selected ? swatch.fill : 'rgb(255 255 255 / 35%)'}
        stroke={selected ? '#fff' : '#fff'}
        strokeWidth={selected ? 3.5 : 2.5}
      />
    </g>
  );
}

/** Posición legal sobre una arista. */
export function EdgeTarget({
  a,
  b,
  selected,
  color,
  id,
  onPick,
}: {
  a: Point;
  b: Point;
  selected: boolean;
  color: string;
  id: string;
  onPick: () => void;
}) {
  const swatch = playerColor(color);
  return (
    <g className={selected ? 'target selected' : 'target'} data-target-edge={id} onClick={onPick}>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="transparent"
        strokeWidth={26}
        strokeLinecap="round"
      />
      <line
        className="target-ring"
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={selected ? swatch.fill : 'rgb(255 255 255 / 55%)'}
        strokeWidth={selected ? 10 : 7}
        strokeLinecap="round"
      />
      {selected && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#fff"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.85}
        />
      )}
    </g>
  );
}

/** Hexágono elegible (por ejemplo, para mover el ladrón). */
export function HexTarget({
  corners,
  selected,
  color,
  id,
  onPick,
}: {
  corners: readonly Point[];
  selected: boolean;
  color: string;
  id: string;
  onPick: () => void;
}) {
  const swatch = playerColor(color);
  return (
    <g className={selected ? 'target selected' : 'target'} data-target-hex={id} onClick={onPick}>
      <polygon
        className="target-ring"
        points={polygonPoints(corners)}
        fill={selected ? swatch.fill : 'rgb(255 255 255 / 18%)'}
        fillOpacity={selected ? 0.5 : 1}
        stroke="#fff"
        strokeWidth={selected ? 5 : 3}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Marca que enseña en el host lo que el jugador de turno está a punto de elegir. */
export function PreviewMark({
  target,
  color,
  layout,
}: {
  target: { kind: 'vertex' | 'edge' | 'hex'; id: string };
  color: string;
  layout: {
    vertices: Readonly<Record<string, Point>>;
    edges: Readonly<Record<string, { a: Point; b: Point }>>;
    hexes: readonly { id: string; corners: readonly Point[] }[];
  };
}) {
  const swatch = playerColor(color);
  if (target.kind === 'vertex') {
    const at = layout.vertices[target.id];
    if (!at) return null;
    return (
      <circle
        className="preview-mark"
        data-preview="vertex"
        cx={at.x}
        cy={at.y}
        r={15}
        fill="none"
        stroke={swatch.fill}
        strokeWidth={5}
      />
    );
  }
  if (target.kind === 'edge') {
    const edge = layout.edges[target.id];
    if (!edge) return null;
    return (
      <line
        className="preview-mark"
        data-preview="edge"
        x1={edge.a.x}
        y1={edge.a.y}
        x2={edge.b.x}
        y2={edge.b.y}
        stroke={swatch.fill}
        strokeWidth={11}
        strokeLinecap="round"
      />
    );
  }
  const hex = layout.hexes.find((h) => h.id === target.id);
  if (!hex) return null;
  return (
    <polygon
      className="preview-mark"
      data-preview="hex"
      points={polygonPoints(hex.corners)}
      fill={swatch.fill}
      fillOpacity={0.28}
      stroke={swatch.fill}
      strokeWidth={6}
      strokeLinejoin="round"
    />
  );
}
