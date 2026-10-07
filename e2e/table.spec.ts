import { expect, test } from '@playwright/test';
import {
  desktop,
  joinAndReady,
  phone,
  pieces,
  playUntil,
  realProblems,
  roomCode,
  turnNumber,
} from './helpers.js';
import type { Person } from './helpers.js';

const PLAYERS = [
  { name: 'Ana', color: 'Carmesí' },
  { name: 'Berta', color: 'Violeta' },
  { name: 'Carla', color: 'Ámbar' },
  { name: 'Diego', color: 'Cian' },
] as const;

test('mesa con pantalla principal y cuatro móviles: sala, colocación inicial y varias rondas', async ({
  browser,
}) => {
  const host = await desktop(browser, 'pantalla');
  const everyone: Person[] = [host];
  try {
    await host.page.goto('/host');
    const code = await roomCode(host.page);

    // ── Los cuatro móviles entran por código, con su nombre y su color ──
    const phones: Person[] = [];
    for (const { name, color } of PLAYERS) {
      const person = await phone(browser, name);
      everyone.push(person);
      phones.push(person);
      await joinAndReady(person, code, color);
    }
    for (const { name } of PLAYERS)
      await expect(host.page.locator('.seat-list')).toContainText(name);

    // ── La pantalla principal empieza la partida cuando todos están listos ──
    const start = host.page.getByRole('button', { name: 'Empezar partida' });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(host.page.locator('.board')).toBeVisible();
    for (const person of phones) {
      await expect(person.page.getByRole('heading', { name: 'Tu mano' })).toBeVisible();
    }

    // ── Colocación inicial: 2 poblados y 2 caminos por jugador, cada uno cuando le toca ──
    await playUntil(
      phones,
      async () => {
        const p = await pieces(host.page);
        return p.buildings === 8 && p.roads === 8;
      },
      'la colocación inicial',
    );
    expect(await pieces(host.page)).toEqual({ buildings: 8, roads: 8 });

    // ── Varias rondas: cada uno tira los dados y termina su turno ──
    await playUntil(phones, async () => (await turnNumber(host.page)) >= 6, 'cinco turnos');
    // la pantalla principal muestra lo público (la tirada); nunca una mano
    await expect(host.page.getByLabel(/Última tirada/)).toBeVisible();
    await expect(host.page.getByRole('heading', { name: 'Tu mano' })).toHaveCount(0);

    // ── Un móvil que se recarga vuelve a su asiento sin perder la partida ──
    const berta = phones[1];
    if (!berta) throw new Error('sin segundo jugador');
    await berta.page.reload();
    await expect(berta.page.getByRole('heading', { name: 'Tu mano' })).toBeVisible();
    await expect(berta.page.getByRole('banner')).toContainText('Berta');

    expect(realProblems(everyone)).toEqual([]);
  } finally {
    await Promise.all(everyone.map((p) => p.context.close()));
  }
});
