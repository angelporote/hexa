import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clientErrorSchema } from '@hexa/protocol';
import type { ClientErrorReport } from '@hexa/protocol';
import { Providers, makeConnection } from '../testing.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import {
  beaconSender,
  createReporter,
  installGlobalErrorReporting,
  normalizePath,
  redact,
} from './report.js';
import type { ErrorReporter } from './report.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('normalizePath', () => {
  it('quita el código de sala y la consulta', () => {
    expect(normalizePath('/play/ABCD')).toBe('/play/:code');
    expect(normalizePath('/watch/WXYZ?x=1')).toBe('/watch/:code');
    expect(normalizePath('/play/abcd#frag')).toBe('/play/:code');
    expect(normalizePath('/join?code=ABCD')).toBe('/join');
    expect(normalizePath('/host')).toBe('/host');
    expect(normalizePath('/')).toBe('/');
  });

  it('recorta rutas absurdamente largas', () => {
    expect(normalizePath('/' + 'x'.repeat(500)).length).toBe(200);
  });
});

describe('redact', () => {
  it('oculta tokens de sesión y códigos de sala', () => {
    const token = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4';
    expect(redact(`token inválido ${token} en /play/ABCD`)).toBe(
      'token inválido [token] en /play/:code',
    );
    expect(redact('http://x.test/join?code=ABCD&y=1')).toBe('http://x.test/join?code=:code&y=1');
    expect(redact('at https://h.test/watch/WXYZ/x')).toBe('at https://h.test/watch/:code/x');
  });

  it('deja intacto lo que no es sensible', () => {
    const text = 'Cannot read properties of undefined (reading hand) at Hand.tsx:12:3';
    expect(redact(text)).toBe(text);
  });
});

describe('createReporter', () => {
  function setup(over: Partial<Parameters<typeof createReporter>[0]> = {}) {
    const sent: ClientErrorReport[] = [];
    let now = 1_000_000;
    const reporter = createReporter({
      send: (r) => void sent.push(r),
      path: () => '/play/ABCD',
      now: () => now,
      ...over,
    });
    return { reporter, sent, advance: (ms: number) => (now += ms) };
  }

  it('envía un informe válido con el mensaje, la pila, el origen y la ruta normalizada', () => {
    const { reporter, sent } = setup();
    const error = new Error('Boom');
    reporter.report(error, 'window');
    expect(sent).toHaveLength(1);
    expect(clientErrorSchema.safeParse(sent[0]).success).toBe(true);
    expect(sent[0]).toMatchObject({ message: 'Boom', source: 'window', path: '/play/:code' });
    expect(sent[0]?.stack).toContain('Boom');
  });

  it('entiende lo que no es un Error', () => {
    const { reporter, sent } = setup();
    reporter.report('texto suelto', 'promise');
    reporter.report(42, 'promise');
    reporter.report(undefined, 'promise');
    expect(sent.map((r) => r.message)).toEqual(['texto suelto', '42', 'undefined']);
    expect(sent.every((r) => r.stack === undefined)).toBe(true);
  });

  it('un mensaje vacío se informa igualmente', () => {
    const { reporter, sent } = setup();
    reporter.report(new Error(''), 'window');
    expect(sent[0]?.message).toBe('Error');
  });

  it('recorta mensajes y pilas largos para cumplir el esquema y redacta lo sensible', () => {
    const { reporter, sent } = setup();
    const error = new Error('x'.repeat(2000) + ' /play/ABCD');
    error.stack = 'Error\n' + 'y'.repeat(9000);
    reporter.report(error, 'react');
    expect(clientErrorSchema.safeParse(sent[0]).success).toBe(true);
    expect(sent[0]?.message.length).toBe(500);
    expect(sent[0]?.stack?.length).toBe(4000);

    const secret = new Error('falla con a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4');
    reporter.report(secret, 'window');
    expect(JSON.stringify(sent[1])).not.toContain('a1b2c3d4e5f6');
    expect(sent[1]?.message).toContain('[token]');
  });

  it('no repite el mismo error seguido, pero sí pasado el tiempo o si cambia', () => {
    const { reporter, sent, advance } = setup({ dedupeMs: 1000 });
    const boom = () => new Error('Boom');
    reporter.report(boom(), 'window');
    reporter.report(boom(), 'window');
    expect(sent).toHaveLength(1);
    reporter.report(boom(), 'react'); // otro origen
    reporter.report(new Error('Otro'), 'window');
    expect(sent).toHaveLength(3);
    advance(1001);
    reporter.report(boom(), 'window');
    expect(sent).toHaveLength(4);
  });

  it('limita los informes por carga de página', () => {
    const { reporter, sent } = setup({ maxReports: 3 });
    for (let i = 0; i < 10; i++) reporter.report(new Error(`fallo ${i}`), 'window');
    expect(sent).toHaveLength(3);
  });

  it('si el envío falla, no lanza ni rompe nada', () => {
    const reporter = createReporter({
      send: () => {
        throw new Error('sin red');
      },
      path: () => '/',
    });
    expect(() => reporter.report(new Error('x'), 'window')).not.toThrow();
  });
});

