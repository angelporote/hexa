// Sonidos de la interfaz como datos: se sintetizan con Web Audio (osciladores y ruido), así que no
// hay archivos de audio ni licencias que registrar. Cada receta es una lista de «voces» que
// suenan a la vez o encadenadas; el reproductor las convierte en nodos de audio.

export type SoundId = 'dice' | 'turn' | 'build' | 'gain' | 'robber' | 'offer' | 'win';

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface ToneVoice {
  readonly kind: 'tone';
  readonly wave: Wave;
  /** Frecuencia inicial y final en Hz; si difieren, se desliza de una a otra. */
  readonly from: number;
  readonly to: number;
  /** Segundos desde el inicio del sonido. */
  readonly at: number;
  readonly duration: number;
  /** Volumen de 0 a 1 antes del volumen general. */
  readonly gain: number;
}

export interface NoiseVoice {
  readonly kind: 'noise';
  readonly at: number;
  readonly duration: number;
  readonly gain: number;
  /** Frecuencia de corte del filtro paso bajo: más baja = más sordo. */
  readonly lowpass: number;
}

export type Voice = ToneVoice | NoiseVoice;

const tone = (
  wave: Wave,
  from: number,
  at: number,
  duration: number,
  gain: number,
  to: number = from,
): ToneVoice => ({ kind: 'tone', wave, from, to, at, duration, gain });

const noise = (at: number, duration: number, gain: number, lowpass: number): NoiseVoice => ({
  kind: 'noise',
  at,
  duration,
  gain,
  lowpass,
});

/** Notas (Hz) de una escala de do mayor, para los avisos agradables. */
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

export const SOUNDS: Readonly<Record<SoundId, readonly Voice[]>> = {
  // Traqueteo de dados: ráfagas de ruido que se espacian y un golpe grave al final.
  dice: [
    noise(0, 0.05, 0.5, 3200),
    noise(0.08, 0.05, 0.45, 2800),
    noise(0.17, 0.06, 0.4, 2400),
    noise(0.28, 0.07, 0.35, 2000),
    tone('sine', 160, 0.4, 0.12, 0.5, 90),
  ],
  // Tu turno: dos notas ascendentes.
  turn: [tone('sine', C5, 0, 0.14, 0.5), tone('sine', G5, 0.14, 0.22, 0.5)],
  // Construir: un golpe seco y un clic.
  build: [tone('triangle', 200, 0, 0.14, 0.6, 85), noise(0, 0.04, 0.25, 1800)],
  // Recibir recursos: «ding» de dos tonos agudos.
  gain: [tone('sine', 988, 0, 0.1, 0.4), tone('sine', 1318.5, 0.08, 0.2, 0.4)],
  // Ladrón: tono grave que baja con un poco de aspereza.
  robber: [tone('sawtooth', 150, 0, 0.4, 0.35, 70), tone('sine', 75, 0.05, 0.4, 0.5)],
  // Oferta de comercio: dos avisos iguales.
  offer: [tone('sine', 784, 0, 0.1, 0.45), tone('sine', 784, 0.16, 0.14, 0.45)],
  // Victoria: arpegio ascendente.
  win: [
    tone('triangle', C5, 0, 0.16, 0.5),
    tone('triangle', E5, 0.15, 0.16, 0.5),
    tone('triangle', G5, 0.3, 0.16, 0.5),
    tone('triangle', C6, 0.45, 0.5, 0.55),
  ],
};

export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

/** Segundos que dura un sonido completo (hasta el final de su última voz). */
export function soundDuration(id: SoundId): number {
  return Math.max(...SOUNDS[id].map((v) => v.at + v.duration));
}
