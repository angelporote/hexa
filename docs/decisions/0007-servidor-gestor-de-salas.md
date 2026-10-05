# 0007 — Gestor de salas independiente de la red, acks y almacén de escritura diferida

**Estado:** aceptada

## Contexto

El servidor debe validar cada mensaje, aplicar las acciones con el motor y enviar a cada cliente solo su vista. Tiene que ser testeable sin sockets, sobrevivir a reinicios más adelante (fase 7) y escalar sin reescribirse (ver `ARCHITECTURE.md`).

## Opciones

- Lógica de salas dentro de los manejadores de Socket.IO.
- `RoomStore` asíncrono consultado en cada mensaje.
- Gestor de salas síncrono y en memoria, con el almacén como copia persistente.

## Decisión

1. **`RoomManager` no conoce Socket.IO.** Recibe intenciones de conexiones identificadas por un id y devuelve el resultado más una lista de mensajes a enviar (`OutMessage`). La capa `net/` valida con Zod, aplica el límite de mensajes, llama al gestor y entrega los mensajes.
2. **Peticiones con respuesta (ack) y difusiones por eventos.** Cada petición del cliente (`room:create`, `room:join`, `game:action`…) recibe un ack `{ ok: true, data } | { ok: false, error }`; sin callback, el error llega como evento `error`. Las difusiones son `room:state`, `game:view` y `game:events`. La respuesta se entrega antes que las difusiones.
3. **Salas en memoria, almacén de escritura diferida.** El gestor guarda las salas en un `Map` y llama a `RoomStore.save` tras cada cambio (sin esperar); al arrancar las recupera con `loadAll`. Así el gestor es síncrono y no hay carreras entre lecturas y escrituras. Redis (fase 7) implementará la misma interfaz.
4. **La identidad sale de la conexión, nunca del mensaje.** Los esquemas son estrictos: un campo `player` colado en una acción se rechaza.
5. **El registro de partida es `seed + config + acciones`**, más una instantánea del estado. `replayGame` reconstruye la partida y los tests comprueban que coincide con la instantánea.
6. **Sesiones por token.** Cada asiento, el host y cada espectador tienen un token aleatorio de 192 bits que el cliente guarda. `session:resume` recupera el rol y la vista; si la identidad ya estaba conectada, la conexión nueva sustituye a la anterior (que recibe `SESSION_REPLACED`).

## Consecuencias

- Se puede probar toda la lógica de salas con tests unitarios deterministas y la capa de red con clientes reales.
- Una caída del proceso puede perder el último cambio no guardado; es aceptable en esta etapa y se resuelve con Redis en la fase 7.
- Abandonar una sala durante la partida conserva el asiento (se puede volver con el token); abandonar el lobby lo libera.
- Los límites por socket (30 mensajes de ráfaga, 10/s sostenidos, 8 KB por mensaje) se configuran por entorno.
