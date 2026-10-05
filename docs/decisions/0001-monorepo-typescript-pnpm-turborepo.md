# 0001 — Monorepo TypeScript con pnpm y Turborepo

**Estado:** aceptada

## Contexto

Motor, protocolo, servidor y web comparten tipos y evolucionan juntos. Necesitamos cambios atómicos entre paquetes y una única CI.

## Opciones

- Repositorios separados con paquetes publicados.
- Monorepo con pnpm workspaces + Turborepo.
- Monorepo con npm/yarn workspaces sin orquestador.

## Decisión

Monorepo con **pnpm workspaces** y **Turborepo** para orquestar y cachear tareas.

Los paquetes internos (`engine`, `protocol`, `theme`) se consumen **como código fuente TypeScript** (`exports` apunta a `src/index.ts`), sin paso de build intermedio. Vite, Vitest y `tsx` lo resuelven directamente.

## Consecuencias

- Tipos compartidos sin publicar nada; cambios atómicos.
- Sin `dist` en los paquetes internos: menos fricción en desarrollo. Si algún día se publica un paquete, se añadirá su build entonces.
- TypeScript fijado en 6.0 mientras `typescript-eslint` no soporte 7.
