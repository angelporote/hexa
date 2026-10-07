import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createConfig, createGame, getPlayerView } from '@hexa/engine';
import type { GameState, PlayerView, ResourceCounts } from '@hexa/engine';
import { App } from '../App.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { Providers, makeConnection, roomOf, setupGame } from '../testing.js';
import { Controller } from './Controller.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const none: ResourceCounts = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

function snapshotFor(view: PlayerView): ConnectionSnapshot {
  return {
    status: 'connected',
    resuming: false,
    session: {
      code: 'ABCD',
      token: 'x'.repeat(24),
      role: 'player',
      playerId: view.you?.id ?? null,
    },
    room: roomOf('playing', { you: { role: 'player', playerId: view.you?.id ?? null } }),
    view,
    seq: 20,
    events: [],
    diceRoll: null,
    preview: null,
    replaced: false,
    resumeFailed: false,
  };
}

function withHand(state: GameState, id: string, hand: Partial<ResourceCounts>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, hand: { ...none, ...hand } } : p)),
  };
}

/** Monta el mando de `player` sobre `state` con un transporte falso que acepta todo. */
function mount(state: GameState, player = 'p0') {
  const view = getPlayerView(state, player);
  const { connection, transport } = makeConnection();
  for (const event of ['game:action', 'game:preview', 'lobby:update']) {
    transport.responses.set(event, { ok: true, data: {} });
  }
  const utils = render(
    <Providers connection={connection}>
      <Controller view={view} snapshot={snapshotFor(view)} />
    </Providers>,
  );
  const sent = (event: string) => transport.sent.filter((s) => s.event === event);
  return { ...utils, transport, view, sent };
}

const mainState = (): GameState => {
  const base = setupGame();
  return { ...base, phase: { type: 'main' }, turn: { ...base.turn, number: 5 } };
};

