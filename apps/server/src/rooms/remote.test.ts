import { describe, expect, it } from 'vitest';
import { silentLogger } from '../logger.js';
import { MemoryRoomStore } from '../store/room-store.js';
import type { RoomData } from '../store/room-store.js';
import { RoomManager } from './room-manager.js';
import type { ManagerResult, OutMessage } from './room-manager.js';

function must<T>(r: ManagerResult<T>) {
  if (!r.ok) throw new Error(`falló: ${r.error}`);
  return r.value;
}

function setup() {
  let tokens = 0;
  const store = new MemoryRoomStore();
  const manager = new RoomManager({
    store,
    logger: silentLogger,
    clock: () => 1,
    randomInt: () => 0,
    token: () => `token-${String(++tokens).padStart(20, '0')}`,
    seed: () => 'remote-seed',
    roomTtlMs: 1000,
  });
  return { manager, store };
}

const stateOf = (out: OutMessage[], to: string) =>
  out.find((m) => m.to === to && m.event === 'room:state')?.payload;
const join = (name: string) => ({
  protocolVersion: 1,
  code: 'AAAA',
  role: 'player' as const,
  name,
});

describe('sala creada por un jugador a distancia', () => {
  it('el creador entra como jugador, administra la sala y no hay pantalla principal', () => {
    const { manager } = setup();
    const { data, out } = must(
      manager.createRoom('a', { role: 'player', name: ' Ana ', color: 'c3' }),
    );
    expect(data).toMatchObject({ code: 'AAAA', role: 'player', playerId: 'p0' });
    expect(manager.getRoom('AAAA')).toMatchObject({
      hostless: true,
      ownerId: 'p0',
      status: 'lobby',
    });
    expect(manager.getRoom('AAAA')?.seats).toMatchObject([
      { playerId: 'p0', name: 'Ana', color: 'c3', ready: false, bot: false },
    ]);
    expect(stateOf(out, 'a')).toMatchObject({
      hostConnected: false,
      you: { role: 'player', playerId: 'p0', admin: true },
      seats: [{ name: 'Ana', color: 'c3' }],
    });
  });

  it('por defecto se queda con el primer color', () => {
    const { manager } = setup();
    must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    expect(manager.getRoom('AAAA')?.seats[0]?.color).toBe('c1');
  });

  it('una sala con pantalla principal sigue como antes: el host administra y los jugadores no', () => {
    const { manager } = setup();
    const created = must(manager.createRoom('h'));
    expect(created.data.role).toBe('host');
    expect(manager.getRoom('AAAA')).toMatchObject({ hostless: false, ownerId: null });
    const joined = must(manager.join('a', join('Ana')));
    expect(stateOf(joined.out, 'a')).toMatchObject({ you: { admin: false } });
    expect(stateOf(joined.out, 'h')).toMatchObject({ you: { admin: true } });
    expect(manager.addBot('a')).toEqual({ ok: false, error: 'NOT_HOST' });
  });

  it('solo el administrador añade y quita bots y empieza la partida', () => {
    const { manager } = setup();
    must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    must(manager.join('b', join('Luis')));
    expect(manager.addBot('b')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(manager.removeBot('b', 'p1')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(manager.start('b')).toEqual({ ok: false, error: 'NOT_HOST' });

    must(manager.addBot('a'));
    expect(manager.getRoom('AAAA')?.seats.map((s) => s.name)).toEqual(['Ana', 'Luis', 'Bot 1']);
    expect(manager.removeBot('b', 'p2')).toEqual({ ok: false, error: 'NOT_HOST' });
    must(manager.removeBot('a', 'p2'));
    expect(manager.getRoom('AAAA')?.seats).toHaveLength(2);

    // para empezar hacen falta 2 jugadores y que todos estén listos, incluido el creador
    expect(manager.start('a')).toEqual({ ok: false, error: 'PLAYERS_NOT_READY' });
    must(manager.updateLobby('a', { protocolVersion: 1, ready: true }));
    must(manager.updateLobby('b', { protocolVersion: 1, ready: true }));
    expect(manager.start('b')).toEqual({ ok: false, error: 'NOT_HOST' });
    const started = must(manager.start('a'));
    expect(manager.getRoom('AAAA')?.status).toBe('playing');
    // cada uno recibe su vista, y nadie es host
    const views = started.out.filter((m) => m.event === 'game:view');
    expect(views.map((v) => v.to).sort()).toEqual(['a', 'b']);
    for (const v of views)
      if (v.event === 'game:view') expect(v.payload.view.you?.id).toBe(v.to === 'a' ? 'p0' : 'p1');
  });

  it('un solo jugador con bots puede empezar (juego en solitario contra el servidor)', () => {
    const { manager } = setup();
    must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    must(manager.addBot('a'));
    must(manager.updateLobby('a', { protocolVersion: 1, ready: true }));
    must(manager.start('a'));
    expect(manager.getRoom('AAAA')?.game?.snapshot.players.map((p) => p.id)).toEqual(['p0', 'p1']);
  });

  it('si el creador sale del lobby, el cargo pasa al siguiente jugador humano (nunca a un bot)', () => {
    const { manager } = setup();
    must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    must(manager.addBot('a'));
    must(manager.join('b', join('Luis')));
    const left = must(manager.leave('a'));
    expect(manager.getRoom('AAAA')?.ownerId).toBe('p2');
    expect(stateOf(left.out, 'b')).toMatchObject({ you: { playerId: 'p2', admin: true } });
    expect(manager.addBot('b').ok).toBe(true);
  });

  it('si no queda ningún humano, el siguiente que entre pasa a administrar la sala', () => {
    const { manager } = setup();
    must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    must(manager.leave('a'));
    expect(manager.getRoom('AAAA')?.ownerId).toBeNull();
    const joined = must(manager.join('b', join('Luis')));
    expect(manager.getRoom('AAAA')?.ownerId).toBe('p1');
    expect(stateOf(joined.out, 'b')).toMatchObject({ you: { admin: true } });
  });

  it('el creador conserva el cargo al reconectar y la sala sobrevive a que se desconecte', () => {
    const { manager } = setup();
    const { data } = must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    manager.disconnect('a');
    expect(manager.getRoom('AAAA')?.ownerId).toBe('p0');
    const resumed = must(
      manager.resume('a2', { protocolVersion: 1, code: 'AAAA', token: data.token }),
    );
    expect(resumed.data).toMatchObject({ role: 'player', playerId: 'p0' });
    expect(stateOf(resumed.out, 'a2')).toMatchObject({ you: { admin: true } });
  });

  it('abandonar durante la partida no quita el cargo: se puede volver con el token', () => {
    const { manager } = setup();
    const { data } = must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    must(manager.addBot('a'));
    must(manager.updateLobby('a', { protocolVersion: 1, ready: true }));
    must(manager.start('a'));
    must(manager.leave('a'));
    expect(manager.getRoom('AAAA')?.ownerId).toBe('p0');
    expect(manager.resume('a2', { protocolVersion: 1, code: 'AAAA', token: data.token }).ok).toBe(
      true,
    );
  });
});

describe('espectadores en una sala a distancia', () => {
  it('entran sin asiento y reciben la vista pública', () => {
    const { manager } = setup();
    must(manager.createRoom('a', { role: 'player', name: 'Ana' }));
    must(manager.addBot('a'));
    must(manager.updateLobby('a', { protocolVersion: 1, ready: true }));
    must(manager.start('a'));
    const spec = must(manager.join('s', { protocolVersion: 1, code: 'AAAA', role: 'spectator' }));
    const view = spec.out.find((m) => m.to === 's' && m.event === 'game:view');
    expect(view && view.event === 'game:view' && view.payload.view.you).toBeNull();
    expect(view && view.event === 'game:view' && view.payload.view.legalActions).toEqual([]);
    expect(stateOf(spec.out, 's')).toMatchObject({
      you: { role: 'spectator', playerId: null, admin: false },
      spectators: 1,
    });
    // el espectador no puede administrar ni actuar
    expect(manager.start('s')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(manager.addBot('s')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(manager.action('s', { type: 'ROLL' })).toEqual({ ok: false, error: 'NOT_A_PLAYER' });
  });
});

describe('salas guardadas por versiones anteriores', () => {
  it('se recuperan como salas con pantalla principal y sin propietario', async () => {
    const { manager, store } = setup();
    must(manager.createRoom('h'));
    await Promise.resolve();
    const [saved] = await store.loadAll();
    const legacy: Record<string, unknown> = { ...(saved as RoomData) };
    delete legacy['hostless'];
    delete legacy['ownerId'];
    const old = new MemoryRoomStore();
    await old.save(legacy as unknown as RoomData);
    const fresh = new RoomManager({
      store: old,
      logger: silentLogger,
      clock: () => 1,
      randomInt: () => 0,
      token: () => 'x'.repeat(24),
      seed: () => 's',
      roomTtlMs: 1000,
    });
    await fresh.hydrate();
    expect(fresh.getRoom('AAAA')).toMatchObject({ hostless: false, ownerId: null });
  });
});
