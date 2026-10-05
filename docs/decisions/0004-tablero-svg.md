# 0004 — Tablero en SVG

**Estado:** aceptada

## Contexto

El tablero tiene unos 20 hexágonos, 54 vértices y 72 aristas, y debe escalar a cualquier pantalla y ser accesible.

## Opciones

- Canvas 2D.
- WebGL / motor de juegos.
- SVG generado con React.

## Decisión

**SVG** con componentes React (`Hex`, `Vertex`, `Edge`, `Port`, `Robber`).

## Consecuencias

- Escalado vectorial, accesibilidad e interacción por elemento sin código extra.
- Se reconsidera solo si hiciera falta animación pesada.
