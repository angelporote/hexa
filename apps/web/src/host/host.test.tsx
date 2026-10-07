import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PlayerView } from '@hexa/engine';
import type { ConnectionSnapshot } from '../net/connection.js';
import { GameScreen } from './GameScreen.js';
import { Lobby } from './Lobby.js';
import { PlayersPanel } from './PlayersPanel.js';
import { QrCode } from './QrCode.js';
import { playerInfos } from './players.js';
import { Providers, hostView, makeConnection, roomOf, setupGame } from '../testing.js';

afterEach(cleanup);

function snapshotWith(
  view: PlayerView,
  patch: Partial<ConnectionSnapshot> = {},
): ConnectionSnapshot {
  return {
    status: 'connected',
    resuming: false,
    session: null,
    room: roomOf('playing'),
    view,
    seq: 10,
    clock: null,
    events: [],
    diceRoll: null,
    preview: null,
    replaced: false,
    resumeFailed: false,
    ...patch,
  };
}

describe('<PlayersPanel />', () => {
  it('muestra nombre, puntos y solo el número de cartas de cada jugador', () => {
    const view = hostView(setupGame());
    const infos = playerInfos(roomOf('playing'), view);
    const { container } = render(
      <Providers connection={makeConnection().connection}>
        <PlayersPanel view={view} infos={infos} />
      </Providers>,
    );
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('Luis')).toBeTruthy();
    expect(screen.getByText('Marta')).toBeTruthy();
    const cards = container.querySelectorAll('.player-card');
    expect(cards).toHaveLength(3);
    // los 3 jugadores tienen 2 poblados: 2 puntos públicos
    expect([...container.querySelectorAll('.player-points')].map((e) => e.textContent)).toEqual([
      '2',
      '2',
      '2',
    ]);
    // el jugador activo (p0) está marcado; la desconectada (Marta) se atenúa y se etiqueta
    expect(cards[0]?.getAttribute('aria-current')).toBe('true');
    expect(cards[1]?.getAttribute('aria-current')).toBeNull();
    expect(cards[2]?.className).toContain('offline');
    expect(within(cards[1] as HTMLElement).getByText('Bot')).toBeTruthy();
  });

  it('indica las bonificaciones de su titular', () => {
    const base = setupGame();
    const view = hostView({ ...base, awards: { longestRoad: 'p1', largestArmy: 'p2' } });
    render(
      <Providers connection={makeConnection().connection}>
        <PlayersPanel view={view} infos={playerInfos(roomOf('playing'), view)} />
      </Providers>,
    );
    expect(screen.getAllByText('Camino más largo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mayor ejército').length).toBeGreaterThan(0);
  });
});

describe('<GameScreen />', () => {
  it('muestra el turno, la fase, el tablero, los jugadores y el banco', () => {
    const view = hostView(setupGame());
    const { container } = render(
      <Providers connection={makeConnection().connection}>
        <GameScreen view={view} snapshot={snapshotWith(view)} />
      </Providers>,
    );
    expect(screen.getByText('Turno de Ana')).toBeTruthy();
    expect(screen.getByText('Ana debe tirar los dados')).toBeTruthy();
    expect(container.querySelectorAll('.hex')).toHaveLength(19);
    expect(container.querySelectorAll('.player-card')).toHaveLength(3);
    expect(container.querySelectorAll('.bank-item').length).toBe(6);
    expect(screen.getByText('La partida acaba de empezar.')).toBeTruthy();
  });

  it('muestra los dados con la última tirada y el registro de eventos con nombres', () => {
    const view = hostView(setupGame());
    const snapshot = snapshotWith(view, {
      diceRoll: { dice: [3, 4], key: 7 },
      events: [
        { id: 1, seq: 9, event: { type: 'DICE_ROLLED', player: 'p0', dice: [3, 4], total: 7 } },
        { id: 2, seq: 9, event: { type: 'CARDS_DISCARDED', player: 'p1', count: 4 } },
      ],
    });
    render(
      <Providers connection={makeConnection().connection}>
        <GameScreen view={view} snapshot={snapshot} />
      </Providers>,
    );
    expect(screen.getByRole('img', { name: 'Última tirada: 7' })).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items.some((t) => t?.includes('Ana saca 7 (3 + 4)'))).toBe(true);
    expect(items.some((t) => t?.includes('Luis descarta 4 cartas'))).toBe(true);
    // lo más reciente va arriba
    const log = screen.getByRole('region', { name: 'Registro' });
    expect(within(log).getAllByRole('listitem')[0]?.textContent).toContain('Luis descarta');
  });

  it('enseña en el tablero lo que el jugador de turno está a punto de elegir', () => {
    const view = hostView(setupGame());
    const vertex = Object.keys(view.board.topology.vertexById)[0] ?? '';
    const { container } = render(
      <Providers connection={makeConnection().connection}>
        <GameScreen
          view={view}
          snapshot={snapshotWith(view, {
            preview: { playerId: 'p1', target: { kind: 'vertex', id: vertex } },
          })}
        />
      </Providers>,
    );
    const mark = container.querySelector('[data-preview="vertex"]');
    expect(mark).not.toBeNull();
    // lleva el color del jugador que elige (Luis, c2)
    expect(mark?.getAttribute('stroke')).toBe('#3d8bfd');
  });

  it('muestra al ganador cuando termina la partida', () => {
    const base = setupGame();
    const ended = hostView({ ...base, phase: { type: 'ended' }, winner: 'p1' });
    render(
      <Providers connection={makeConnection().connection}>
        <GameScreen view={ended} snapshot={snapshotWith(ended)} />
      </Providers>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('¡Luis gana la partida!')).toBeTruthy();
    expect(screen.getAllByText('Partida terminada').length).toBeGreaterThan(0);
  });

  it('funciona en inglés', () => {
    const view = hostView(setupGame());
    render(
      <Providers connection={makeConnection().connection} locale="en">
        <GameScreen view={view} snapshot={snapshotWith(view)} />
      </Providers>,
    );
    expect(screen.getByText("Ana's turn")).toBeTruthy();
    expect(screen.getByText('Ana must roll the dice')).toBeTruthy();
  });
});

