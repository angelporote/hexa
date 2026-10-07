import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTurnVibration, useWakeLock } from './hooks.js';

interface FakeLock {
  released: boolean;
  release: () => Promise<void>;
}

function installWakeLock(behaviour: 'ok' | 'denied' = 'ok') {
  const locks: FakeLock[] = [];
  const request = vi.fn((): Promise<FakeLock> => {
    if (behaviour === 'denied') return Promise.reject(new Error('denegado'));
    const lock: FakeLock = {
      released: false,
      release: () => {
        lock.released = true;
        return Promise.resolve();
      },
    };
    locks.push(lock);
    return Promise.resolve(lock);
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { locks, request };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => setVisibility('visible'));
afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(navigator, 'vibrate');
  setVisibility('visible');
});

describe('useWakeLock', () => {
  it('pide el bloqueo de pantalla al activarse y lo libera al desmontar', async () => {
    const { locks, request } = installWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    expect(locks).toHaveLength(1);
    expect(locks[0]?.released).toBe(false);
    unmount();
    await flush();
    expect(locks[0]?.released).toBe(true);
  });

  it('no pide nada si no está activo, y lo libera al desactivarse', async () => {
    const { locks, request } = installWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: false } });
    await flush();
    expect(request).not.toHaveBeenCalled();
    rerender({ on: true });
    await flush();
    expect(locks).toHaveLength(1);
    rerender({ on: false });
    await flush();
    expect(locks[0]?.released).toBe(true);
  });

  it('lo vuelve a pedir cuando la página vuelve a ser visible (el navegador lo libera al ocultarla)', async () => {
    const { request } = installWakeLock();
    renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('no falla si el navegador no lo soporta o lo deniega', async () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    installWakeLock('denied');
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(() => unmount()).not.toThrow();
  });

  it('si se desmonta mientras el bloqueo está pendiente, lo libera igualmente', async () => {
    const { locks } = installWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    await flush();
    expect(locks.every((l) => l.released)).toBe(true);
  });
});

describe('useTurnVibration', () => {
  it('vibra al pasar a ser tu turno, pero no al abrir la página ni al perderlo', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { rerender } = renderHook(({ mine }) => useTurnVibration(mine), {
      initialProps: { mine: true },
    });
    expect(vibrate).not.toHaveBeenCalled(); // empezar con el turno propio no vibra
    rerender({ mine: false });
    expect(vibrate).not.toHaveBeenCalled();
    rerender({ mine: true });
    expect(vibrate).toHaveBeenCalledTimes(1);
    rerender({ mine: true });
    expect(vibrate).toHaveBeenCalledTimes(1); // sin cambio, sin vibración
  });

  it('se puede desactivar y no falla sin soporte', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { rerender } = renderHook(({ mine }) => useTurnVibration(mine, false), {
      initialProps: { mine: false },
    });
    rerender({ mine: true });
    expect(vibrate).not.toHaveBeenCalled();

    Reflect.deleteProperty(navigator, 'vibrate');
    const second = renderHook(({ mine }) => useTurnVibration(mine), {
      initialProps: { mine: false },
    });
    expect(() => second.rerender({ mine: true })).not.toThrow();
  });
});
