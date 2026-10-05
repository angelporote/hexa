import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@hexa/protocol';
import { generateRoomCode } from './codes.js';

/** Generador pseudoaleatorio determinista para los tests. */
function lcg(seed: number): (max: number) => number {
  let s = seed;
  return (max) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % max;
  };
}

describe('generateRoomCode', () => {
  it('produce 4 letras del alfabeto sin caracteres ambiguos', () => {
    const rand = lcg(1);
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode(() => false, rand);
      expect(code).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`));
      expect(code).not.toMatch(/[ILOQU]/);
    }
  });

  it('nunca repite un código en uso', () => {
    const rand = lcg(7);
    const used = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generateRoomCode((c) => used.has(c), rand);
      expect(code).not.toBeNull();
      expect(used.has(code ?? '')).toBe(false);
      used.add(code ?? '');
    }
  });

  it('reintenta tras una colisión', () => {
    let calls = 0;
    const rand = (max: number) => {
      calls++;
      return calls <= ROOM_CODE_LENGTH ? 0 : 1 % max; // el primer intento da AAAA, ocupado
    };
    const code = generateRoomCode((c) => c === 'AAAA', rand);
    expect(code).toBe('BBBB');
  });

  it('devuelve null si el espacio está saturado', () => {
    expect(generateRoomCode(() => true, lcg(3), 20)).toBeNull();
  });
});
