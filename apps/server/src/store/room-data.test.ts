import { describe, expect, it } from 'vitest';
import { tradeRoom } from '../testing/trade-room.js';
import { parseRoomData } from './room-data.js';

const { room } = tradeRoom({ p0: { r1: 2 } });
const json = (value: unknown): string => JSON.stringify(value);

describe('parseRoomData', () => {
  it('una sala en partida sobrevive intacta a JSON (el estado es JSON puro)', () => {
    expect(parseRoomData(json(room))).toEqual(room);
  });

  it('acepta una sala de lobby sin partida', () => {
    const lobby = { ...room, status: 'lobby', game: null };
    expect(parseRoomData(json(lobby))).toEqual(lobby);
  });

  it('acepta una sala anterior al juego a distancia (sin hostless ni ownerId)', () => {
    const legacy: Record<string, unknown> = { ...room };
    delete legacy['hostless'];
    delete legacy['ownerId'];
    expect(parseRoomData(json(legacy))).toMatchObject({ code: 'TRDE' });
  });

  it('descarta lo que no es JSON ni un objeto', () => {
    for (const raw of ['', '{no', 'null', '42', '"sala"', '[]']) {
      expect(parseRoomData(raw), raw).toBeNull();
    }
  });

  it.each([
    ['sin código', { ...room, code: undefined }],
    ['estado desconocido', { ...room, status: 'pausada' }],
    ['asientos que no son una lista', { ...room, seats: {} }],
    ['un asiento sin token', { ...room, seats: [{ ...room.seats[0], token: undefined }] }],
    ['un asiento con "bot" mal tipado', { ...room, seats: [{ ...room.seats[0], bot: 'no' }] }],
    ['tokens de espectador mal formados', { ...room, spectatorTokens: [1] }],
    ['lastActivity textual', { ...room, lastActivity: 'ayer' }],
    ['partida sin instantánea', { ...room, game: { ...room.game, snapshot: null } }],
    ['partida sin semilla', { ...room, game: { ...room.game, seed: 7 } }],
  ])('descarta una sala %s', (_name, broken) => {
    expect(parseRoomData(json(broken))).toBeNull();
  });
});
