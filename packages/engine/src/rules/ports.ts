import { RESOURCE_IDS } from '../board/types.js';
import type { ResourceId } from '../board/types.js';
import type { GameState, PlayerId } from '../state/types.js';

const BANK_RATIO = 4;
const GENERAL_PORT_RATIO = 3;
const SPECIFIC_PORT_RATIO = 2;

/** Cartas que `player` debe entregar al banco por cada carta de cada recurso. */
export function tradeRatios(state: GameState, player: PlayerId): Record<ResourceId, number> {
  const ratios: Record<ResourceId, number> = { r1: 4, r2: 4, r3: 4, r4: 4, r5: 4 };
  for (const port of state.board.ports) {
    const owns = port.vertices.some((v) => state.buildings[v]?.owner === player);
    if (!owns) continue;
    if (port.kind === 'any') {
      for (const r of RESOURCE_IDS) ratios[r] = Math.min(ratios[r], GENERAL_PORT_RATIO);
    } else {
      ratios[port.kind] = Math.min(ratios[port.kind], SPECIFIC_PORT_RATIO);
    }
  }
  return ratios;
}

export { BANK_RATIO };
