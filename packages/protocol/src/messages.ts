import { z } from 'zod';
import type { GameEvent, PlayerView } from '@hexa/engine';
import { actionSchema } from './action-schema.js';
import {
  MAX_NAME_LENGTH,
  PLAYER_COLORS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './constants.js';

// ── Piezas comunes ───────────────────────────────────────────────────────────────────────

const protocolVersion = z.number().int();

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`));

export const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NAME_LENGTH)
  .regex(/^[^\p{C}]+$/u); // sin caracteres de control ni invisibles

export const colorSchema = z.enum(PLAYER_COLORS);
export const roleSchema = z.enum(['host', 'player', 'spectator']);
export type Role = z.infer<typeof roleSchema>;

/** Token secreto de asiento: lo guarda el cliente para reconectar. */
export const tokenSchema = z.string().min(16).max(128);

/** Elemento del tablero que un jugador está a punto de elegir (se enseña a los demás). */
export const previewTargetSchema = z
  .object({ kind: z.enum(['vertex', 'edge', 'hex']), id: z.string().min(1).max(32) })
  .strict();
export type PreviewTarget = z.infer<typeof previewTargetSchema>;

// ── Cliente → servidor ───────────────────────────────────────────────────────────────────

export const clientMessageSchemas = {
  'room:create': z.object({ protocolVersion }).strict(),
  'room:join': z
    .object({
      protocolVersion,
      code: roomCodeSchema,
      role: z.enum(['player', 'spectator']),
      name: playerNameSchema.optional(),
      color: colorSchema.optional(),
    })
    .strict()
    .refine((m) => m.role !== 'player' || m.name !== undefined, {
      message: 'Un jugador necesita nombre',
      path: ['name'],
    }),
  'room:leave': z.object({ protocolVersion }).strict(),
  'lobby:update': z
    .object({
      protocolVersion,
      name: playerNameSchema.optional(),
      color: colorSchema.optional(),
      ready: z.boolean().optional(),
    })
    .strict()
    .refine((m) => m.name !== undefined || m.color !== undefined || m.ready !== undefined, {
      message: 'No hay nada que actualizar',
    }),
  'lobby:start': z.object({ protocolVersion }).strict(),
  'lobby:addBot': z.object({ protocolVersion }).strict(),
  'lobby:removeBot': z.object({ protocolVersion, playerId: z.string().min(1).max(32) }).strict(),
  'game:action': z.object({ protocolVersion, action: actionSchema }).strict(),
  'game:preview': z.object({ protocolVersion, target: previewTargetSchema.nullable() }).strict(),
  'session:resume': z
    .object({ protocolVersion, code: roomCodeSchema, token: tokenSchema })
    .strict(),
} as const;

export type ClientEventName = keyof typeof clientMessageSchemas;
export const CLIENT_EVENTS = Object.keys(clientMessageSchemas) as ClientEventName[];

export type ClientPayloads = {
  [K in ClientEventName]: z.infer<(typeof clientMessageSchemas)[K]>;
};

/** Mensaje de cliente ya validado, con el nombre del evento como discriminante. */
export type ClientMessage = {
  [K in ClientEventName]: { event: K; payload: ClientPayloads[K] };
}[ClientEventName];

// ── Respuestas (ack) ─────────────────────────────────────────────────────────────────────

const sessionData = z.object({
  code: roomCodeSchema,
  token: tokenSchema,
  role: roleSchema,
  playerId: z.string().nullable(),
});
export type SessionData = z.infer<typeof sessionData>;

const errorCodeSchema = z.string().min(1).max(64);

function ack<T extends z.ZodType>(data: T) {
  return z.union([
    z
      .object({ ok: z.literal(true) })
      .extend({ data })
      .strict(),
    z.object({ ok: z.literal(false), error: errorCodeSchema }).strict(),
  ]);
}

const empty = z.object({}).strict();

export const ackSchemas = {
  'room:create': ack(sessionData),
  'room:join': ack(sessionData),
  'room:leave': ack(empty),
  'lobby:update': ack(empty),
  'lobby:start': ack(empty),
  'lobby:addBot': ack(empty),
  'lobby:removeBot': ack(empty),
  'game:action': ack(empty),
  'game:preview': ack(empty),
  'session:resume': ack(sessionData),
} as const satisfies Record<ClientEventName, z.ZodType>;

export type AckFor<K extends ClientEventName> = z.infer<(typeof ackSchemas)[K]>;

// ── Servidor → cliente ───────────────────────────────────────────────────────────────────

export const seatSchema = z.object({
  playerId: z.string(),
  name: playerNameSchema,
  color: colorSchema,
  ready: z.boolean(),
  connected: z.boolean(),
  /** Asiento controlado por el servidor. */
  bot: z.boolean(),
});
export type Seat = z.infer<typeof seatSchema>;

export const roomStateSchema = z.object({
  code: roomCodeSchema,
  status: z.enum(['lobby', 'playing', 'ended']),
  hostConnected: z.boolean(),
  seats: z.array(seatSchema).max(4),
  spectators: z.number().int().min(0),
  you: z.object({ role: roleSchema, playerId: z.string().nullable() }),
});
export type RoomState = z.infer<typeof roomStateSchema>;

// La vista y los eventos derivan de tipos del motor; aquí solo se comprueba su forma básica,
// porque el servidor es quien los genera y el cliente confía en él.
const viewSchema = z.custom<PlayerView>(
  (v) => typeof v === 'object' && v !== null && 'phase' in v && 'board' in v && 'legalActions' in v,
);
const eventsSchema = z.custom<GameEvent[]>(
  (v) => Array.isArray(v) && v.every((e) => typeof e === 'object' && e !== null && 'type' in e),
);

export const serverMessageSchemas = {
  'room:state': roomStateSchema,
  'game:view': z.object({ seq: z.number().int().min(0), view: viewSchema }).strict(),
  'game:events': z.object({ seq: z.number().int().min(0), events: eventsSchema }).strict(),
  'game:preview': z
    .object({ playerId: z.string(), target: previewTargetSchema.nullable() })
    .strict(),
  error: z.object({ error: errorCodeSchema, detail: z.string().max(200).optional() }).strict(),
} as const;

export type ServerEventName = keyof typeof serverMessageSchemas;
export const SERVER_EVENTS = Object.keys(serverMessageSchemas) as ServerEventName[];

export type ServerPayloads = {
  [K in ServerEventName]: z.infer<(typeof serverMessageSchemas)[K]>;
};
