import { playerColor, playerMarkPath } from '@hexa/theme';

/**
 * Marca de un jugador: su color con su forma (círculo, cuadrado, triángulo o rombo). El color
 * nunca va solo, para que se distingan también quienes no ven bien los colores. Es decorativa:
 * el nombre del jugador o del color siempre está a su lado como texto.
 */
export function Swatch({
  color,
  large = false,
  taken = false,
}: {
  color: string;
  large?: boolean;
  taken?: boolean;
}) {
  const { fill, stroke } = playerColor(color);
  const classes = ['swatch', large ? 'swatch-lg' : '', taken ? 'taken' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <svg className={classes} viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true" focusable="false">
      <path
        d={playerMarkPath(color)}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
