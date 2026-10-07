# 0015 — Accesibilidad: colores con daltonismo y tamaños táctiles

**Estado:** aceptada

## Contexto

La tarea 7.4 pide que los colores de jugador se distingan con daltonismo (formas o patrones además del color) y que los controles tengan un tamaño táctil adecuado. Antes de cambiar nada se midió:

- **Colores.** Con la paleta original (coral, azul, naranja, violeta), el par azul–violeta tenía una distancia de color ΔE de **7,9 con protanopía** y **14,4 con deuteranopía** (por debajo de ~10 son prácticamente iguales). Solo añadir formas habría dejado el color como pista débil.
- **Tamaños.** En el móvil (375 × 812) fallaban los botones de idioma (36 px de alto), los enlaces «Volver» y «Salir de la sala» (22–24 px), el desplegable de costes (22 px) y el botón pequeño de las ofertas (36 px). El resto del mando ya medía 44 px o más.

## Decisión

1. **El color nunca es la única pista.** Cada jugador tiene una **forma** propia (círculo, cuadrado, triángulo, rombo; `playerMarks` en el tema) y un **trazo de camino** propio (continuo, rayas, puntos, raya-punto; `roadDashes`).
   - Un componente `Swatch` dibuja la silueta con el color del jugador y sustituye a todas las muestras redondas (tarjetas, cabeceras, sala de espera, selector de color, intercambios).
   - En el tablero, cada edificio lleva dentro la forma de su jugador y cada camino una línea central con su trazo.
   - Las formas son redundantes para quien ve bien y siempre están activas: no hay un «modo daltónico» que activar.
2. **Paleta nueva** elegida con una búsqueda numérica entre candidatos agradables: carmesí `#e03a63`, violeta `#7a6cf0`, ámbar `#f5b800` y cian `#4cc9e0`. La distancia mínima entre cualquier par pasa a 38,7 con tritanopía, 40,0 con protanopía, 46,9 con deuteranopía y 82,3 con visión normal (antes, 7,9 como peor caso). Los nombres visibles cambian (Carmesí, Violeta, Ámbar, Cian).
3. **Un test lo vigila** (`packages/theme/src/accessibility.test.ts`): simula protanopía, deuteranopía y tritanopía (matrices de Machado, Oliveira y Fernandes 2009), exige ΔE ≥ 35 entre todos los pares, que cada color tenga un contraste ≥ 3:1 con los fondos oscuros de la interfaz (WCAG 1.4.11) y que formas y trazos sean todos distintos.
4. **Tamaños táctiles: 44 × 44 px como mínimo** en todo control (guía de Apple; criterio AAA 2.5.5 de WCAG, más estricto que el AA de 24 px). Se subieron los botones de idioma, `.link-btn`, `.btn-sm` y el resumen de costes. Un test lee `styles.css` y exige esa medida a las clases de control; las medidas reales se comprueban en el navegador con una auditoría de todos los controles de cada pantalla.

## Alternativas descartadas

- **Opción «modo daltónico».** Obliga a descubrirla y deja a esas personas con una experiencia aparte; las formas redundantes ayudan a todos (p. ej., con poca luz o pantallas con mal contraste).
- **Solo cambiar la paleta (o solo las formas).** La paleta sola no cubre todos los tipos de daltonismo; las formas solas dejan colores casi idénticos.
- **Texto (1–4) en lugar de formas** sobre las piezas: ocupa más y se confunde con los números de las fichas.

## Consecuencias

- Los nombres de color de las traducciones cambian; los ids (`c1`…`c4`) y el protocolo no.
- Las piezas del tablero tienen unos 20 px: la forma interior es pequeña, pero legible, y el tablero se puede ampliar con el zoom.
- No se ha hecho una revisión completa de lectores de pantalla ni de contraste de texto; queda como mejora futura.
