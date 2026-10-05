import { RESOURCE_IDS } from '../board/types.js';
import type { ResourceId } from '../board/types.js';

export type ResourceCounts = Readonly<Record<ResourceId, number>>;

export function emptyCounts(): Record<ResourceId, number> {
  return { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
}

export function countsOf(partial: Partial<Record<ResourceId, number>>): Record<ResourceId, number> {
  return { ...emptyCounts(), ...partial };
}

export function totalCards(counts: ResourceCounts): number {
  return RESOURCE_IDS.reduce((sum, id) => sum + counts[id], 0);
}

/** `have` cubre `need` en todos los recursos. */
export function covers(have: ResourceCounts, need: ResourceCounts): boolean {
  return RESOURCE_IDS.every((id) => have[id] >= need[id]);
}

export function addCounts(a: ResourceCounts, b: ResourceCounts): Record<ResourceId, number> {
  const out = emptyCounts();
  for (const id of RESOURCE_IDS) out[id] = a[id] + b[id];
  return out;
}

/** Resta sin comprobar; usar antes `covers`. */
export function subCounts(a: ResourceCounts, b: ResourceCounts): Record<ResourceId, number> {
  const out = emptyCounts();
  for (const id of RESOURCE_IDS) out[id] = a[id] - b[id];
  return out;
}

/** Los valores son enteros no negativos. */
export function isValidCounts(counts: ResourceCounts): boolean {
  return RESOURCE_IDS.every((id) => Number.isInteger(counts[id]) && counts[id] >= 0);
}
