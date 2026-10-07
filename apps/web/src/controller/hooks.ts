import { useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

/**
 * Mantiene la pantalla encendida mientras `active` sea verdadero (Wake Lock API). El navegador
 * libera el bloqueo al ocultar la página, así que se vuelve a pedir al volver a verla. Si el
 * navegador no lo soporta o lo deniega, no pasa nada: es una comodidad, no un requisito.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const nav = navigator as Navigator & WakeLockNavigator;
    if (!active || !nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const lock = await nav.wakeLock?.request('screen');
        if (!lock) return;
        if (cancelled) void lock.release().catch(() => undefined);
        else sentinel = lock;
      } catch {
        // Denegado (ahorro de batería, permisos…): se sigue sin él.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

/** Vibra brevemente cuando pasa a ser tu turno (si el dispositivo lo permite). */
export function useTurnVibration(myTurn: boolean, enabled = true): void {
  const previous = useRef<boolean | null>(null);
  useEffect(() => {
    // La primera lectura solo fija el estado inicial: no vibra al abrir la página.
    if (enabled && previous.current === false && myTurn && 'vibrate' in navigator) {
      navigator.vibrate([180, 80, 180]);
    }
    previous.current = myTurn;
  }, [myTurn, enabled]);
}
