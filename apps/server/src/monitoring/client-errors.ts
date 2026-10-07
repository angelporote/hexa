import type { FastifyInstance } from 'fastify';
import { MAX_CLIENT_ERROR_BYTES, clientErrorSchema } from '@hexa/protocol';
import type { Logger } from '../logger.js';
import { TokenBucket } from '../net/rate-limit.js';

export interface ClientErrorOptions {
  readonly logger: Logger;
  readonly clock: () => number;
  /** Informes seguidos que admite cada dirección y con qué ritmo se recupera. */
  readonly burst?: number;
  readonly perSecond?: number;
}

const IDLE_MS = 10 * 60 * 1000;
const PRUNE_ABOVE = 1000;

/**
 * `POST /client-errors`: la web informa aquí de sus errores (captura global y `ErrorBoundary`).
 * Se registran como un log estructurado (`event: 'client_error'`) junto a los del servidor, sin
 * servicios de terceros. Solo se guarda lo que valida el esquema; no se anota la dirección IP ni el
 * navegador, que se usan únicamente en memoria para limitar el ritmo.
 */
export function registerClientErrors(app: FastifyInstance, options: ClientErrorOptions): void {
  const { logger, clock } = options;
  const burst = options.burst ?? 5;
  const perSecond = options.perSecond ?? 0.1;
  const buckets = new Map<string, { bucket: TokenBucket; seen: number }>();

  const limited = (ip: string): boolean => {
    const now = clock();
    if (buckets.size > PRUNE_ABOVE) {
      for (const [key, entry] of buckets) if (now - entry.seen > IDLE_MS) buckets.delete(key);
    }
    let entry = buckets.get(ip);
    if (!entry) {
      entry = { bucket: new TokenBucket(burst, perSecond, now), seen: now };
      buckets.set(ip, entry);
    }
    entry.seen = now;
    return !entry.bucket.take(now);
  };

  // `navigator.sendBeacon` envía `text/plain` para evitar la comprobación previa entre orígenes.
  app.addContentTypeParser(
    'text/plain',
    { parseAs: 'string', bodyLimit: MAX_CLIENT_ERROR_BYTES },
    (_request, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(Object.assign(new Error('JSON no válido'), { statusCode: 400 }), undefined);
      }
    },
  );

  app.post('/client-errors', { bodyLimit: MAX_CLIENT_ERROR_BYTES }, (request, reply) => {
    if (limited(request.ip)) return reply.code(429).send({ error: 'RATE_LIMITED' });
    const parsed = clientErrorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_MESSAGE' });
    logger.error({ event: 'client_error', ...parsed.data }, 'error de la web');
    return reply.code(204).send();
  });
}
