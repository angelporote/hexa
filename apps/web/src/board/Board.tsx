import { useMemo } from 'react';
import { SEA_COLOR } from '@hexa/theme';
import type { Locale } from '@hexa/theme';
import type { PlayerView } from '@hexa/engine';
import { HexTile } from './HexTile.js';
import { PortBadge } from './PortBadge.js';
import { Building, Road, Robber } from './Pieces.js';
import { layoutBoard } from './geometry.js';

export interface BoardProps {
  board: PlayerView['board'];
  buildings: PlayerView['buildings'];
  roads: PlayerView['roads'];
  robber: PlayerView['robber'];
  /** Id de color (`c1`…) de cada jugador, para pintar sus piezas. */
  colorOf: (playerId: string) => string;
  locale: Locale;
  label: string;
}

/**
 * Tablero en SVG generado desde la vista: se adapta a cualquier resolución por su `viewBox`.
 * Solo dibuja; no decide nada de las reglas.
 */
export function Board({ board, buildings, roads, robber, colorOf, locale, label }: BoardProps) {
  const layout = useMemo(() => layoutBoard(board.topology, board.ports), [board]);
  const { x, y, w, h } = layout.viewBox;
  const robberHex = layout.hexes.find((hex) => hex.id === robber);

  return (
    <svg
      className="board"
      viewBox={`${x} ${y} ${w} ${h}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={x} y={y} width={w} height={h} fill={SEA_COLOR} rx={24} />
      {board.ports.map((port) => {
        const laid = layout.ports.find((p) => p.edge === port.edge);
        return laid ? <PortBadge key={port.edge} port={laid} kind={port.kind} /> : null;
      })}
      {layout.hexes.map((hex) => {
        const tile = board.hexes[hex.id];
        return tile ? <HexTile key={hex.id} hex={hex} tile={tile} locale={locale} /> : null;
      })}
      {Object.entries(roads).map(([edgeId, owner]) => {
        const edge = layout.edges[edgeId];
        return edge ? (
          <Road key={edgeId} id={edgeId} a={edge.a} b={edge.b} color={colorOf(owner)} />
        ) : null;
      })}
      {Object.entries(buildings).map(([vertexId, building]) => {
        const at = layout.vertices[vertexId];
        return at ? (
          <Building
            key={`${vertexId}-${building.kind}`}
            id={vertexId}
            at={at}
            kind={building.kind}
            color={colorOf(building.owner)}
          />
        ) : null;
      })}
      {robberHex && <Robber at={robberHex.center} />}
    </svg>
  );
}
