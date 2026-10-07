import type { RoomData } from './room-store.js';

const STATUSES: readonly unknown[] = ['lobby', 'playing', 'ended'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function isSeat(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v['playerId'] === 'string' &&
    typeof v['name'] === 'string' &&
    typeof v['color'] === 'string' &&
    typeof v['token'] === 'string' &&
    typeof v['ready'] === 'boolean' &&
    typeof v['bot'] === 'boolean'
  );
}

function isGameRecord(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v['seed'] === 'string' &&
    isObject(v['config']) &&
    Array.isArray(v['actions']) &&
    isObject(v['snapshot'])
  );
}

/**
 * Lee una sala guardada como JSON. Devuelve `null` si el texto no es JSON o no tiene la forma de
 * una sala: un registro corrupto se descarta en lugar de impedir que arranque el resto.
 * No comprueba `hostless` ni `ownerId`: las salas anteriores al juego a distancia no los traen y
 * el gestor les pone valores por defecto al recuperarlas.
 */
export function parseRoomData(raw: string): RoomData | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  const ok =
    typeof value['code'] === 'string' &&
    typeof value['createdAt'] === 'number' &&
    typeof value['lastActivity'] === 'number' &&
    STATUSES.includes(value['status']) &&
    typeof value['hostToken'] === 'string' &&
    Array.isArray(value['seats']) &&
    value['seats'].every(isSeat) &&
    isStringArray(value['spectatorTokens']) &&
    typeof value['nextPlayerNumber'] === 'number' &&
    (value['game'] === null || isGameRecord(value['game']));
  return ok ? (value as unknown as RoomData) : null;
}
