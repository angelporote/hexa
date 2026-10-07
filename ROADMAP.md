# Hoja de ruta — proyecto `hexa`

## Estado actual

> Claude Code actualiza esta sección al final de cada sesión.

- **Fase en curso:** 7 completada. Siguen abiertas la 4.8 (móviles reales) y la prueba con personas de los hitos M2 y M3
- **Última tarea completada:** 7.7
- **Bloqueos / dudas abiertas:** M3 («2 jugadores en la sala y 2 remotos») está cubierto por tests de red con clientes reales y por una prueba en navegador (escritorio + móvil emulado + espectador), pero no con personas en dispositivos distintos. El test del almacén contra un Redis real solo corre en la CI (en esta máquina no hay Redis ni Docker; en local se usa un cliente en memoria con el mismo contrato). Dos pestañas del mismo navegador comparten asiento (la sesión va en `localStorage`): para probar varios jugadores en una máquina, usar `localhost` y `127.0.0.1` o navegadores distintos.
- **Próximo paso:** Fase 8 (preparación para publicar). Casi todas sus tareas necesitan decisiones tuyas (nombre comercial, arte, dominio, proveedor). Antes, conviene cerrar las pruebas con personas en dispositivos reales (4.8, M2, M3). En paralelo: probar con personas en dispositivos distintos (M2, M3).

## Objetivo del MVP publicable

Un juego web en el que una pantalla muestra el tablero, de 3 a 4 jugadores se unen desde el móvil con un código o QR sin instalar nada, juegan una partida completa con las reglas base (incluido el comercio entre jugadores), y cualquiera puede participar a distancia desde su navegador. Robusto ante bloqueos del móvil y reconexiones, con identidad visual y nombre propios.

## Hitos

| Hito                          | Al terminar | Significa                                             |
| ----------------------------- | ----------- | ----------------------------------------------------- |
| **M1 — Motor completo**       | Fase 1      | Se juegan miles de partidas simuladas sin errores.    |
| **M2 — Primera partida real** | Fase 4      | 4 personas juegan con sus móviles en la misma sala.   |
| **M3 — Juego completo**       | Fase 6      | Comercio entre jugadores y juego a distancia.         |
| **M4 — Beta pública**         | Fase 8      | Publicado con nombre, arte y páginas legales propios. |

---

## Fase 0 — Cimientos del repositorio

**Objetivo:** un monorepo limpio donde todo se compila, se prueba y se valida en CI desde el primer día.

- [x] **0.1** Monorepo con pnpm workspaces y Turborepo: `apps/server`, `apps/web`, `packages/engine`, `packages/protocol`, `packages/theme` (estructura en `docs/ARCHITECTURE.md`).
- [x] **0.2** `tsconfig.base.json` estricto compartido; ESLint + Prettier; Vitest en cada paquete.
- [x] **0.3** Scripts raíz: `dev`, `build`, `test`, `typecheck`, `lint`, `check`.
- [x] **0.4** `.nvmrc` con la versión LTS actual de Node, `.editorconfig`, `.gitignore`, `README.md` breve con cómo arrancar.
- [x] **0.5** Esqueletos mínimos: el servidor responde `GET /health`; la web muestra una página de inicio; el motor exporta una función trivial con test.
- [x] **0.6** CI en GitHub Actions: `pnpm install --frozen-lockfile` + `pnpm check` en cada push y PR.
- [x] **0.7** Comprobación de términos prohibidos en CI (script que falla si encuentra los términos de la sección de propiedad intelectual de `CLAUDE.md`, excluyendo `CLAUDE.md`).
- [x] **0.8** Carpeta `docs/decisions/` con los ADR iniciales listados en `docs/ARCHITECTURE.md`.

**Criterios de aceptación:** `pnpm install && pnpm check` pasa en limpio; CI en verde; `pnpm dev` levanta servidor y web a la vez.

---

## Fase 1 — Motor del juego (sin red ni interfaz)

**Objetivo:** una partida completa jugable solo con código y tests. Es la base de todo; aquí se invierte en calidad.

