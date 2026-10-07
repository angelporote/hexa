import type { RuleError } from '@hexa/engine';

/** Errores de la capa de red y de salas; los de reglas del juego llegan como `RuleError`. */
export type ProtocolError =
  | 'UNKNOWN_MESSAGE'
  | 'INVALID_MESSAGE'
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'COLOR_TAKEN'
  | 'NOT_HOST'
  | 'NOT_A_PLAYER'
  | 'NOT_IN_ROOM'
  | 'ALREADY_IN_ROOM'
  | 'GAME_ALREADY_STARTED'
  | 'GAME_NOT_STARTED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_NOT_READY'
  | 'INVALID_SESSION'
  | 'HOST_ALREADY_PRESENT'
  | 'SESSION_REPLACED'
  | 'NOT_A_BOT'
  | 'NO_CLOCK'
  | 'SERVER_ERROR';

export type ErrorCode = ProtocolError | RuleError;
