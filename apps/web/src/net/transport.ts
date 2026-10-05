import { io } from 'socket.io-client';
import type { ServerEventName } from '@hexa/protocol';

/** Lo mínimo que necesita la conexión del servidor; permite sustituirlo por uno falso en tests. */
export interface Transport {
  connect(): void;
  close(): void;
  onConnect(callback: () => void): void;
  onDisconnect(callback: () => void): void;
  onServerEvent(event: ServerEventName, callback: (payload: unknown) => void): void;
  /** Envía un mensaje y espera su respuesta; rechaza si no llega a tiempo. */
  request(event: string, payload: unknown, timeoutMs: number): Promise<unknown>;
}

const SERVER_EVENTS: readonly ServerEventName[] = [
  'room:state',
  'game:view',
  'game:events',
  'error',
];

/**
 * Transporte real sobre Socket.IO. Sin URL se conecta al mismo origen que sirve la web: en
 * desarrollo, el proxy de Vite reenvía `/socket.io` al servidor.
 */
export function socketTransport(url?: string): Transport {
  const socket = io(url ?? '/', {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
  return {
    connect: () => {
      socket.connect();
    },
    close: () => {
      socket.close();
    },
    onConnect: (callback) => {
      socket.on('connect', callback);
    },
    onDisconnect: (callback) => {
      socket.on('disconnect', callback);
    },
    onServerEvent: (event, callback) => {
      if (SERVER_EVENTS.includes(event)) socket.on(event, callback);
    },
    request: (event, payload, timeoutMs) =>
      socket.timeout(timeoutMs).emitWithAck(event, payload) as Promise<unknown>,
  };
}
