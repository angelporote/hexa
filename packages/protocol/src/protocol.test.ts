import { describe, expect, it } from 'vitest';
import { autoSetupForTests } from './test-helpers.js';
import { actionSchema } from './action-schema.js';
import { ackSchemas, roomStateSchema, serverMessageSchemas } from './messages.js';
import {
  MAX_TURN_TIMER_SECONDS,
  MIN_TURN_TIMER_SECONDS,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  TURN_TIMER_CHOICES,
} from './constants.js';
import { parseClientMessage } from './parse.js';
import { MAX_CLIENT_ERROR_BYTES, clientErrorSchema } from './client-error.js';
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
      ['lobby:setOptions', { protocolVersion: v, turnTimerSeconds: 90 }],
      ['lobby:setOptions', { protocolVersion: v, turnTimerSeconds: null }],
      ['seat:return', { protocolVersion: v }],
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

  it('lobby:setOptions acota el temporizador de turno', () => {
    const options = (turnTimerSeconds: unknown) =>
      parseClientMessage('lobby:setOptions', { protocolVersion: v, turnTimerSeconds });
    expect(options(MIN_TURN_TIMER_SECONDS).ok).toBe(true);
    expect(options(MAX_TURN_TIMER_SECONDS).ok).toBe(true);
    expect(options(MIN_TURN_TIMER_SECONDS - 1).ok).toBe(false);
    expect(options(MAX_TURN_TIMER_SECONDS + 1).ok).toBe(false);
    expect(options(45.5).ok).toBe(false);
    expect(options('60').ok).toBe(false);
    expect(options(undefined).ok).toBe(false);
    expect(parseClientMessage('lobby:setOptions', { protocolVersion: v }).ok).toBe(false);
    expect(options(60).ok && TURN_TIMER_CHOICES.every((n) => options(n).ok)).toBe(true);
  });

  it('seat:return no admite campos de más', () => {
    expect(parseClientMessage('seat:return', { protocolVersion: v, playerId: 'p1' }).ok).toBe(
      false,
    );
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
        {
          playerId: 'p0',
          name: 'Ana',
          color: 'c1',
          ready: false,
          connected: true,
          bot: false,
          auto: false,
        },
      ],
      spectators: 0,
      options: { turnTimerSeconds: null },
      you: { role: 'player', playerId: 'p0', admin: false },
    };
    expect(roomStateSchema.safeParse(room).success).toBe(true);
    expect(roomStateSchema.safeParse({ ...room, status: 'otro' }).success).toBe(false);
    expect(
      roomStateSchema.safeParse({ ...room, seats: Array(5).fill(room.seats[0]) }).success,
    ).toBe(false);
    expect(roomStateSchema.safeParse({ ...room, options: { turnTimerSeconds: 90 } }).success).toBe(
      true,
    );
    expect(roomStateSchema.safeParse({ ...room, options: { turnTimerSeconds: 'x' } }).success).toBe(
      false,
    );
    expect(roomStateSchema.safeParse({ ...room, options: undefined }).success).toBe(false);
  });

  it('game:view admite el reloj de turno (o su ausencia)', () => {
    const view = getPlayerView(state, 'p0');
    const parse = (extra: object) =>
      serverMessageSchemas['game:view'].safeParse({ seq: 3, view, ...extra }).success;
    expect(parse({})).toBe(true);
    expect(parse({ clock: null })).toBe(true);
    expect(parse({ clock: { actors: ['p0', 'p2'], remainingMs: 45_000 } })).toBe(true);
    expect(parse({ clock: { actors: ['p0'], remainingMs: -1 } })).toBe(false);
    expect(parse({ clock: { actors: ['p0'], remainingMs: 1.5 } })).toBe(false);
    expect(parse({ clock: { actors: 'p0', remainingMs: 10 } })).toBe(false);
    expect(parse({ clock: { actors: ['p0'], remainingMs: 10, extra: 1 } })).toBe(false);
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

describe('informe de error de la web', () => {
  const report = { message: 'Boom', source: 'window', path: '/play/:code' };

  it('acepta un informe mínimo y uno con pila', () => {
    expect(clientErrorSchema.safeParse(report).success).toBe(true);
    expect(
      clientErrorSchema.safeParse({ ...report, stack: 'Error: Boom at x (y.js:1:1)' }).success,
    ).toBe(true);
  });

  it('acota los campos y no admite nada de más', () => {
    const bad = (extra: object) => clientErrorSchema.safeParse({ ...report, ...extra }).success;
    expect(bad({ message: '' })).toBe(false);
    expect(bad({ message: 'x'.repeat(501) })).toBe(false);
    expect(bad({ stack: 'x'.repeat(4001) })).toBe(false);
    expect(bad({ path: 'x'.repeat(201) })).toBe(false);
    expect(bad({ source: 'otro' })).toBe(false);
    expect(bad({ token: 'secreto' })).toBe(false);
    expect(bad({ hand: { r1: 3 } })).toBe(false);
    expect(clientErrorSchema.safeParse({ message: 'x', source: 'window' }).success).toBe(false);
  });

  it('el tamaño máximo del cuerpo cubre un informe completo', () => {
    const worst = JSON.stringify({
      message: 'x'.repeat(500),
      stack: 'y'.repeat(4000),
      source: 'promise',
      path: 'z'.repeat(200),
    });
    expect(worst.length).toBeLessThan(MAX_CLIENT_ERROR_BYTES);
  });
});
