import { expect, test } from '@playwright/test';
import { desktop, pieces, playUntil, realProblems, turnNumber } from './helpers.js';

test('partida a distancia: dos jugadores y un bot sin pantalla común, con un espectador', async ({
  browser,
}) => {
  const ana = await desktop(browser, 'Ana');
  const berta = await desktop(browser, 'Berta');
  const watcher = await desktop(browser, 'espectador');
  const everyone = [ana, berta, watcher];
  try {
    // ── Ana crea la sala desde su navegador y comparte el enlace ──
    await ana.page.goto('/create');
    await ana.page.getByLabel('Tu nombre').fill('Ana');
    await ana.page.getByRole('button', { name: 'Crear sala' }).click();
    const link = ana.page.getByLabel('Enlace de la sala');
    await expect(link).toBeVisible();
    const url = await link.inputValue();
    const code = /code=([A-Z]{4})/.exec(url)?.[1];
    expect(code, `enlace de la sala: ${url}`).toBeTruthy();

    // ── Berta entra por el enlace ──
    await berta.page.goto(new URL(url).pathname + new URL(url).search);
    await berta.page.getByLabel('Tu nombre').fill('Berta');
    await berta.page.getByRole('button', { name: 'Unirme' }).click();
    await berta.page.getByRole('button', { name: 'Estoy listo' }).click();
    await expect(ana.page.locator('.seat-list')).toContainText('Berta');

    // ── Un espectador mira la sala sin jugar ──
    await watcher.page.goto(`/watch/${code}`);
    await expect(watcher.page.locator('.seat-list')).toContainText('Ana');

    // ── Ana añade un bot, se pone lista y empieza ──
    await ana.page.getByRole('button', { name: 'Añadir bot' }).click();
    await ana.page.getByRole('button', { name: 'Estoy listo' }).click();
    const start = ana.page.getByRole('button', { name: 'Empezar partida' });
    await expect(start).toBeEnabled();
    await start.click();

    // El espectador ve el tablero; nada de manos ni de botones de juego.
    await expect(watcher.page.locator('.board')).toBeVisible();
    await expect(watcher.page.getByRole('heading', { name: 'Tu mano' })).toHaveCount(0);
    await expect(watcher.page.getByRole('button', { name: 'Tirar los dados' })).toHaveCount(0);

    // ── Colocación inicial de los tres (6 poblados y 6 caminos), con el bot jugando solo ──
    await playUntil(
      [ana, berta],
      async () => {
        const p = await pieces(watcher.page);
        return p.buildings === 6 && p.roads === 6;
      },
      'la colocación inicial',
    );

    // ── Unas rondas más: el turno avanza para todos, también para el espectador ──
    await playUntil(
      [ana, berta],
      async () => (await turnNumber(watcher.page)) >= 5,
      'cuatro turnos',
    );
    await expect(ana.page.getByRole('heading', { name: 'Tu mano' })).toBeVisible();
    await expect(berta.page.getByRole('heading', { name: 'Tu mano' })).toBeVisible();

    expect(realProblems(everyone)).toEqual([]);
  } finally {
    await Promise.all(everyone.map((p) => p.context.close()));
  }
});
