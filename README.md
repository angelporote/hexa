# hexa

Juego de mesa online de colonización sobre tablero hexagonal. Una pantalla principal muestra el tablero y los móviles de los jugadores son mandos privados. Nombre en clave provisional.

Documentación: [`CLAUDE.md`](CLAUDE.md) (forma de trabajo), [`ROADMAP.md`](ROADMAP.md) (fases y estado), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (arquitectura).

## Requisitos

- Node.js 24 LTS (ver `.nvmrc`)
- pnpm 12 (`npm i -g pnpm`)

## Arranque

```bash
pnpm install
pnpm dev      # servidor en :3001 y web en :5173
pnpm check    # typecheck + lint + tests + términos prohibidos
```

El servidor responde en `GET http://localhost:3001/health`. Abre `http://localhost:5173/host` para crear una sala: desde ahí puedes añadir bots y empezar una partida. Para que un móvil entre por el QR, abre la pantalla del host con la IP del ordenador (por ejemplo `http://192.168.1.20:5173/host`). Los jugadores entran desde el móvil con el QR o en `/join`. Sin pantalla común: `/create` crea una sala a distancia y se comparte su enlace; `/watch` permite mirar como espectador. Variables útiles del servidor: `PORT`, `BOT_DELAY_MS`, `ROOM_TTL_MS`, `LOG_LEVEL`.

Simular partidas completas de bots (sin red): `pnpm sim -- --games 100`. Con `--bots smart` juegan los bots razonables y con `--bots mixed` uno razonable contra aleatorios, para medir su calidad.

## Pruebas de extremo a extremo

`pnpm e2e` arranca el servidor y la web y juega con navegadores reales, cada persona en su propio contexto: una pantalla principal con cuatro móviles y una partida a distancia con un espectador. En local se puede usar el navegador que ya tengas: `E2E_CHANNEL=msedge pnpm e2e` (o `chrome`); si no, `pnpm --filter @hexa/e2e exec playwright install chromium` una vez. No forman parte de `pnpm check`; la CI las ejecuta en un trabajo aparte.

## Persistencia de salas

Por defecto las salas viven en memoria y se pierden al reiniciar el servidor. Para que sobrevivan, define `REDIS_URL` al arrancarlo:

```bash
docker run -d -p 6379:6379 redis:7-alpine
REDIS_URL=redis://localhost:6379 pnpm --filter @hexa/server start
```

Con `REDIS_URL` definida el servidor no arranca si Redis no responde. Los tests contra un Redis real solo se ejecutan si esa variable existe (la CI la define); sin ella se usa un cliente en memoria con el mismo contrato. Detalles en [`docs/decisions/0012-persistencia-redis.md`](docs/decisions/0012-persistencia-redis.md).
