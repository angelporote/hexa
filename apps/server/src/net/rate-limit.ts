/** Cubo de fichas: admite ráfagas de `burst` mensajes y se rellena a `perSecond` fichas por segundo. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly burst: number,
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = burst;
    this.last = now;
  }

  /** Consume una ficha si hay; devuelve `false` si el cliente se ha pasado del límite. */
  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.perSecond);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
