import { chooseMoveFor, createRng } from '@hexa/engine';
import type { GameState, PlayerId } from '@hexa/engine';
import type { Logger } from '../logger.js';
import type { OutMessage, RoomManager } from '../rooms/room-manager.js';
import type { RoomData } from '../store/room-store.js';

export interface BotDriverOptions {
  /** Pausa antes de cada jugada, para que las partidas con bots se puedan seguir. */
  readonly delayMs: number;
}

/** Tras tantos fallos seguidos en una sala se deja de jugar por sus bots (evita bucles). */
const MAX_FAILURES = 3;

/**
 * Juega por los asientos de bot. Se activa con cada cambio de una sala: si le toca actuar a un
 * bot, programa una jugada tras una pausa. Las jugadas son deterministas respecto al estado:
 * la semilla del bot sale de la de la partida y del número de acciones ya aplicadas.
 */
export class BotDriver {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly manager: RoomManager,
    private readonly deliver: (out: readonly OutMessage[]) => void,
    private readonly logger: Logger,
    private readonly options: BotDriverOptions,
  ) {
    manager.onChange((code) => this.schedule(code));
  }

  /** Revisa todas las salas (al arrancar, tras recuperarlas del almacén). */
  resumeAll(): void {
    for (const code of this.manager.codes()) this.schedule(code);
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(code: string): void {
    if (this.timers.has(code)) return;
    if ((this.failures.get(code) ?? 0) >= MAX_FAILURES) return;
    const room = this.manager.getRoom(code);
    if (!room || room.status !== 'playing' || !room.game) return;
    if (this.actingBot(room) === null) return;

    const timer = setTimeout(() => {
      this.timers.delete(code);
      this.act(code);
    }, this.options.delayMs);
    timer.unref();
    this.timers.set(code, timer);
  }

  /** Bot al que le toca mover, si lo hay: descarte pendiente, respuesta a oferta o turno propio. */
  private actingBot(room: RoomData): PlayerId | null {
    const state = room.game?.snapshot;
    if (!state || state.phase.type === 'ended') return null;
    const bots = new Set(room.seats.filter((s) => s.bot).map((s) => s.playerId));
    if (bots.size === 0) return null;

    if (state.phase.type === 'discard') {
      return Object.keys(state.phase.owed).find((id) => bots.has(id)) ?? null;
    }
    const offer = state.pendingTrade;
    if (offer && state.phase.type === 'main') {
      const waiting = botsAwaitingResponse(state, bots);
      if (waiting) return waiting;
    }
    return bots.has(state.turn.player) ? state.turn.player : null;
  }

  private act(code: string): void {
    const room = this.manager.getRoom(code);
    const state = room?.game?.snapshot;
    if (!room || !state || room.status !== 'playing') return;
    const bot = this.actingBot(room);
    if (bot === null) return;

    const rng = createRng(`bot:${room.game?.seed ?? ''}:${state.log.length}`);
    const { move } = chooseMoveFor(state, bot, rng, { offers: false });
    if (!move) {
      this.fail(code, `el bot ${bot} no tiene jugadas en la fase ${state.phase.type}`);
      return;
    }
    const result = this.manager.botAction(code, bot, move.action);
    if (!result.ok) {
      this.fail(code, `el bot ${bot} fue rechazado en ${move.action.type}: ${result.error}`);
      return;
    }
    this.failures.delete(code);
    this.deliver(result.value.out);
  }

  private fail(code: string, message: string): void {
    this.failures.set(code, (this.failures.get(code) ?? 0) + 1);
    this.logger.error({ event: 'bot_failed', code, message }, 'fallo del bot');
    // Reintenta: un fallo suelto no debe dejar la partida parada.
    this.schedule(code);
  }
}

function botsAwaitingResponse(state: GameState, bots: ReadonlySet<PlayerId>): PlayerId | null {
  const offer = state.pendingTrade;
  if (!offer) return null;
  for (const id of bots) {
    const recipient = id !== offer.from && (offer.to === null || offer.to.includes(id));
    if (recipient && !offer.accepted.includes(id) && !offer.rejected.includes(id)) return id;
  }
  return null;
}
