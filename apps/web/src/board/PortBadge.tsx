import { glyphs, terrainColors } from '@hexa/theme';
import type { PortKind } from '@hexa/engine';
import type { LaidOutPort } from './geometry.js';

/** Puerto: insignia en el mar unida con dos amarras a los vértices de su arista. */
export function PortBadge({ port, kind }: { port: LaidOutPort; kind: PortKind }) {
  const { badge } = port;
  const specific = kind !== 'any';
  const colors = specific ? terrainColors[kind] : { fill: '#f4efe2', stroke: '#8b8470' };
  return (
    <g className="port" data-port={port.edge}>
      <g stroke="#d8e3ea" strokeWidth={2} strokeDasharray="4 3" opacity={0.85}>
        <line x1={port.a.x} y1={port.a.y} x2={badge.x} y2={badge.y} />
        <line x1={port.b.x} y1={port.b.y} x2={badge.x} y2={badge.y} />
      </g>
      <circle
        cx={badge.x}
        cy={badge.y}
        r={19}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={2.5}
      />
      {specific && (
        <path
          d={glyphs[kind]}
          transform={`translate(${badge.x - 7} ${badge.y - 15}) scale(0.58)`}
          fill={colors.stroke}
          opacity={0.9}
        />
      )}
      <text
        x={badge.x}
        y={badge.y + (specific ? 9 : 1)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={specific ? 10 : 12}
        fontWeight={700}
        fill="#2d2a22"
      >
        {specific ? '2:1' : '3:1'}
      </text>
    </g>
  );
}
