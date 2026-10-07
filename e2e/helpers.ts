import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { devices } from '@playwright/test';

/** Una persona con su propio contexto de navegador (sesión y almacenamiento aparte). */
export interface Person {
  readonly name: string;
  readonly context: BrowserContext;
  readonly page: Page;
  /** Errores de JavaScript o de consola vistos en su página. */
  readonly problems: string[];
}

function watch(page: Page, who: string): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`${who}: ${error.message}`));
  // Una respuesta fallida se anota con su URL (el mensaje de consola del navegador no la trae).
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`${who}: ${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`${who}: ${message.text()}`);
  });
  return problems;
}

/** Una persona con un móvil (pantalla táctil de 412 × 915). */
export async function phone(browser: Browser, name: string): Promise<Person> {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' });
  const page = await context.newPage();
  return { name, context, page, problems: watch(page, name) };
}

/** Una persona con un ordenador (la pantalla principal o un jugador a distancia). */
export async function desktop(browser: Browser, name: string): Promise<Person> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
  });
  const page = await context.newPage();
  return { name, context, page, problems: watch(page, name) };
}

/** Código de sala que enseña la pantalla principal (se lee del texto alternativo del QR). */
export async function roomCode(host: Page): Promise<string> {
  const qr = host.getByRole('img', { name: /Código QR para unirse a la sala/ });
  await expect(qr).toBeVisible();
  const label = (await qr.getAttribute('aria-label')) ?? '';
  const code = /sala ([A-Z]{4})/.exec(label)?.[1];
  if (!code) throw new Error(`No se encontró el código de sala en «${label}»`);
  return code;
}

/** Entra en una sala desde el móvil: nombre, color y «estoy listo». */
export async function joinAndReady(person: Person, code: string, color: string): Promise<void> {
  const { page, name } = person;
  await page.goto(`/join?code=${code}`);
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByLabel(color).check({ force: true });
  await page.getByRole('button', { name: 'Unirme' }).click();
  await page.getByRole('button', { name: 'Estoy listo' }).click();
  await expect(page.getByRole('button', { name: 'No estoy listo' })).toBeVisible();
}

/**
 * Hace lo siguiente que el mando permita, una sola cosa: colocar una pieza (elige la primera
 * posición legal y confirma), tirar los dados o terminar el turno. Devuelve qué hizo, o `null`
 * si ahora no puede hacer nada (no es su turno).
 */
export async function actOnce(page: Page): Promise<string | null> {
  const confirm = page.getByRole('button', { name: 'Confirmar' });

  for (const kind of ['vertex', 'edge'] as const) {
    const target = page.locator(`[data-target-${kind}]`).first();
    if ((await target.count()) > 0) {
      // La zona táctil es un círculo (o una línea) transparente: se pulsa en su centro.
      await target.click({ force: true });
      await confirm.click();
      return kind === 'vertex' ? 'poblado' : 'camino';
    }
  }

  const roll = page.getByRole('button', { name: 'Tirar los dados' });
  if (await roll.isVisible()) {
    await roll.click();
    return 'tirada';
  }
  const end = page.getByRole('button', { name: 'Terminar turno' });
  if ((await end.isVisible()) && (await end.isEnabled())) {
    await end.click();
    return 'fin de turno';
  }
  return null;
}

/** Cuenta los edificios y caminos dibujados en el tablero de una pantalla. */
export async function pieces(page: Page): Promise<{ buildings: number; roads: number }> {
  return {
    buildings: await page.locator('[data-building]').count(),
    roads: await page.locator('[data-road]').count(),
  };
}

/** Número de turno que muestra la pantalla principal («Turno N»). */
export async function turnNumber(host: Page): Promise<number> {
  const text = (await host.locator('.round').first().textContent()) ?? '';
  return Number(/\d+/.exec(text)?.[0] ?? '0');
}

/** Cada persona hace lo que le toque, en rondas, hasta que `done` se cumpla o se agote el tiempo. */
export async function playUntil(
  people: readonly Person[],
  done: () => Promise<boolean>,
  what: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error(`Tiempo agotado: ${what}`);
    let acted = false;
    for (const person of people) {
      if ((await actOnce(person.page)) !== null) acted = true;
    }
    // Si nadie podía hacer nada, se espera a que el servidor mueva (bots, mensajes en camino).
    await people[0]?.page.waitForTimeout(acted ? 40 : 150);
  }
}

/** Errores de JavaScript, de consola o de red vistos en las páginas de estas personas. */
export function realProblems(people: readonly Person[]): string[] {
  return people.flatMap((p) => p.problems);
}
