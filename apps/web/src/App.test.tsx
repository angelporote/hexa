import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { App } from './App.js';

it('renderiza la página de inicio', () => {
  expect(renderToString(<App />)).toContain('hexa');
});
