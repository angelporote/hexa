export interface ServerConfig {
  readonly port: number;
  /** Orígenes permitidos para el WebSocket (CORS). */
  readonly corsOrigin: readonly string[];
  readonly logLevel: string;
  /** Una sala sin actividad ni conexiones durante este tiempo se elimina. */
  readonly roomTtlMs: number;
  readonly sweepIntervalMs: number;
  /** Límite de mensajes por socket: cubo con `burst` fichas que se rellena a `perSecond`. */
  readonly rateLimit: { readonly burst: number; readonly perSecond: number };
}

type Env = Readonly<Record<string, string | undefined>>;

function int(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: Env): ServerConfig {
  return {
    port: int(env['PORT'], 3001),
    corsOrigin: (env['CORS_ORIGIN'] ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: env['LOG_LEVEL'] ?? 'info',
    roomTtlMs: int(env['ROOM_TTL_MS'], 6 * 60 * 60 * 1000),
    sweepIntervalMs: int(env['SWEEP_INTERVAL_MS'], 60 * 1000),
    rateLimit: { burst: int(env['RATE_BURST'], 30), perSecond: int(env['RATE_PER_SECOND'], 10) },
  };
}
