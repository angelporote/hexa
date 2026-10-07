import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App.js';
import { Providers, hostView, makeConnection, roomOf, setupGame } from '../testing.js';

afterEach(cleanup);

const hostSession = { code: 'ABCD', token: 'h'.repeat(24), role: 'host' as const, playerId: null };

describe('rutas', () => {
  it('/ ofrece crear partida y unirse', () => {
    render(
      <Providers connection={makeConnection().connection}>
        <App />
      </Providers>,
    );
    expect(
      screen.getByRole('link', { name: 'Crear partida en esta pantalla' }).getAttribute('href'),
    ).toBe('/host');
    expect(screen.getByRole('link', { name: 'Unirme a una partida' }).getAttribute('href')).toBe(
      '/join',
    );
  });

  it('el selector de idioma cambia los textos', () => {
    render(
      <Providers connection={makeConnection().connection}>
        <App />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('link', { name: 'Host a game on this screen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('/join muestra el formulario con el código de la URL en mayúsculas', () => {
    render(
      <Providers connection={makeConnection().connection} route="/join?code=wxyz">
        <App />
      </Providers>,
    );
    expect((screen.getByLabelText(/Código de sala/) as HTMLInputElement).value).toBe('WXYZ');
  });

  it('/play/:code sin sesión vuelve al formulario con el código escrito', async () => {
    render(
      <Providers connection={makeConnection().connection} route="/play/abcd">
        <App />
      </Providers>,
    );
    await waitFor(() =>
      expect((screen.getByLabelText(/Código de sala/) as HTMLInputElement).value).toBe('ABCD'),
    );
  });

  it('una ruta desconocida muestra el 404', () => {
    render(
      <Providers connection={makeConnection().connection} route="/nada">
        <App />
      </Providers>,
    );
    expect(screen.getByText('404')).toBeTruthy();
    expect(screen.getByText('Esta página no existe.')).toBeTruthy();
  });
});

describe('/host', () => {
  it('crea una sala al conectar y muestra el lobby con su código', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:create', { ok: true, data: hostSession });
    render(
      <Providers connection={connection} route="/host">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toContain('room:create'));
    act(() => transport.emit('room:state', roomOf('lobby', { seats: [] })));
    expect(await screen.findByText('ABCD')).toBeTruthy();
    expect(transport.sent.filter((s) => s.event === 'room:create')).toHaveLength(1);
  });

  it('si hay una sesión guardada la recupera en lugar de crear otra sala', async () => {
    const { connection, transport } = makeConnection({ key: 'host', session: hostSession });
    transport.responses.set('session:resume', { ok: true, data: hostSession });
    render(
      <Providers connection={connection} route="/host">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toContain('session:resume'));
    act(() => transport.emit('room:state', roomOf('lobby', { seats: [] })));
    await screen.findByText('ABCD');
    expect(transport.sent.map((s) => s.event)).not.toContain('room:create');
  });

  it('si la sesión guardada ya no sirve, crea una sala nueva', async () => {
    const { connection, transport } = makeConnection({ key: 'host', session: hostSession });
    transport.responses.set('session:resume', { ok: false, error: 'ROOM_NOT_FOUND' });
    transport.responses.set('room:create', { ok: true, data: { ...hostSession, code: 'WXYZ' } });
    render(
      <Providers connection={connection} route="/host">
        <App />
      </Providers>,
    );
    await waitFor(() =>
      expect(transport.sent.map((s) => s.event)).toEqual(['session:resume', 'room:create']),
    );
  });

  it('pasa del lobby a la partida cuando el servidor la inicia', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:create', { ok: true, data: hostSession });
    const { container } = render(
      <Providers connection={connection} route="/host">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    act(() => transport.emit('room:state', roomOf('lobby')));
    await screen.findByText('Empezar partida');

    const view = hostView(setupGame());
    act(() => {
      transport.emit('room:state', roomOf('playing'));
      transport.emit('game:view', { seq: 12, view });
    });
    await screen.findByText('Turno de Ana');
    expect(container.querySelectorAll('.hex')).toHaveLength(19);
    expect(screen.queryByText('Empezar partida')).toBeNull();
  });

  it('avisa cuando se pierde la conexión y cuando otro dispositivo toma la sesión', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:create', { ok: true, data: hostSession });
    render(
      <Providers connection={connection} route="/host">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    act(() => transport.drop());
    expect((await screen.findByRole('status')).textContent).toBe('Conexión perdida. Reintentando…');
    act(() => transport.emit('error', { error: 'SESSION_REPLACED' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Esta sesión se ha abierto en otro dispositivo.',
    );
  });
});
