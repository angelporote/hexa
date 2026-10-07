import { useSyncExternalStore } from 'react';
import { createSoundPlayer } from './player.js';
import type { SoundPlayer } from './player.js';

const KEY = 'hexa.sound';

/** El sonido está activado por defecto; quien lo silencia lo conserva entre visitas. */
function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

let muted = read();
const listeners = new Set<() => void>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  if (muted === value) return;
  muted = value;
  try {
    localStorage.setItem(KEY, value ? 'off' : 'on');
  } catch {
    // Sin almacenamiento: la preferencia vale solo hasta cerrar la pestaña.
  }
  for (const listener of listeners) listener();
}

/** Relee la preferencia guardada (para tests que cambian `localStorage` a mano). */
export function reloadMuted(): void {
  muted = read();
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Estado de silencio y su interruptor, para los componentes. */
export function useMuted(): readonly [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, isMuted, isMuted);
  return [value, setMuted] as const;
}

let shared: SoundPlayer | null = null;

/** El reproductor de toda la aplicación: uno solo, para compartir el contexto de audio. */
export function getSoundPlayer(): SoundPlayer {
  shared ??= createSoundPlayer({ isMuted });
  return shared;
}

/** Sustituye el reproductor compartido (tests); sin argumento, vuelve al de verdad. */
export function setSoundPlayerForTests(player: SoundPlayer | null): void {
  shared = player;
}
