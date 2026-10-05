import pino from 'pino';

/** Lo mínimo que necesitan los módulos; `pino` lo cumple y los tests pasan uno mudo. */
export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
}

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

export function createLogger(level: string): pino.Logger {
  return pino({ level });
}