describe('mando: estados de espera', () => {
  it('cuando no es tu turno solo ves qué pasa, y tu mano', () => {
    const state = withHand(setupGame(), 'p1', { r1: 2, r4: 1 });
    mount(state, 'p1');
    expect(screen.getByText('Ana debe tirar los dados')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tirar los dados' })).toBeNull();
    const hand = screen.getByRole('region', { name: 'Tu mano' });
    expect(within(hand).getByLabelText('Madera: 2')).toBeTruthy();
    expect(within(hand).getByLabelText('Cereal: 1')).toBeTruthy();
  });

  it('la cabecera dice quién eres, tus puntos y de quién es el turno', () => {
    mount(setupGame(), 'p1');
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Luis')).toBeTruthy();
    expect(within(header).getByText('Turno de Ana')).toBeTruthy();
    expect(within(header).getByLabelText('2 puntos')).toBeTruthy();
    cleanup();
    mount(setupGame(), 'p0');
    expect(within(screen.getByRole('banner')).getByText('Es tu turno')).toBeTruthy();
  });

  it('al terminar la partida muestra el resultado', () => {
    const base = setupGame();
    mount({ ...base, phase: { type: 'ended' }, winner: 'p0' }, 'p0');
    expect(screen.getByText('¡Has ganado la partida!')).toBeTruthy();
    cleanup();
    mount({ ...base, phase: { type: 'ended' }, winner: 'p0' }, 'p1');
    expect(screen.getByText('La partida ha terminado. Gana Ana.')).toBeTruthy();
  });

  it('la tabla de costes sale de las reglas del motor', () => {
    const { container } = mount(setupGame(), 'p1');
    const costs = container.querySelector('.costs');
    expect(costs?.querySelectorAll('li')).toHaveLength(4);
    // ciudad: 2 cereal + 3 mineral = 5 iconos; camino: 2
    const rows = [...(costs?.querySelectorAll('li') ?? [])].map(
      (li) => li.querySelectorAll('svg').length,
    );
    expect(rows).toEqual([2, 4, 5, 3]);
  });
});

describe('mando: colocación inicial con confirmación en dos pasos', () => {
  function setupStart(): GameState {
    return createGame(createConfig(['p0', 'p1', 'p2']), 'controller-setup');
  }

  it('solo se pueden tocar los vértices legales; tocar marca y enseña, confirmar envía', async () => {
    const { container, transport, sent, view } = mount(setupStart(), 'p0');
    expect(screen.getByText('Toca un vértice libre para colocar tu poblado.')).toBeTruthy();
    const targets = container.querySelectorAll('[data-target-vertex]');
    expect(targets).toHaveLength(54);
    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull(); // es obligatorio

    const first = view.legalActions.find((a) => a.type === 'BUILD_SETTLEMENT');
    if (first?.type !== 'BUILD_SETTLEMENT') throw new Error('sin poblado legal');
    fireEvent.click(container.querySelector(`[data-target-vertex="${first.vertex}"]`) as Element);

    // paso 1: marcado + vista previa para la pantalla principal; todavía no se ha jugado nada
    await waitFor(() => expect(sent('game:preview')).toHaveLength(1));
    expect(sent('game:preview')[0]?.payload['target']).toEqual({
      kind: 'vertex',
      id: first.vertex,
    });
    expect(sent('game:action')).toHaveLength(0);
    expect(
      container.querySelector(`[data-target-vertex="${first.vertex}"].selected`),
    ).not.toBeNull();
    expect(confirm.disabled).toBe(false);

    // paso 2: confirmar
    fireEvent.click(confirm);
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({
      type: 'BUILD_SETTLEMENT',
      vertex: first.vertex,
    });
    // tras confirmar se borra la vista previa del host
    await waitFor(() => expect(sent('game:preview').at(-1)?.payload['target']).toBeNull());
    expect(transport.sent.map((s) => s.event)).toContain('game:action');
  });

  it('cambiar de idea antes de confirmar mueve la marca', async () => {
    const { container, view, sent } = mount(setupStart(), 'p0');
    const [a, b] = view.legalActions.filter((x) => x.type === 'BUILD_SETTLEMENT');
    if (a?.type !== 'BUILD_SETTLEMENT' || b?.type !== 'BUILD_SETTLEMENT')
      throw new Error('faltan opciones');
    fireEvent.click(container.querySelector(`[data-target-vertex="${a.vertex}"]`) as Element);
    fireEvent.click(container.querySelector(`[data-target-vertex="${b.vertex}"]`) as Element);
    expect(container.querySelectorAll('[data-target-vertex].selected')).toHaveLength(1);
    expect(container.querySelector(`[data-target-vertex="${b.vertex}"].selected`)).not.toBeNull();
    await waitFor(() => expect(sent('game:preview')).toHaveLength(2));
  });

  it('el camino inicial solo se puede poner junto al poblado recién colocado', () => {
    let state = setupStart();
    const v = state.board.topology.vertices.find((x) => x.edges.length === 3);
    if (!v) throw new Error('sin vértice');
    state = {
      ...state,
      buildings: { [v.id]: { owner: 'p0', kind: 'settlement' } },
      phase: { type: 'setup', index: 0, step: 'road', lastSettlement: v.id },
    };
    const { container } = mount(state, 'p0');
    expect(screen.getByText('Toca una arista para colocar tu camino.')).toBeTruthy();
    const edges = [...container.querySelectorAll('[data-target-edge]')].map((e) =>
      e.getAttribute('data-target-edge'),
    );
    expect(edges.sort()).toEqual([...v.edges].sort());
  });

  it('un error del servidor se muestra y se puede reintentar', async () => {
    const { container, view, transport } = mount(setupStart(), 'p0');
    transport.responses.set('game:action', { ok: false, error: 'NOT_YOUR_TURN' });
    const first = view.legalActions.find((a) => a.type === 'BUILD_SETTLEMENT');
    if (first?.type !== 'BUILD_SETTLEMENT') throw new Error('sin poblado legal');
    fireEvent.click(container.querySelector(`[data-target-vertex="${first.vertex}"]`) as Element);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('No es tu turno.');
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe('mando: turno libre', () => {
  it('en la fase de tirada ofrece tirar los dados', async () => {
    const { sent } = mount(setupGame(), 'p0');
    fireEvent.click(screen.getByRole('button', { name: 'Tirar los dados' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({ type: 'ROLL' });
    expect(screen.queryByRole('button', { name: 'Terminar turno' })).toBeNull();
  });

  it('los botones se activan solo si hay una acción legal (recursos y sitio)', () => {
    mount(withHand(mainState(), 'p0', {}), 'p0');
    const enabled = (name: string) =>
      !(screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
    expect(enabled('Camino')).toBe(false);
    expect(enabled('Poblado')).toBe(false);
    expect(enabled('Ciudad')).toBe(false);
    expect(enabled('Comprar carta')).toBe(false);
    expect(enabled('Banco')).toBe(false);
    expect(enabled('Terminar turno')).toBe(true);
    cleanup();

    mount(withHand(mainState(), 'p0', { r1: 5, r2: 5, r3: 5, r4: 5, r5: 5 }), 'p0');
    expect(enabled('Camino')).toBe(true);
    expect(enabled('Ciudad')).toBe(true);
    expect(enabled('Comprar carta')).toBe(true);
    expect(enabled('Banco')).toBe(true);
  });

  it('construir un camino abre la colocación, se puede cancelar y confirmar', async () => {
    const { container, sent, view } = mount(withHand(mainState(), 'p0', { r1: 3, r2: 3 }), 'p0');
    fireEvent.click(screen.getByRole('button', { name: 'Camino' }));
    expect(screen.getByText('Toca una arista para colocar tu camino.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Camino' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Camino' }));
    const edge = view.legalActions.find((a) => a.type === 'BUILD_ROAD');
    if (edge?.type !== 'BUILD_ROAD') throw new Error('sin camino legal');
    fireEvent.click(container.querySelector(`[data-target-edge="${edge.edge}"]`) as Element);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({
      type: 'BUILD_ROAD',
      edge: edge.edge,
    });
    // vuelve a la pantalla principal del turno
    await screen.findByRole('button', { name: 'Terminar turno' });
  });

  it('mejorar a ciudad solo deja tocar tus poblados', () => {
    const { container, view } = mount(withHand(mainState(), 'p0', { r4: 2, r5: 3 }), 'p0');
    fireEvent.click(screen.getByRole('button', { name: 'Ciudad' }));
    const mine = Object.entries(view.buildings).filter(
      ([, b]) => b.owner === 'p0' && b.kind === 'settlement',
    );
    const targets = [...container.querySelectorAll('[data-target-vertex]')].map((e) =>
      e.getAttribute('data-target-vertex'),
    );
    expect(targets.sort()).toEqual(mine.map(([id]) => id).sort());
  });

  it('terminar el turno y comprar carta envían la acción correspondiente', async () => {
    const { sent } = mount(withHand(mainState(), 'p0', { r3: 1, r4: 1, r5: 1 }), 'p0');
    fireEvent.click(screen.getByRole('button', { name: 'Comprar carta' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    // mientras se espera la respuesta los botones se bloquean; después vuelven a estar activos
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Terminar turno' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Terminar turno' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(2));
    expect(sent('game:action').map((s) => (s.payload['action'] as { type: string }).type)).toEqual([
      'BUY_DEV_CARD',
      'END_TURN',
    ]);
  });
});

describe('mando: el 7', () => {
  const discardState = (): GameState => ({
    ...withHand(mainState(), 'p1', { r1: 5, r2: 4 }),
    phase: { type: 'discard', owed: { p1: 4 } },
  });

  it('el descarte exige elegir exactamente las cartas debidas y solo de tu mano', async () => {
    const { sent } = mount(discardState(), 'p1');
    expect(screen.getByText('Un 7: descarta 4 cartas.')).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: '+ Madera' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Arcilla' }));
    expect(screen.getByText('4 de 4 cartas elegidas')).toBeTruthy();
    // ya no se pueden añadir más
    expect((screen.getByRole('button', { name: '+ Madera' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // y no se puede elegir lo que no se tiene
    expect((screen.getByRole('button', { name: '+ Lana' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({
      type: 'DISCARD',
      resources: { ...none, r1: 3, r2: 1 },
    });
  });

  it('quien no debe descartar espera', () => {
    mount(discardState(), 'p2');
    expect(screen.getByText(/Descartes pendientes: Luis/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  function robberState(): GameState {
    let s: GameState = { ...mainState(), phase: { type: 'robber', returnTo: 'main' } };
    const hex = s.board.topology.hexes.find((h) => h.id !== s.robber);
    if (!hex) throw new Error('sin hexágono');
    s = {
      ...s,
      buildings: {
        ...s.buildings,
        [hex.vertices[0] ?? '']: { owner: 'p1', kind: 'settlement' },
        [hex.vertices[3] ?? '']: { owner: 'p2', kind: 'settlement' },
      },
    };
    return withHand(withHand(s, 'p1', { r1: 1 }), 'p2', { r2: 1 });
  }

  it('el ladrón: se elige hexágono y, si hay varias víctimas, a quién robar', async () => {
    const state = robberState();
    const target = state.board.topology.hexes.find(
      (h) =>
        h.id !== state.robber &&
        h.vertices.some((v) => state.buildings[v]?.owner === 'p1') &&
        h.vertices.some((v) => state.buildings[v]?.owner === 'p2'),
    );
    if (!target) throw new Error('sin hexágono con dos víctimas');
    const { container, sent } = mount(state, 'p0');
    expect(screen.getByText('Toca el hexágono al que mover el ladrón.')).toBeTruthy();
    expect(container.querySelectorAll('[data-target-hex]')).toHaveLength(18);

    fireEvent.click(container.querySelector(`[data-target-hex="${target.id}"]`) as Element);
    // con dos víctimas posibles no se puede confirmar hasta elegir una
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Marta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({
      type: 'MOVE_ROBBER',
      hex: target.id,
      victim: 'p2',
    });
  });

  it('con una sola víctima (o ninguna) se confirma directamente', async () => {
    const state = robberState();
    const free = state.board.topology.hexes.find(
      (h) => h.id !== state.robber && h.vertices.every((v) => !state.buildings[v]),
    );
    if (!free) throw new Error('sin hexágono libre');
    const { container, sent } = mount(state, 'p0');
    fireEvent.click(container.querySelector(`[data-target-hex="${free.id}"]`) as Element);
    expect(screen.getByText('No hay a quién robar en ese hexágono.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({
      type: 'MOVE_ROBBER',
      hex: free.id,
      victim: null,
    });
  });
});

describe('mando: comercio con el banco y cartas', () => {
  it('banco: muestra la tarifa de tus puertos, pide entregar y recibir y confirma', async () => {
    let state = withHand(mainState(), 'p0', { r1: 4, r2: 2 });
    const port = state.board.ports.find((p) => p.kind === 'r2');
    if (!port) throw new Error('sin puerto de r2');
    state = {
      ...state,
      buildings: { ...state.buildings, [port.vertices[0]]: { owner: 'p0', kind: 'settlement' } },
    };
    const { sent } = mount(state, 'p0');

    fireEvent.click(screen.getByRole('button', { name: 'Banco' }));
    const give = (name: string) =>
      screen.getByRole('button', { name: new RegExp(name) }) as HTMLButtonElement;
    expect(give('Madera').textContent).toContain('4:1');
    expect(give('Arcilla').textContent).toContain('2:1'); // por el puerto
    expect(give('Lana').disabled).toBe(true); // no tiene
    fireEvent.click(give('Arcilla'));

    expect(screen.getByText('Elige qué quieres recibir.')).toBeTruthy();
    fireEvent.click(give('Mineral'));
    expect(screen.getByText('Entregas 2 de Arcilla y recibes 1 de Mineral.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({
      type: 'BANK_TRADE',
      give: 'r2',
      want: 'r5',
    });
  });

  it('banco: se puede volver atrás y cancelar', () => {
    mount(withHand(mainState(), 'p0', { r1: 4 }), 'p0');
    fireEvent.click(screen.getByRole('button', { name: 'Banco' }));
    fireEvent.click(screen.getByRole('button', { name: /Madera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByText(/Elige qué entregas/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Terminar turno' })).toBeTruthy();
  });

  function withCards(
    state: GameState,
    ...cards: ('army' | 'roads' | 'plenty' | 'monopoly' | 'point')[]
  ): GameState {
    return {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p0' ? { ...p, devCards: cards.map((card) => ({ card, boughtOnTurn: 1 })) } : p,
      ),
    };
  }

  it('las cartas jugables aparecen como botones y las demás no', async () => {
    const { sent } = mount(withCards(mainState(), 'army', 'point'), 'p0');
    expect(screen.getByText('Punto (oculta)')).toBeTruthy(); // en la mano, sin botón
    expect(screen.queryByRole('button', { name: 'Monopolio' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ejército' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({ type: 'PLAY_ARMY' });
  });

  it('una carta comprada este turno aparece marcada y sin botón', () => {
    const base = mainState();
    const state = {
      ...base,
      players: base.players.map((p) =>
        p.id === 'p0'
          ? { ...p, devCards: [{ card: 'army' as const, boughtOnTurn: base.turn.number }] }
          : p,
      ),
    };
    mount(state, 'p0');
    expect(screen.getByText('nueva')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ejército' })).toBeNull();
  });

  it('abundancia: se eligen dos recursos y se confirma', async () => {
    const { sent } = mount(withCards(mainState(), 'plenty'), 'p0');
    fireEvent.click(screen.getByRole('button', { name: 'Abundancia' }));
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: /Madera/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cereal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    const action = sent('game:action')[0]?.payload['action'] as {
      type: string;
      resources: string[];
    };
    expect(action.type).toBe('PLAY_PLENTY');
    expect([...action.resources].sort()).toEqual(['r1', 'r4']);
  });

  it('monopolio: se elige un recurso y se confirma', async () => {
    const { sent } = mount(withCards(mainState(), 'monopoly'), 'p0');
    fireEvent.click(screen.getByRole('button', { name: 'Monopolio' }));
    fireEvent.click(screen.getByRole('button', { name: /Lana/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(sent('game:action')).toHaveLength(1));
    expect(sent('game:action')[0]?.payload['action']).toEqual({
      type: 'PLAY_MONOPOLY',
      resource: 'r3',
    });
  });

  it('carta de caminos: tras jugarla se colocan caminos gratis de forma obligatoria', () => {
    const base = withCards(mainState(), 'roads');
    const free: GameState = {
      ...base,
      phase: { type: 'roadBuilding', remaining: 2, returnTo: 'main' },
    };
    mount(free, 'p0');
    expect(screen.getByText('Coloca tu camino gratis (2 por colocar).')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });
});

describe('unirse y sala de espera desde el móvil', () => {
  const session = { code: 'ABCD', token: 't'.repeat(24), role: 'player' as const, playerId: 'p0' };

  it('unirse envía código, nombre y color, y lleva a la sala', async () => {
    const { connection, transport } = makeConnection();
    transport.responses.set('room:join', { ok: true, data: session });
    render(
      <Providers connection={connection} route="/join?code=abcd">
        <App />
      </Providers>,
    );
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: '  Ana  ' } });
    fireEvent.click(screen.getByLabelText('Azul'));
    fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toContain('room:join'));
    expect(transport.sent.find((s) => s.event === 'room:join')?.payload).toMatchObject({
      code: 'ABCD',
      role: 'player',
      name: 'Ana',
      color: 'c2',
    });
    // el servidor envía el estado de la sala y la pantalla pasa a la sala de espera
    act(() =>
      transport.emit(
        'room:state',
        roomOf('lobby', {
          you: { role: 'player', playerId: 'p0' },
          seats: [
            { playerId: 'p0', name: 'Ana', color: 'c2', ready: false, connected: true, bot: false },
          ],
        }),
      ),
    );
    expect(await screen.findByText('Esperando a que la pantalla empiece la partida…')).toBeTruthy();
  });

  it('valida el código y el nombre antes de enviar, y traduce los errores del servidor', async () => {
    const { connection, transport } = makeConnection();
    render(
      <Providers connection={connection} route="/join">
        <App />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));
    expect((await screen.findByRole('alert')).textContent).toBe('El código tiene 4 letras.');
    fireEvent.change(screen.getByLabelText(/Código de sala/), { target: { value: 'ab1c-d' } });
    expect((screen.getByLabelText(/Código de sala/) as HTMLInputElement).value).toBe('ABCD');
    fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Escribe un nombre (hasta 20 caracteres).',
    );
    expect(transport.sent.map((s) => s.event)).not.toContain('room:join');

    transport.responses.set('room:join', { ok: false, error: 'ROOM_NOT_FOUND' });
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No existe ninguna sala con ese código.',
    );
  });

  it('en la sala de espera se marca listo, se cambia de color y los ocupados se bloquean', async () => {
    const { connection, transport } = makeConnection({ key: 'player', session });
    transport.responses.set('session:resume', { ok: true, data: session });
    transport.responses.set('lobby:update', { ok: true, data: {} });
    render(
      <Providers connection={connection} route="/play/ABCD">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.map((s) => s.event)).toContain('session:resume'));
    act(() =>
      transport.emit(
        'room:state',
        roomOf('lobby', {
          you: { role: 'player', playerId: 'p0' },
          seats: [
            { playerId: 'p0', name: 'Ana', color: 'c1', ready: false, connected: true, bot: false },
            { playerId: 'p1', name: 'Luis', color: 'c2', ready: true, connected: true, bot: true },
          ],
        }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Estoy listo' }));
    await waitFor(() =>
      expect(transport.sent.filter((s) => s.event === 'lobby:update')).toHaveLength(1),
    );
    expect(transport.sent.find((s) => s.event === 'lobby:update')?.payload['ready']).toBe(true);

    expect((screen.getByLabelText('Azul') as HTMLInputElement).disabled).toBe(true); // lo tiene Luis
    fireEvent.click(screen.getByLabelText('Naranja'));
    await waitFor(() =>
      expect(transport.sent.filter((s) => s.event === 'lobby:update')).toHaveLength(2),
    );
    expect(transport.sent.filter((s) => s.event === 'lobby:update')[1]?.payload['color']).toBe(
      'c3',
    );
    expect(screen.getByText('Luis')).toBeTruthy();
    expect(screen.getByText('Ana (tú)')).toBeTruthy();
  });

  it('con la partida en marcha, /play muestra el mando', async () => {
    const { connection, transport } = makeConnection({ key: 'player', session });
    transport.responses.set('session:resume', { ok: true, data: session });
    render(
      <Providers connection={connection} route="/play/ABCD">
        <App />
      </Providers>,
    );
    await waitFor(() => expect(transport.sent.length).toBeGreaterThan(0));
    const view = getPlayerView(setupGame(), 'p0');
    act(() => {
      transport.emit('room:state', roomOf('playing', { you: { role: 'player', playerId: 'p0' } }));
      transport.emit('game:view', { seq: 7, view });
    });
    expect(await screen.findByRole('button', { name: 'Tirar los dados' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tu mano' })).toBeTruthy();
  });
});
