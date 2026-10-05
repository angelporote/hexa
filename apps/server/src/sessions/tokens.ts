import { randomBytes, randomInt } from 'node:crypto';

/** Token aleatorio de 192 bits, en hexadecimal. */
export function createToken(): string {
  return randomBytes(24).toString('hex');
}

export function createSeed(): string {
  return randomBytes(12).toString('hex');
}

export { randomInt };
