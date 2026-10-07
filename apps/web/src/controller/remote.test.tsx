import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createConfig, createGame, getPlayerView } from '@hexa/engine';
import type { GameState } from '@hexa/engine';
import type { RoomState } from '@hexa/protocol';
import { App } from '../App.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { Providers, hostView, makeConnection, roomOf, setupGame } from '../testing.js';
import { Controller } from './Controller.js';
import { WIDE_QUERY } from './use-media-query.js';

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(() => Promise.resolve()) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  Reflect.deleteProperty(window, 'matchMedia');
  Reflect.deleteProperty(navigator, 'share');
});

const session = (over: object = {}) => ({
  code: 'ABCD',
  token: 'p'.repeat(24),
  role: 'player' as const,
  playerId: 'p0',
  ...over,
});

function lobbyRoom(over: Partial<RoomState> = {}): RoomState {
  return roomOf('lobby', {
    hostConnected: false,
    hostless: true,
    you: { role: 'player', playerId: 'p0', admin: true },
    seats: [
      {
        playerId: 'p0',
        name: 'Ana',
        color: 'c1',
        ready: false,
        connected: true,
        bot: false,
        auto: false,
      },
    ],
    ...over,
  });
}

describe('crear una sala a distancia', () => {
  it('envía nombre y color como jugador y lleva a la sala de espera', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:create', { ok: true, data: session() });
    render(
      <Providers connection={connection} route="/create">
        <App />
      </Providers>,
    );
    expect(screen.getByText('Crear partida a distancia')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: ' Ana ' } });
    fireEvent.click(screen.getByLabelText('Ámbar'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toContain('room:create'));
    expect(transport.sent.find((s) => s.event === 'room:create')?.payload).toMatchObject({
      role: 'player',
      name: 'Ana',
      color: 'c3',
    });
    act(() => transport.emit('room:state', lobbyRoom()));
    expect(await screen.findByText('ABCD')).toBeTruthy();
    expect(localStorage.getItem('hexa.playerName')).toBe('Ana');
  });

  it('exige un nombre y muestra el error del servidor', async () => {
    const { connection, transport } = makeConnection();
    render(
      <Providers connection={connection} route="/create">
        <App />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Escribe un nombre (hasta 20 caracteres).',
    );
    expect(transport.sent.map((s) => s.event)).not.toContain('room:create');
    transport.responses.set('room:create', { ok: false, error: 'RATE_LIMITED' });
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Vas demasiado deprisa. Espera un momento.',
    );
  });

  it('la portada ofrece jugar a distancia y ver una partida', () => {
    render(
      <Providers connection={makeConnection().connection}>
        <App />
      </Providers>,
    );
    expect(
      screen.getByRole('link', { name: 'Jugar a distancia (crear sala)' }).getAttribute('href'),
    ).toBe('/create');
    expect(screen.getByRole('link', { name: 'Ver una partida' }).getAttribute('href')).toBe(
      '/watch',
    );
  });
});

