// Solo para tests: datos de partida reales del motor y un envoltorio con todos los proveedores.
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  applyAction,
  createConfig,
  createGame,
  getPlayerView,
  respectsDistanceRule,
} from '@hexa/engine';
import type { GameState, PlayerView } from '@hexa/engine';
import type { RoomState, SessionData } from '@hexa/protocol';
import type { Locale } from '@hexa/theme';
import { I18nProvider } from './i18n/index.js';
import { GameConnection } from './net/connection.js';
import { FakeTransport } from './net/fake-transport.js';
import { memorySessionStore } from './net/session-store.js';
import { ConnectionProvider } from './net/provider.js';

export function makeConnection(stored?: { key: string; session: SessionData }): {
  connection: GameConnection;
  transport: FakeTransport;
} {
  const transport = new FakeTransport();
  const store = memorySessionStore();
  if (stored) store.set(stored.key, stored.session);
  return { connection: new GameConnection(transport, store), transport };
}

export function Providers({
  children,
  connection,
  locale = 'es',
  route = '/',
}: {
  children: ReactNode;
  connection: GameConnection;
  locale?: Locale;
  route?: string;
}) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <I18nProvider initial={locale}>
        <ConnectionProvider connection={connection}>{children}</ConnectionProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

export const PLAYER_IDS = ['p0', 'p1', 'p2'];

/** Partida de 3 jugadores tras la colocación inicial: ya hay 6 poblados y 6 caminos. */
export function setupGame(): GameState {
  let state = createGame(createConfig(PLAYER_IDS), 'web-tests');
  while (state.phase.type === 'setup') {
    const player = state.turn.player;
    const vertex = state.board.topology.vertices.find(
      (v) => !state.buildings[v.id] && respectsDistanceRule(state, v.id),
    );
    if (!vertex) throw new Error('sin vértice');
    const settled = applyAction(state, player, { type: 'BUILD_SETTLEMENT', vertex: vertex.id });
    if (!settled.ok) throw new Error(settled.error);
    const edge = vertex.edges.find((e) => !settled.value.state.roads[e]);
    if (!edge) throw new Error('sin arista');
    const built = applyAction(settled.value.state, player, { type: 'BUILD_ROAD', edge });
    if (!built.ok) throw new Error(built.error);
    state = built.value.state;
  }
  return state;
}

export function hostView(state: GameState): PlayerView {
  return getPlayerView(state, 'host');
}

export function roomOf(
  status: RoomState['status'] = 'playing',
  over: Partial<RoomState> = {},
): RoomState {
  return {
    code: 'ABCD',
    status,
    hostConnected: true,
    seats: [
      { playerId: 'p0', name: 'Ana', color: 'c1', ready: true, connected: true, bot: false },
      { playerId: 'p1', name: 'Luis', color: 'c2', ready: true, connected: true, bot: true },
      { playerId: 'p2', name: 'Marta', color: 'c3', ready: true, connected: false, bot: false },
    ],
    spectators: 0,
    you: { role: 'host', playerId: null },
    ...over,
  };
}
