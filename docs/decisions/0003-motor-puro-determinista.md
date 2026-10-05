# 0003 — Motor puro y determinista con registro de acciones

**Estado:** aceptada

## Contexto

Las reglas deben ser testeables, simulables a gran escala y reproducibles para depurar partidas reales.

## Opciones

- Lógica de juego mezclada con el servidor.
- Motor con estado mutable e I/O.
- Motor puro `(estado, acción) → resultado`, con RNG con semilla dentro del estado.

## Decisión

`packages/engine` es puro: sin I/O, red, `Date.now()` ni `Math.random()`. Cada sala guarda `seed + config + acciones`; reaplicarlas reconstruye la partida.

## Consecuencias

- Simulación de miles de partidas y tests deterministas.
- Recuperación tras reinicios y repeticiones casi gratis.
- Todo dato no determinista (tiempo, identificadores) debe entrar al motor como parte de la acción o la configuración.
