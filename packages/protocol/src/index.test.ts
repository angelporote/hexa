import { expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './index.js';

it('define la versión del protocolo', () => {
  expect(PROTOCOL_VERSION).toBeGreaterThan(0);
});
