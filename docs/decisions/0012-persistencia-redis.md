# 0012 — Persistencia de salas en Redis con escritura diferida

**Estado:** aceptada

## Contexto

Hasta la fase 6 las salas vivían solo en memoria (`MemoryRoomStore`): reiniciar o desplegar el servidor mataba todas las partidas. El gestor de salas ya escribía en un `RoomStore` tras cada cambio sin esperar (ADR 0007), así que la tarea 7.1 solo exigía una implementación real de esa interfaz.

## Opciones

- **Cliente:** `redis` (meta-paquete oficial), `@redis/client` (el núcleo oficial), `ioredis`.
- **Escritura:** directa (cada `save` es un `SET` independiente) o diferida (cola con coalescencia y reintentos).
- **Formato:** una clave por sala con JSON, o un hash/stream por sala.

## Decisión

1. **`@redis/client`**, el núcleo del cliente oficial. El paquete `redis` arrastra módulos (JSON, búsqueda, series temporales, Bloom) que no usamos. Solo se emplean `SET … PX`, `DEL`, `SCAN` y `MGET`.
2. **Una clave por sala** (`hexa:room:CODIGO`) con la `RoomData` serializada como JSON y **caducidad igual al TTL de sala**, renovada en cada guardado. El estado es JSON puro (así lo exige el motor), por lo que el viaje de ida y vuelta es exacto; un test lo comprueba con una partida real. La sala guarda `seed + config + acciones + instantánea` (ADR 0003): la instantánea evita reaplicar la partida y el registro permite reproducirla o depurarla.
3. **Interfaz mínima `KeyValueClient`** (`set` con TTL, `del`, `keys`, `getMany`, `close`) entre el almacén y el cliente real. Permite probar toda la lógica con un cliente en memoria. El mismo conjunto de tests se ejecuta además contra un Redis real cuando existe `REDIS_URL`; la CI levanta uno como servicio.
4. **`WriteBehindStore`**, un decorador genérico sobre cualquier `RoomStore`:
   - `save` y `delete` devuelven al instante; solo se escribe la **última versión** de cada sala (cada una es una instantánea completa) y las escrituras del mismo instante se juntan.
   - Si el almacén falla, la sala queda pendiente y se **reintenta con espera creciente** (500 ms → 10 s). Una caída de Redis no frena ni rompe las partidas, no acumula memoria sin límite y, al volver, se escribe el estado más reciente.
   - `close()` **vuelca lo pendiente** (hasta 5 s) y cierra el almacén; `buildServer` lo llama lo último al apagarse, tras desconectar a los clientes, porque esas desconexiones también cambian las salas.
5. **Sin cola de espera en el cliente de Redis** (`disableOfflineQueue`). Con Redis caído los comandos fallan al instante en lugar de quedarse colgados; si no, el apagado esperaría indefinidamente.
6. **Arranque estricto:** con `REDIS_URL` definida, el servidor no arranca si Redis no responde en 10 s (un error de configuración debe notarse enseguida). Sin `REDIS_URL` se usa memoria y se avisa en el log.
7. **Lectura defensiva:** al recuperar, una entrada que no sea JSON o no tenga forma de sala se descarta con un aviso y no impide arrancar a las demás. Las salas guardadas antes del juego a distancia (sin `hostless` ni `ownerId`) se aceptan y el gestor les pone valores por defecto.

## Consecuencias

- Reiniciar o desplegar el servidor ya no pierde partidas: los jugadores retoman su asiento con su token (`session:resume`) y los bots siguen jugando.
- Con una caída de Redis solo se pierde lo no escrito si además se apaga el proceso antes de que vuelva; es el compromiso de la escritura diferida (misma idea que ADR 0007).
- Una sola instancia del servidor por Redis: no hay bloqueo entre instancias. El escalado horizontal (8.7) exigirá anclar cada sala a una instancia.
- Los tests contra Redis real solo se ejecutan donde haya `REDIS_URL` (CI); en local corre el cliente en memoria.
- `loadAll` usa `SCAN` con prefijo: correcto para cientos o miles de salas; si hiciera falta más, se mantendría un índice de códigos.
