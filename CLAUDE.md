# CLAUDE.md — Instrucciones de trabajo para Claude Code

Proyecto: juego de mesa online de colonización sobre tablero hexagonal. Una **pantalla principal** (host) muestra el tablero; los **móviles** de los jugadores son mandos privados; todos se unen a una sala con un **código**. También se puede jugar a distancia desde cualquier navegador.

Nombre en clave provisional: **`hexa`** (paquetes `@hexa/*`). El nombre comercial se decidirá en la fase 8.

## Fuentes de verdad

| Documento | Para qué |
|---|---|
| `ROADMAP.md` | Qué hacer y en qué orden. Contiene el estado actual. |
| `docs/ARCHITECTURE.md` | Cómo está construido el sistema y por qué. |
| `docs/RULES.md` | Reglas del juego redactadas por nosotros (se crea en la fase 1). |
| `docs/decisions/` | Decisiones técnicas (ADR), una por archivo: `NNNN-titulo.md`. |

Si el código y estos documentos se contradicen, para y pregunta antes de seguir.

## Forma de trabajar (obligatorio)

1. **Una fase cada vez, en orden.** No empieces una fase hasta que la anterior cumpla sus criterios de aceptación.
2. **Una tarea cada vez.** Ciclo: leer la tarea en `ROADMAP.md` → plan breve → tests → implementación → `pnpm check` en verde → marcar la casilla → commit.
3. **Decisiones no previstas:** si una tarea exige una decisión técnica que no está en estos documentos, escribe un ADR corto (contexto, opciones, decisión, consecuencias) antes de implementarla. Si la decisión es grande o cambia la arquitectura, pregunta primero.
4. **Al final de cada sesión,** actualiza la sección «Estado actual» de `ROADMAP.md` (fase, última tarea, bloqueos).
5. **Commits pequeños** con Conventional Commits: `feat(engine): ...`, `fix(server): ...`, `test(engine): ...`, `docs: ...`.
6. **Nunca avances** con tests rotos, errores de tipos o de lint.
7. **No añadas dependencias** sin justificarlas en el commit; prefiere pocas y mantenidas.

## Comandos

Se configuran en la fase 0. Si cambian, actualiza esta sección.

```bash
pnpm install                         # instalar
pnpm dev                             # servidor + web en modo desarrollo
pnpm test                            # todos los tests
pnpm typecheck                       # tipos en todo el monorepo
pnpm lint                            # ESLint
pnpm check                           # typecheck + lint + test (lo que ejecuta la CI)
pnpm --filter @hexa/engine test      # tests de un paquete
pnpm sim -- --games 1000             # simulador de partidas (fase 1)
```

## Reglas de arquitectura (no negociables)

- **El motor es puro.** `packages/engine` no hace I/O, red, `Date.now()` ni `Math.random()`. Todo es `(estado, acción) → resultado`. La aleatoriedad usa un RNG con semilla guardado en el estado.
- **El servidor es la única autoridad.** Los clientes envían *intenciones* (acciones), nunca estado. El servidor valida con el motor y difunde el resultado.
- **Información oculta.** Un cliente solo recibe lo que puede ver. Todo lo que sale hacia un cliente pasa por `getPlayerView()`. Nunca se envía el estado completo.
- **Protocolo tipado.** Todo mensaje de red se define y valida con Zod en `packages/protocol`. Nada de mensajes ad hoc.
- **Sin reglas en el front.** La interfaz no decide qué es legal: usa `legalActions()` que llega en la vista del jugador.
- **Temática desacoplada.** El motor usa identificadores neutros. Nombres, colores e iconos de recursos y cartas viven en `packages/theme`.
- **Textos por i18n.** Ningún texto visible al usuario va escrito directamente en un componente.
- **Errores de dominio como valores**, no excepciones: `{ ok: false, error: 'NOT_YOUR_TURN' }`.

## Propiedad intelectual (importante)

Este es un juego **original** que reutiliza mecánicas de juego, que no están protegidas. Lo que sí está protegido es la marca, el arte y el texto del juego en el que se inspira. Por tanto:

- No uses las palabras «Catan», «Settlers» ni «Colonos de» en código, textos, nombres de archivo, commits, metadatos, dominios ni dependencias. La CI tendrá una comprobación que falla si aparecen (fase 0).
- No copies ni parafrasees de cerca el reglamento oficial. `docs/RULES.md` se redacta desde cero.
- No uses arte, iconos, ilustraciones ni la paleta del juego original. No descargues recursos de terceros sin licencia compatible; registra cada recurso en `assets/LICENSES.md`.
- Si una tarea parece requerir cualquiera de estas cosas, detente y pregunta.

## Convenciones de código

- TypeScript `strict`, ESM. Sin `any`: usa `unknown` y valida.
- Identificadores en inglés. Documentación en español. Interfaz en español e inglés vía i18n.
- Archivos en `kebab-case`, componentes React en `PascalCase`.
- Tests junto al código (`*.test.ts`) con Vitest. E2E en `e2e/` con Playwright.
- Funciones pequeñas; un archivo por regla o acción en el motor.
- Comentarios para el *porqué*, no para el *qué*.
