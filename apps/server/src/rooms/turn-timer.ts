import type { Logger } from '../logger.js';
import type { OutMessage, RoomManager } from './room-manager.js';

/**
 * Programa el vencimiento del reloj de turno de cada sala. El gestor es quien lleva la cuenta de
 * quién está «en juego» y hasta cuándo; este servicio solo despierta en ese momento y le pide que
 * agote el plazo, tras lo cual el conductor de bots juega por quien no respondió.
 */
export class TurnTimer {
  private readonly timers = new Map<
    string,
    { deadline: number; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private readonly manager: RoomManager,
    private readonly deliver: (out: readonly OutMessage[]) => void,
    private readonly logger: Logger,
    private readonly clock: () => number,
  ) {
    manager.onChange((code) => this.check(code));
  }

  /** Revisa una sala: arma el temporizador de su reloj vigente o lo retira si ya no hay. */
  check(code: string): void {
    const clock = this.manager.clockOf(code);
    const current = this.timers.get(code);
    if (!clock) {
      if (current) {
        clearTimeout(current.timer);
        this.timers.delete(code);
      }
      return;
    }
    // El mismo plazo sigue con su temporizador; uno nuevo (otra acción, otro jugador) empieza de cero.
    if (current?.deadline === clock.deadline) return;
    if (current) clearTimeout(current.timer);

    const timer = setTimeout(
      () => {
        this.timers.delete(code);
        const result = this.manager.expireClock(code, clock.deadline);
        if (result.ok) this.deliver(result.value.out);
        else this.logger.debug({ event: 'turn_timeout_skipped', code, error: result.error });
      },
      Math.max(0, clock.deadline - this.clock()),
    );
    timer.unref();
    this.timers.set(code, { deadline: clock.deadline, timer });
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
