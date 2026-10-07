# 0011 — Juego a distancia: salas sin pantalla, vista combinada y espectadores

**Estado:** aceptada

## Contexto

Hasta la fase 5 toda sala tenía una pantalla principal (host) que mostraba el tablero y gestionaba el lobby; los móviles eran solo mandos. La fase 6 pide jugar sin pantalla compartida (cada persona en su navegador), mezclar jugadores presenciales y remotos, y admitir espectadores.

## Decisión

1. **Sala sin pantalla (`hostless`).** `room:create` acepta `role: 'player'` (con nombre y color): el creador entra como jugador `p0` y pasa a **administrar** la sala. No se crea ninguna figura nueva en el servidor: sigue siendo una sala normal con un campo `ownerId`. `room:state.you.admin` indica a cada cliente si puede añadir bots y empezar; el servidor lo comprueba (`isAdmin`: el host, o el propietario en una sala sin pantalla). El error se mantiene como `NOT_HOST`, ahora con el texto «solo quien administra la sala».
2. **Traspaso del cargo.** Si el propietario sale del lobby, pasa al siguiente jugador humano (nunca a un bot); si no queda ninguno, el siguiente que entre lo recibe. Durante la partida no cambia: se puede volver con el token.
3. **Una sala mixta no necesita nada especial.** Presencial o remoto, un jugador es un jugador: entra por código y recibe su vista. Lo que cambia es el cliente: quien no tiene pantalla compartida ve el tablero en su dispositivo.
4. **El mando incluye el tablero.** En pantalla estrecha, dos pestañas («Mando» y «Tablero»); la pestaña del mando se activa sola cuando necesitas actuar (tu turno, una elección obligatoria o una oferta dirigida a ti) y la otra muestra un punto de aviso. En pantalla ancha (≥ 960 px) la vista es combinada: tablero a la izquierda y mando, jugadores y registro a la derecha. Para tener un solo tablero, la colocación lo dibuja en el hueco de la izquierda mediante un portal de React (`PlacementPanel.boardSlot`) en lugar de duplicarlo.
5. **Espectadores.** Ya existía el rol; ahora tienen ruta (`/watch`, `/watch/:code`) y reutilizan `GameScreen` de la pantalla principal. Solo reciben la vista pública (`getPlayerView(state, 'spectator')`): sin manos, sin acciones. Una sala a distancia puede mostrarse en una pantalla común abriendo la vista de espectador.
6. **La sesión es del navegador, no de la pestaña.** La sesión se guarda en `localStorage` (para sobrevivir a que el móvil descarte la pestaña), así que dos pestañas del _mismo navegador_ comparten asiento: la segunda toma el relevo de la primera. Para probar varios jugadores en una máquina hay que usar orígenes distintos (`localhost` y `127.0.0.1`) o navegadores distintos.

## Consecuencias

- Cualquier persona puede crear una sala desde su navegador y compartir el enlace (`/join?code=XXXX`), con botón de copiar y de compartir si el navegador lo soporta.
- Las salas guardadas antes de este cambio se recuperan como salas con pantalla y sin propietario.
- Aprendizaje de herramientas: Turbo no invalidaba la caché de `typecheck` y `test` de un paquete al cambiar sus dependencias del monorepo (se consumen como código fuente); ahora ambos tienen `dependsOn: ["^typecheck"]` y `["^test"]`.
- El criterio M3 («2 jugadores en la sala y 2 remotos») está cubierto por tests de red con clientes reales y por una prueba en navegador; falta la prueba con personas en dispositivos distintos.
