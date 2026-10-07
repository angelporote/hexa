import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CLIENT_ERROR_BYTES } from '@hexa/protocol';
import { buildServer } from '../app.js';
import type { ServerHandle } from '../app.js';
import { TestClient, startTestServer } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';
import { installCrashLogging } from './crash-logging.js';
import type { ProcessLike } from './crash-logging.js';
import { errorFields } from './error-fields.js';

type Logged = { level: string; obj: Record<string, unknown>; msg?: string | undefined };

function recordingLogger() {
  const lines: Logged[] = [];
  const at =
    (level: string) =>
    (obj: object, msg?: string): void => {
      lines.push({ level, obj: obj as Record<string, unknown>, msg });
    };
  return {
    lines,
    logger: { info: at('info'), warn: at('warn'), error: at('error'), debug: at('debug') },
  };
}

describe('errorFields', () => {
  it('da el mensaje y la pila de un Error', () => {
    const fields = errorFields(new Error('boom'));
    expect(fields.error).toBe('boom');
    expect(fields.stack).toContain('Error: boom');
  });

  it('usa el nombre si el mensaje está vacío y convierte lo que no es un Error en texto', () => {
    expect(errorFields(new TypeError('')).error).toBe('TypeError');
    expect(errorFields('texto')).toEqual({ error: 'texto' });
    expect(errorFields({ a: 1 })).toEqual({ error: '[object Object]' });
    expect(errorFields(undefined)).toEqual({ error: 'undefined' });
  });

  it('sin pila no inventa el campo', () => {
    const error = new Error('sin pila');
    delete error.stack;
    expect(errorFields(error)).toEqual({ error: 'sin pila' });
  });
});

