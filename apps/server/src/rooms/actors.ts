import type { GameState, PlayerId } from '@hexa/engine';

/**
 * Quién tiene que mover para que la partida avance: quienes deben descartar o, en cualquier otra
 * fase, el jugador de turno (colocación, tirada, ladrón, carreteras y fase principal). Las
 * respuestas a ofertas de comercio son opcionales y no cuentan: no frenan la partida.
 */
export function requiredActors(state: GameState): PlayerId[] {
  switch (state.phase.type) {
    case 'ended':
      return [];
    case 'discard':
      return Object.keys(state.phase.owed);
    default:
      return [state.turn.player];
  }
}