describe('beaconSender', () => {
  const report: ClientErrorReport = { message: 'Boom', source: 'window', path: '/' };

  it('usa sendBeacon con un cuerpo text/plain', async () => {
    const beacon = vi.fn<Navigator['sendBeacon']>(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    beaconSender('/client-errors')(report);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, data] = beacon.mock.calls[0] ?? [];
    const blob = data as Blob | undefined;
    expect(url).toBe('/client-errors');
    expect(blob?.type).toBe('text/plain');
    expect(JSON.parse((await blob?.text()) ?? '')).toEqual(report);
  });

  it('si sendBeacon no acepta el envío o no existe, usa fetch', () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => false) });
    beaconSender()(report);
    vi.stubGlobal('navigator', {});
    beaconSender()(report);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/client-errors');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', keepalive: true });
  });

  it('no lanza aunque todo falle', () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('no');
      },
    });
    vi.stubGlobal('fetch', () => {
      throw new Error('tampoco');
    });
    expect(() => beaconSender()(report)).not.toThrow();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('rechazado')));
    expect(() => beaconSender()(report)).not.toThrow();
  });
});

describe('installGlobalErrorReporting', () => {
  // jsdom escribe en la consola los errores de ventana que nadie gestiona; se dan por atendidos.
  const quiet = (e: Event) => e.preventDefault();
  beforeEach(() => window.addEventListener('error', quiet));
  afterEach(() => window.removeEventListener('error', quiet));

  function spy(): ErrorReporter & { calls: [unknown, string][] } {
    const calls: [unknown, string][] = [];
    return { calls, report: (error, source) => void calls.push([error, source]) };
  }

  it('notifica los errores de la ventana y las promesas rechazadas', () => {
    const reporter = spy();
    const stop = installGlobalErrorReporting(reporter, window);
    const boom = new Error('Boom');
    window.dispatchEvent(new ErrorEvent('error', { error: boom, message: 'Boom' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'motivo' }));
    expect(reporter.calls).toEqual([
      [boom, 'window'],
      ['Script error.', 'window'],
      ['motivo', 'promise'],
    ]);
    stop();
  });

  it('deja de escuchar al desinstalarse', () => {
    const reporter = spy();
    installGlobalErrorReporting(reporter, window)();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('x'), message: 'x' }));
    expect(reporter.calls).toEqual([]);
  });
});

describe('<ErrorBoundary />', () => {
  beforeEach(() => {
    // React escribe en la consola los errores que captura un ErrorBoundary: se silencia en el test.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  function Boom(): never {
    throw new Error('revienta al pintar');
  }

  const mount = (reporter: ErrorReporter, child: React.ReactNode, locale: 'es' | 'en' = 'es') =>
    render(
      <Providers connection={makeConnection().connection} locale={locale}>
        <ErrorBoundary reporter={reporter}>{child}</ErrorBoundary>
      </Providers>,
    );

  it('si todo va bien, no se nota', () => {
    const report = vi.fn();
    mount({ report }, <p>contenido</p>);
    expect(screen.getByText('contenido')).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });

  it('si algo revienta al pintar, avisa, ofrece recargar y notifica el error', () => {
    const report = vi.fn();
    mount({ report }, <Boom />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Algo ha ido mal');
    expect(alert.textContent).toContain('tu asiento en la partida se conserva');
    expect(report).toHaveBeenCalledTimes(1);
    const [error, source] = report.mock.calls[0] as [Error, string];
    expect(error.message).toBe('revienta al pintar');
    expect(source).toBe('react');
  });

  it('el botón recarga la página', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    mount({ report: vi.fn() }, <Boom />);
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('está traducido', () => {
    mount({ report: vi.fn() }, <Boom />, 'en');
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });
});
