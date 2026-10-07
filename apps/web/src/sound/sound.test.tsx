import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { GameEvent } from '@hexa/engine';
import { SoundToggle } from '../components/SoundToggle.js';
import type { LoggedEvent } from '../net/connection.js';
import { Providers, makeConnection } from '../testing.js';
import { createSoundPlayer } from './player.js';
import type { SoundPlayer } from './player.js';
import { SOUNDS, SOUND_IDS, soundDuration } from './recipes.js';
import type { SoundId } from './recipes.js';
import { isMuted, reloadMuted, setMuted, setSoundPlayerForTests, useMuted } from './store.js';
import { SOUND_GAP, soundsFor, useSoundEffects } from './use-sound-effects.js';

beforeEach(() => {
  localStorage.clear();
  reloadMuted();
});

afterEach(() => {
  cleanup();
  setSoundPlayerForTests(null);
  localStorage.clear();
  reloadMuted();
});

// ── Un AudioContext falso que anota los nodos que se crean ─────────────────────────────────

function fakeAudio(state: 'running' | 'suspended' = 'running') {
  const param = () => ({
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const made = {
    oscillators: [] as {
      type: string;
      start: ReturnType<typeof vi.fn>;
      frequency: ReturnType<typeof param>;
    }[],
    sources: [] as { start: ReturnType<typeof vi.fn>; buffer: { data: Float32Array } | null }[],
    filters: [] as { type: string }[],
    gains: 0,
    buffers: [] as Float32Array[],
  };
  const ctx = {
    currentTime: 10,
    state,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(() => {
      ctx.state = 'running';
      return Promise.resolve();
    }),
    createGain: () => {
      made.gains++;
      return { gain: param(), connect: vi.fn() };
    },
    createOscillator: () => {
      const o = { type: '', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      made.oscillators.push(o);
      return o;
    },
    createBuffer: (_channels: number, frames: number) => {
      const data = new Float32Array(frames);
      made.buffers.push(data);
      return { getChannelData: () => data, data };
    },
    createBufferSource: () => {
      const s = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      made.sources.push(s);
      return s;
    },
    createBiquadFilter: () => {
      const f = { type: '', frequency: param(), connect: vi.fn() };
      made.filters.push(f);
      return f;
    },
  };
  return { ctx, made, audio: ctx as unknown as AudioContext };
}

describe('recetas de sonido', () => {
  it('cada sonido tiene voces válidas y dura menos de dos segundos', () => {
    expect(SOUND_IDS.sort()).toEqual(['build', 'dice', 'gain', 'offer', 'robber', 'turn', 'win']);
    for (const id of SOUND_IDS) {
      expect(SOUNDS[id].length, id).toBeGreaterThan(0);
      for (const v of SOUNDS[id]) {
        expect(v.at, id).toBeGreaterThanOrEqual(0);
        expect(v.duration, id).toBeGreaterThan(0);
        expect(v.gain, id).toBeGreaterThan(0);
        expect(v.gain, id).toBeLessThanOrEqual(1);
        if (v.kind === 'tone') {
          expect(v.from, id).toBeGreaterThan(20);
          expect(v.to, id).toBeGreaterThan(20);
        } else {
          expect(v.lowpass, id).toBeGreaterThan(100);
        }
      }
      expect(soundDuration(id), id).toBeLessThan(2);
    }
  });

  it('son distintos entre sí (para poder reconocerlos)', () => {
    const signatures = SOUND_IDS.map((id) => JSON.stringify(SOUNDS[id]));
    expect(new Set(signatures).size).toBe(SOUND_IDS.length);
  });
});

describe('reproductor', () => {
  it('un tono crea un oscilador con su onda y lo programa en su momento', () => {
    const { audio, made } = fakeAudio();
    createSoundPlayer({ isMuted: () => false, createContext: () => audio }).play('turn');
    const voices = SOUNDS.turn;
    expect(made.oscillators).toHaveLength(voices.length);
    expect(made.oscillators.map((o) => o.type)).toEqual(
      voices.map((v) => (v.kind === 'tone' ? v.wave : '')),
    );
    voices.forEach((v, i) => {
      expect(made.oscillators[i]?.start).toHaveBeenCalledWith(10 + v.at);
    });
  });

  it('el retraso desplaza el inicio de todas las voces', () => {
    const { audio, made } = fakeAudio();
    createSoundPlayer({ isMuted: () => false, createContext: () => audio }).play('turn', 0.5);
    expect(made.oscillators[0]?.start).toHaveBeenCalledWith(10.5);
  });

  it('el ruido crea una fuente con búfer y un filtro paso bajo; el búfer es reproducible', () => {
    const run = () => {
      const { audio, made } = fakeAudio();
      createSoundPlayer({ isMuted: () => false, createContext: () => audio }).play('dice');
      return made;
    };
    const first = run();
    const noises = SOUNDS.dice.filter((v) => v.kind === 'noise').length;
    expect(first.sources).toHaveLength(noises);
    expect(first.filters).toHaveLength(noises);
    expect(first.filters.every((f) => f.type === 'lowpass')).toBe(true);
    const samples = first.buffers[0] ?? new Float32Array();
    expect(samples.some((x) => x !== 0)).toBe(true);
    expect([...samples].every((x) => x >= -1 && x <= 1)).toBe(true);
    expect([...(run().buffers[0] ?? [])]).toEqual([...samples]);
    // el resto de voces del dado (un golpe grave) sí son tonos
    expect(first.oscillators).toHaveLength(SOUNDS.dice.length - noises);
  });

  it('en silencio no crea ni el contexto de audio', () => {
    const createContext = vi.fn(() => fakeAudio().audio);
    const player = createSoundPlayer({ isMuted: () => true, createContext });
    player.play('win');
    expect(createContext).not.toHaveBeenCalled();
  });

  it('el silencio se consulta en cada reproducción', () => {
    const { audio, made } = fakeAudio();
    let muted = true;
    const player = createSoundPlayer({ isMuted: () => muted, createContext: () => audio });
    player.play('turn');
    expect(made.oscillators).toHaveLength(0);
    muted = false;
    player.play('turn');
    expect(made.oscillators.length).toBeGreaterThan(0);
  });

  it('unlock crea el contexto y lo reanuda si el navegador lo dejó suspendido', () => {
    const { audio, ctx } = fakeAudio('suspended');
    const createContext = vi.fn(() => audio);
    const player = createSoundPlayer({ isMuted: () => false, createContext });
    player.unlock();
    player.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('reproducir con el contexto suspendido también lo reanuda', () => {
    const { audio, ctx } = fakeAudio('suspended');
    createSoundPlayer({ isMuted: () => false, createContext: () => audio }).play('gain');
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('sin Web Audio, o si falla al crearlo, no lanza y no lo reintenta', () => {
    const none = vi.fn(() => null);
    const p1 = createSoundPlayer({ isMuted: () => false, createContext: none });
    expect(() => {
      p1.unlock();
      p1.play('win');
      p1.play('win');
    }).not.toThrow();
    expect(none).toHaveBeenCalledTimes(1);

    const boom = vi.fn(() => {
      throw new Error('no hay audio');
    });
    const p2 = createSoundPlayer({ isMuted: () => false, createContext: boom });
    expect(() => {
      p2.play('win');
      p2.unlock();
    }).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
  });

  it('un fallo al programar un sonido se traga: la partida sigue', () => {
    const { audio, ctx } = fakeAudio();
    ctx.createGain = () => {
      throw new Error('fallo de audio');
    };
    const player = createSoundPlayer({ isMuted: () => false, createContext: () => audio });
    expect(() => player.play('build')).not.toThrow();
  });

  it('con el contexto real del navegador ausente (jsdom) tampoco falla', () => {
    const player = createSoundPlayer({ isMuted: () => false });
    expect(() => {
      player.unlock();
      player.play('dice');
    }).not.toThrow();
  });
});

describe('preferencia de silencio', () => {
  it('está activado por defecto, se guarda y se recuerda', () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(localStorage.getItem('hexa.sound')).toBe('off');
    setMuted(false);
    expect(localStorage.getItem('hexa.sound')).toBe('on');
    localStorage.setItem('hexa.sound', 'off');
    reloadMuted();
    expect(isMuted()).toBe(true);
  });

  it('avisa a quien escucha solo cuando cambia', () => {
    const { result } = renderHook(() => useMuted());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](true)); // sin cambio
    expect(result.current[0]).toBe(true);
  });

  it('sin almacenamiento disponible sigue funcionando en memoria', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => setMuted(true)).not.toThrow();
    expect(isMuted()).toBe(true);
    spy.mockRestore();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    reloadMuted();
    expect(isMuted()).toBe(false);
    get.mockRestore();
  });
});

// ── Qué suena con cada evento ──────────────────────────────────────────────────────────────

const OFFER = {
  id: 1,
  from: 'p1',
  to: null,
  give: { r1: 1, r2: 0, r3: 0, r4: 0, r5: 0 },
  want: { r1: 0, r2: 1, r3: 0, r4: 0, r5: 0 },
  accepted: [],
  rejected: [],
  counters: [],
};
const NONE = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

const events = {
  roll: { type: 'DICE_ROLLED', player: 'p1', dice: [3, 4], total: 7 } as GameEvent,
  settlement: { type: 'SETTLEMENT_BUILT', player: 'p1', vertex: 'v1' } as GameEvent,
  city: { type: 'CITY_BUILT', player: 'p1', vertex: 'v1' } as GameEvent,
  road: { type: 'ROAD_BUILT', player: 'p1', edge: 'e1' } as GameEvent,
  robber: { type: 'ROBBER_MOVED', player: 'p1', hex: 'h0,0', victim: null } as GameEvent,
  win: { type: 'GAME_WON', player: 'p1', points: 10 } as GameEvent,
  myWin: { type: 'GAME_WON', player: 'p0', points: 10 } as GameEvent,
  myTurn: { type: 'TURN_STARTED', player: 'p0', number: 4 } as GameEvent,
  otherTurn: { type: 'TURN_STARTED', player: 'p1', number: 3 } as GameEvent,
  myGain: { type: 'RESOURCES_GAINED', player: 'p0', resources: NONE, reason: 'roll' } as GameEvent,
  otherGain: {
    type: 'RESOURCES_GAINED',
    player: 'p1',
    resources: NONE,
    reason: 'roll',
  } as GameEvent,
  offerToAll: { type: 'TRADE_OFFERED', offer: OFFER } as GameEvent,
  offerToMe: { type: 'TRADE_OFFERED', offer: { ...OFFER, to: ['p0'] } } as GameEvent,
  offerToOther: { type: 'TRADE_OFFERED', offer: { ...OFFER, to: ['p2'] } } as GameEvent,
  myOffer: { type: 'TRADE_OFFERED', offer: { ...OFFER, from: 'p0' } } as GameEvent,
  tradeWithMe: { type: 'TRADE_COMPLETED', offerId: 1, from: 'p1', with: 'p0' } as GameEvent,
  tradeOthers: { type: 'TRADE_COMPLETED', offerId: 1, from: 'p1', with: 'p2' } as GameEvent,
  discard: { type: 'CARDS_DISCARDED', player: 'p0', count: 2 } as GameEvent,
};

describe('soundsFor', () => {
  it('la mesa (pantalla principal, espectadores): dados, construcciones, ladrón y victoria', () => {
    expect(soundsFor([events.roll], null, 'public')).toEqual(['dice']);
    for (const e of [events.settlement, events.city, events.road]) {
      expect(soundsFor([e], null, 'public')).toEqual(['build']);
    }
    expect(soundsFor([events.robber], null, 'public')).toEqual(['robber']);
    expect(soundsFor([events.win], null, 'public')).toEqual(['win']);
  });

  it('la mesa no suena con lo personal', () => {
    expect(
      soundsFor(
        [events.myTurn, events.myGain, events.offerToMe, events.tradeWithMe],
        'p0',
        'public',
      ),
    ).toEqual([]);
  });

  it('el mando: tu turno, recibir recursos, una oferta para ti y un trato cerrado contigo', () => {
    expect(soundsFor([events.myTurn], 'p0', 'personal')).toEqual(['turn']);
    expect(soundsFor([events.myGain], 'p0', 'personal')).toEqual(['gain']);
    expect(soundsFor([events.offerToAll], 'p0', 'personal')).toEqual(['offer']);
    expect(soundsFor([events.offerToMe], 'p0', 'personal')).toEqual(['offer']);
    expect(soundsFor([events.tradeWithMe], 'p0', 'personal')).toEqual(['gain']);
  });

  it('el mando no suena con lo ajeno ni con la mesa', () => {
    const others = [
      events.otherTurn,
      events.otherGain,
      events.offerToOther,
      events.myOffer,
      events.tradeOthers,
      events.roll,
      events.settlement,
      events.robber,
      events.win,
      events.discard,
    ];
    expect(soundsFor(others, 'p0', 'personal')).toEqual([]);
  });

  it('tu propia victoria suena en el mando; la de otro, no', () => {
    expect(soundsFor([events.myWin], 'p0', 'personal')).toEqual(['win']);
    expect(soundsFor([events.win], 'p0', 'personal')).toEqual([]);
    expect(soundsFor([events.myWin], null, 'personal')).toEqual([]);
  });

  it('sin saber quién eres no suena nada personal', () => {
    expect(
      soundsFor(
        [events.myTurn, events.myGain, events.offerToAll, events.tradeWithMe],
        null,
        'personal',
      ),
    ).toEqual([]);
  });

  it('sala a distancia (todo): lo de la mesa y lo tuyo', () => {
    expect(soundsFor([events.roll, events.myTurn], 'p0', 'all')).toEqual(['turn', 'dice']);
    expect(soundsFor([events.win], 'p0', 'all')).toEqual(['win']);
  });

  it('un lote no repite sonidos, va por orden de importancia y se limita a tres', () => {
    const batch = [
      events.settlement,
      events.road,
      events.roll,
      events.myGain,
      events.myTurn,
      events.robber,
    ];
    const result = soundsFor(batch, 'p0', 'all');
    expect(result).toEqual(['turn', 'dice', 'robber']);
    expect(new Set(result).size).toBe(result.length);
    expect(soundsFor([events.myWin, events.myTurn, events.roll], 'p0', 'all')).toEqual([
      'win',
      'turn',
      'dice',
    ]);
  });

  it('un lote vacío no suena', () => {
    expect(soundsFor([], 'p0', 'all')).toEqual([]);
  });
});

// ── El hook ────────────────────────────────────────────────────────────────────────────────

function recorder(): { player: SoundPlayer; played: [SoundId, number][]; unlocked: () => number } {
  const played: [SoundId, number][] = [];
  let unlocks = 0;
  return {
    played,
    unlocked: () => unlocks,
    player: {
      play: (id, delay = 0) => void played.push([id, delay]),
      unlock: () => void unlocks++,
    },
  };
}

const logged = (list: GameEvent[], from = 1): LoggedEvent[] =>
  list.map((event, i) => ({ id: from + i, seq: 1, event }));

describe('useSoundEffects', () => {
  it('ignora el historial que ya había al montarse y suena lo nuevo', () => {
    const { player, played } = recorder();
    const history = logged([events.roll, events.settlement]);
    const { rerender } = renderHook(({ list }) => useSoundEffects(list, null, 'public', player), {
      initialProps: { list: history },
    });
    expect(played).toEqual([]);
    rerender({ list: [...history, ...logged([events.robber], 3)] });
    expect(played).toEqual([['robber', 0]]);
  });

  it('un mismo evento no suena dos veces aunque se vuelva a pintar', () => {
    const { player, played } = recorder();
    const { rerender } = renderHook(({ list }) => useSoundEffects(list, null, 'public', player), {
      initialProps: { list: logged([]) },
    });
    const withRoll = logged([events.roll]);
    rerender({ list: withRoll });
    rerender({ list: [...withRoll] });
    expect(played).toEqual([['dice', 0]]);
  });

  it('separa en el tiempo los sonidos de un mismo lote', () => {
    const { player, played } = recorder();
    const { rerender } = renderHook(({ list }) => useSoundEffects(list, 'p0', 'all', player), {
      initialProps: { list: logged([]) },
    });
    rerender({ list: logged([events.roll, events.myTurn, events.robber]) });
    expect(played).toEqual([
      ['turn', 0],
      ['dice', SOUND_GAP],
      ['robber', SOUND_GAP * 2],
    ]);
  });

  it('respeta el ámbito: el mando no suena con la mesa', () => {
    const { player, played } = recorder();
    const { rerender } = renderHook(({ list }) => useSoundEffects(list, 'p0', 'personal', player), {
      initialProps: { list: logged([]) },
    });
    rerender({ list: logged([events.roll, events.settlement]) });
    expect(played).toEqual([]);
  });

  it('tras limpiar el registro (p. ej., al salir de la sala) vuelve a empezar sin sonar', () => {
    const { player, played } = recorder();
    const { rerender } = renderHook(({ list }) => useSoundEffects(list, null, 'public', player), {
      initialProps: { list: logged([events.roll]) },
    });
    rerender({ list: [] });
    expect(played).toEqual([]);
  });

  it('prepara el audio en el primer toque y solo en el primero', () => {
    const { player, unlocked } = recorder();
    renderHook(() => useSoundEffects([], null, 'public', player));
    expect(unlocked()).toBe(0);
    fireEvent.pointerDown(window);
    fireEvent.pointerDown(window);
    expect(unlocked()).toBe(1);
  });

  it('prepara el audio también con el teclado', () => {
    const { player, unlocked } = recorder();
    renderHook(() => useSoundEffects([], null, 'public', player));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(unlocked()).toBe(1);
  });

  it('al desmontarse deja de escuchar', () => {
    const { player, unlocked } = recorder();
    const { unmount } = renderHook(() => useSoundEffects([], null, 'public', player));
    unmount();
    fireEvent.pointerDown(window);
    expect(unlocked()).toBe(0);
  });
});

// ── El botón ───────────────────────────────────────────────────────────────────────────────

describe('<SoundToggle />', () => {
  const mount = () =>
    render(
      <Providers connection={makeConnection().connection}>
        <SoundToggle />
      </Providers>,
    );

  it('refleja el estado y lo cambia con un toque, recordándolo', () => {
    const { player } = recorder();
    setSoundPlayerForTests(player);
    mount();
    const button = screen.getByRole('button', { name: 'Sonido' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('title')).toBe('Sonido activado');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('title')).toBe('Sonido desactivado');
    expect(localStorage.getItem('hexa.sound')).toBe('off');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('hexa.sound')).toBe('on');
  });

  it('al activarlo prepara el audio y suena un aviso; al silenciarlo no suena nada', () => {
    const { player, played, unlocked } = recorder();
    setSoundPlayerForTests(player);
    setMuted(true);
    mount();
    const button = screen.getByRole('button', { name: 'Sonido' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button); // activa
    expect(unlocked()).toBe(1);
    expect(played).toEqual([['gain', 0]]);
    fireEvent.click(button); // silencia
    expect(played).toHaveLength(1);
  });

  it('empieza silenciado si así se dejó la última vez', () => {
    localStorage.setItem('hexa.sound', 'off');
    reloadMuted();
    mount();
    expect(screen.getByRole('button', { name: 'Sonido' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
