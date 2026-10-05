const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

function Die({ value }: { value: number }) {
  return (
    <svg className="die" viewBox="0 0 40 40" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="36"
        height="36"
        rx="8"
        fill="#f8f4ea"
        stroke="#9c9480"
        strokeWidth="2"
      />
      {(PIPS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={11 + cx * 9} cy={11 + cy * 9} r="3.2" fill="#2d2a22" />
      ))}
    </svg>
  );
}

/** Dos dados que se «lanzan» con una animación cada vez que cambia `rollKey`. */
export function Dice({
  dice,
  rollKey,
  label,
}: {
  dice: readonly [number, number];
  rollKey: number;
  label: string;
}) {
  return (
    <div className="dice" role="img" aria-label={label} key={rollKey}>
      <span className="die-wrap die-a">
        <Die value={dice[0]} />
      </span>
      <span className="die-wrap die-b">
        <Die value={dice[1]} />
      </span>
    </div>
  );
}
