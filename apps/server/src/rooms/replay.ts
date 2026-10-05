import { applyAction, createGame } from '@hexa/engine';
import type { GameConfig, GameState, LogEntry } from '@hexa/engine';

/**
 * Reconstruye una partida desde su semilla, configuración y lista de acciones. El motor es
 * determinista, así que el resultado es idéntico al estado original; sirve para depurar,
 * recuperar salas tras un reinicio y comprobar la instantánea guardada.
 */
export function replayGame(record: {
  readonly seed: string;
  readonly config: GameConfig;
  readonly actions: readonly LogEntry[];
}): GameState {
  let state = createGame(record.config, record.seed);
  record.actions.forEach((entry, index) => {
    const result = applyAction(state, entry.player, entry.action);
    if (!result.ok) {
      throw new Error(
        `La acción ${index} (${entry.action.type} de ${entry.player}) falla: ${result.error}`,
      );
    }
    state = result.value.state;
  });
  return state;
}
