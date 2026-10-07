# Pruebas en dispositivos reales

Estado de la tarea 4.8 del ROADMAP. Aquí se anotan las incidencias de cada dispositivo.

## Lo ya comprobado (emulación y tests)

Hecho por Claude en el navegador integrado (emulación de móvil de 375 × 812) contra un servidor real, con el host en otra pestaña:

| Comprobación                                                                                                       | Resultado     |
| ------------------------------------------------------------------------------------------------------------------ | ------------- |
| Unirse por URL del QR (`/join?code=XXXX`), nombre y color                                                          | Correcto      |
| Sala de espera, marcarse listo, cambiar de color                                                                   | Correcto      |
| Colocación inicial con confirmación en dos pasos; el host muestra la elección en vivo                              | Correcto      |
| Tirar, terminar turno, banco, descarte tras un 7, mover el ladrón                                                  | Correcto      |
| Recarga de la pantalla del host: recupera la sala y la partida                                                     | Correcto      |
| Fin de partida: aviso de ganador en el host y mensaje en el móvil                                                  | Correcto      |
| Tests automáticos de componentes, hooks (Wake Lock, vibración), zoom/arrastre y red                                | 110 tests     |
| Tamaños táctiles (7.4): auditoría de todos los controles de portada, unirse, sala de espera y partida en 375 × 812 | Todos ≥ 44 px |
| Colores y formas de jugador (7.4): tablero con cuatro jugadores, tarjetas y selector de color                      | Correcto      |

Limitaciones de esa emulación: no hay pantalla táctil real (los clics son de ratón), el navegador integrado no implementa la vibración y no se puede bloquear/desbloquear un teléfono de verdad.

## Pendiente: pruebas en dispositivos reales

Necesita una persona con los teléfonos. Servidor y web en el mismo ordenador y red:

```bash
pnpm dev
```

Abre `http://<IP-del-ordenador>:5173/host` en la pantalla grande (con la IP, no con `localhost`, o el QR no funcionará en los móviles) y entra desde cada móvil escaneando el QR.

### Lista de comprobación (repetir en iOS Safari y en Android Chrome)

- [ ] El QR se escanea y abre el formulario con el código escrito.
- [ ] El teclado no tapa el botón «Unirme»; el código se escribe en mayúsculas.
- [ ] Los botones y los vértices del tablero se pueden tocar con el dedo sin fallar (comprobar sobre todo el vértice cerca de otro).
- [ ] Pellizcar para ampliar el tablero y arrastrar funciona sin que la página haga zoom ni scroll por su cuenta.
- [ ] Un arrastre no elige una posición por accidente.
- [ ] Se distinguen los cuatro jugadores en el tablero por su forma (● ■ ▲ ◆) y por el trazo de sus caminos, también en exteriores o con poco brillo. Si alguien con daltonismo puede probarlo, mejor.
- [ ] La pantalla no se apaga durante la partida (Wake Lock). Anotar versión: iOS lo soporta desde 16.4.
- [ ] El móvil vibra al empezar tu turno (en iOS Safari no existe la API de vibración: es esperable).
- [ ] **Bloquear y desbloquear el móvil** a mitad de partida: vuelve solo a su asiento y a su vista, con el indicador de reconexión visible mientras tanto.
- [ ] Cambiar de aplicación y volver, y activar/desactivar el modo avión unos segundos.
- [ ] Rotar el móvil no rompe el diseño.
- [ ] Una partida completa de 4 personas con sus móviles sin quedarse bloqueada (criterio M2).

### Incidencias

| Fecha      | Dispositivo / navegador                                                          | Qué ocurre                                                                                                                                                   | Estado                                                  |
| ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 2026-10-07 | Un móvil real (modelo y navegador sin anotar), Wi-Fi compartida desde otro móvil | Unirse por QR y jugar una partida: «va perfecto», sin incidencias                                                                                            | Correcto                                                |
| 2026-10-07 | Mismo móvil, Wi-Fi `alumnos 3` (red de centro educativo)                         | La página no carga: la red no deja que los dispositivos se vean entre sí (en el ordenador solo se veía la puerta de enlace). No es un fallo de la aplicación | Evitar esa red; usar una zona Wi-Fi o una red doméstica |

Pendiente: el resto de la lista de comprobación (bloquear/desbloquear, Wake Lock, vibración, pellizcar, rotar, varios móviles a la vez y iOS Safari).
