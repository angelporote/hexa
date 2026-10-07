import { defineConfig, devices } from '@playwright/test';

// Pruebas de extremo a extremo: servidor y web reales, cada persona en su propio contexto de
// navegador (sesión y almacenamiento distintos), como en una mesa de verdad.
//
// En la CI se usa el Chromium que instala Playwright. En local, si no se quiere descargar nada,
// se puede usar un navegador ya instalado: `E2E_CHANNEL=msedge pnpm e2e` (o `chrome`).

const CHANNEL = process.env['E2E_CHANNEL'];
const SERVER_PORT = 3001;
const WEB_PORT = 5173;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // Cada prueba monta su propia sala; ir en serie evita competir por CPU y por el reloj de los bots.
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-ES',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(CHANNEL ? { channel: CHANNEL } : {}) },
    },
  ],
  webServer: [
    {
      // Partidas con la misma semilla (sin ningún 7 en las primeras tiradas, para no depender de
      // descartes ni del ladrón, que se prueban en otros niveles) y bots rápidos.
      command: 'pnpm --filter @hexa/server start',
      url: `http://localhost:${SERVER_PORT}/health`,
      env: {
        PORT: String(SERVER_PORT),
        GAME_SEED: 'e2e-231',
        BOT_DELAY_MS: '120',
        LOG_LEVEL: 'warn',
      },
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @hexa/web exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
