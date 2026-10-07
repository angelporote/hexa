# 0018 — Monitorización de errores sin servicios de terceros

**Estado:** aceptada

## Contexto

La tarea 7.7 pide «Sentry o similar» en servidor y web. Antes de este cambio, un error en el servidor quedaba como texto suelto en la salida de errores de Node (sin formato ni pila en los logs estructurados) y un error de la web no dejaba rastro: una excepción al pintar dejaba la pantalla en blanco sin que nadie se enterara.

Un servicio como Sentry exige una cuenta y un DSN, envía datos de los usuarios a un tercero (algo que hay que reflejar en la política de privacidad, tarea 8.4) y supone una decisión de coste que corresponde a quien lleva el proyecto, no a una tarea de robustez.

## Decisión

Se resuelve con lo que ya hay: **los logs estructurados del servidor** (`pino`, JSON por línea) pasan a ser el único sitio donde mirar, y la web informa al servidor.

1. **Servidor.**
   - `installCrashLogging`: una excepción sin capturar se registra con su pila (`event: 'uncaught_exception'`) y cierra el proceso, para que lo reinicie quien lo supervise (con Redis las salas sobreviven; ADR 0012). Una promesa rechazada sin gestionar (`unhandled_rejection`) se registra pero no tumba el servidor: una tarea suelta no debe cortar todas las partidas.
   - Los errores internos de la capa de red (`handler_crashed`) incluyen ahora la pila (`errorFields`).
2. **La web informa de sus errores** a `POST /client-errors`:
   - Captura global (`error` y `unhandledrejection`) y un **`ErrorBoundary`** que sustituye la pantalla en blanco por un aviso con botón de recargar (la sesión se conserva, así que se vuelve al mismo asiento).
   - El informe (`clientErrorSchema`, estricto) lleva solo mensaje (≤ 500 caracteres), pila (≤ 4000), origen (`window`, `promise`, `react`) y ruta **normalizada** (`/play/:code`).
   - **Antes de salir del navegador** se redactan tokens de sesión (cadenas hexadecimales largas) y códigos de sala; un mismo error no se repite en un minuto y hay un tope de 20 informes por carga de página. Notificar un error nunca provoca otro.
   - Se envía con `navigator.sendBeacon` (sobrevive al cierre de la página) y `text/plain`, que evita la comprobación previa entre orígenes distintos; si falla, `fetch` con `keepalive`.
3. **El endpoint se defiende**: cuerpo máximo de 8 KB, validación con Zod (rechaza campos de más), y límite de ritmo por dirección (ráfaga de 5, una más cada 10 s; las peticiones inválidas también cuentan). **No se registra la IP ni el navegador**: solo se usan en memoria para limitar el ritmo.
4. **Cómo se ve:** cada informe es una línea de log con `event: 'client_error'`, nivel `error`, junto a los errores del servidor. Cualquier agregador de logs (o `grep`) los encuentra y se pueden alertar por nivel.

## Alternativas descartadas

- **Sentry u otro servicio ahora.** Más completo (agrupación, versiones, alertas), pero requiere cuenta, envía datos a un tercero y se decide mejor junto con el despliegue y la política de privacidad (fase 8). Enchufarlo después es sencillo: el `ErrorReporter` de la web y `errorFields` del servidor son los únicos puntos de captura.
- **Guardar los informes en una base de datos.** Más piezas y más datos retenidos; el log ya cumple.

## Consecuencias

- Hay constancia de cualquier fallo, con pila, sin depender de un servicio externo.
- No hay agrupación ni mapas de código fuente (las pilas de producción vendrán minificadas): se añadirá con el servicio que se elija (mapas de código fuente subidos al proveedor).
- Si la web y el servidor se despliegan en orígenes distintos, `sendBeacon` con `text/plain` funciona sin configurar CORS, pero la política de privacidad debe mencionar que los errores se envían al servidor.
- Detrás de un proxy inverso, `request.ip` será el del proxy: al desplegar (8.5) hay que activar `trustProxy` para que el límite de ritmo sea por cliente.
