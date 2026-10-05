/** Versión del protocolo; todo mensaje del cliente la lleva. Súbela al romper la compatibilidad. */
export const PROTOCOL_VERSION = 1;

/** Letras de los códigos de sala: sin las que se confunden entre sí (I, L, O, Q, U). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPRSTVWXYZ';
export const ROOM_CODE_LENGTH = 4;

/** Colores de jugador con ids neutros; el aspecto real lo decide `packages/theme`. */
export const PLAYER_COLORS = ['c1', 'c2', 'c3', 'c4'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 2;
export const MAX_NAME_LENGTH = 20;

/** Tamaño máximo de un mensaje entrante, en bytes (lo aplica el servidor al abrir el socket). */
export const MAX_MESSAGE_BYTES = 8 * 1024;
