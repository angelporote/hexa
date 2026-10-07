import { useMemo } from 'react';
import { SEA_COLOR } from '@hexa/theme';
import type { Locale } from '@hexa/theme';
import type { PlayerView } from '@hexa/engine';
import type { PreviewTarget } from '@hexa/protocol';
import { HexTile } from './HexTile.js';
import { PortBadge } from './PortBadge.js';
import { Building, Road, Robber } from './Pieces.js';
import { EdgeTarget, HexTarget, PreviewMark, VertexTarget } from './Overlays.js';
import { layoutBoard } from './geometry.js';
import type { BoardLayout } from './geometry.js';

export type ViewBox = BoardLayout['viewBox'];

/** Posiciones que se pueden tocar (mando móvil). */
export interface Interaction {
  readonly vertices?: ReadonlySet<string>;
  readonly edges?: ReadonlySet<string>;
  readonly hexes?: ReadonlySet<string>;
  readonly selected: PreviewTarget | null;
  /** Color (`c1`…) del jugador que elige, para pintar su selección. */
  readonly color: string;
  readonly onPick: (target: PreviewTarget) => void;
}

export interface BoardProps {
  board: PlayerView['board'];
  buildings: PlayerView['buildings'];
  roads: PlayerView['roads'];
  robber: PlayerView['robber'];
  /** Id de color (`c1`…) de cada jugador, para pintar sus piezas. */
  colorOf: (playerId: string) => string;
  locale: Locale;
  label: string;
  /** Zona visible; por defecto, el tablero entero. Permite el zoom del mando móvil. */
  viewBox?: ViewBox;
  /** Posiciones elegibles; si se omite, el tablero es solo de lectura. */
  interaction?: Interaction;
  /** Lo que está a punto de elegir el jugador de turno (se muestra en el host). */
  preview?: { target: PreviewTarget; color: string } | null;
  /** Ficha de la última tirada: sus hexágonos laten un momento (salvo el que tapa el ladrón). */
  highlight?: number | null;
}

/** Disposición del tablero a partir de la vista; separada para reutilizarla en el zoom. */
export function useBoardLayout(board: PlayerView['board']): BoardLayout {
  return useMemo(() => layoutBoard(board.topology, board.ports), [board]);
}

/**
 * Tablero en SVG generado desde la vista: se adapta a cualquier resolución por su `viewBox`.
 * Solo dibuja; no decide nada de las reglas.
 */
export function Board({
  board,
  buildings,
  roads,
  robber,
  colorOf,
  locale,
  label,
  viewBox,
  interaction,
  preview,
  highlight = null,
}: BoardProps) {
  const layout = useBoardLayout(board);
  const { x, y, w, h } = viewBox ?? layout.viewBox;
  const base = layout.viewBox;
  const robberHex = layout.hexes.find((hex) => hex.id === robber);
  const isSelected = (kind: PreviewTarget['kind'], id: string) =>
    interaction?.selected?.kind === kind && interaction.selected.id === id;

  return (
    <svg
      className="board"
      viewBox={`${x} ${y} ${w} ${h}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={base.x} y={base.y} width={base.w} height={base.h} fill={SEA_COLOR} rx={24} />
      {board.ports.map((port) => {
        const laid = layout.ports.find((p) => p.edge === port.edge);
        return laid ? <PortBadge key={port.edge} port={laid} kind={port.kind} /> : null;
      })}
      {layout.hexes.map((hex) => {
        const tile = board.hexes[hex.id];
        return tile ? (
          <HexTile
            key={hex.id}
            hex={hex}
            tile={tile}
            locale={locale}
            pulse={highlight !== null && tile.number === highlight && hex.id !== robber}
          />
        ) : null;
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

      {interaction?.hexes &&
        layout.hexes
          .filter((hex) => interaction.hexes?.has(hex.id))
          .map((hex) => (
            <HexTarget
              key={hex.id}
              id={hex.id}
              corners={hex.corners}
              selected={isSelected('hex', hex.id)}
              color={interaction.color}
              onPick={() => interaction.onPick({ kind: 'hex', id: hex.id })}
            />
          ))}
      {interaction?.edges &&
        [...interaction.edges].map((id) => {
          const edge = layout.edges[id];
          return edge ? (
            <EdgeTarget
              key={id}
              id={id}
              a={edge.a}
              b={edge.b}
              selected={isSelected('edge', id)}
              color={interaction.color}
              onPick={() => interaction.onPick({ kind: 'edge', id })}
            />
          ) : null;
        })}
      {interaction?.vertices &&
        [...interaction.vertices].map((id) => {
          const at = layout.vertices[id];
          return at ? (
            <VertexTarget
              key={id}
              id={id}
              at={at}
              selected={isSelected('vertex', id)}
              color={interaction.color}
              onPick={() => interaction.onPick({ kind: 'vertex', id })}
            />
          ) : null;
        })}

      {preview && <PreviewMark target={preview.target} color={preview.color} layout={layout} />}
    </svg>
  );
}
