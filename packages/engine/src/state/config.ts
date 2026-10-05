import { BASE_MAP } from '../board/maps/index.js';
import type { GameConfig, PlayerId, RuleSet } from './types.js';

export const DEFAULT_RULES: RuleSet = {
  victoryPoints: 10,
  discardLimit: 7,
  avoidAdjacentHotNumbers: true,
  pieces: { roads: 15, settlements: 5, cities: 4 },
  bankStock: 19,
  devDeck: { army: 14, roads: 2, plenty: 2, monopoly: 2, point: 5 },
  minLongestRoad: 5,
  minLargestArmy: 3,
};

export function createConfig(
  players: readonly PlayerId[],
  overrides: Partial<Pick<GameConfig, 'map'>> & { rules?: Partial<RuleSet> } = {},
): GameConfig {
  return {
    players,
    map: overrides.map ?? BASE_MAP,
    rules: { ...DEFAULT_RULES, ...overrides.rules },
  };
}