describe('sala de espera a distancia', () => {
  function lobby(room: RoomState) {
    const { connection, transport } = makeConnection({ key: 'player', session: session() });
    transport.responses.set('session:resume', { ok: true, data: session() });
    for (const e of ['lobby:addBot', 'lobby:removeBot', 'lobby:start', 'lobby:update']) {
      transport.responses.set(e, { ok: true, data: {} });
    }
    render(
      <Providers connection={connection} route="/play/ABCD">
        <App />
      </Providers>,
    );
    return { transport, show: () => act(() => transport.emit('room:state', room)) };
  }

  it('quien administra ve el enlace para invitar, añade bots, los quita y empieza', async () => {
    const room = lobbyRoom({
      seats: [
        {
          playerId: 'p0',
          name: 'Ana',
          color: 'c1',
          ready: true,
          connected: true,
          bot: false,
          auto: false,
        },
        {
          playerId: 'p1',
          name: 'Bot 1',
          color: 'c2',
          ready: true,
          connected: true,
          bot: true,
          auto: false,
        },
      ],
    });
    const { transport, show } = lobby(room);
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    show();
    const link = (await screen.findByLabelText('Enlace de la sala')) as HTMLInputElement;
    expect(link.value).toMatch(/\/join\?code=ABCD$/);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await screen.findByRole('button', { name: 'Copiado' });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.value);

    fireEvent.click(screen.getByRole('button', { name: 'Añadir bot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar partida' }));
    await waitFor(() =>
      expect(transport.sent.map((s) => s.event)).toEqual(
        expect.arrayContaining(['lobby:addBot', 'lobby:removeBot', 'lobby:start']),
      ),
    );
    expect(transport.sent.find((s) => s.event === 'lobby:removeBot')?.payload['playerId']).toBe(
      'p1',
    );
  });

  it('no se puede empezar sin dos jugadores listos y se explica por qué', async () => {
    const { transport, show } = lobby(lobbyRoom());
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    show();
    expect(
      ((await screen.findByRole('button', { name: 'Empezar partida' })) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText('Hacen falta al menos 2 jugadores')).toBeTruthy();
  });

  it('quien no administra solo ve que se espera al creador, sin botones de gestión', async () => {
    const room = lobbyRoom({
      you: { role: 'player', playerId: 'p1', admin: false },
      seats: [
        {
          playerId: 'p0',
          name: 'Ana',
          color: 'c1',
          ready: true,
          connected: true,
          bot: false,
          auto: false,
        },
        {
          playerId: 'p1',
          name: 'Luis',
          color: 'c2',
          ready: false,
          connected: true,
          bot: false,
          auto: false,
        },
      ],
    });
    const { transport, show } = lobby(room);
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    show();
    expect(
      await screen.findByText('Esperando a que quien creó la sala empiece la partida…'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Empezar partida' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Añadir bot' })).toBeNull();
    expect(screen.getByLabelText('Enlace de la sala')).toBeTruthy(); // cualquiera puede invitar
  });

  it('con pantalla principal no hay enlace para compartir y se espera a la pantalla', async () => {
    const room = lobbyRoom({
      hostless: false,
      hostConnected: true,
      you: { role: 'player', playerId: 'p0', admin: false },
    });
    const { transport, show } = lobby(room);
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    show();
    expect(await screen.findByText('Esperando a que la pantalla empiece la partida…')).toBeTruthy();
    expect(screen.queryByLabelText('Enlace de la sala')).toBeNull();
  });

  it('ofrece compartir si el navegador lo permite', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { transport, show } = lobby(lobbyRoom());
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Compartir' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
  });
});