- [x] **1.1** Coordenadas hexagonales axiales. Grafo de vértices y aristas con vértices compartidos deduplicados. Test: el mapa base de 19 hexágonos produce 54 vértices y 72 aristas.
- [x] **1.2** RNG con semilla (serializable dentro del estado). Test de reproducibilidad: misma semilla, mismo resultado.
- [x] **1.3** Mapas como datos (JSON validado): forma, terrenos, fichas numéricas y puertos. Generador aleatorio con semilla para el mapa base, con opción de impedir que las dos fichas más probables queden adyacentes.
- [x] **1.4** Modelo de estado completo y serializable: jugadores, recursos, piezas restantes, edificios, mazo de desarrollo, banco, ladrón, fase, turno, registro. Ver tipos en `docs/ARCHITECTURE.md`.
- [x] **1.5** Fase de colocación inicial en orden de ida y vuelta; la segunda colocación otorga recursos de los terrenos adyacentes.
- [x] **1.6** Tirada de dados y producción, incluida la regla de escasez del banco.
- [x] **1.7** Construcción de caminos, poblados (regla de distancia y conexión) y ciudades; costes; límite de piezas por jugador.
- [x] **1.8** El 7: descarte de la mitad para quien supere el límite de cartas, mover el ladrón, robar a un jugador adyacente.
- [x] **1.9** Cartas de desarrollo: compra, restricción de no jugar la comprada en el mismo turno, máximo una por turno, efectos de cada tipo.
- [x] **1.10** Comercio con el banco y con puertos (genéricos y específicos).
- [x] **1.11** Comercio entre jugadores en el motor: proponer, aceptar, rechazar, cancelar; solo con el jugador activo.
- [x] **1.12** Bonificaciones de mayor ejército y camino más largo, incluidos los cortes de camino por edificios ajenos. Batería de tests específica para el camino más largo (ciclos, ramificaciones, cortes, empates).
- [x] **1.13** Condición de victoria comprobada en el turno del jugador; fin de partida.
- [x] **1.14** `legalActions(state, player)` y `getPlayerView(state, viewer)` con ocultación de información.
- [x] **1.15** Simulador (`pnpm sim`): bots aleatorios juegan N partidas completas con semillas distintas. Invariantes comprobadas en cada paso: conservación total de recursos y cartas, puntos coherentes, ningún estado ilegal.
- [x] **1.16** `docs/RULES.md` redactado desde cero con nuestras palabras.

**Criterios de aceptación:** 1.000 partidas simuladas sin errores ni invariantes rotas; cobertura del motor ≥ 90 %; el motor no importa nada de Node ni del navegador.

---

## Fase 2 — Servidor y salas

**Objetivo:** salas con código, roles, reconexión y una partida completa jugada por clientes simulados a través de la red.

- [x] **2.1** `packages/protocol`: esquemas Zod de mensajes cliente → servidor y servidor → cliente, con número de versión del protocolo.
- [x] **2.2** Servidor Node con Fastify + Socket.IO. Gestor de salas detrás de la interfaz `RoomStore` (implementación en memoria por ahora).
- [x] **2.3** Códigos de sala de 4 letras sin caracteres ambiguos, únicos entre las salas activas, que caducan con la sala.
- [x] **2.4** Roles: `host` (pantalla), `player`, `spectator`. Lobby: nombre, color, listo; el host inicia la partida.
- [x] **2.5** Sesiones: token aleatorio por asiento que el cliente guarda; al reconectar recupera su asiento y su vista.
- [x] **2.6** Bucle de acción: recibir → validar con Zod → comprobar permiso → motor → enviar a cada cliente su vista + eventos.
- [x] **2.7** Registro de acciones por sala (semilla + lista de acciones) para poder reproducir cualquier partida.
- [x] **2.8** Robustez: límite de mensajes por socket, tamaño máximo de mensaje, limpieza de salas inactivas, logs estructurados (pino).
- [x] **2.9** Tests de integración con `socket.io-client`: crear sala, unir 4 bots, jugar una partida completa; desconectar y reconectar un jugador a mitad de partida.

**Criterios de aceptación:** el test de integración de partida completa pasa; ningún cliente recibe información oculta de otro (test explícito).

---

## Fase 3 — Pantalla principal (host)

**Objetivo:** la pantalla grande muestra lobby y partida en tiempo real.

- [x] **3.1** App web con Vite + React y rutas: `/` (inicio), `/host`, `/join`, `/play/:code`.
- [x] **3.2** Cliente de red común (`apps/web/src/net`) con estado de conexión y reconexión.
- [x] **3.3** Lobby del host: código grande, QR con el enlace de unión, jugadores conectados.
- [x] **3.4** Tablero en SVG generado desde el estado (componentes `Hex`, `Vertex`, `Edge`, `Port`, `Robber`), adaptado a cualquier resolución.
- [x] **3.5** Panel de jugadores (puntos públicos, nº de cartas, bonificaciones), registro de eventos, animación de dados y del jugador activo.
- [x] **3.6** `packages/theme` con nombres, colores e iconos provisionales propios; i18n es/en configurado.

