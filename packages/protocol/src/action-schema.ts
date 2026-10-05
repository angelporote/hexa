import { RESOURCE_IDS } from '@hexa/engine';
import type { Action } from '@hexa/engine';
import { z } from 'zod';

const id = z.string().min(1).max(32);
const resource = z.enum(RESOURCE_IDS);
const counts = z
  .object({
    r1: z.number().int().min(0).max(99),
    r2: z.number().int().min(0).max(99),
    r3: z.number().int().min(0).max(99),
    r4: z.number().int().min(0).max(99),
    r5: z.number().int().min(0).max(99),
  })
  .strict();

/** Esquema de las intenciones del jugador; el motor decide después si son legales. */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ROLL') }).strict(),
  z.object({ type: z.literal('BUILD_ROAD'), edge: id }).strict(),
  z.object({ type: z.literal('BUILD_SETTLEMENT'), vertex: id }).strict(),
  z.object({ type: z.literal('BUILD_CITY'), vertex: id }).strict(),
  z.object({ type: z.literal('BUY_DEV_CARD') }).strict(),
  z.object({ type: z.literal('PLAY_ARMY') }).strict(),
  z.object({ type: z.literal('PLAY_ROADS') }).strict(),
  z.object({ type: z.literal('PLAY_PLENTY'), resources: z.tuple([resource, resource]) }).strict(),
  z.object({ type: z.literal('PLAY_MONOPOLY'), resource }).strict(),
  z.object({ type: z.literal('DISCARD'), resources: counts }).strict(),
  z.object({ type: z.literal('MOVE_ROBBER'), hex: id, victim: id.nullable() }).strict(),
  z.object({ type: z.literal('BANK_TRADE'), give: resource, want: resource }).strict(),
  z
    .object({
      type: z.literal('OFFER_TRADE'),
      to: z.array(id).max(3).nullable(),
      give: counts,
      want: counts,
    })
    .strict(),
  z.object({ type: z.literal('ACCEPT_TRADE'), offerId: z.number().int().min(1) }).strict(),
  z.object({ type: z.literal('REJECT_TRADE'), offerId: z.number().int().min(1) }).strict(),
  z.object({ type: z.literal('CANCEL_TRADE'), offerId: z.number().int().min(1) }).strict(),
  z
    .object({ type: z.literal('CONFIRM_TRADE'), offerId: z.number().int().min(1), with: id })
    .strict(),
  z.object({ type: z.literal('END_TURN') }).strict(),
]);

// Comprobación en compilación: lo que valida el esquema es siempre una acción del motor.
type Assert<T extends true> = T;
export type ActionSchemaMatchesEngine = Assert<
  z.infer<typeof actionSchema> extends Action ? true : false
>;
