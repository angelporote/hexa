import type { GameState, PlayerId } from '../state/types.js';
import { totalCards } from '../state/resources.js';

/** Reacción a un 7: descartan quienes superan el límite; si nadie, se mueve el ladrón. */
export function startSeven(state: GameState): GameState {
  const owed: Record<PlayerId, number> = {};
  for (const p of state.players) {
    const cards = totalCards(p.hand);
    if (cards > state.config.rules.discardLimit) owed[p.id] = Math.floor(cards / 2);
  }
  if (Object.keys(owed).length > 0) return { ...state, phase: { type: 'discard', owed } };
  return { ...state, phase: { type: 'robber', returnTo: 'main' } };
}