**Criterios de aceptación:** una partida jugada por bots del servidor se ve correctamente y en tiempo real en la pantalla del host.

---

## Fase 4 — Mando móvil

**Objetivo:** jugar una partida completa desde el móvil.

- [x] **4.1** Unirse por código o QR; elegir nombre y color; esperar en el lobby.
- [x] **4.2** Mano privada: recursos, cartas de desarrollo, costes de construcción a la vista.
- [x] **4.3** Botones generados a partir de `legalActions`: tirar, construir, comprar, jugar carta, terminar turno.
- [x] **4.4** Colocación: minitablero en el móvil con zoom y solo las posiciones legales resaltadas; confirmación en dos pasos; la elección se resalta también en el host.
- [x] **4.5** Flujos del 7 (descarte, ladrón, robo) y de cada carta de desarrollo.
- [x] **4.6** Comercio con el banco y los puertos.
- [x] **4.7** Wake Lock para que la pantalla no se apague, reconexión automática con indicador visible, vibración al empezar tu turno.
- [ ] **4.8** Pruebas manuales en iOS Safari y Android Chrome reales; documentar incidencias en `docs/devices.md`.

**Criterios de aceptación (M2):** 4 personas juegan una partida completa con sus móviles; bloquear y desbloquear un móvil no rompe la partida.

---

## Fase 5 — Comercio entre jugadores

- [x] **5.1** Proponer oferta desde el móvil (dar / pedir) al resto o a un jugador concreto.
- [x] **5.2** Recibir ofertas: aceptar, rechazar o contraofertar.
- [x] **5.3** El jugador activo elige entre las aceptaciones; cancelación y caducidad de ofertas.
- [x] **5.4** Las ofertas abiertas se muestran en el host.

**Criterios de aceptación:** comercio fluido entre 4 móviles sin estados inconsistentes, cubierto por tests E2E.

---

## Fase 6 — Juego a distancia y espectadores

- [x] **6.1** Partida sin pantalla compartida: cualquier jugador puede crear la sala desde su navegador.
- [x] **6.2** Vista combinada para escritorio (tablero + mano) y pestaña «tablero» en el mando móvil para jugadores remotos.
- [x] **6.3** Espectadores que ven solo información pública.
- [x] **6.4** Mezcla de jugadores presenciales (con host) y remotos en la misma sala.

**Criterios de aceptación (M3):** partida con 2 jugadores en la sala y 2 remotos, completada sin incidencias.

---

## Fase 7 — Robustez y calidad

- [x] **7.1** `RoomStore` con Redis: las salas sobreviven a un reinicio del servidor (estado reconstruible desde semilla + acciones).
- [x] **7.2** Temporizador de turno opcional; jugador ausente → bot sustituto hasta que vuelva.
- [x] **7.3** Bot básico razonable (no aleatorio) para rellenar huecos y para tests.
- [x] **7.4** Accesibilidad: colores de jugador distinguibles con daltonismo (formas o patrones además del color), tamaños táctiles adecuados.
- [x] **7.5** Sonidos y feedback visual pulido.
- [x] **7.6** Tests E2E con Playwright: un host y 4 mandos en contextos de navegador distintos.
- [x] **7.7** Monitorización de errores (Sentry o similar) en servidor y web.

---

## Fase 8 — Preparación para publicar

- [ ] **8.1** Nombre comercial definitivo verificado en TMview (OEPM/EUIPO) y dominio registrado. Sustituir el nombre en clave en textos visibles.
- [ ] **8.2** Arte e identidad visual finales y originales; `assets/LICENSES.md` completo.
- [ ] **8.3** Revisión de propiedad intelectual: textos, reglas, arte y metadatos sin referencias al juego original.
- [ ] **8.4** Páginas legales: aviso legal, privacidad y cookies (evitar cookies no esenciales).
- [ ] **8.5** Despliegue: Docker, proveedor con soporte de WebSockets, HTTPS, dominio, copias de seguridad de Redis.
- [ ] **8.6** Pruebas de carga (k6 o Artillery) con un objetivo explícito de salas simultáneas.
- [ ] **8.7** Escalado horizontal preparado: adaptador Redis de Socket.IO y enrutado de cada sala a su instancia.
- [ ] **8.8** Beta cerrada con jugadores reales; recoger feedback.

**Criterios de aceptación (M4):** beta pública en producción con monitorización y sin errores críticos abiertos.

---

## Backlog posterior al lanzamiento

Ampliación a 5–6 jugadores · editor y selección de mapas · partidas asíncronas · cuentas opcionales, estadísticas y clasificación · PWA instalable y apps nativas · monetización cosmética (temas de tablero, fichas).
