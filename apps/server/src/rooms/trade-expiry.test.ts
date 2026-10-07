import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction } from '@hexa/engine';
import { silentLogger } from '../logger.js';
import { none, storeWith, tradeRoom } from '../testing/trade-room.js';
import { RoomManager } from './room-manager.js';
import type { OutMessage } from './room-manager.js';
import { TradeExpiry } from './trade-expiry.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup(withOffer: boolean) {
  const { room, state } = tradeRoom({ p0: { r1: 3 }, p1: { r2: 2 } });
  const offered = withOffer
    ? applyAction(state, 'p0', {
        type: 'OFFER_TRADE',
        to: null,
        give: { ...none, r1: 1 },
        want: { ...none, r2: 1 },
      })
    : null;
  if (offered && !offered.ok) throw new Error(offered.error);
  const snapshot = offered?.ok ? offered.value.state : state;
  const store = await storeWith({
    ...room,
    game: room.game ? { ...room.game, snapshot } : null,
  });
  const manager = new RoomManager({
    store,
    logger: silentLogger,
    clock: () => Date.now(),
    randomInt: () => 0,
    token: () => 'x'.repeat(24),
    seed: () => 's',
    roomTtlMs: 10 * 60 * 1000,
  });
  await manager.hydrate();
  const delivered: OutMessage[][] = [];
  const expiry = new TradeExpiry(manager, (out) => delivered.push([...out]), silentLogger, 1000);
  return { manager, expiry, delivered };
}

const pending = (m: RoomManager) => m.getRoom('TRDE')?.game?.snapshot.pendingTrade ?? null;

describe('TradeExpiry', () => {
  it('cancela la oferta abierta cuando se cumple el tiempo', async () => {
    const { manager, expiry, delivered } = await setup(true);
    expiry.checkAll();
    vi.advanceTimersByTime(999);
    expect(pending(manager)).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(pending(manager)).toBeNull();
    expect(manager.getRoom('TRDE')?.game?.snapshot.log.at(-1)).toEqual({
      player: 'p0',
      action: { type: 'CANCEL_TRADE', offerId: 1 },
    });
    // se entrega el resultado (sin conexiones no hay mensajes, pero no falla)
    expect(delivered).toHaveLength(1);
    expect(delivered.flat()).toHaveLength(0);
    expiry.stop();
  });

  it('no hace nada si no hay ofertas', async () => {
    const { manager, expiry } = await setup(false);
    expiry.checkAll();
    vi.advanceTimersByTime(60_000);
    expect(pending(manager)).toBeNull();
    expect(manager.getRoom('TRDE')?.game?.snapshot.log).toHaveLength(0);
    expiry.stop();
  });

  it('retira el temporizador si la oferta se cierra antes de tiempo', async () => {
    const { manager, expiry } = await setup(true);
    expiry.checkAll();
    expect(manager.botAction('TRDE', 'p0', { type: 'CANCEL_TRADE', offerId: 1 }).ok).toBe(false); // no es un bot
    const room = manager.getRoom('TRDE');
    const result = room && manager.expireTrade('TRDE', 1);
    expect(result?.ok).toBe(true);
    expect(manager.expireTrade('TRDE', 1)).toEqual({ ok: false, error: 'NO_SUCH_OFFER' });
    vi.advanceTimersByTime(5000);
    // el temporizador antiguo no debe volver a cancelar nada
    expect(
      manager.getRoom('TRDE')?.game?.snapshot.log.filter((e) => e.action.type === 'CANCEL_TRADE'),
    ).toHaveLength(1);
    expiry.stop();
  });

  it('expireTrade rechaza salas u ofertas que no existen', async () => {
    const { manager, expiry } = await setup(true);
    expect(manager.expireTrade('NOPE', 1)).toEqual({ ok: false, error: 'NO_SUCH_OFFER' });
    expect(manager.expireTrade('TRDE', 99)).toEqual({ ok: false, error: 'NO_SUCH_OFFER' });
    expiry.stop();
  });

  it('manager.codes lista las salas', async () => {
    const { manager, expiry } = await setup(false);
    expect(manager.codes()).toEqual(['TRDE']);
    expiry.stop();
  });
});
