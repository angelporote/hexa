import { describe, expect, it } from 'vitest';
import { autoSetupForTests } from './test-helpers.js';
import { actionSchema } from './action-schema.js';
import { ackSchemas, roomStateSchema, serverMessageSchemas } from './messages.js';
import { ROOM_CODE_ALPHABET, PROTOCOL_VERSION } from './constants.js';
import { parseClientMessage } from './parse.js';
import { getPlayerView, legalActions } from '@hexa/engine';

const v = PROTOCOL_VERSION;

describe('parseClientMessage', () => {
  it('acepta mensajes válidos de cada tipo', () => {
    const cases: [string, object][] = [
      ['room:create', { protocolVersion: v }],
      [
        'room:join',
        { protocolVersion: v, code: 'abcd', role: 'player', name: ' Ana ', color: 'c2' },
      ],
      ['room:join', { protocolVersion: v, code: 'ABCD', role: 'spectator' }],
      ['room:leave', { protocolVersion: v }],
      ['lobby:update', { protocolVersion: v, ready: true }],
      ['lobby:start', { protocolVersion: v }],
      ['game:preview', { protocolVersion: v, target: { kind: 'vertex', id: 'v3' } }],
      ['game:preview', { protocolVersion: v, target: null }],
      ['lobby:addBot', { protocolVersion: v }],
      ['lobby:removeBot', { protocolVersion: v, playerId: 'p1' }],
      ['game:action', { protocolVersion: v, action: { type: 'ROLL' } }],
      ['session:resume', { protocolVersion: v, code: 'ABCD', token: 'a'.repeat(32) }],
    ];
    for (const [event, payload] of cases) {
      const r = parseClientMessage(event, payload);
      expect(r.ok, `${event}: ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it('normaliza el código (mayúsculas) y el nombre (sin espacios sobrantes)', () => {
    const r = parseClientMessage('room:join', {
      protocolVersion: v,
      code: ' abcd ',
      role: 'player',
      name: '  Ana  ',
    });
    expect(r.ok && r.value.event === 'room:join' && r.value.payload).toMatchObject({
      code: 'ABCD',
      name: 'Ana',
    });
  });

  it('rechaza eventos desconocidos, versiones distintas y formas inválidas', () => {
    expect(parseClientMessage('hack:me', { protocolVersion: v })).toEqual({
      ok: false,
      error: 'UNKNOWN_MESSAGE',
    });
    expect(parseClientMessage('room:create', { protocolVersion: v + 1 })).toEqual({
      ok: false,
      error: 'PROTOCOL_VERSION_MISMATCH',
    });
    expect(parseClientMessage('room:create', {})).toEqual({ ok: false, error: 'INVALID_MESSAGE' });
    expect(parseClientMessage('room:create', null)).toEqual({
      ok: false,
      error: 'INVALID_MESSAGE',
    });
    expect(parseClientMessage('room:create', 'texto')).toEqual({
      ok: false,
      error: 'INVALID_MESSAGE',
    });
    expect(parseClientMessage('room:create', { protocolVersion: v, extra: 1 })).toEqual({
      ok: false,
      error: 'INVALID_MESSAGE',
    });
  });

  it('valida códigos, nombres y colores', () => {
    const join = (over: object) =>
      parseClientMessage('room:join', {
        protocolVersion: v,
        code: 'ABCD',
        role: 'player',
        name: 'Ana',
        ...over,
      });
    expect(join({ code: 'ABC' }).ok).toBe(false);
    expect(join({ code: 'ABCDE' }).ok).toBe(false);
    expect(join({ code: 'ABIL' }).ok).toBe(false); // letras ambiguas excluidas
    expect(join({ name: '' }).ok).toBe(false);
    expect(join({ name: '   ' }).ok).toBe(false);
    expect(join({ name: 'x'.repeat(21) }).ok).toBe(false);
    expect(join({ name: 'a\u0000b' }).ok).toBe(false);
    expect(join({ name: 'a​b' }).ok).toBe(false);
    expect(join({ color: 'rojo' }).ok).toBe(false);
    expect(join({ role: 'host' }).ok).toBe(false);
    expect(
      parseClientMessage('room:join', { protocolVersion: v, code: 'ABCD', role: 'player' }).ok,
    ).toBe(false);
  });

  it('game:preview valida el tipo y el id del elemento', () => {
    const preview = (target: unknown) =>
      parseClientMessage('game:preview', { protocolVersion: v, target });
    expect(preview({ kind: 'planet', id: 'x' }).ok).toBe(false);
    expect(preview({ kind: 'hex', id: '' }).ok).toBe(false);
    expect(preview({ kind: 'hex', id: 'x'.repeat(40) }).ok).toBe(false);
    expect(preview({ kind: 'hex', id: 'h0,0', extra: 1 }).ok).toBe(false);
    expect(parseClientMessage('game:preview', { protocolVersion: v }).ok).toBe(false);
  });

  it('lobby:update exige al menos un cambio', () => {
    expect(parseClientMessage('lobby:update', { protocolVersion: v }).ok).toBe(false);
    expect(parseClientMessage('lobby:update', { protocolVersion: v, color: 'c9' }).ok).toBe(false);
  });

  it('el alfabeto de códigos no contiene letras ambiguas', () => {
    for (const bad of 'ILOQU') expect(ROOM_CODE_ALPHABET).not.toContain(bad);
  });
});

describe('actionSchema', () => {
  const none = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

  it('acepta todas las acciones legales de una partida real', () => {
    const state = autoSetupForTests();
    for (const player of ['p0', 'p1']) {
      for (const action of legalActions(state, player)) {
        expect(actionSchema.safeParse(action).success).toBe(true);
      }
    }
  });

  it('acepta ofertas de comercio y descartes bien formados', () => {
    expect(
      actionSchema.safeParse({
        type: 'OFFER_TRADE',
        to: null,
        give: { ...none, r1: 1 },
        want: { ...none, r2: 1 },
      }).success,
    ).toBe(true);
    expect(
      actionSchema.safeParse({ type: 'OFFER_TRADE', to: ['p1'], give: none, want: none }).success,
    ).toBe(true);
    expect(actionSchema.safeParse({ type: 'DISCARD', resources: none }).success).toBe(true);
    expect(
      actionSchema.safeParse({
        type: 'COUNTER_TRADE',
        offerId: 1,
        give: { ...none, r3: 2 },
        want: { ...none, r1: 1 },
      }).success,
    ).toBe(true);
    expect(
      actionSchema.safeParse({ type: 'CONFIRM_COUNTER', offerId: 1, with: 'p2' }).success,
    ).toBe(true);
    expect(actionSchema.safeParse({ type: 'COUNTER_TRADE', offerId: 1, give: none }).success).toBe(
      false,
    );
    expect(
      actionSchema.safeParse({ type: 'CONFIRM_COUNTER', offerId: 0, with: 'p2' }).success,
    ).toBe(false);
  });

  it('rechaza tipos desconocidos, campos de más o de menos y valores fuera de rango', () => {
    const bad: unknown[] = [
      { type: 'CHEAT' },
      { type: 'ROLL', extra: true },
      { type: 'BUILD_ROAD' },
      { type: 'BUILD_ROAD', edge: '' },
      { type: 'BUILD_ROAD', edge: 5 },
      { type: 'DISCARD', resources: { ...none, r1: -1 } },
      { type: 'DISCARD', resources: { ...none, r1: 1.5 } },
      { type: 'DISCARD', resources: { ...none, r1: 100 } },
      { type: 'DISCARD', resources: { r1: 1 } },
      { type: 'PLAY_PLENTY', resources: ['r1'] },
      { type: 'PLAY_PLENTY', resources: ['r1', 'r9'] },
      { type: 'BANK_TRADE', give: 'r1', want: 'x' },
      { type: 'ACCEPT_TRADE', offerId: 0 },
      { type: 'OFFER_TRADE', to: ['a', 'b', 'c', 'd'], give: none, want: none },
      null,
      'ROLL',
    ];
    for (const a of bad) expect(actionSchema.safeParse(a).success, JSON.stringify(a)).toBe(false);
  });
});

describe('mensajes del servidor y respuestas', () => {
  const state = autoSetupForTests();

  it('room:state valida un estado de sala', () => {
    const room = {
      code: 'ABCD',
      status: 'lobby',
      hostConnected: true,
      hostless: false,
      seats: [
        { playerId: 'p0', name: 'Ana', color: 'c1', ready: false, connected: true, bot: false },
      ],
      spectators: 0,
      you: { role: 'player', playerId: 'p0', admin: false },
    };
    expect(roomStateSchema.safeParse(room).success).toBe(true);
    expect(roomStateSchema.safeParse({ ...room, status: 'otro' }).success).toBe(false);
    expect(
      roomStateSchema.safeParse({ ...room, seats: Array(5).fill(room.seats[0]) }).success,
    ).toBe(false);
  });

  it('game:view y game:events aceptan lo que genera el motor', () => {
    const view = getPlayerView(state, 'p0');
    expect(serverMessageSchemas['game:view'].safeParse({ seq: 3, view }).success).toBe(true);
    expect(serverMessageSchemas['game:view'].safeParse({ seq: 3, view: { x: 1 } }).success).toBe(
      false,
    );
    expect(
      serverMessageSchemas['game:events'].safeParse({
        seq: 1,
        events: [{ type: 'TURN_STARTED', player: 'p0', number: 1 }],
      }).success,
    ).toBe(true);
    expect(serverMessageSchemas['game:events'].safeParse({ seq: 1, events: [1] }).success).toBe(
      false,
    );
  });

  it('la vista de un jugador sobrevive a JSON y sigue siendo válida', () => {
    const view = JSON.parse(JSON.stringify(getPlayerView(state, 'p1')));
    expect(serverMessageSchemas['game:view'].safeParse({ seq: 0, view }).success).toBe(true);
  });

  it('error y acks tienen forma estricta', () => {
    expect(serverMessageSchemas.error.safeParse({ error: 'ROOM_FULL' }).success).toBe(true);
    expect(serverMessageSchemas.error.safeParse({ error: '' }).success).toBe(false);
    expect(ackSchemas['game:action'].safeParse({ ok: true, data: {} }).success).toBe(true);
    expect(ackSchemas['game:action'].safeParse({ ok: false, error: 'NOT_YOUR_TURN' }).success).toBe(
      true,
    );
    expect(
      ackSchemas['room:create'].safeParse({
        ok: true,
        data: { code: 'ABCD', token: 'x'.repeat(32), role: 'host', playerId: null },
      }).success,
    ).toBe(true);
    expect(ackSchemas['room:create'].safeParse({ ok: true, data: {} }).success).toBe(false);
  });
});
