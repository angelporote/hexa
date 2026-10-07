# 0009 — Mando móvil: interfaz derivada de `legalActions`, vista previa efímera y tablero táctil propio

**Estado:** aceptada

## Contexto

La fase 4 construye el mando del jugador. Debe cumplir «sin reglas en el front», ser cómodo con el pulgar, sobrevivir a bloqueos del móvil y enseñar en la pantalla principal lo que el jugador está a punto de elegir.

## Decisión

1. **La interfaz se deriva de `view.legalActions`.** Un botón solo se puede pulsar si existe una acción de ese tipo en la lista; las posiciones tocables del tablero son exactamente las de las acciones legales; el descarte, el banco y las cartas de abundancia/monopolio solo confirman combinaciones que están en la lista. Las tarifas de puerto llegan en `view.you.tradeRatios` y los costes se leen de `COSTS` del motor. El front no repite ninguna regla. (Excepción documentada: `OFFER_TRADE` no se enumera; su formulario llega en la fase 5 y usará `canOfferTrade`.)
2. **Modo forzado según la fase** (`forcedMode`): colocación inicial, caminos gratis, ladrón y descarte obligan a elegir y no ofrecen cancelar; el resto del turno es libre.
3. **Confirmación en dos pasos y vista previa efímera.** Tocar una posición la marca y envía `game:preview` (nuevo mensaje: `{ target: { kind, id } | null }`); solo lo puede enviar quien tiene el turno y el servidor lo reenvía a los demás como `game:preview` sin tocar el estado de la partida ni guardarlo. Confirmar envía la acción real. La web borra la vista previa cuando llega una vista con `seq` mayor.
4. **Tablero táctil propio** (`ZoomableBoard`): zoom con botones, rueda y pellizco, y desplazamiento arrastrando, sin librerías. Un arrastre de más de 8 px no cuenta como toque, para no elegir por accidente. No se captura el puntero, para que los `click` lleguen a los objetivos del SVG.
5. **Wake Lock y vibración como mejoras opcionales.** `useWakeLock` pide el bloqueo de pantalla mientras dura la partida y lo vuelve a pedir al volver a ver la página; si el navegador no lo soporta o lo deniega, no pasa nada. `useTurnVibration` vibra solo al pasar a ser tu turno, no al abrir la página.
6. **Una sola conexión compartida entre `/join` y `/play`.** `/join` abre la conexión sin cerrarla al navegar; `/play/:code` la reutiliza. `GameConnection.start` se reinicia si cambia la clave de sesión (`host` ↔ `player`).

## Consecuencias

- Cambiar una regla en el motor cambia el mando sin tocarlo.
- El host ve en directo la elección del jugador, pero un cliente malintencionado solo puede mostrar marcas (ids acotados y validados por esquema), nunca actuar.
- Las pruebas en iOS Safari y Android Chrome reales (tarea 4.8) siguen pendientes; ver `docs/devices.md`.
