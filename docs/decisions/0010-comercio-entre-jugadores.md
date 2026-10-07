# 0010 — Comercio entre jugadores: contraofertas en el motor y caducidad en el servidor

**Estado:** aceptada

## Contexto

La fase 5 pide proponer ofertas, aceptarlas, rechazarlas o contraofertar, que el jugador activo elija entre las aceptaciones, y que las ofertas se puedan cancelar o caduquen. El motor ya tenía oferta única, aceptar, rechazar, cancelar y confirmar (tarea 1.11), pero no contraofertas ni caducidad.

## Opciones para la contraoferta

- Una segunda oferta independiente de un destinatario hacia el oferente (rompe la regla de «una oferta abierta» y la de comerciar solo con el jugador activo).
- Un campo dentro de la oferta abierta: cada destinatario puede dejar una contraoferta, y el oferente decide.

## Decisión

1. **Contraoferta dentro de la oferta.** `TradeOffer.counters` guarda como mucho una por destinatario (`{ from, give, want }`: lo que él da y lo que pide). Acciones nuevas: `COUNTER_TRADE` (destinatario) y `CONFIRM_COUNTER` (oferente). Responder con sí, no o contraoferta son excluyentes: la última respuesta sustituye a las anteriores. Las contraofertas son públicas igual que la oferta.
2. **No se enumeran** `OFFER_TRADE` ni `COUNTER_TRADE` en `legalActions` (parámetros libres); la vista indica `canOfferTrade` y `canCounterTrade`. Sí se enumera `CONFIRM_COUNTER` por cada contraoferta que ambos pueden cubrir.
3. **Caducidad en el servidor, no en el motor.** El motor es puro y no conoce el reloj. `TradeExpiry` arma un temporizador por oferta abierta (`TRADE_TTL_MS`, 120 s por defecto) y, al vencer, aplica `CANCEL_TRADE` en nombre del oferente. Es una acción normal, queda en el registro y la partida se sigue pudiendo reproducir sin saber nada de tiempos. También se revisan las salas al arrancar, por si había ofertas abiertas.
4. **La interfaz del mando** reutiliza `OfferSummary` con la pantalla principal: quien ve la oferta ve lo mismo en los dos sitios. El formulario solo exige algo en cada lado y limita lo que das a tu mano; el resto de reglas (mismo recurso en ambos lados, destinatarios válidos…) las decide el servidor y su error se traduce.
5. **Los bots** responden a las ofertas humanas con el mismo mecanismo de siempre (aceptar o rechazar entre lo legal). No proponen ni contraofertan: en el simulador de partidas sí lo hacen al azar para ejercitar el motor.

## Consecuencias

- Las reglas del comercio quedan en `docs/RULES.md` (sección 10) y el simulador comprueba que las contraofertas no rompen invariantes (400 partidas sin fallos).
- Una oferta abierta no sobrevive a un reinicio sin que se rearme su temporizador: `TradeExpiry.checkAll()` lo hace al arrancar.
- Los tests E2E con navegadores reales (Playwright) llegan en la tarea 7.6; mientras tanto el flujo está cubierto por 12 tests de red con cuatro clientes por WebSocket y por pruebas de componentes.
