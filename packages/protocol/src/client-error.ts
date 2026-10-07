import { z } from 'zod';

/** Dónde se produjo el error en la web. */
export const CLIENT_ERROR_SOURCES = ['window', 'promise', 'react'] as const;
export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number];

/** Tamaño máximo del cuerpo de un informe de error, en bytes. */
export const MAX_CLIENT_ERROR_BYTES = 8 * 1024;

/**
 * Informe de un error de la web (`POST /client-errors`). Solo lleva lo necesario para localizar el
 * fallo: nunca tokens, manos, nombres ni el código de sala (la ruta va ya normalizada).
 */
export const clientErrorSchema = z
  .object({
    message: z.string().min(1).max(500),
    stack: z.string().max(4000).optional(),
    source: z.enum(CLIENT_ERROR_SOURCES),
    /** Ruta de la página sin datos de la sala, p. ej. `/play/:code`. */
    path: z.string().max(200),
  })
  .strict();
export type ClientErrorReport = z.infer<typeof clientErrorSchema>;
