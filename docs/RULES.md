# Reglas del juego — `hexa`

Documento redactado desde cero para este proyecto. Describe exactamente lo que implementa `packages/engine`; si el motor y este texto discrepan, hay que corregir uno de los dos.

## 1. Objetivo

Gana la primera persona que, **durante su propio turno**, alcance **10 puntos de victoria**. Los puntos se consiguen colonizando el tablero: edificios, rutas largas, ejércitos y cartas de punto.

## 2. Componentes

| Elemento             | Cantidad                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hexágonos de terreno | 19: cinco terrenos productores (4 + 3 + 4 + 4 + 3) y 1 estéril                                                                    |
| Fichas numéricas     | 18, con los valores 2 a 12 sin el 7 (el 6 y el 8 son las más probables y salen dos veces; también se repiten 3, 4, 5, 9, 10 y 11) |
| Puertos              | 9: 4 generales y 5 específicos (uno por recurso)                                                                                  |
| Piezas por jugador   | 15 caminos, 5 poblados, 4 ciudades                                                                                                |
| Banco                | 19 cartas de cada uno de los 5 recursos                                                                                           |
| Mazo de desarrollo   | 25 cartas: 14 de ejército, 2 de caminos, 2 de abundancia, 2 de monopolio, 5 de punto                                              |

Los recursos se llaman en el motor `r1` a `r5`. Sus nombres visibles son cosa del tema gráfico (`packages/theme`); mientras tanto, por convención: `r1` madera, `r2` arcilla, `r3` lana, `r4` cereal, `r5` mineral.

**Preparación del tablero.** Los terrenos y las fichas se reparten al azar a partir de una semilla. Por defecto, el reparto evita que dos fichas de 6 u 8 queden en hexágonos contiguos. El terreno estéril no produce ni lleva ficha, y el ladrón empieza sobre él.

## 3. Conceptos de tablero

- Un **vértice** es una esquina compartida por hasta tres hexágonos. Ahí se colocan poblados y ciudades.
- Una **arista** es el lado entre dos hexágonos. Ahí se colocan caminos.
- Un **puerto** ocupa una arista de la costa; quien tenga un edificio en cualquiera de sus dos vértices lo usa.

## 4. Colocación inicial

Se juega una ronda de ida y otra de vuelta: con cuatro jugadores el orden es 1, 2, 3, 4, 4, 3, 2, 1.

En cada paso, la persona activa coloca **gratis**, en este orden:

1. Un **poblado** en un vértice libre.
2. Un **camino** en una arista que toque ese poblado.

Reglas de colocación: no se necesita camino previo, pero se aplica la **regla de distancia** (ver 7).

En la segunda colocación (la de vuelta), el poblado entrega **una carta por cada hexágono productor** que toque.

Al terminar, empieza la partida el primer jugador.

## 5. El turno

1. **Tirada.** La persona activa tira dos dados. Antes de tirar puede jugar una carta de desarrollo.
2. **Resolución de la tirada** (secciones 6 y 8).
3. **Fase principal**, en cualquier orden y cuantas veces pueda pagarlo: construir, comprar y jugar cartas de desarrollo, comerciar con el banco y proponer intercambios.
4. **Fin de turno.** Pasa al siguiente jugador.

Solo existe una acción obligatoria: tirar los dados.

## 6. Producción

Con una tirada distinta de 7, cada hexágono cuya ficha coincide con el total produce para los edificios que lo tocan, salvo el que ocupa el ladrón:

- un **poblado** recibe 1 carta del recurso del terreno;
- una **ciudad** recibe 2.

**Escasez del banco.** Si el banco no tiene cartas suficientes de un recurso para cubrir todo lo que se debe:

- si **una sola persona** lo reclama, recibe las que queden;
- si lo reclaman **varias**, nadie recibe ese recurso en esa tirada.

## 7. Construcción

| Pieza               | Coste                     | Requisitos                                                            |
| ------------------- | ------------------------- | --------------------------------------------------------------------- |
| Camino              | `r1` + `r2`               | Arista libre que enlace con la red propia (ver abajo)                 |
| Poblado             | `r1` + `r2` + `r3` + `r4` | Vértice libre, **regla de distancia** y un camino propio que lo toque |
| Ciudad              | 2 `r4` + 3 `r5`           | Sustituye a un poblado propio, que vuelve a la reserva                |
| Carta de desarrollo | `r3` + `r4` + `r5`        | Quedan cartas en el mazo                                              |

- **Regla de distancia:** un poblado no puede tener ningún edificio (de nadie) en un vértice contiguo.
- **Enlace de caminos:** un camino nuevo debe salir de un edificio propio o prolongar un camino propio. No se puede continuar a través de un vértice ocupado por un edificio ajeno.
- El número de piezas es limitado: sin piezas en la reserva no se puede construir ese tipo.
- Todo lo que se paga va al banco.

## 8. El 7 y el ladrón

Si el total de los dados es 7, nadie produce y ocurre lo siguiente, en este orden:

