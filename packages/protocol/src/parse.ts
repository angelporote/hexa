import { err, ok } from '@hexa/engine';
import type { Result } from '@hexa/engine';
import { PROTOCOL_VERSION } from './constants.js';
import type { ProtocolError } from './errors.js';
import { CLIENT_EVENTS, clientMessageSchemas } from './messages.js';
import type { ClientEventName, ClientMessage } from './messages.js';

function isClientEvent(event: string): event is ClientEventName {
  return (CLIENT_EVENTS as string[]).includes(event);
}

/**
 * Valida un mensaje entrante antes de que nadie lo procese: evento conocido, versión del
 * protocolo coincidente y forma correcta. Los mensajes inválidos se descartan.
 */
export function parseClientMessage(
  event: string,
  payload: unknown,
): Result<ClientMessage, ProtocolError> {
  if (!isClientEvent(event)) return err('UNKNOWN_MESSAGE');
  if (typeof payload !== 'object' || payload === null) return err('INVALID_MESSAGE');
  const version = (payload as { protocolVersion?: unknown }).protocolVersion;
  if (typeof version !== 'number') return err('INVALID_MESSAGE');
  if (version !== PROTOCOL_VERSION) return err('PROTOCOL_VERSION_MISMATCH');

  const parsed = clientMessageSchemas[event].safeParse(payload);
  if (!parsed.success) return err('INVALID_MESSAGE');
  // El tipo exacto lo garantiza el esquema elegido por `event`.
  return ok({ event, payload: parsed.data } as ClientMessage);
}
