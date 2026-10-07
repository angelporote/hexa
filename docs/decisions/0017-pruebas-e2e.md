# 0017 — Pruebas de extremo a extremo con Playwright

**Estado:** aceptada

## Contexto

La tarea 7.6 pide una prueba con una pantalla principal y cuatro mandos en contextos de navegador distintos. Hasta ahora lo más parecido eran los tests de red (clientes Socket.IO) y las pruebas manuales en el navegador integrado de Claude Code: no había nada automático que ejerciera a la vez el servidor real, la web real y varias sesiones independientes.

## Decisión

1. **Playwright**, con un paquete de espacio de trabajo `@hexa/e2e` (`e2e/`). Dependencia solo de desarrollo; no se descarga ningún navegador al instalarla.
2. **Cada persona es un contexto de navegador distinto** (sesión y `localStorage` aparte): la pantalla principal en un ordenador y cada jugador en un móvil emulado (Pixel 7, táctil). Es lo único que representa de verdad una mesa; con una sola pestaña, la sesión guardada en `localStorage` se pisaría (ADR 0011).
3. **Dos escenarios**, que juegan de verdad (colocación inicial completa y varias rondas) desde la interfaz:
   - _Mesa:_ pantalla principal + 4 móviles que entran por código, nombre y color; la pantalla ve a los cuatro, empieza la partida, colocan 8 poblados y 8 caminos, juegan cinco turnos, se comprueba que la pantalla no muestra ninguna mano y que un móvil recargado recupera su asiento.
   - _A distancia:_ una persona crea la sala, otra entra por el enlace, un bot completa la mesa y un espectador mira sin ver manos ni botones de juego.
4. **Semilla fija** (`GAME_SEED`, opción nueva del servidor, solo para pruebas y demos). Se eligió `e2e-231`, que no saca ningún 7 en las 30 primeras tiradas con 2, 3 o 4 jugadores. Así las pruebas no dependen del azar ni se topan con descartes y ladrón, que ya se prueban a nivel de componentes y de red, donde es más barato y exacto.
5. **Cualquier error cuenta como fallo.** Cada página registra los errores de JavaScript y de consola y las respuestas HTTP ≥ 400; un escenario que termina con alguno falla. Gracias a esto se descubrió que la web no tenía icono y el navegador recibía un 404 en cada carga (corregido con un icono propio incrustado).
6. **Fuera de `pnpm check`.** Necesitan un navegador y duran más de un minuto; la CI los ejecuta en un trabajo aparte (`e2e`) que instala Chromium y, si falla, guarda capturas y trazas como artefacto. En local, `E2E_CHANNEL=msedge` (o `chrome`) usa un navegador ya instalado para no descargar nada.
7. **Las pruebas van en serie** (un solo proceso): cada una monta su propia sala y los bots dependen del reloj, así que competir por CPU solo añade falsos fallos.

## Consecuencias

- Hay una red de seguridad automática para los flujos que antes solo se probaban a mano: unirse por código, empezar, jugar desde el móvil, recargar y ver como espectador.
- Los E2E son lentos y sensibles a la interfaz: usan atributos estables del tablero (`data-target-vertex`, `data-target-edge`, `data-building`, `data-road`) y textos accesibles. Un cambio de textos del español exige actualizarlos.
- No cubren el final de la partida, el comercio ni el ladrón (los cubren los tests de red y de componentes), ni dispositivos reales (tarea 4.8 y hitos M2/M3 siguen abiertos).
