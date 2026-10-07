import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Los componentes se prueban con React Testing Library sobre jsdom.
    environment: 'jsdom',
    // La hoja de estilos se lee como texto en `touch-targets.test.ts`; por defecto Vitest la vacía.
    css: { include: [/styles\.css/] },
  },
});
