import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@hexa/protocol';

/**
 * Genera un código de sala de 4 letras sin caracteres ambiguos, distinto de los que ya están
 * en uso. Devuelve `null` si tras varios intentos no encuentra uno libre (espacio saturado).
 */
export function generateRoomCode(
  isTaken: (code: string) => boolean,
  randomInt: (maxExclusive: number) => number,
  maxAttempts = 200,
): string | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length));
    }
    if (!isTaken(code)) return code;
  }
  return null;
}
