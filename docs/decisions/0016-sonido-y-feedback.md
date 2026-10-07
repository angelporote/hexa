# 0016 — Sonidos sintetizados y feedback visual

**Estado:** aceptada

## Contexto

La tarea 7.5 pide sonidos y un feedback visual más cuidado. Dos restricciones del proyecto marcan el enfoque: no se pueden añadir recursos de terceros sin licencia compatible (y cada uno debe registrarse en `assets/LICENSES.md`), y la interfaz se usa sobre todo en móviles, donde la pantalla se bloquea y el audio está restringido por los navegadores.

## Decisión

### Sonidos

1. **Se sintetizan con Web Audio**, sin archivos de audio: cada sonido es una receta de «voces» (tonos con envolvente y ráfagas de ruido filtrado) en `sound/recipes.ts`. No hay nada que licenciar, no pesan nada y se pueden ajustar como código.
2. **Qué suena depende de quién mira** (`soundsFor`, función pura):
   - _Mesa_ (pantalla principal y espectadores): dados, construcciones, ladrón, victoria.
   - _Personal_ (mando): tu turno, recibir recursos, una oferta dirigida a ti, un trato cerrado contigo, tu victoria.
   - _Todo_ (mando de una sala a distancia, sin pantalla común al lado): las dos cosas.
     Así, en una mesa con pantalla principal no suenan los dados en cinco dispositivos a la vez.
3. **Solo suena lo nuevo.** El hook ignora el historial de eventos que ya hubiera al montarse (recargar la página no reproduce la partida) y no repite un evento. Un lote de eventos se reduce a tres sonidos como máximo, sin repetidos, por orden de importancia y separados 0,25 s.
4. **Preparación del audio.** Los navegadores solo permiten el audio tras un gesto del usuario: se prepara el contexto en el primer toque o pulsación y, al activar el sonido con el botón, suena un aviso corto como confirmación.
5. **Silencio.** Botón de altavoz en la pantalla principal y en la cabecera del mando; la preferencia se guarda en `localStorage` (`hexa.sound`) y por defecto está activado. El volumen general es moderado (0,35).
6. **Nunca rompe la partida.** Sin Web Audio, con el contexto bloqueado o ante cualquier error, el reproductor no hace nada. El contexto es inyectable, por lo que los tests usan uno falso y comprueban los nodos que se crean.

### Feedback visual

7. **Recursos recibidos:** un «+N» que sube y se desvanece sobre cada recurso de la mano que aumenta (la primera lectura no cuenta), y un aviso para lectores de pantalla (`role="status"`).
8. **Hexágonos que producen:** con cada tirada nueva (salvo el 7) laten unos segundos los hexágonos con esa ficha, excepto el que tapa el ladrón. Aparece en la pantalla principal y en el tablero del mando; una tirada que ya existía al abrir la página no se resalta.
9. **Movimiento reducido:** una regla global bajo `prefers-reduced-motion: reduce` anula animaciones y transiciones en toda la aplicación (antes solo algunas lo respetaban).

## Alternativas descartadas

- **Archivos de audio (mp3/ogg):** requieren licencia y registro, pesan y hay que precargarlos.
- **Que suene todo en todos los dispositivos:** el mismo ruido varias veces a la vez, sin sentido de quién es el aviso.
- **Silenciado por defecto:** los avisos de turno son justo para lo que el móvil necesita sonido (iOS no tiene vibración); quien no lo quiera, lo silencia una vez y se recuerda.

## Consecuencias

- Los sonidos son sencillos (sintetizados); sustituirlos por unos grabados con licencia, si se decide más adelante, solo cambia `recipes.ts` y el reproductor.
- No se puede probar el sonido «de oído» en los tests: se verifica que cada sonido crea los nodos esperados y, en el navegador, que Web Audio funciona sin errores.
- Los avisos visuales son breves y no sustituyen a la información (el registro y las manos siguen siendo la fuente de verdad).
