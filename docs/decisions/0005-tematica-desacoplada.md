# 0005 — Temática desacoplada en `packages/theme`

**Estado:** aceptada

## Contexto

El nombre comercial, el arte y la ambientación se decidirán tarde (fase 8) y deben poder cambiar sin riesgo para las reglas. Además evitamos usar marca, arte o texto protegidos de terceros.

## Opciones

- Nombres y colores dentro del motor y la web.
- Capa de temática separada.

## Decisión

El motor usa identificadores neutros (`r1`…`r5`). Nombres, colores e iconos viven en `packages/theme`, que solo usa `web`.

## Consecuencias

- Cambiar la temática no toca reglas ni tests del motor.
- La web debe resolver siempre nombres a través del tema y de i18n.
