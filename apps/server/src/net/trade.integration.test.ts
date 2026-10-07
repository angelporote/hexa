import { afterEach, describe, expect, it } from 'vitest';
import { getPlayerView } from '@hexa/engine';
import type { ResourceCounts } from '@hexa/engine';
import { TestClient, startTestServer, until } from '../testing/harness.js';
import type { TestServer } from '../testing/harness.js';
import type { GameRecord } from '../store/room-store.js';
import { none, storeWith, tradeRoom } from '../testing/trade-room.js';

const FAST = { rateLimit: { burst: 100_000, perSecond: 100_000 } };

let server: TestServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

const ids = ['p0', 'p1', 'p2', 'p3'] as const;

interface Table {
  host: TestClient;
  p: Record<(typeof ids)[number], TestClient>;
  tokens: Record<string, string>;
  truth: () => GameRecord | null | undefined;
}

/** Servidor con la sala `TRDE` ya en marcha y los cinco clientes (host y 4 jugadores) conectados. */
async function table(
  hands: Record<string, Partial<ResourceCounts>>,
  options: { ttl?: number; after?: Parameters<typeof tradeRoom>[1] } = {},
): Promise<Table> {
  const { room, tokens } = tradeRoom(hands, options.after);
  const srv = await startTestServer({
    store: await storeWith(room),
    config: { ...FAST, ...(options.ttl ? { tradeOfferTtlMs: options.ttl } : {}), botDelayMs: 1 },
  });
  server = srv;
  const connect = async (token: string): Promise<TestClient> => {
    const c = await TestClient.connect(srv.url);
    clients.push(c);
    expect(await c.resume('TRDE', token)).toMatchObject({ ok: true });
    return c;
  };
  const host = await connect(tokens['host'] ?? '');
  const p = {} as Table['p'];
  for (const id of ids) p[id] = await connect(tokens[id] ?? '');
  await until(() => [host, ...Object.values(p)].every((c) => c.view !== null), 3000, 'vistas');
  return { host, p, tokens, truth: () => srv.handle.manager.getRoom('TRDE')?.game };
}

const act = (c: TestClient, action: Record<string, unknown>) =>
  c.request('game:action', { action });
const hand = (t: Table, id: (typeof ids)[number]) =>
  t.truth()?.snapshot.players.find((x) => x.id === id)?.hand;
const totalCards = (t: Table) =>
  (t.truth()?.snapshot.players ?? []).reduce(
    (n, pl) => n + Object.values(pl.hand).reduce((a, b) => a + b, 0),
    0,
  );
/** Espera a que todos los clientes vean la oferta con ese estado. */
const everyoneSees = (
  t: Table,
  check: (view: NonNullable<TestClient['view']>) => boolean,
  label: string,
) =>
  until(
    () => [t.host, ...Object.values(t.p)].every((c) => c.view !== null && check(c.view)),
    3000,
    label,
  );

const HANDS = { p0: { r1: 4, r5: 1 }, p1: { r2: 2, r3: 2 }, p2: { r2: 1 }, p3: { r4: 2 } };