describe('ver una partida como espectador', () => {
  it('/watch pide el código, lo limpia y lleva a la partida', () => {
    render(
      <Providers connection={makeConnection().connection} route="/watch">
        <App />
      </Providers>,
    );
    const input = screen.getByLabelText('Código de sala') as HTMLInputElement;
    expect((screen.getByRole('button', { name: 'Mirar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(input, { target: { value: 'ab1c-d' } });
    expect(input.value).toBe('ABCD');
    expect((screen.getByRole('button', { name: 'Mirar' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('entra como espectador, ve la sala de espera y después la partida con solo información pública', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:join', {
      ok: true,
      data: session({ role: 'spectator', playerId: null }),
    });
    const { container } = render(
      <Providers connection={connection} route="/watch/abcd">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toContain('room:join'));
    expect(transport.sent.find((s) => s.event === 'room:join')?.payload).toMatchObject({
      code: 'ABCD',
      role: 'spectator',
    });

    act(() =>
      transport.emit(
        'room:state',
        roomOf('lobby', { you: { role: 'spectator', playerId: null, admin: false } }),
      ),
    );
    expect(await screen.findByText('Esperando a que empiece la partida…')).toBeTruthy();

    const view = hostView(setupGame());
    act(() => {
      transport.emit(
        'room:state',
        roomOf('playing', { you: { role: 'spectator', playerId: null, admin: false } }),
      );
      transport.emit('game:view', { seq: 3, view });
    });
    await screen.findByText('Turno de Ana');
    expect(container.querySelectorAll('.hex')).toHaveLength(19);
    // solo se ve lo público: sin manos ni botones de acción
    expect(screen.queryByRole('button', { name: /Tirar|Terminar|Comerciar/ })).toBeNull();
    expect(container.querySelector('.hand')).toBeNull();
  });

  it('un código que no existe muestra el error y la forma de volver', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:join', { ok: false, error: 'ROOM_NOT_FOUND' });
    render(
      <Providers connection={connection} route="/watch/ZZZZ">
        <App />
      </Providers>,
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No existe ninguna sala con ese código.',
    );
    expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe('/watch');
  });

  it('si ya hay una sesión de espectador guardada para esa sala, la recupera sin volver a entrar', async () => {
    const spectator = session({ role: 'spectator', playerId: null });
    const { connection, transport } = makeConnection({ key: 'spectator', session: spectator });
    transport.responses.set('session:resume', { ok: true, data: spectator });
    render(
      <Providers connection={connection} route="/watch/ABCD">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toContain('session:resume'));
    await new Promise((r) => setTimeout(r, 50));
    expect(transport.sent.map((s) => s.event)).not.toContain('room:join');
  });

  it('cambiar de sala deja antes la anterior', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:join', {
      ok: true,
      data: session({ role: 'spectator', playerId: null }),
    });
    transport.responses.set('room:leave', { ok: true, data: {} });
    connection.start('spectator');
    await connection.watch('ABCD');
    transport.responses.set('room:join', {
      ok: true,
      data: session({ code: 'WXYZ', role: 'spectator', playerId: null }),
    });
    await connection.watch('WXYZ');
    expect(transport.sent.map((s) => s.event)).toEqual(['room:join', 'room:leave', 'room:join']);
    expect(connection.getSnapshot().session?.code).toBe('WXYZ');
  });
});

/** Estado de partida con el turno de `p0` en la fase de tirada, visto por `player`. */
function snapshotFor(state: GameState, player: string): ConnectionSnapshot {
  const view = getPlayerView(state, player);
  return {
    status: 'connected',
    resuming: false,
    session: { code: 'ABCD', token: 'x'.repeat(24), role: 'player', playerId: player },
    room: roomOf('playing', { you: { role: 'player', playerId: player, admin: false } }),
    view,
    seq: 12,
    clock: null,
    events: [
      { id: 1, seq: 12, event: { type: 'DICE_ROLLED', player: 'p0', dice: [2, 3], total: 5 } },
    ],
    diceRoll: { dice: [2, 3], key: 1 },
    preview: null,
    replaced: false,
    resumeFailed: false,
  };
}

function mount(state: GameState, player: string, wide = false) {
  if (wide) {
    window.matchMedia = ((query: string) => ({
      matches: query === WIDE_QUERY,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  }
  const { connection, transport } = makeConnection();
  transport.responses.set('game:action', { ok: true, data: {} });
  transport.responses.set('game:preview', { ok: true, data: {} });
  const snapshot = snapshotFor(state, player);
  const view = snapshot.view;
  if (!view) throw new Error('sin vista');
  const utils = render(
    <Providers connection={connection}>
      <Controller view={view} snapshot={snapshot} />
    </Providers>,
  );
  return { ...utils, transport, connection };
}

describe('mando en pantalla estrecha: pestañas', () => {
  it('tiene «Mando» y «Tablero»; el tablero muestra el estado de la mesa sin tocar el mando', () => {
    const { container } = mount(setupGame(), 'p1');
    expect(screen.getByRole('tab', { name: 'Mando', selected: true })).toBeTruthy();
    expect(screen.queryByText('Registro')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Tablero/ }));
    expect(screen.getByRole('tab', { name: /Tablero/, selected: true })).toBeTruthy();
    expect(container.querySelectorAll('.hex')).toHaveLength(19);
    expect(container.querySelectorAll('.player-card')).toHaveLength(3);
    expect(screen.getByText('Registro')).toBeTruthy();
    expect(screen.getByText('Ana saca 5 (2 + 3)')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Última tirada: 5' })).toBeTruthy();
    // el estado del jugador se sigue viendo en las dos pestañas
    expect(within(screen.getByRole('banner')).getByText('Luis')).toBeTruthy();
    // y se vuelve al mando
    fireEvent.click(screen.getByRole('tab', { name: 'Mando' }));
    expect(screen.getByRole('region', { name: 'Tu mano' })).toBeTruthy();
  });

  it('avisa en la pestaña del tablero cuando necesitas actuar, y vuelve sola al mando', () => {
    const state = setupGame();
    const view = (s: GameState, p: string) => snapshotFor(s, p);
    const { rerender, connection } = mount(state, 'p1');
    fireEvent.click(screen.getByRole('tab', { name: /Tablero/ }));
    expect(screen.queryByLabelText('Requiere tu atención')).toBeNull();

    // pasa a ser el turno de p1: la pestaña se cambia sola
    const mine = view({ ...state, turn: { ...state.turn, player: 'p1' } }, 'p1');
    rerender(
      <Providers connection={connection}>
        {mine.view && <Controller view={mine.view} snapshot={mine} />}
      </Providers>,
    );
    expect(screen.getByRole('tab', { name: /Mando/, selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tirar los dados' })).toBeTruthy();
  });

  it('con una elección obligatoria (colocación inicial) salta al mando', () => {
    const start = createGame(createConfig(['p0', 'p1', 'p2']), 'tabs-setup');
    mount(start, 'p0');
    expect(screen.getByRole('tab', { name: 'Mando', selected: true })).toBeTruthy();
    expect(screen.getByText('Toca un vértice libre para colocar tu poblado.')).toBeTruthy();
  });
});

describe('mando en pantalla ancha: vista combinada', () => {
  it('muestra el tablero a un lado y el mando, la mesa y el registro al otro, sin pestañas', () => {
    const { container } = mount(setupGame(), 'p1', true);
    expect(screen.queryByRole('tablist')).toBeNull();
    const wide = container.querySelector('.controller-wide');
    expect(wide).not.toBeNull();
    expect(wide?.querySelector('.pane-board .hex')).not.toBeNull();
    const side = wide?.querySelector('.pane-side') as HTMLElement;
    expect(within(side).getByRole('region', { name: 'Tu mano' })).toBeTruthy();
    expect(side.querySelectorAll('.player-card')).toHaveLength(3);
    expect(within(side).getByText('Registro')).toBeTruthy();
    expect(container.querySelectorAll('.hex')).toHaveLength(19); // un solo tablero, no dos
  });

  it('la colocación dibuja su tablero interactivo en el hueco de la izquierda y funciona', async () => {
    const start = createGame(createConfig(['p0', 'p1', 'p2']), 'wide-setup');
    const { container, transport } = mount(start, 'p0', true);
    const slot = container.querySelector('.board-slot') as HTMLElement;
    expect(slot).not.toBeNull();
    await waitFor(() => expect(slot.querySelectorAll('[data-target-vertex]').length).toBe(54));
    // el panel de la derecha ya no lleva su propio tablero: solo instrucción y botones
    const side = container.querySelector('.pane-side') as HTMLElement;
    expect(side.querySelector('svg.board')).toBeNull();
    expect(container.querySelectorAll('svg.board')).toHaveLength(1);

    const first = slot.querySelector('[data-target-vertex]') as Element;
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(transport.sent.filter((s) => s.event === 'game:action')).toHaveLength(1),
    );
    expect(transport.sent.find((s) => s.event === 'game:action')?.payload['action']).toMatchObject({
      type: 'BUILD_SETTLEMENT',
      vertex: first.getAttribute('data-target-vertex'),
    });
  });

  it('al terminar la colocación vuelve el tablero de solo lectura', async () => {
    const start = createGame(createConfig(['p0', 'p1', 'p2']), 'wide-back');
    const { container, rerender, connection } = mount(start, 'p0', true);
    await waitFor(() => expect(container.querySelector('.board-slot')).not.toBeNull());
    const rolling = snapshotFor(setupGame(), 'p0');
    rerender(
      <Providers connection={connection}>
        {rolling.view && <Controller view={rolling.view} snapshot={rolling} />}
      </Providers>,
    );
    expect(container.querySelector('.board-slot')).toBeNull();
    expect(container.querySelector('.pane-board .hex')).not.toBeNull();
    expect(container.querySelectorAll('[data-target-vertex]')).toHaveLength(0);
  });
});
