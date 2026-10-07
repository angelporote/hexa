import { CLIENT_ERROR_SOURCES } from '@hexa/protocol';
import type { ClientErrorReport, ClientErrorSource } from '@hexa/protocol';

export interface ErrorReporter {
  report(error: unknown, source: ClientErrorSource): void;
}

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_PATH = 200;

/** Ruta de la página sin nada de la sala: `/play/ABCD?x=1` → `/play/:code`. */
export function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? '';
  return withoutQuery.replace(/^\/(play|watch)\/[^/]+/i, '/$1/:code').slice(0, MAX_PATH);
}

/**
 * Quita de un texto lo que no debe salir del navegador: tokens de sesión (cadenas hexadecimales
 * largas) y códigos de sala en rutas o en `?code=`.
 */
export function redact(text: string): string {
  return text
    .replace(/\b[0-9a-f]{24,}\b/gi, '[token]')
    .replace(/([?&]code=)[A-Z]{4}\b/gi, '$1:code')
    .replace(/\/(play|watch)\/[A-Z]{4}\b/gi, '/$1/:code');
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { message: typeof error === 'string' ? error : String(error) };
}

export interface ReporterOptions {
  /** Entrega el informe (por defecto `beaconSender()`); nunca debe lanzar. */
  readonly send: (report: ClientErrorReport) => void;
  readonly path: () => string;
  readonly now?: () => number;
  /** Informes como máximo por carga de página: un error en bucle no inunda al servidor. */
  readonly maxReports?: number;
  /** Un mismo error no se vuelve a enviar antes de este tiempo. */
  readonly dedupeMs?: number;
}

/**
 * Prepara los errores de la web para enviarlos: recorta, redacta datos sensibles, normaliza la ruta,
 * no repite el mismo error seguido y limita el total. Notificar un error nunca debe provocar otro.
 */
export function createReporter(options: ReporterOptions): ErrorReporter {
  const now = options.now ?? Date.now;
  const maxReports = options.maxReports ?? 20;
  const dedupeMs = options.dedupeMs ?? 60_000;
  const seen = new Map<string, number>();
  let sent = 0;

  return {
    report(error, source) {
      try {
        if (sent >= maxReports) return;
        const { message, stack } = describe(error);
        const clean = redact(message).slice(0, MAX_MESSAGE) || 'Error';
        const cleanStack = stack ? redact(stack).slice(0, MAX_STACK) : undefined;

        const firstFrame = cleanStack?.split('\n')[1] ?? '';
        const key = `${source}|${clean}|${firstFrame}`;
        const at = now();
        const last = seen.get(key);
        if (last !== undefined && at - last < dedupeMs) return;
        seen.set(key, at);

        sent++;
        options.send({
          message: clean,
          ...(cleanStack ? { stack: cleanStack } : {}),
          source,
          path: normalizePath(options.path()),
        });
      } catch {
        // Informar de un error no puede romper nada más.
      }
    },
  };
}

/** Envío por `sendBeacon` (sobrevive a cerrar la página) y, si no se puede, por `fetch`. */
export function beaconSender(url = '/client-errors'): (report: ClientErrorReport) => void {
  return (report) => {
    const body = JSON.stringify(report);
    try {
      // `text/plain` evita la comprobación previa entre orígenes distintos.
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))
      ) {
        return;
      }
    } catch {
      // Se prueba con fetch.
    }
    try {
      void fetch(url, {
        method: 'POST',
        body,
        headers: { 'content-type': 'text/plain' },
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Sin red no hay nada más que hacer.
    }
  };
}

/** Captura los errores de la ventana y las promesas rechazadas; devuelve cómo dejar de hacerlo. */
export function installGlobalErrorReporting(
  reporter: ErrorReporter,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onError = (event: Event): void => {
    const e = event as ErrorEvent;
    reporter.report(e.error ?? e.message, 'window');
  };
  const onRejection = (event: Event): void => {
    reporter.report((event as PromiseRejectionEvent).reason, 'promise');
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

export { CLIENT_ERROR_SOURCES };
