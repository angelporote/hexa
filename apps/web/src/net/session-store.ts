import type { SessionData } from '@hexa/protocol';

/** Dónde se recuerda la sesión (token de asiento) para reconectar tras un bloqueo o recarga. */
export interface SessionStore {
  get(key: string): SessionData | null;
  set(key: string, session: SessionData): void;
  remove(key: string): void;
}

const PREFIX = 'hexa.session.';

function isSession(value: unknown): value is SessionData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['code'] === 'string' && typeof v['token'] === 'string' && typeof v['role'] === 'string'
  );
}

/** Almacén sobre `localStorage`; si no está disponible (modo privado, bloqueado) no recuerda nada. */
export function browserSessionStore(): SessionStore {
  return {
    get(key) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        return isSession(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    set(key, session) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(session));
      } catch {
        // Sin almacenamiento: la sesión vive solo mientras dure la pestaña.
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(PREFIX + key);
      } catch {
        // Nada que borrar.
      }
    },
  };
}

export function memorySessionStore(): SessionStore {
  const data = new Map<string, SessionData>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, session) => void data.set(key, session),
    remove: (key) => void data.delete(key),
  };
}
