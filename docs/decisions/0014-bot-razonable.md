# 0014 — Bot razonable (no aleatorio)

**Estado:** aceptada

## Contexto

Los asientos de bot y el sustituto de quien está ausente (ADR 0013) usaban el bot aleatorio ponderado del simulador. Sirve para ejercitar el motor, pero juega mal: gasta recursos sin plan, descarta cartas útiles y mueve el ladrón al azar. La tarea 7.3 pide un bot básico razonable «para rellenar huecos y para tests».

## Decisión

1. **Vive en el motor** (`packages/engine/src/bot/`), como función pura `chooseSmartMove(state, jugador, rng)`, con la misma forma de respuesta que `chooseMoveFor`. No hace I/O ni usa el reloj; el `rng` solo desempata entre jugadas igual de buenas, así que una misma partida y semilla dan siempre las mismas jugadas.
2. **Puntúa lo que ya valida `legalActions`.** Nunca inventa una acción: elige la de mayor puntuación entre las legales, de modo que no puede proponer nada ilegal ni quedarse sin jugada.
3. **Reglas de decisión sencillas y explicables**, no búsqueda ni simulación:
   - Valor de un vértice: producción esperada de sus hexágonos (puntos de probabilidad de la ficha), con más peso a los recursos que aún no produce, bonus por puertos útiles y penalización si el ladrón está encima.
   - Colocación inicial: mejor vértice; el camino, hacia el mejor punto de expansión cercano.
   - Turno libre, por prioridad: jugar un caballero si el ladrón le bloquea una buena casilla o le da el mayor ejército; construir poblado o ciudad (el objetivo primario depende de si hay sitio y de cuántos edificios tiene); comprar carta de desarrollo; camino solo si necesita sitio para expandirse o le sobra madera y arcilla; comerciar con el banco solo para completar el objetivo con un recurso que le sobra; terminar el turno.
   - Descarte: se queda con lo que más acerca a sus objetivos.
   - Ladrón: casilla de mayor daño ponderado por los puntos del rival, sin tocar la suya; roba al líder con cartas.
   - Ofertas de otros: acepta solo si mejoran estrictamente su mano para sus objetivos; si no, rechaza. No propone ni contraoferta.
4. **Solo usa lo que vería un jugador:** su mano, sus cartas y lo público (edificios, caminos, ladrón, puntos visibles y _cuántas_ cartas tiene cada rival). No mira las manos ajenas ni el mazo. Un test lo comprueba barajando lo oculto y exigiendo la misma decisión.
5. **El bot aleatorio se mantiene** para el simulador y las pruebas de robustez, porque su azar encuentra errores del motor. El simulador acepta ahora qué bot juega cada asiento.
6. **El servidor usa el bot razonable** para los asientos de bot y los sustituidos.

## Cómo se valida

Una partida entre cuatro bots razonables termina sin romper invariantes ni reproducibilidad, y un bot razonable contra tres aleatorios gana claramente más del 25 % que le correspondería al azar.

Medición (`pnpm sim -- --bots mixed|smart`):

| Escenario                  | Partidas | Resultado                                                 |
| -------------------------- | -------- | --------------------------------------------------------- |
| 1 razonable + 3 aleatorios | 200      | gana el razonable en las 200                              |
| 1 razonable + 1 aleatorio  | 100      | gana el razonable en las 100                              |
| 4 razonables               | 200      | 200 terminadas, ~80 turnos de media, victorias repartidas |
| 3 razonables               | 100      | 100 terminadas, ~70 turnos de media                       |

El test exige más del 70 % de victorias en 60 partidas (la medición es muy superior), de modo que un cambio que empeore el bot de forma apreciable lo rompe. Otro test comprueba que no mira lo oculto, y otro del servidor que cada jugada de una partida de bots es la que el bot elegiría para ese estado y esa semilla.

## Consecuencias

- Partidas con bots más creíbles y un sustituto que no desperdicia la partida de quien se ausenta.
- No es un jugador fuerte ni lo pretende: no negocia con jugadores, no planea rutas largas ni cuenta cartas. Mejorarlo es posible sin tocar el servidor.
- Más código en el motor, cubierto por el umbral de cobertura (≥ 90 %).
