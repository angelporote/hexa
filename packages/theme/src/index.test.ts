import { expect, it } from 'vitest';
import { THEME_NAME } from './index.js';

it('exporta el nombre de la temática', () => {
  expect(THEME_NAME).toBe('provisional');
});
