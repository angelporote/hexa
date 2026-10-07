import type { Logger } from '../logger.js';
import type { OutMessage, RoomManager } from './room-manager.js';

/**
 * Caduca las ofertas de comercio que llevan demasiado tiempo abiertas, para que un jugador
 * ausente no deje la partida esperando. Al caducar se aplica `CANCEL_TRADE` en nombre del
 * oferente, de modo que queda en el registro y la partida se puede reproducir igual.
 */
export class TradeExpiry {
  private readonly timers = new Map<
    string,
    { offerId: number; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private readonly manager: RoomManager,
    private readonly deliver: (out: readonly OutMessage[]) => void,
    private readonly logger: Logger,
    private readonly ttlMs: number,
  ) {
    manager.onChange((code) => this.check(code));
  }

  /** Revisa una sala: arma el temporizador de su oferta abierta o lo retira si ya no hay. */
  check(code: string): void {
    const offer = this.manager.getRoom(code)?.game?.snapshot.pendingTrade ?? null;
    const current = this.timers.get(code);
    if (!offer) {
      if (current) {
        clearTimeout(current.timer);
        this.timers.delete(code);
      }
      return;
    }
    // La misma oferta sigue con su temporizador; una oferta nueva empieza de cero.
    if (current?.offerId === offer.id) return;
    if (current) clearTimeout(current.timer);

    const timer = setTimeout(() => {
      this.timers.delete(code);
      const result = this.manager.expireTrade(code, offer.id);
      if (result.ok) {
        this.logger.debug({ event: 'trade_expired', code, offerId: offer.id });
        this.deliver(result.value.out);
      }
    }, this.ttlMs);
    timer.unref();
    this.timers.set(code, { offerId: offer.id, timer });
  }

  /** Revisa todas las salas (al arrancar, tras recuperarlas del almacén). */
  checkAll(): void {
    for (const code of this.manager.codes()) this.check(code);
  }

  stop(): void {
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
