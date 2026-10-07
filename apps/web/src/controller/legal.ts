import type { Action, PlayerView, ResourceCounts, ResourceId } from '@hexa/engine';

// Todo lo que el mando enseña y permite sale de `view.legalActions`: la interfaz no decide qué
// es legal, solo organiza las opciones que el servidor ya validó con el motor.

type Of<T extends Action['type']> = Extract<Action, { type: T }>;

export function ofType<T extends Action['type']>(legal: readonly Action[], type: T): Of<T>[] {
  return legal.filter((a): a is Of<T> => a.type === type);
}

export function has(legal: readonly Action[], type: Action['type']): boolean {
  return legal.some((a) => a.type === type);
}

export function legalVertices(
  legal: readonly Action[],
  type: 'BUILD_SETTLEMENT' | 'BUILD_CITY',
): Set<string> {
  return new Set(ofType(legal, type).map((a) => a.vertex));
}

export function legalEdges(legal: readonly Action[]): Set<string> {
  return new Set(ofType(legal, 'BUILD_ROAD').map((a) => a.edge));
}

/** Hexágonos donde se puede mover el ladrón, con las víctimas posibles de cada uno. */
export function robberOptions(legal: readonly Action[]): Map<string, (string | null)[]> {
  const options = new Map<string, (string | null)[]>();
  for (const a of ofType(legal, 'MOVE_ROBBER')) {
    options.set(a.hex, [...(options.get(a.hex) ?? []), a.victim]);
  }
  return options;
}

export function sameCounts(a: ResourceCounts, b: ResourceCounts): boolean {
  return (Object.keys(a) as ResourceId[]).every((r) => a[r] === b[r]);
}

export function findDiscard(legal: readonly Action[], counts: ResourceCounts): Action | undefined {
  return ofType(legal, 'DISCARD').find((a) => sameCounts(a.resources, counts));
}

export function findBankTrade(
  legal: readonly Action[],
  give: ResourceId,
  want: ResourceId,
): Action | undefined {
  return ofType(legal, 'BANK_TRADE').find((a) => a.give === give && a.want === want);
}

/** Cartas de abundancia: el orden de los dos recursos da igual. */
export function findPlenty(
  legal: readonly Action[],
  a: ResourceId,
  b: ResourceId,
): Action | undefined {
  return ofType(legal, 'PLAY_PLENTY').find(
    (x) =>
      (x.resources[0] === a && x.resources[1] === b) ||
      (x.resources[0] === b && x.resources[1] === a),
  );
}

/** Colocaciones que obligan al jugador a elegir un sitio del tablero. */
export type ForcedMode =
  | { readonly kind: 'settlement' }
  | { readonly kind: 'road'; readonly remaining: number | null }
  | { readonly kind: 'robber' }
  | { readonly kind: 'discard'; readonly owed: number };

/** Lo que el jugador debe hacer ahora sí o sí, según la fase (o `null` si es libre). */
export function forcedMode(view: PlayerView): ForcedMode | null {
  const me = view.you?.id;
  if (!me) return null;
  const legal = view.legalActions;
  const { phase } = view;

  if (phase.type === 'discard') {
    const owed = phase.owed[me];
    return owed !== undefined && has(legal, 'DISCARD') ? { kind: 'discard', owed } : null;
  }
  if (view.turn.player !== me) return null;
  if (phase.type === 'setup') {
    if (has(legal, 'BUILD_SETTLEMENT')) return { kind: 'settlement' };
    if (has(legal, 'BUILD_ROAD')) return { kind: 'road', remaining: null };
    return null;
  }
  if (phase.type === 'roadBuilding' && has(legal, 'BUILD_ROAD')) {
    return { kind: 'road', remaining: phase.remaining };
  }
  if (phase.type === 'robber' && has(legal, 'MOVE_ROBBER')) return { kind: 'robber' };
  return null;
}

export function isMyTurn(view: PlayerView): boolean {
  return view.you !== null && view.turn.player === view.you.id;
}
