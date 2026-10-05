import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Los componentes se prueban con React Testing Library sobre jsdom.
    environment: 'jsdom',
  },
});
