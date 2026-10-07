import { glyphs, terrainColors, terrainName } from '@hexa/theme';
import type { Locale } from '@hexa/theme';
import type { BoardHex } from '@hexa/engine';
import { HEX_SIZE, pips, polygonPoints } from './geometry.js';
import type { LaidOutHex } from './geometry.js';

const GLYPH_SCALE = (HEX_SIZE * 0.42) / 24;

/** Hexágono de terreno con su icono y, si produce, su ficha numérica con puntos de probabilidad. */
export function HexTile({
  hex,
  tile,
  locale,
  pulse = false,
}: {
  hex: LaidOutHex;
  tile: BoardHex;
  locale: Locale;
  /** Late un momento: es uno de los hexágonos que producen con la última tirada. */
  pulse?: boolean;
}) {
  const { center } = hex;
  const colors = terrainColors[tile.terrain];
  const hot = tile.number === 6 || tile.number === 8;
  const tokenY = center.y + HEX_SIZE * 0.2;

  return (
    <g className={pulse ? 'hex pulse' : 'hex'} data-hex={hex.id}>
      <title>
        {terrainName(locale, tile.terrain)}
        {tile.number === null ? '' : ` · ${tile.number}`}
      </title>
      <polygon
        points={polygonPoints(hex.corners)}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d={glyphs[tile.terrain]}
        transform={`translate(${center.x - 12 * GLYPH_SCALE} ${center.y - HEX_SIZE * 0.74}) scale(${GLYPH_SCALE})`}
        fill={colors.stroke}
        opacity={0.55}
      />
      {tile.number !== null && (
        <g>
          <circle
            cx={center.x}
            cy={tokenY}
            r={HEX_SIZE * 0.3}
            fill="#f8f1de"
            stroke="#7a6a45"
            strokeWidth={1.5}
          />
          <text
            x={center.x}
            y={tokenY - 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={HEX_SIZE * 0.3}
            fontWeight={700}
            fill={hot ? '#c0392b' : '#2d2a22'}
          >
            {tile.number}
          </text>
          <g fill={hot ? '#c0392b' : '#2d2a22'}>
            {Array.from({ length: pips(tile.number) }, (_, i) => {
              const total = pips(tile.number ?? 0);
              const gap = 4.2;
              return (
                <circle
                  key={i}
                  cx={center.x + (i - (total - 1) / 2) * gap}
                  cy={tokenY + HEX_SIZE * 0.2}
                  r={1.3}
                />
              );
            })}
          </g>
        </g>
      )}
    </g>
  );
}
