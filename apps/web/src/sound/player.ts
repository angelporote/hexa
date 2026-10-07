import { SOUNDS } from './recipes.js';
import type { SoundId, Voice } from './recipes.js';

export interface SoundPlayer {
  /** Reproduce un sonido, con un retraso opcional en segundos. No hace nada si está en silencio. */
  play(id: SoundId, delay?: number): void;
  /**
   * Prepara el audio. Los navegadores solo lo permiten tras un gesto del usuario, así que se llama
   * en el primer toque o pulsación.
   */
  unlock(): void;
}

export interface SoundPlayerOptions {
  readonly isMuted: () => boolean;
  /** Fábrica del contexto de audio; `null` si el navegador no tiene Web Audio. */
  readonly createContext?: () => AudioContext | null;
  /** Volumen general, de 0 a 1. */
  readonly volume?: number;
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function defaultContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

const SILENCE = 0.0001;
const ATTACK = 0.008;

/** Ruido blanco reproducible (no depende de `Math.random`): siempre suena igual. */
function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 22695477;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed / 2147483648 - 1;
  }
  return buffer;
}

function schedule(ctx: AudioContext, destination: AudioNode, voice: Voice, start: number): void {
  const at = start + voice.at;
  const end = at + voice.duration;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(SILENCE, at);
  envelope.gain.exponentialRampToValueAtTime(Math.max(SILENCE, voice.gain), at + ATTACK);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
  envelope.connect(destination);

  if (voice.kind === 'tone') {
    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(voice.from, at);
    if (voice.to !== voice.from) osc.frequency.exponentialRampToValueAtTime(voice.to, end);
    osc.connect(envelope);
    osc.start(at);
    osc.stop(end + 0.02);
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, voice.duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(voice.lowpass, at);
  source.connect(filter);
  filter.connect(envelope);
  source.start(at);
  source.stop(end + 0.02);
}

/**
 * Reproductor de los sonidos de la interfaz. Crea el contexto de audio la primera vez que hace
 * falta y nunca lanza: un fallo de audio no debe romper la partida.
 */
export function createSoundPlayer(options: SoundPlayerOptions): SoundPlayer {
  const create = options.createContext ?? defaultContext;
  const volume = options.volume ?? 0.35;
  let ctx: AudioContext | null = null;
  let failed = false;

  const ensure = (): AudioContext | null => {
    if (ctx || failed) return ctx;
    try {
      ctx = create();
    } catch {
      ctx = null;
    }
    if (!ctx) failed = true;
    return ctx;
  };

  const wake = (audio: AudioContext): void => {
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  };

  return {
    unlock() {
      const audio = ensure();
      if (audio) wake(audio);
    },
    play(id, delay = 0) {
      if (options.isMuted()) return;
      const audio = ensure();
      if (!audio) return;
      try {
        wake(audio);
        const master = audio.createGain();
        master.gain.setValueAtTime(volume, audio.currentTime);
        master.connect(audio.destination);
        const start = audio.currentTime + Math.max(0, delay);
        for (const voice of SOUNDS[id]) schedule(audio, master, voice, start);
      } catch {
        // Sin audio no pasa nada: el juego sigue.
      }
    },
  };
}
