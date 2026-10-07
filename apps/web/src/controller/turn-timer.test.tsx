import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { getPlayerView } from '@hexa/engine';
import type { GameState } from '@hexa/engine';
import type { RoomState } from '@hexa/protocol';
import { Countdown, formatClock } from '../components/Countdown.js';
import { TurnTimerOption } from '../components/TurnTimerOption.js';
import { PlayersPanel } from '../host/PlayersPanel.js';
import { Lobby } from '../host/Lobby.js';
import { playerInfos } from '../host/players.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { Providers, hostView, makeConnection, roomOf, setupGame } from '../testing.js';
import { Controller } from './Controller.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

const seat = (playerId: string, name: string, over: object = {}) => ({
  playerId,
  name,
  color: 'c1' as const,
  ready: true,
  connected: true,
  bot: false,
  auto: false,
  ...over,
});

describe('conexión: reloj del temporizador', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  const viewMessage = (seq: number, clock?: object | null) => ({
    seq,
    view: getPlayerView(setupGame(), 'p0'),
    ...(clock === undefined ? {} : { clock }),
  });

  it('convierte el tiempo restante en la hora local a la que vence el plazo', () => {
    const { connection, transport } = makeConnection();
    expect(connection.getSnapshot().clock).toBeNull();
    transport.emit('game:view', viewMessage(3, { actors: ['p0', 'p2'], remainingMs: 45_000 }));
    expect(connection.getSnapshot().clock).toEqual({ actors: ['p0', 'p2'], endsAt: 1_045_000 });
  });

  it('sin reloj en la vista (o con null) lo borra, también con el mismo seq', () => {
    const { connection, transport } = makeConnection();
    transport.emit('game:view', viewMessage(3, { actors: ['p0'], remainingMs: 10_000 }));
    expect(connection.getSnapshot().clock).not.toBeNull();
    // al vencer el plazo el servidor reenvía la vista con el mismo seq y sin reloj
    transport.emit('game:view', viewMessage(3, null));
    expect(connection.getSnapshot().clock).toBeNull();
    transport.emit('game:view', viewMessage(4, { actors: ['p1'], remainingMs: 5000 }));
    transport.emit('game:view', viewMessage(5));
    expect(connection.getSnapshot().clock).toBeNull();
  });

  it('una vista antigua que llega fuera de orden no pisa el reloj', () => {
    const { connection, transport } = makeConnection();
    transport.emit('game:view', viewMessage(6, { actors: ['p1'], remainingMs: 20_000 }));
    transport.emit('game:view', viewMessage(5, { actors: ['p0'], remainingMs: 90_000 }));
    expect(connection.getSnapshot().clock).toEqual({ actors: ['p1'], endsAt: 1_020_000 });
  });

  it('un reloj mal formado se descarta sin romper la conexión', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { connection, transport } = makeConnection();
    transport.emit('game:view', viewMessage(3, { actors: ['p0'], remainingMs: -5 }));
    expect(connection.getSnapshot().view).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('<Countdown />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000_000);
  });

  it('da formato m:ss', () => {
    expect([0, 9, 59, 60, 61, 125, 600].map(formatClock)).toEqual([
      '0:00',
      '0:09',
      '0:59',
      '1:00',
      '1:01',
      '2:05',
      '10:00',
    ]);
  });

  it('cuenta hacia atrás, avisa en los últimos segundos y se queda en 0:00', () => {
    render(
      <Providers connection={makeConnection().connection}>
        <Countdown endsAt={Date.now() + 42_000} />
      </Providers>,
    );
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toBe('0:42');
    expect(timer.getAttribute('aria-label')).toBe('Tiempo restante: 42 s');
    expect(timer.className).not.toContain('urgent');

    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByRole('timer').textContent).toBe('0:40');
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole('timer').textContent).toBe('0:10');
    expect(screen.getByRole('timer').className).toContain('urgent');
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('timer').textContent).toBe('0:00');
  });

  it('un plazo nuevo reinicia la cuenta', () => {
    const { rerender } = render(
      <Providers connection={makeConnection().connection}>
        <Countdown endsAt={Date.now() + 5000} />
      </Providers>,
    );
    expect(screen.getByRole('timer').className).toContain('urgent');
    rerender(
      <Providers connection={makeConnection().connection}>
        <Countdown endsAt={Date.now() + 90_000} />
      </Providers>,
    );
    expect(screen.getByRole('timer').textContent).toBe('1:30');
    expect(screen.getByRole('timer').className).not.toContain('urgent');
  });
});

