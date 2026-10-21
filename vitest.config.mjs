import { defineConfig } from 'vitest/config';

// Les tests d'intégration (tests/integration) frappent le PROJET DE TEST Supabase
// (rourjugjspqppjhrizxw, « Confirm email » désactivé) et s'ignorent d'eux-mêmes s'il
// est injoignable. Ils sont donc inclus dans `npm test`.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
