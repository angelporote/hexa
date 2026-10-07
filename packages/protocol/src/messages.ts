import { z } from 'zod';
import type { GameEvent, PlayerView } from '@hexa/engine';
import { actionSchema } from './action-schema.js';
import {
  MAX_NAME_LENGTH,
  MAX_TURN_TIMER_SECONDS,
  MIN_TURN_TIMER_SECONDS,
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
  // Sin `role` (o con `host`) crea una sala con pantalla principal; con `player` la crea un
  // jugador desde su navegador (juego a distancia) y queda como su administrador.
  'room:create': z
    .object({
      protocolVersion,
      role: z.enum(['host', 'player']).optional(),
      name: playerNameSchema.optional(),
      color: colorSchema.optional(),
    })
    .strict()
    .refine((m) => m.role !== 'player' || m.name !== undefined, {
      message: 'Un jugador necesita nombre',
      path: ['name'],
    }),
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
  // `null` quita el límite de tiempo.
  'lobby:setOptions': z
    .object({
      protocolVersion,
      turnTimerSeconds: z
        .number()
        .int()
        .min(MIN_TURN_TIMER_SECONDS)
        .max(MAX_TURN_TIMER_SECONDS)
        .nullable(),
    })
    .strict(),
  // El jugador sustituido por un bot recupera su asiento.
  'seat:return': z.object({ protocolVersion }).strict(),
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
  'lobby:setOptions': ack(empty),
  'seat:return': ack(empty),
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
  /** Jugador sustituido temporalmente por un bot (no respondió a tiempo); puede volver. */
  auto: z.boolean(),
});
export type Seat = z.infer<typeof seatSchema>;

export const roomStateSchema = z.object({
  code: roomCodeSchema,
  status: z.enum(['lobby', 'playing', 'ended']),
  hostConnected: z.boolean(),
  /** Sala a distancia: creada por un jugador, sin pantalla principal. */
  hostless: z.boolean(),
  seats: z.array(seatSchema).max(4),
  spectators: z.number().int().min(0),
  options: z.object({
    /** Segundos de inactividad tras los que un bot juega por quien debía mover; `null` = sin límite. */
    turnTimerSeconds: z.number().int().nullable(),
  }),
  /** `admin`: puede añadir bots y empezar la partida (la pantalla principal o el creador a distancia). */
  you: z.object({ role: roleSchema, playerId: z.string().nullable(), admin: z.boolean() }),
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

/** Quién está «en juego» (tiene que mover) y cuánto tiempo le queda; cada cliente lo cuenta con su reloj. */
export const turnClockSchema = z
  .object({
    actors: z.array(z.string()),
    remainingMs: z.number().int().min(0),
  })
  .strict();
export type TurnClock = z.infer<typeof turnClockSchema>;

export const serverMessageSchemas = {
  'room:state': roomStateSchema,
  'game:view': z
    .object({
      seq: z.number().int().min(0),
      view: viewSchema,
      /** `null` o ausente si no hay temporizador o nadie debe mover. */
      clock: turnClockSchema.nullable().optional(),
    })
    .strict(),
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
