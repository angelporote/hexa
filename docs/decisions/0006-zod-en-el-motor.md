# 0006 — Zod en el motor para validar mapas

**Estado:** aceptada

## Contexto

Los mapas son datos JSON (tarea 1.3) y deben validarse al cargarlos. La arquitectura dice que `engine` no depende de ningún otro paquete del monorepo, pero no prohíbe librerías sin dependencias de plataforma.

## Opciones

- Validación escrita a mano.
- Zod en `engine` (ya se usará en `protocol` para los mensajes de red).

## Decisión

`engine` usa **Zod** solo para validar datos de entrada como los mapas. Los tipos se derivan del esquema (`z.infer`). Zod es puro y no usa APIs de Node ni del navegador, así que el motor sigue siendo portable.

## Consecuencias

- Una sola librería de validación en todo el proyecto y mensajes de error uniformes.
- `parseMapTemplate` añade validaciones de coherencia (sumas, puertos costeros) por encima del esquema.
- Dependencia de runtime añadida al motor; el criterio «no importa nada de Node ni del navegador» se mantiene.
