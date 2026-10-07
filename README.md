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

El servidor responde en `GET http://localhost:3001/health`. Abre `http://localhost:5173/host` para crear una sala: desde ahí puedes añadir bots y empezar una partida. Para que un móvil entre por el QR, abre la pantalla del host con la IP del ordenador (por ejemplo `http://192.168.1.20:5173/host`). Los jugadores entran desde el móvil con el QR o en `/join`. Variables útiles del servidor: `PORT`, `BOT_DELAY_MS`, `ROOM_TTL_MS`, `LOG_LEVEL`.

Simular partidas completas de bots (sin red): `pnpm sim -- --games 100`.