describe('<Lobby />', () => {
  function renderLobby(room = roomOf('lobby', { seats: [] })) {
    const { connection, transport } = makeConnection();
    connection.start('host');
    render(
      <Providers connection={connection}>
        <Lobby room={room} />
      </Providers>,
    );
    return { connection, transport };
  }

  it('muestra el código de sala grande y un QR con su enlace', () => {
    renderLobby();
    expect(screen.getByText('ABCD')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Código QR para unirse a la sala ABCD' })).toBeTruthy();
    expect(screen.getByText('Esperando jugadores…')).toBeTruthy();
    expect(screen.getByText(/Hacen falta al menos 2 jugadores/)).toBeTruthy();
  });

  it('lista a los jugadores con su estado y habilita empezar solo con 2+ listos', () => {
    const notReady = roomOf('lobby');
    renderLobby({ ...notReady, seats: notReady.seats.map((s, i) => ({ ...s, ready: i === 0 })) });
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Empezar partida' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('Todos los jugadores deben estar listos')).toBeTruthy();
    cleanup();

    renderLobby(roomOf('lobby'));
    expect(
      (screen.getByRole('button', { name: 'Empezar partida' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.getByText('Desconectado')).toBeTruthy(); // Marta
  });

  it('añadir bot, quitar bot y empezar envían los mensajes al servidor', async () => {
    const { transport } = renderLobby(roomOf('lobby'));
    transport.responses.set('lobby:addBot', { ok: true, data: {} });
    transport.responses.set('lobby:removeBot', { ok: true, data: {} });
    transport.responses.set('lobby:start', { ok: true, data: {} });

    fireEvent.click(screen.getByRole('button', { name: 'Añadir bot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar partida' }));
    await waitFor(() =>
      expect(transport.sent.map((s) => s.event)).toEqual([
        'lobby:addBot',
        'lobby:removeBot',
        'lobby:start',
      ]),
    );
    expect(transport.sent[1]?.payload['playerId']).toBe('p1');
  });

  it('muestra el error del servidor traducido', async () => {
    const { transport } = renderLobby(roomOf('lobby'));
    transport.responses.set('lobby:start', { ok: false, error: 'PLAYERS_NOT_READY' });
    fireEvent.click(screen.getByRole('button', { name: 'Empezar partida' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Todos los jugadores deben estar listos.',
    );
  });

  it('con 4 jugadores no deja añadir más bots', () => {
    const room = roomOf('lobby');
    renderLobby({
      ...room,
      seats: [
        ...room.seats,
        {
          playerId: 'p3',
          name: 'Eva',
          color: 'c4',
          ready: true,
          connected: true,
          bot: false,
          auto: false,
        },
      ],
    });
    expect((screen.getByRole('button', { name: 'Añadir bot' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('<QrCode />', () => {
  it('genera un trazado distinto para cada valor', () => {
    const a = render(<QrCode value="http://x.test/join?code=ABCD" label="qr-a" />);
    const pathA = a.container.querySelector('path')?.getAttribute('d') ?? '';
    cleanup();
    const b = render(<QrCode value="http://x.test/join?code=WXYZ" label="qr-b" />);
    const pathB = b.container.querySelector('path')?.getAttribute('d') ?? '';
    expect(pathA.length).toBeGreaterThan(200);
    expect(pathA).not.toBe(pathB);
  });
});
