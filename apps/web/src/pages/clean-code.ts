import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@hexa/protocol';

/** Normaliza lo que se escribe como código: mayúsculas y solo letras válidas, máximo 4. */
export function cleanCode(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .slice(0, ROOM_CODE_LENGTH)
    .join('');
}
