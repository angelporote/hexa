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

El servidor responde en `GET http://localhost:3001/health`.
