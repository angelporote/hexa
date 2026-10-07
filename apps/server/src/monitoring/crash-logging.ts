import type { Logger } from '../logger.js';
import { errorFields } from './error-fields.js';

/** Lo que se usa del proceso; permite probarlo con un emisor de eventos cualquiera. */
export interface ProcessLike {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
}

/**
 * Deja constancia, con su pila y en el mismo formato que el resto de logs, de lo que Node
 * imprimiría suelto por la salida de errores:
 * - Una excepción sin capturar deja el proceso en un estado desconocido: se registra y se cierra
 *   para que lo reinicie quien lo supervise (con Redis, las salas sobreviven; ADR 0012).
 * - Una promesa rechazada sin gestionar se registra pero no tumba el servidor: una tarea suelta
 *   que falla no debe cortar todas las partidas.
 */
export function installCrashLogging(
  logger: Logger,
  target: ProcessLike = process,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  target.on('uncaughtException', (error) => {
    logger.error(
      { event: 'uncaught_exception', ...errorFields(error) },
      'excepción sin capturar: el proceso se cierra',
    );
    exit(1);
  });
  target.on('unhandledRejection', (reason) => {
    logger.error(
      { event: 'unhandled_rejection', ...errorFields(reason) },
      'promesa rechazada sin gestionar',
    );
  });
}
