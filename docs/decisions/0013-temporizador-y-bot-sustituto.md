# 0013 — Temporizador de turno opcional y bot sustituto

**Estado:** aceptada

## Contexto

Una partida se queda parada si a quien le toca no responde: móvil bloqueado, pestaña descartada, alguien que se levanta. En una mesa presencial se espera; en juego a distancia no siempre. La tarea 7.2 pide un temporizador **opcional** y que un **bot sustituya** a quien está ausente hasta que vuelva.

## Decisión

1. **Opción de sala `turnTimerSeconds`** (`null` = sin límite, que es el valor por defecto: quien juega en la misma mesa no quiere que un bot le quite el turno). La fija quien administra la sala en el lobby con un mensaje nuevo, `lobby:setOptions`, y viaja en `room:state.options`. Rango válido: 10–600 s; la interfaz ofrece 30, 60, 90, 120 y 180.
2. **El reloj mide inactividad, no duración del turno.** Corre mientras al menos una persona (no bot ni sustituida) tiene que mover para que la partida avance: el jugador de turno (colocación, tirada, ladrón, carreteras, fase principal) o quienes deben descartar. Se reinicia con cada acción aplicada en la partida y cuando cambia quién tiene que mover. Así quien juega activamente nunca se queda sin tiempo, y las respuestas a ofertas de comercio (opcionales) no cuentan.
3. **Al agotarse, los jugadores que debían mover pasan a «sustituidos»** (`SeatData.auto`, visible como `seats[].auto`). El conductor de bots trata igual a un asiento `bot` que a uno sustituido, de modo que juega su decisión pendiente y todas las siguientes mientras siga sustituido. Sus jugadas son acciones normales del motor: quedan en el registro y la partida sigue siendo reproducible.
4. **Volver.** El jugador sustituido recupera su asiento con un mensaje nuevo, `seat:return` (botón «Volver a la partida»), o simplemente enviando cualquier acción de juego. Reconectar **no** lo devuelve solo: un móvil que reconecta en segundo plano no significa que esa persona esté mirando. Como el asiento se conserva (token), vale también tras un reinicio del servidor.
5. **El servidor es el dueño del reloj.** El gestor guarda en memoria el plazo de cada sala (`reloj`: quién está en juego y cuándo vence) y lo recalcula en cada cambio; un servicio `TurnTimer` (modelo de `TradeExpiry`) programa el vencimiento y llama a `expireClock`. Los clientes reciben el tiempo **restante** (`game:view.clock = { actors, remainingMs }`) en cada vista y cuentan hacia atrás con su propio reloj, sin sincronizar relojes. El plazo no se persiste: tras un reinicio cada partida recupera un plazo completo.
6. **Una unidad de tiempo configurable** (`TURN_TIMER_UNIT_MS`, 1000 por defecto) permite probar por red con plazos de milisegundos.
7. **Compatibilidad.** `turnTimerSeconds` (null) y `auto` (false) se rellenan al recuperar salas guardadas antes de este cambio; `game:view.clock` es opcional en el esquema.

## Alternativas descartadas

- **Reloj por turno completo:** castiga a quien negocia o piensa mucho aunque esté activo.
- **Pasar el turno en lugar de jugar:** no siempre es posible (colocación inicial, ladrón, descartes) y deja la partida sin avanzar.
- **Tratar toda desconexión como ausencia:** el corte de un segundo no debería poner un bot al mando; el reloj ya cubre el caso real (nadie responde, conectado o no).
- **Devolver el asiento al reconectar:** ver punto 4.

## Consecuencias

- Las partidas a distancia ya no se bloquean por un jugador ausente; el resto puede dejar el temporizador activado y seguir.
- La calidad del sustituto es la del bot del servidor; la tarea 7.3 la mejorará.
- Una partida con todos los humanos sustituidos continúa sola hasta terminar.
- Es otra pieza de estado en memoria por sala; no afecta a la reproducibilidad del motor, que no conoce el reloj.
