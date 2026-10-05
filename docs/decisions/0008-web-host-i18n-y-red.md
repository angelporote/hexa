# 0008 — Web del host: i18n propia, cliente de red con estado inmutable y proxy de desarrollo

**Estado:** aceptada

## Contexto

La fase 3 construye la pantalla principal (lobby y partida) sobre React. Hay que cumplir «sin textos en los componentes», tener es/en, reconectar sin perder la partida y que un móvil pueda abrir la web por la IP del ordenador en desarrollo.

## Decisión

1. **i18n propia, sin librería.** Dos diccionarios (`es.ts`, `en.ts`) con claves tipadas: `en` es un `Record<MessageKey, string>`, así que faltar una clave no compila. Un test comprueba que los marcadores `{nombre}` coinciden entre idiomas. El volumen de texto es pequeño y no hace falta plurales ni formatos complejos; si crece se sustituye por una librería sin cambiar las llamadas `t(clave, parámetros)`.
2. **Nombres de recursos y cartas en `packages/theme`**, no en i18n: dependen de la ambientación, no de la interfaz.
3. **`GameConnection` + `Transport`.** La conexión es una clase con estado inmutable que se observa con `useSyncExternalStore`. Todo lo que llega del servidor se valida con los esquemas de `@hexa/protocol` antes de usarse. El transporte (Socket.IO) se inyecta, así que los tests usan uno falso sin red. Las vistas con `seq` menor que la actual se ignoran.
4. **Sesión por token en `localStorage`** con una clave por pantalla (`host`, más adelante `player`). Al conectar o reconectar se intenta `session:resume`; si el servidor dice que la sesión ya no existe se descarta y, en el host, se crea otra sala. Si otro dispositivo toma la sesión (`SESSION_REPLACED`) se deja de reconectar para no pelearse con él.
5. **Proxy de Vite para `/socket.io`** y `server.host: true`: la web y el WebSocket comparten origen, de modo que no hay CORS ni URL del servidor que configurar y un móvil en la misma red llega por la IP del ordenador. En producción servirá el mismo origen.
6. **Tablero en SVG con geometría pura** (`board/geometry.ts`): el grafo del motor se coloca en el plano sin depender del estado de la partida; las posiciones de vértices y aristas se derivan de las esquinas de los hexágonos, con el mismo orden que usa el motor.
7. **Dependencias nuevas** en `@hexa/web`: `react-router-dom` (rutas), `socket.io-client` (cliente del servidor), `qrcode-generator` (QR sin dependencias, dibujado como un trazado SVG propio, sin HTML inyectado), y en desarrollo `jsdom` y `@testing-library/react` (tests de componentes).

## Consecuencias

- Cambiar el idioma o el tema no toca la lógica.
- La conexión se puede probar entera sin servidor: caídas, reconexión, sesiones muertas, mensajes mal formados.
- El código QR usa el origen desde el que se abre la pantalla: en desarrollo hay que abrirla por la IP del ordenador (no por `localhost`) para que los móviles puedan entrar.
