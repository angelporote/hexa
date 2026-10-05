import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { MAX_MESSAGE_BYTES, parseClientMessage } from '@hexa/protocol';
import type { ClientMessage, ErrorCode } from '@hexa/protocol';
import type { ServerConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { ManagerResult, OutMessage, RoomManager } from '../rooms/room-manager.js';
import { TokenBucket } from './rate-limit.js';

type Ack = (response: unknown) => void;

export interface SocketServerDeps {
  readonly manager: RoomManager;
  readonly config: Pick<ServerConfig, 'corsOrigin' | 'rateLimit'>;
  readonly logger: Logger;
  readonly clock: () => number;
}

/** Tras tantas peticiones rechazadas por límite seguidas, se corta la conexión. */
const MAX_CONSECUTIVE_RATE_LIMITED = 100;

export function attachSocketServer(httpServer: HttpServer, deps: SocketServerDeps): Server {
  const { manager, config, logger, clock } = deps;
  const io = new Server(httpServer, {
    serveClient: false,
    cors: { origin: [...config.corsOrigin] },
    // Un mensaje mayor que esto cierra la conexión: ninguna acción legítima se le acerca.
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
  });

  const deliver = (messages: readonly OutMessage[]): void => {
    for (const m of messages) io.to(m.to).emit(m.event, m.payload);
  };

  const dispatch = (socketId: string, msg: ClientMessage): ManagerResult<unknown> => {
    switch (msg.event) {
      case 'room:create':
        return manager.createRoom(socketId);
      case 'room:join':
        return manager.join(socketId, msg.payload);
      case 'room:leave':
        return manager.leave(socketId);
      case 'lobby:update':
        return manager.updateLobby(socketId, msg.payload);
      case 'lobby:start':
        return manager.start(socketId);
      case 'game:action':
        return manager.action(socketId, msg.payload.action);
      case 'session:resume':
        return manager.resume(socketId, msg.payload);
    }
  };

  io.on('connection', (socket: Socket) => {
    const bucket = new TokenBucket(config.rateLimit.burst, config.rateLimit.perSecond, clock());
    let limited = 0;
    logger.debug({ event: 'socket_connected', id: socket.id });

    // Si el cliente no pasó callback, los errores llegan como evento `error`.
    const fail = (ack: Ack | undefined, error: ErrorCode): void => {
      if (ack) ack({ ok: false, error });
      else socket.emit('error', { error });
    };

    socket.onAny((event: string, ...args: unknown[]) => {
      const last = args[args.length - 1];
      const ack = typeof last === 'function' ? (last as Ack) : undefined;
      const payload = ack ? args[args.length - 2] : args[0];

      if (!bucket.take(clock())) {
        limited++;
        fail(ack, 'RATE_LIMITED');
        if (limited >= MAX_CONSECUTIVE_RATE_LIMITED) {
          logger.warn(
            { event: 'socket_flooding', id: socket.id },
            'conexión cortada por exceso de mensajes',
          );
          socket.disconnect(true);
        }
        return;
      }
      limited = 0;

      const parsed = parseClientMessage(event, payload);
      if (!parsed.ok) {
        logger.debug({
          event: 'message_rejected',
          id: socket.id,
          name: event,
          error: parsed.error,
        });
        fail(ack, parsed.error);
        return;
      }

      let result: ManagerResult<unknown>;
      try {
        result = dispatch(socket.id, parsed.value);
      } catch (error) {
        logger.error(
          { event: 'handler_crashed', id: socket.id, name: event, error: String(error) },
          'error interno',
        );
        fail(ack, 'SERVER_ERROR');
        return;
      }
      if (!result.ok) {
        fail(ack, result.error);
        return;
      }
      // Primero la respuesta (el cliente aprende su sesión) y después las difusiones.
      if (ack) ack({ ok: true, data: result.value.data });
      deliver(result.value.out);
    });

    socket.on('disconnect', () => {
      deliver(manager.disconnect(socket.id));
      logger.debug({ event: 'socket_disconnected', id: socket.id });
    });
  });

  return io;
}