describe('<TurnTimerOption />', () => {
  function mount(room: RoomState) {
    const { connection, transport } = makeConnection();
    transport.responses.set('lobby:setOptions', { ok: true, data: {} });
    render(
      <Providers connection={connection}>
        <TurnTimerOption room={room} />
      </Providers>,
    );
    return transport;
  }
  const admin = (turnTimerSeconds: number | null = null) =>
    roomOf('lobby', { options: { turnTimerSeconds } });

  it('quien administra elige el plazo o lo quita', async () => {
    const transport = mount(admin());
    const select = screen.getByLabelText('Temporizador de turno') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Sin límite',
      '30 segundos',
      '60 segundos',
      '90 segundos',
      '120 segundos',
      '180 segundos',
    ]);
    expect(select.value).toBe('');
    expect(screen.getByText(/un bot juega por esa persona/)).toBeTruthy();

    fireEvent.change(select, { target: { value: '90' } });
    await waitFor(() => expect(transport.sent).toHaveLength(1));
    expect(transport.sent[0]).toMatchObject({
      event: 'lobby:setOptions',
      payload: { turnTimerSeconds: 90 },
    });
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(transport.sent).toHaveLength(2));
    expect(transport.sent[1]?.payload['turnTimerSeconds']).toBeNull();
  });

  it('refleja el valor de la sala, también uno que no está entre las opciones', () => {
    mount(admin(45));
    const select = screen.getByLabelText('Temporizador de turno') as HTMLSelectElement;
    expect(select.value).toBe('45');
    expect([...select.options].map((o) => o.textContent)).toContain('45 segundos');
  });

  it('enseña el error si el servidor lo rechaza', async () => {
    const transport = mount(admin());
    transport.responses.set('lobby:setOptions', { ok: false, error: 'GAME_ALREADY_STARTED' });
    fireEvent.change(screen.getByLabelText('Temporizador de turno'), { target: { value: '60' } });
    expect((await screen.findByRole('alert')).textContent).toBe('La partida ya ha empezado.');
  });

  it('quien no administra solo ve el plazo, y nada si no hay', () => {
    const player = (turnTimerSeconds: number | null): RoomState =>
      roomOf('lobby', {
        you: { role: 'player', playerId: 'p1', admin: false },
        options: { turnTimerSeconds },
      });
    const first = render(
      <Providers connection={makeConnection().connection}>
        <TurnTimerOption room={player(60)} />
      </Providers>,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/Temporizador de turno: 60 segundos/)).toBeTruthy();
    first.unmount();
    const second = render(
      <Providers connection={makeConnection().connection}>
        <TurnTimerOption room={player(null)} />
      </Providers>,
    );
    expect(second.container.textContent).toBe('');
  });

  it('aparece en la sala de espera de la pantalla principal', () => {
    const { connection } = makeConnection();
    connection.start('host');
    render(
      <Providers connection={connection}>
        <Lobby room={roomOf('lobby', { seats: [], options: { turnTimerSeconds: 120 } })} />
      </Providers>,
    );
    expect((screen.getByLabelText('Temporizador de turno') as HTMLSelectElement).value).toBe('120');
  });
});

