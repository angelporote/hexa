# 0002 — Socket.IO en lugar de un framework de salas

**Estado:** aceptada

## Contexto

Necesitamos control total sobre qué ve cada cliente (información oculta), reconexión robusta desde móviles y posibilidad de escalar a varias instancias.

## Opciones

- Framework de salas de juego dedicado.
- WebSocket nativo (`ws`) con protocolo propio.
- Socket.IO sobre Fastify.

## Decisión

**Socket.IO** sobre Fastify. Aporta salas, reconexión y fallback de transporte; el adaptador Redis permite escalar después.

## Consecuencias

- El servidor decide mensaje a mensaje qué envía a cada socket; la lógica de salas es nuestra y es testeable.
- Dependencia adicional de runtime; se compensa con el ahorro de reimplementar reconexión y difusión.