describe('comercio entre jugadores por red', () => {
  it('oferta a todos: la ven todos, unos aceptan y otros no, y el oferente cierra con quien quiere', async () => {
    const t = await table(HANDS);
    const cards = totalCards(t);
    expect(
      await act(t.p.p0, {
        type: 'OFFER_TRADE',
        to: null,
        give: { ...none, r1: 2 },
        want: { ...none, r2: 1 },
      }),
    ).toEqual({ ok: true, data: {} });
    await everyoneSees(t, (v) => v.pendingTrade?.from === 'p0', 'oferta visible');

    // el host y los espectadores la ven completa, igual que los demás
    expect(t.host.view?.pendingTrade).toMatchObject({
      id: 1,
      from: 'p0',
      to: null,
      accepted: [],
      rejected: [],
    });

    expect(await act(t.p.p1, { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({ ok: true, data: {} });
    expect(await act(t.p.p2, { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({ ok: true, data: {} });
    expect(await act(t.p.p3, { type: 'REJECT_TRADE', offerId: 1 })).toEqual({ ok: true, data: {} });
    await everyoneSees(
      t,
      (v) => v.pendingTrade?.accepted.length === 2 && v.pendingTrade.rejected.length === 1,
      'respuestas',
    );

    // el oferente ve a quién puede cerrar el trato en sus acciones legales
    const options = t.p.p0.view?.legalActions.filter((a) => a.type === 'CONFIRM_TRADE');
    expect(options?.map((a) => (a.type === 'CONFIRM_TRADE' ? a.with : ''))).toEqual(['p1', 'p2']);

    expect(await act(t.p.p0, { type: 'CONFIRM_TRADE', offerId: 1, with: 'p2' })).toEqual({
      ok: true,
      data: {},
    });
    await everyoneSees(t, (v) => v.pendingTrade === null, 'oferta cerrada');
    expect(hand(t, 'p0')).toEqual({ ...none, r1: 2, r2: 1, r5: 1 });
    expect(hand(t, 'p2')).toEqual({ ...none, r1: 2 });
    expect(hand(t, 'p1')).toEqual({ ...none, r2: 2, r3: 2 }); // p1 aceptó pero no se cerró con él
    expect(totalCards(t)).toBe(cards);
    expect(t.host.gameEvents.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'TRADE_OFFERED',
        'TRADE_ACCEPTED',
        'TRADE_REJECTED',
        'TRADE_COMPLETED',
      ]),
    );
  });

  it('contraoferta: un destinatario propone otras condiciones y el oferente la acepta', async () => {
    const t = await table(HANDS);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 2 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade !== null, 'oferta');
    await until(() => t.p.p3.view?.canCounterTrade === true, 3000, 'p3 puede contraofertar');
    expect(t.p.p0.view?.canCounterTrade).toBe(false);

    expect(
      await act(t.p.p3, {
        type: 'COUNTER_TRADE',
        offerId: 1,
        give: { ...none, r4: 2 },
        want: { ...none, r1: 1 },
      }),
    ).toEqual({ ok: true, data: {} });
    await everyoneSees(t, (v) => v.pendingTrade?.counters.length === 1, 'contraoferta visible');
    expect(t.host.view?.pendingTrade?.counters[0]).toEqual({
      from: 'p3',
      give: { ...none, r4: 2 },
      want: { ...none, r1: 1 },
    });

    const cards = totalCards(t);
    expect(await act(t.p.p0, { type: 'CONFIRM_COUNTER', offerId: 1, with: 'p3' })).toEqual({
      ok: true,
      data: {},
    });
    await everyoneSees(t, (v) => v.pendingTrade === null, 'cerrada');
    expect(hand(t, 'p0')).toEqual({ ...none, r1: 3, r4: 2, r5: 1 });
    expect(hand(t, 'p3')).toEqual({ ...none, r1: 1 });
    expect(totalCards(t)).toBe(cards);
  });

  it('una oferta dirigida solo la pueden responder sus destinatarios', async () => {
    const t = await table(HANDS);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: ['p1'],
      give: { ...none, r1: 2 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade?.to?.[0] === 'p1', 'oferta dirigida');
    expect(await act(t.p.p2, { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'NOT_A_RECIPIENT',
    });
    expect(
      await act(t.p.p2, {
        type: 'COUNTER_TRADE',
        offerId: 1,
        give: { ...none, r2: 1 },
        want: { ...none, r1: 1 },
      }),
    ).toEqual({ ok: false, error: 'NOT_A_RECIPIENT' });
    expect(await act(t.p.p1, { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({ ok: true, data: {} });
    // los no destinatarios no ven acciones de respuesta
    expect(t.p.p2.view?.legalActions.some((a) => a.type === 'ACCEPT_TRADE')).toBe(false);
  });

  it('solo el jugador de turno ofrece, y una oferta a la vez', async () => {
    const t = await table(HANDS);
    const offer = {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r2: 1 },
      want: { ...none, r1: 1 },
    };
    expect(await act(t.p.p1, offer)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await act(t.host, offer)).toEqual({ ok: false, error: 'NOT_A_PLAYER' });
    const first = {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 1 },
      want: { ...none, r2: 1 },
    };
    expect(await act(t.p.p0, first)).toEqual({ ok: true, data: {} });
    expect(await act(t.p.p0, first)).toEqual({ ok: false, error: 'TRADE_PENDING' });
    expect(
      await act(t.p.p0, {
        type: 'OFFER_TRADE',
        to: null,
        give: { ...none, r1: 99 },
        want: { ...none, r2: 1 },
      }),
    ).toMatchObject({ ok: false });
  });

  it('cancelar, y lo que llegue tarde a una oferta cerrada, no deja estados inconsistentes', async () => {
    const t = await table(HANDS);
    const cards = totalCards(t);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 2 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade !== null, 'oferta');
    expect(await act(t.p.p1, { type: 'CANCEL_TRADE', offerId: 1 })).toMatchObject({ ok: false });
    expect(await act(t.p.p0, { type: 'CANCEL_TRADE', offerId: 1 })).toEqual({ ok: true, data: {} });
    await everyoneSees(t, (v) => v.pendingTrade === null, 'cancelada');
    // respuestas tardías a una oferta que ya no existe
    expect(await act(t.p.p1, { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({
      ok: false,
      error: 'NO_SUCH_OFFER',
    });
    expect(await act(t.p.p0, { type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' })).toEqual({
      ok: false,
      error: 'NO_SUCH_OFFER',
    });
    expect(totalCards(t)).toBe(cards);
    // y se puede abrir otra oferta con un id nuevo
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 1 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade?.id === 2, 'segunda oferta');
  });

  it('dos aceptaciones casi a la vez: se cierra con una y la otra oferta ya no existe', async () => {
    const t = await table(HANDS);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 2 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade !== null, 'oferta');
    const answers = await Promise.all([
      act(t.p.p1, { type: 'ACCEPT_TRADE', offerId: 1 }),
      act(t.p.p2, { type: 'ACCEPT_TRADE', offerId: 1 }),
    ]);
    expect(answers).toEqual([
      { ok: true, data: {} },
      { ok: true, data: {} },
    ]);
    await everyoneSees(t, (v) => v.pendingTrade?.accepted.length === 2, 'ambas aceptaciones');
    expect(await act(t.p.p0, { type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' })).toEqual({
      ok: true,
      data: {},
    });
    // el que no fue elegido ya no puede cerrar nada
    expect(await act(t.p.p0, { type: 'CONFIRM_TRADE', offerId: 1, with: 'p2' })).toEqual({
      ok: false,
      error: 'NO_SUCH_OFFER',
    });
    expect(hand(t, 'p2')).toEqual({ ...none, r2: 1 });
  });

  it('si el oferente gasta lo ofrecido antes de cerrar, el trato falla y nadie pierde nada', async () => {
    const t = await table(HANDS);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 4 },
      want: { ...none, r2: 1 },
    });
    await act(t.p.p1, { type: 'ACCEPT_TRADE', offerId: 1 });
    await everyoneSees(t, (v) => v.pendingTrade?.accepted.length === 1, 'aceptada');
    // p0 cambia sus 4 de r1 con el banco antes de cerrar
    expect(await act(t.p.p0, { type: 'BANK_TRADE', give: 'r1', want: 'r3' })).toEqual({
      ok: true,
      data: {},
    });
    await until(() => t.p.p0.view?.you?.hand.r1 === 0, 3000, 'mano actualizada');
    expect(await act(t.p.p0, { type: 'CONFIRM_TRADE', offerId: 1, with: 'p1' })).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_RESOURCES',
    });
    expect(hand(t, 'p1')).toEqual({ ...none, r2: 2, r3: 2 });
  });

  it('terminar el turno cancela la oferta abierta', async () => {
    const t = await table(HANDS);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 1 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade !== null, 'oferta');
    expect(await act(t.p.p0, { type: 'END_TURN' })).toEqual({ ok: true, data: {} });
    await everyoneSees(
      t,
      (v) => v.pendingTrade === null && v.turn.player === 'p1',
      'turno siguiente sin oferta',
    );
    expect(t.host.gameEvents.some((e) => e.type === 'TRADE_CANCELLED')).toBe(true);
  });

  it('una oferta sin respuesta caduca sola y se cancela en nombre del oferente', async () => {
    const t = await table(HANDS, { ttl: 150 });
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 1 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade !== null, 'oferta');
    await everyoneSees(t, (v) => v.pendingTrade === null, 'oferta caducada');
    expect(t.host.gameEvents.some((e) => e.type === 'TRADE_CANCELLED')).toBe(true);
    // queda en el registro como una acción normal del oferente, y se puede ofrecer de nuevo
    const log = t.truth()?.snapshot.log ?? [];
    expect(log.at(-1)).toEqual({ player: 'p0', action: { type: 'CANCEL_TRADE', offerId: 1 } });
    expect(
      await act(t.p.p0, {
        type: 'OFFER_TRADE',
        to: null,
        give: { ...none, r1: 1 },
        want: { ...none, r2: 1 },
      }),
    ).toEqual({ ok: true, data: {} });
  });

  it('la caducidad se reinicia con cada oferta nueva', async () => {
    const t = await table(HANDS, { ttl: 400 });
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 1 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade?.id === 1, 'primera');
    await act(t.p.p0, { type: 'CANCEL_TRADE', offerId: 1 });
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 1 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade?.id === 2, 'segunda');
    await new Promise((r) => setTimeout(r, 250));
    // la segunda sigue viva: no hereda el tiempo de la primera
    expect(t.p.p0.view?.pendingTrade?.id).toBe(2);
    await everyoneSees(t, (v) => v.pendingTrade === null, 'la segunda también caduca');
  });

  it('un jugador que se reconecta recupera la oferta abierta y puede responderla', async () => {
    const t = await table(HANDS);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 2 },
      want: { ...none, r2: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade !== null, 'oferta');
    t.p.p1.close();
    await until(() => t.host.state?.seats.some((s) => !s.connected) === true, 3000, 'caída');
    const again = await TestClient.connect(server?.url ?? '');
    clients.push(again);
    expect(await again.resume('TRDE', t.tokens['p1'] ?? '')).toMatchObject({ ok: true });
    await until(
      () => again.view?.pendingTrade !== undefined && again.view.pendingTrade !== null,
      3000,
      'vista con oferta',
    );
    expect(again.view?.legalActions.some((a) => a.type === 'ACCEPT_TRADE')).toBe(true);
    expect(await act(again, { type: 'ACCEPT_TRADE', offerId: 1 })).toEqual({ ok: true, data: {} });
  });

  it('nadie ve la mano ajena durante el comercio', async () => {
    const t = await table(HANDS);
    await act(t.p.p0, {
      type: 'OFFER_TRADE',
      to: null,
      give: { ...none, r1: 2 },
      want: { ...none, r2: 1 },
    });
    await act(t.p.p1, {
      type: 'COUNTER_TRADE',
      offerId: 1,
      give: { ...none, r3: 2 },
      want: { ...none, r1: 1 },
    });
    await everyoneSees(t, (v) => v.pendingTrade?.counters.length === 1, 'contraoferta');
    for (const id of ids) {
      const view = t.p[id].view;
      expect(view?.you?.id).toBe(id);
      for (const pub of view?.players ?? []) expect('hand' in pub).toBe(false);
      // y la vista que recibe es exactamente la proyección del estado del servidor
      const snapshot = t.truth()?.snapshot;
      expect(view).toEqual(snapshot ? getPlayerView(snapshot, id) : null);
    }
    expect(t.host.view?.you).toBeNull();
  });
});