describe('<PlayersPanel /> con temporizador', () => {
  const room = roomOf('playing', {
    seats: [seat('p0', 'Ana'), seat('p1', 'Luis', { auto: true }), seat('p2', 'Marta')],
  });

  function mount(state: GameState, clock: ConnectionSnapshot['clock']) {
    const view = hostView(state);
    return render(
      <Providers connection={makeConnection().connection}>
        <PlayersPanel view={view} infos={playerInfos(room, view)} clock={clock} />
      </Providers>,
    );
  }

  it('quien está en juego muestra su cuenta atrás; quien está sustituido, la etiqueta', () => {
    mount(setupGame(), { actors: ['p0'], endsAt: Date.now() + 30_000 });
    const timers = screen.getAllByRole('timer');
    expect(timers).toHaveLength(1);
    expect(timers[0]?.getAttribute('aria-label')).toBe('Tiempo de Ana: 30 s');
    const cards = document.querySelectorAll('.player-card');
    expect(within(cards[0] as HTMLElement).getByRole('timer')).toBe(timers[0]);
    expect(within(cards[1] as HTMLElement).getByText('Bot al mando')).toBeTruthy();
    expect(within(cards[0] as HTMLElement).queryByText('Bot al mando')).toBeNull();
  });

  it('en el descarte puede haber varios en juego a la vez', () => {
    mount(setupGame(), { actors: ['p0', 'p2'], endsAt: Date.now() + 30_000 });
    expect(screen.getAllByRole('timer')).toHaveLength(2);
  });

  it('sin reloj, o con la partida terminada, no hay cuenta atrás', () => {
    mount(setupGame(), null);
    expect(screen.queryByRole('timer')).toBeNull();
    cleanup();
    mount(
      { ...setupGame(), phase: { type: 'ended' }, winner: 'p0' },
      {
        actors: ['p0'],
        endsAt: Date.now() + 30_000,
      },
    );
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('mando con temporizador y sustitución', () => {
  function mount(
    player: string,
    over: Partial<ConnectionSnapshot> = {},
    seats = [seat('p0', 'Ana'), seat('p1', 'Luis'), seat('p2', 'Marta')],
  ) {
    const view = getPlayerView(setupGame(), player);
    const { connection, transport } = makeConnection();
    transport.responses.set('seat:return', { ok: true, data: {} });
    const snapshot: ConnectionSnapshot = {
      status: 'connected',
      resuming: false,
      session: { code: 'ABCD', token: 'x'.repeat(24), role: 'player', playerId: player },
      room: roomOf('playing', {
        you: { role: 'player', playerId: player, admin: false },
        seats,
      }),
      view,
      seq: 20,
      clock: null,
      events: [],
      diceRoll: null,
      preview: null,
      replaced: false,
      resumeFailed: false,
      ...over,
    };
    render(
      <Providers connection={connection}>
        <Controller view={view} snapshot={snapshot} />
      </Providers>,
    );
    return transport;
  }

  it('si el reloj corre contra ti, la cabecera te dice cuánto te queda', () => {
    mount('p0', { clock: { actors: ['p0'], endsAt: Date.now() + 42_000 } });
    const timer = within(screen.getByRole('banner')).getByRole('timer');
    expect(timer.getAttribute('aria-label')).toBe('Te quedan 42 s para mover');
    expect(timer.className).toContain('mine');
  });

  it('si corre contra otra persona, la cabecera muestra de quién es el tiempo', () => {
    mount('p1', { clock: { actors: ['p0'], endsAt: Date.now() + 42_000 } });
    const timer = within(screen.getByRole('banner')).getByRole('timer');
    expect(timer.getAttribute('aria-label')).toBe('Tiempo de Ana: 42 s');
    expect(timer.className).not.toContain('mine');
  });

  it('sin reloj no hay cuenta atrás en la cabecera', () => {
    mount('p0');
    expect(within(screen.getByRole('banner')).queryByRole('timer')).toBeNull();
  });

  it('quien está sustituido ve el aviso y vuelve a la partida con un botón', async () => {
    const transport = mount('p0', {}, [
      seat('p0', 'Ana', { auto: true }),
      seat('p1', 'Luis'),
      seat('p2', 'Marta'),
    ]);
    expect(screen.getByText('Un bot está jugando por ti')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la partida' }));
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toEqual(['seat:return']));
  });

  it('si el servidor rechaza volver, se explica', async () => {
    const transport = mount('p0', {}, [
      seat('p0', 'Ana', { auto: true }),
      seat('p1', 'Luis'),
      seat('p2', 'Marta'),
    ]);
    transport.responses.set('seat:return', { ok: false, error: 'RATE_LIMITED' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la partida' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Vas demasiado deprisa. Espera un momento.',
    );
  });

  it('el aviso es solo de quien está sustituido, no de los demás', () => {
    mount('p0', {}, [seat('p0', 'Ana'), seat('p1', 'Luis', { auto: true }), seat('p2', 'Marta')]);
    expect(screen.queryByText('Un bot está jugando por ti')).toBeNull();
    // la etiqueta de quien está sustituido se ve en la pestaña del tablero
    fireEvent.click(screen.getByRole('tab', { name: /Tablero/ }));
    expect(screen.getAllByText('Bot al mando').length).toBeGreaterThan(0);
  });
});
