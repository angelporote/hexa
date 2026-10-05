import type { ResourceCounts } from '../state/resources.js';

// Convención de recursos (los nombres reales viven en `packages/theme`):
// r1 = madera, r2 = arcilla, r3 = lana, r4 = cereal, r5 = mineral.
export const COSTS = {
  road: { r1: 1, r2: 1, r3: 0, r4: 0, r5: 0 },
  settlement: { r1: 1, r2: 1, r3: 1, r4: 1, r5: 0 },
  city: { r1: 0, r2: 0, r3: 0, r4: 2, r5: 3 },
  devCard: { r1: 0, r2: 0, r3: 1, r4: 1, r5: 1 },
} as const satisfies Record<string, ResourceCounts>;
