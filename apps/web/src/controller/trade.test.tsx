import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { applyAction, getPlayerView } from '@hexa/engine';
import type { Action, GameState, ResourceCounts } from '@hexa/engine';
import { GameScreen } from '../host/GameScreen.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { Providers, makeConnection, roomOf, setupGame } from '../testing.js';
import { Controller } from './Controller.js';

afterEach(cleanup);

const none: ResourceCounts = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

/** Fase principal del turno de p0 con las manos indicadas (p0 Ana, p1 Luis, p2 Marta). */
function mainState(hands: Record<string, Partial<ResourceCounts>>): GameState {
  const base = setupGame();
  return {
    ...base,
    phase: { type: 'main' },
    turn: { ...base.turn, number: 5 },
    players: base.players.map((p) => ({ ...p, hand: { ...none, ...hands[p.id] } })),
  };
}

function apply(state: GameState, player: string, action: Action): GameState {
  const r = applyAction(state, player, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.value.state;
}

const HANDS = { p0: { r1: 3, r5: 1 }, p1: { r2: 2, r3: 1 }, p2: { r2: 1, r3: 1 } };
const offerTerms = { give: { ...none, r1: 2 }, want: { ...none, r2: 1 } };

const withOffer = (to: string[] | null = null): GameState =>
  apply(mainState(HANDS), 'p0', { type: 'OFFER_TRADE', to, ...offerTerms });

function snapshotFor(state: GameState, player: string): ConnectionSnapshot {
  const view = getPlayerView(state, player);
  return {
    status: 'connected',
    resuming: false,
    session: { code: 'ABCD', token: 'x'.repeat(24), role: 'player', playerId: player },
    room: roomOf('playing', { you: { role: 'player', playerId: player, admin: false } }),
    view,
    seq: 30,
    clock: null,
    events: [],
    diceRoll: null,
    preview: null,
    replaced: false,
    resumeFailed: false,
  };
}

function mount(state: GameState, player: string) {
  const { connection, transport } = makeConnection();
  transport.responses.set('game:action', { ok: true, data: {} });
  const snapshot = snapshotFor(state, player);
  const view = snapshot.view;
  if (!view) throw new Error('sin vista');
  const utils = render(
    <Providers connection={connection}>
      <Controller view={view} snapshot={snapshot} />
    </Providers>,
  );
  const actions = () =>
    transport.sent.filter((s) => s.event === 'game:action').map((s) => s.payload['action']);
  return { ...utils, transport, actions, connection };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const enabled = (name: string | RegExp) =>
  !(screen.getByRole('button', { name }) as HTMLButtonElement).disabled;

describe('proponer un intercambio desde el mando', () => {
  it('el botón solo está disponible si se puede ofrecer algo', () => {
    mount(mainState({}), 'p0');
    expect(enabled('Comerciar con jugadores')).toBe(false);
    cleanup();
    mount(mainState(HANDS), 'p0');
    expect(enabled('Comerciar con jugadores')).toBe(true);
  });

  it('se elige qué dar (limitado a tu mano) y qué pedir, y se envía a todos', async () => {
    const { actions } = mount(mainState(HANDS), 'p0');
    click('Comerciar con jugadores');
    expect(screen.getByText('Propón un intercambio')).toBeTruthy();
    expect(enabled('Enviar oferta')).toBe(false);
    expect(screen.getByText('Elige al menos una carta en cada lado.')).toBeTruthy();

    // no se puede dar más de lo que se tiene (3 de Madera)
    for (let i = 0; i < 5; i++)
      fireEvent.click(screen.getByRole('button', { name: 'Das: + Madera' }));
    expect(
      (screen.getByRole('button', { name: 'Das: + Madera' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Das: − Madera' }));
    // ni dar lo que no se tiene
    expect(
      (screen.getByRole('button', { name: 'Das: + Cereal' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pides: + Arcilla' }));
    expect(enabled('Enviar oferta')).toBe(true);

    click('Enviar oferta');
    await waitFor(() => expect(actions()).toHaveLength(1));
    expect(actions()[0]).toEqual({
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 2 },
      want: { ...none, r2: 1 },
    });
    // al terminar vuelve a la pantalla del turno
    await screen.findByRole('button', { name: 'Terminar turno' });
  });

  it('se puede dirigir a jugadores concretos', async () => {
    const { actions } = mount(mainState(HANDS), 'p0');
    click('Comerciar con jugadores');
    fireEvent.click(screen.getByRole('button', { name: 'Das: + Madera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pides: + Lana' }));
    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
    click('Luis');
    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Luis' }).getAttribute('aria-pressed')).toBe('true');
    click('Enviar oferta');
    await waitFor(() => expect(actions()).toHaveLength(1));
    expect(actions()[0]).toMatchObject({ type: 'OFFER_TRADE', to: ['p1'] });
  });

  it('muestra el error del servidor y deja corregir la oferta', async () => {
    const { transport, actions } = mount(mainState(HANDS), 'p0');
    transport.responses.set('game:action', { ok: false, error: 'INVALID_TRADE' });
    click('Comerciar con jugadores');
    fireEvent.click(screen.getByRole('button', { name: 'Das: + Madera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pides: + Madera' })); // mismo recurso: inválido
    click('Enviar oferta');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Oferta no válida/);
    expect(actions()).toHaveLength(1);
    expect(screen.getByText('Propón un intercambio')).toBeTruthy(); // sigue en el formulario
    click('Cancelar');
    expect(screen.getByRole('button', { name: 'Terminar turno' })).toBeTruthy();
  });
});

describe('responder a una oferta', () => {
  it('el destinatario ve la oferta y la puede aceptar', async () => {
    const { actions } = mount(withOffer(), 'p1');
    const card = screen.getByRole('region', { name: 'Intercambio' });
    expect(within(card).getByText('Ana')).toBeTruthy();
    expect(within(card).getByText(/propone/)).toBeTruthy();
    expect(within(card).getByText('×2')).toBeTruthy();
    expect(within(card).getAllByText('Madera').length).toBeGreaterThan(0);
    click('Aceptar');
    await waitFor(() => expect(actions()).toHaveLength(1));
    expect(actions()[0]).toEqual({ type: 'ACCEPT_TRADE', offerId: 1 });
  });

  it('rechazar envía el rechazo', async () => {
    const { actions } = mount(withOffer(), 'p2');
    click('Rechazar');
    await waitFor(() => expect(actions()).toHaveLength(1));
    expect(actions()[0]).toEqual({ type: 'REJECT_TRADE', offerId: 1 });
  });

  it('sin las cartas que piden no se puede aceptar, y se avisa', () => {
    const state = apply(mainState({ ...HANDS, p1: { r3: 1 } }), 'p0', {
      type: 'OFFER_TRADE',
      to: null,
      ...offerTerms,
    });
    mount(state, 'p1');
    expect(enabled('Aceptar')).toBe(false);
    expect(screen.getByText('No tienes las cartas que piden.')).toBeTruthy();
    expect(enabled('Rechazar')).toBe(true);
  });

  it('tras responder se recuerda lo que se dijo', () => {
    let state = withOffer();
    state = apply(state, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 });
    state = apply(state, 'p2', { type: 'REJECT_TRADE', offerId: 1 });
    mount(state, 'p1');
    expect(
      screen.getByText('Has aceptado. Espera a que el oferente cierre el trato.'),
    ).toBeTruthy();
    expect(enabled('Aceptar')).toBe(false);
    cleanup();
    mount(state, 'p2');
    expect(screen.getByText('Has rechazado esta oferta.')).toBeTruthy();
    expect(enabled('Rechazar')).toBe(false);
  });

  it('quien no es destinatario de una oferta dirigida la ve pero no puede responder', () => {
    mount(withOffer(['p1']), 'p2');
    expect(screen.getByRole('region', { name: 'Intercambio' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contraofertar' })).toBeNull();
  });
});

describe('contraoferta desde el mando', () => {
  it('se parte de las condiciones originales vistas desde tu lado y se envía lo que se cambie', async () => {
    const { actions } = mount(withOffer(), 'p1');
    click('Contraofertar');
    expect(screen.getByText('Haz una contraoferta')).toBeTruthy();
    // Luis recibe 2 de Madera por 1 de Arcilla: parte dando 1 de Arcilla y pidiendo 2 de Madera
    const give = screen.getByRole('group', { name: 'Das' });
    const want = screen.getByRole('group', { name: 'Pides' });
    expect(within(give).getByLabelText('Das: − Arcilla')).toBeTruthy();
    expect((within(give).getByLabelText('Das: − Arcilla') as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((within(want).getByLabelText('Pides: − Madera') as HTMLButtonElement).disabled).toBe(
      false,
    );
    // pide solo 1 de Madera en lugar de 2
    fireEvent.click(within(want).getByLabelText('Pides: − Madera'));
    click('Enviar contraoferta');
    await waitFor(() => expect(actions()).toHaveLength(1));
    expect(actions()[0]).toEqual({
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r2: 1 },
      want: { ...none, r1: 1 },
    });
    // después sigue viendo la oferta
    await screen.findByRole('region', { name: 'Intercambio' });
  });

  it('si la oferta se cierra mientras redactas, vuelves a la pantalla de espera', () => {
    const open = withOffer();
    const { rerender, connection } = mount(open, 'p1');
    click('Contraofertar');
    expect(screen.getByText('Haz una contraoferta')).toBeTruthy();
    const closed = apply(open, 'p0', { type: 'CANCEL_TRADE', offerId: 1 });
    const snapshot = snapshotFor(closed, 'p1');
    rerender(
      <Providers connection={connection}>
        {snapshot.view && <Controller view={snapshot.view} snapshot={snapshot} />}
      </Providers>,
    );
    expect(screen.queryByText('Haz una contraoferta')).toBeNull();
    expect(screen.getByText('Ana juega su turno')).toBeTruthy();
  });

  it('quien no tiene cartas no puede contraofertar', () => {
    const state = apply(mainState({ p0: { r1: 3 }, p1: {}, p2: { r2: 1 } }), 'p0', {
      type: 'OFFER_TRADE',
      to: null,
      ...offerTerms,
    });
    mount(state, 'p1');
    expect(enabled('Contraofertar')).toBe(false);
  });
});

describe('el oferente gestiona su oferta', () => {
  it('ve cómo responden y cierra el trato con quien aceptó', async () => {
    let state = withOffer();
    state = apply(state, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 });
    state = apply(state, 'p2', { type: 'REJECT_TRADE', offerId: 1 });
    const { actions } = mount(state, 'p0');
    const card = screen.getByRole('region', { name: 'Intercambio' });
    expect(within(card).getByText('Tu oferta')).toBeTruthy();
    expect(within(card).getByText('Aceptó')).toBeTruthy();
    expect(within(card).getByText('Rechazó')).toBeTruthy();
    click('Cerrar con Luis');
    await waitFor(() => expect(actions()).toHaveLength(1));
    expect(actions()[0]).toEqual({ type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' });
  });

  it('puede aceptar una contraoferta o cancelar la oferta', async () => {
    let state = withOffer();
    state = apply(state, 'p1', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r2: 2 },
      want: { ...none, r1: 1 },
    });
    const { actions } = mount(state, 'p0');
    expect(screen.getByText('Contraoferta')).toBeTruthy();
    click('Aceptar la de Luis');
    await waitFor(() => expect(actions()).toHaveLength(1));
    expect(actions()[0]).toEqual({ type: 'CONFIRM_COUNTER', offerId: 1, with: 'p1' });
    cleanup();
    const second = mount(withOffer(), 'p0');
    click('Cancelar oferta');
    await waitFor(() => expect(second.actions()).toHaveLength(1));
    expect(second.actions()[0]).toEqual({ type: 'CANCEL_TRADE', offerId: 1 });
  });

  it('mientras la oferta está abierta no se puede abrir otra, y se avisa de que se esperan respuestas', () => {
    mount(withOffer(), 'p0');
    expect(enabled('Comerciar con jugadores')).toBe(false);
    expect(screen.getByText('Esperando respuestas…')).toBeTruthy();
  });

  it('si ya no se pueden cubrir las cartas del trato, el botón de cerrar se desactiva', () => {
    let state = withOffer();
    state = apply(state, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 });
    const spent: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, hand: { ...none } } : p)),
    };
    mount(spent, 'p0');
    expect(enabled('Cerrar con Luis')).toBe(false);
  });
});

describe('la oferta en la pantalla principal', () => {
  it('el host muestra la oferta abierta con quién la aceptó, rechazó o contraofertó', () => {
    let state = withOffer();
    state = apply(state, 'p1', { type: 'ACCEPT_TRADE', offerId: 1 });
    state = apply(state, 'p2', {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 1 },
      want: { ...none, r1: 1 },
    });
    const view = getPlayerView(state, 'host');
    const { connection } = makeConnection();
    render(
      <Providers connection={connection}>
        <GameScreen
          view={view}
          snapshot={{ ...snapshotFor(state, 'p0'), view, room: roomOf('playing') }}
        />
      </Providers>,
    );
    const offer = screen.getByRole('region', { name: 'Intercambio' });
    expect(within(offer).getByText(/propone/)).toBeTruthy();
    expect(within(offer).getByText('Aceptó')).toBeTruthy();
    expect(within(offer).getByText('Contraoferta')).toBeTruthy();
    // el host no tiene botones de acción
    expect(within(offer).queryAllByRole('button')).toHaveLength(0);
    // y no aparece cuando no hay oferta
    cleanup();
    const quiet = getPlayerView(mainState(HANDS), 'host');
    render(
      <Providers connection={connection}>
        <GameScreen
          view={quiet}
          snapshot={{
            ...snapshotFor(mainState(HANDS), 'p0'),
            view: quiet,
            room: roomOf('playing'),
          }}
        />
      </Providers>,
    );
    expect(screen.queryByRole('region', { name: 'Intercambio' })).toBeNull();
  });
});