1. **Descarte.** Quien tenga **más de 7 cartas** de recurso descarta la **mitad (redondeando hacia abajo)**, a su elección. Se descarta en cualquier orden y hay que esperar a que todos terminen.
2. **Ladrón.** La persona activa **debe** mover el ladrón a otro hexágono. El hexágono ocupado por el ladrón no produce.
3. **Robo.** Si en el nuevo hexágono hay edificios de otras personas con cartas en la mano, la persona activa elige a una y le quita **una carta al azar**. Si no hay nadie a quien robar, no se roba.

## 9. Cartas de desarrollo

Se compran del mazo (oculto) y se quedan en la mano, en secreto.

**Límites al jugarlas:**

- Como máximo **una carta por turno**.
- No se puede jugar una carta **el mismo turno en que se compró**.
- Se pueden jugar antes de tirar los dados o en la fase principal.
- Las cartas de punto no se juegan: cuentan solas.

| Carta          | Efecto                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Ejército**   | Se mueve el ladrón y se roba, como en el 7 pero sin descarte. Cuenta para el mayor ejército.                                             |
| **Caminos**    | Se colocan hasta 2 caminos gratis, respetando las reglas de enlace. Si no hay ningún sitio donde colocarlos, la carta no se puede jugar. |
| **Abundancia** | Se toman 2 cartas de recurso cualesquiera del banco. El banco debe tenerlas.                                                             |
| **Monopolio**  | Se nombra un recurso y todos los demás jugadores entregan todas sus cartas de ese recurso.                                               |
| **Punto**      | Vale 1 punto de victoria y permanece oculta hasta el final.                                                                              |

## 10. Comercio

### Con el banco

Se entregan **4 cartas del mismo recurso** y se recibe **1** a elección. Los puertos mejoran la tarifa para quien tenga un edificio en ellos:

- **Puerto general:** 3 por 1, en cualquier recurso.
- **Puerto específico:** 2 por 1, solo en su recurso.

Se aplica siempre la mejor tarifa disponible. El banco debe tener la carta que se pide.

### Entre jugadores

Solo se puede comerciar **con la persona que tiene el turno**: los demás no comercian entre sí.

1. La persona activa **propone** una oferta: qué da y qué pide, a todos o a jugadores concretos. Debe tener lo que ofrece, tiene que haber algo a cada lado y no puede pedir y dar el mismo recurso.
2. Cada destinatario responde con una de tres cosas, y puede cambiar de respuesta mientras la oferta siga abierta:
   - **Aceptar**, si tiene lo que se le pide.
   - **Rechazar**.
   - **Contraofertar**: propone otras condiciones (qué da él y qué pide). Solo hay una contraoferta por persona; la última sustituye a la anterior y a cualquier sí o no que hubiera dicho.
3. La persona activa ve las respuestas y **cierra el trato** con alguien que aceptó, o **acepta una contraoferta** (el trato se hace con las condiciones de esa contraoferta), o **cancela**. Al cerrar se vuelve a comprobar que ambas partes tienen las cartas.

Solo hay **una oferta abierta** a la vez. La oferta se cancela sola:

- al terminar el turno;
- si la partida sale de la fase principal (por ejemplo, al jugar una carta de ejército o al terminar la partida);
- si pasa demasiado tiempo sin cerrarse (2 minutos por defecto), para que una persona ausente no deje a los demás esperando.

## 11. Bonificaciones

### Camino más largo (2 puntos)

- Se cuenta el **recorrido continuo más largo** de caminos propios. Puede ramificarse (solo se cuenta una rama), no repite caminos, y un circuito cerrado cuenta entero.
- Un **edificio ajeno** en un vértice corta el recorrido: se puede llegar hasta él, pero no seguir al otro lado. Los edificios propios no cortan.
- Hacen falta **al menos 5**.
- Quien lo tiene lo conserva mientras siga **empatado en cabeza**. Para quitárselo hay que superarle estrictamente.
- Si el titular lo pierde (por un corte, por ejemplo): pasa a quien tenga la longitud máxima si es **una sola persona** con 5 o más; si hay empate por delante o nadie llega a 5, **queda vacante**.

### Mayor ejército (2 puntos)

- Se cuentan las cartas de ejército jugadas.
- Hacen falta **al menos 3**.
- Se conserva con el empate; para quitarlo hay que superar estrictamente al titular.

## 12. Puntos y victoria

| Concepto         | Puntos     |
| ---------------- | ---------- |
| Poblado          | 1          |
| Ciudad           | 2          |
| Camino más largo | 2          |
| Mayor ejército   | 2          |
| Carta de punto   | 1 cada una |

La victoria se comprueba **al terminar cada acción de la persona activa** y también **al empezar su turno**. Quien alcance 10 puntos en turno ajeno (por ejemplo, porque otra persona le cede una bonificación al cortarse un camino) gana cuando le toque jugar. No se comprueba durante la colocación inicial.

## 13. Información oculta

- Cada jugador conoce su mano completa y sus cartas de desarrollo. Del resto solo conoce **cuántas cartas de recurso y cuántas de desarrollo** tienen.
- El mazo, su orden y la aleatoriedad de la partida no los conoce nadie.
- La pantalla compartida y los espectadores no ven ninguna mano.
- Los puntos que se muestran durante la partida son los **públicos** (edificios y bonificaciones); las cartas de punto se revelan al terminar.