describe('installCrashLogging', () => {
  function setup() {
    const emitter = new EventEmitter();
    const exit = vi.fn();
    const { lines, logger } = recordingLogger();
    installCrashLogging(logger, emitter as unknown as ProcessLike, exit);
    return { emitter, exit, lines };
  }

  it('una excepción sin capturar se registra con su pila y cierra el proceso', () => {
    const { emitter, exit, lines } = setup();
    emitter.emit('uncaughtException', new Error('se rompió algo'));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('error');
    expect(lines[0]?.obj).toMatchObject({ event: 'uncaught_exception', error: 'se rompió algo' });
    expect(String(lines[0]?.obj['stack'])).toContain('se rompió algo');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('una promesa rechazada se registra pero no cierra el proceso', () => {
    const { emitter, exit, lines } = setup();
    emitter.emit('unhandledRejection', new Error('rechazada'));
    emitter.emit('unhandledRejection', 'motivo suelto');
    expect(lines.map((l) => l.obj['event'])).toEqual([
      'unhandled_rejection',
      'unhandled_rejection',
    ]);
    expect(lines[0]?.obj['error']).toBe('rechazada');
    expect(lines[1]?.obj['error']).toBe('motivo suelto');
    expect(exit).not.toHaveBeenCalled();
  });
});

describe('POST /client-errors', () => {
  let handle: ServerHandle | null = null;
  let now = 1_000_000;

  afterEach(async () => {
    await handle?.close();
    handle = null;
    now = 1_000_000;
  });

  async function boot() {
    const { lines, logger } = recordingLogger();
    handle = await buildServer({ logger, clock: () => now });
    return { app: handle.app, lines };
  }
  const report = { message: 'Boom', source: 'window', path: '/play/:code' };
  const post = (
    app: ServerHandle['app'],
    payload: unknown,
    extra: { ip?: string; type?: string } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/client-errors',
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      headers: { 'content-type': extra.type ?? 'application/json' },
      ...(extra.ip ? { remoteAddress: extra.ip } : {}),
    });
  const errors = (lines: Logged[]) => lines.filter((l) => l.obj['event'] === 'client_error');

  it('registra el informe como un log estructurado y responde 204', async () => {
    const { app, lines } = await boot();
    const response = await post(app, { ...report, stack: 'Error: Boom\n  at x' });
    expect(response.statusCode).toBe(204);
    expect(errors(lines)).toHaveLength(1);
    expect(errors(lines)[0]).toMatchObject({
      level: 'error',
      obj: {
        event: 'client_error',
        message: 'Boom',
        source: 'window',
        path: '/play/:code',
        stack: 'Error: Boom\n  at x',
      },
    });
  });

  it('acepta el texto plano que envía navigator.sendBeacon', async () => {
    const { app, lines } = await boot();
    const response = await post(app, report, { type: 'text/plain;charset=UTF-8' });
    expect(response.statusCode).toBe(204);
    expect(errors(lines)).toHaveLength(1);
  });

  it('rechaza lo que no cumple el esquema, sin registrar nada', async () => {
    const { app, lines } = await boot();
    const bad: unknown[] = [
      {},
      { ...report, message: '' },
      { ...report, source: 'otro' },
      { ...report, token: 'secreto' },
      { ...report, hand: { r1: 3 } },
      [],
      'texto',
    ];
    // una dirección distinta por petición: las inválidas también cuentan para el límite de ritmo
    let n = 0;
    const from = () => ({ ip: `10.1.0.${++n}` });
    for (const body of bad) {
      expect((await post(app, body, from())).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await post(app, '{no es json', { type: 'text/plain', ...from() })).statusCode).toBe(
      400,
    );
    expect(errors(lines)).toHaveLength(0);
  });

  it('rechaza un cuerpo demasiado grande', async () => {
    const { app, lines } = await boot();
    const big = { ...report, message: 'x'.repeat(MAX_CLIENT_ERROR_BYTES) };
    expect((await post(app, big)).statusCode).toBe(413);
    expect(errors(lines)).toHaveLength(0);
  });

  it('no guarda nada que no esté en el esquema: ni dirección IP ni navegador', async () => {
    const { app, lines } = await boot();
    await app.inject({
      method: 'POST',
      url: '/client-errors',
      payload: JSON.stringify(report),
      headers: { 'content-type': 'application/json', 'user-agent': 'NavegadorSecreto/1.0' },
      remoteAddress: '203.0.113.9',
    });
    const text = JSON.stringify(lines);
    expect(text).not.toContain('203.0.113.9');
    expect(text).not.toContain('NavegadorSecreto');
  });

  it('limita el ritmo por dirección: 5 seguidos y luego 429 hasta que se recupera', async () => {
    const { app, lines } = await boot();
    for (let i = 0; i < 5; i++) expect((await post(app, report)).statusCode).toBe(204);
    const limited = await post(app, report);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'RATE_LIMITED' });
    expect(errors(lines)).toHaveLength(5);

    now += 10_000; // se recupera una ficha cada 10 s
    expect((await post(app, report)).statusCode).toBe(204);
    expect((await post(app, report)).statusCode).toBe(429);
  });

  it('cada dirección tiene su propio límite', async () => {
    const { app } = await boot();
    for (let i = 0; i < 6; i++) await post(app, report, { ip: '10.0.0.1' });
    expect((await post(app, report, { ip: '10.0.0.1' })).statusCode).toBe(429);
    expect((await post(app, report, { ip: '10.0.0.2' })).statusCode).toBe(204);
  });

  it('solo existe POST', async () => {
    const { app } = await boot();
    expect((await app.inject({ method: 'GET', url: '/client-errors' })).statusCode).toBe(404);
  });

  it('el servidor sigue respondiendo a /health', async () => {
    const { app } = await boot();
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
  });
});

describe('fallos internos en la capa de red', () => {
  let server: TestServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it('un manejador que revienta responde SERVER_ERROR y deja el error con su pila en el log', async () => {
    const { lines, logger } = recordingLogger();
    server = await startTestServer({ logger });
    vi.spyOn(server.handle.manager, 'createRoom').mockImplementation(() => {
      throw new Error('fallo interno de prueba');
    });
    const client = await TestClient.connect(server.url);
    try {
      expect(await client.request('room:create')).toEqual({ ok: false, error: 'SERVER_ERROR' });
    } finally {
      client.close();
    }
    const crashed = lines.find((l) => l.obj['event'] === 'handler_crashed');
    expect(crashed?.level).toBe('error');
    expect(crashed?.obj).toMatchObject({ name: 'room:create', error: 'fallo interno de prueba' });
    expect(String(crashed?.obj['stack'])).toContain('fallo interno de prueba');
  });
});
