import { defineConfig } from 'vitest/config';

// Les tests d'intégration (tests/integration) frappent le VRAI projet Supabase et
// exigent « Confirm email » DÉSACTIVÉ (le signup doit renvoyer un token). Le projet
// de production l'a ACTIVÉ (décision 2026-10-17) → ils sont opt-in : `npm run test:int`
// (OPLAA_IT=1), à lancer contre un projet de test dédié. `npm test` = unitaires seuls.
const INTEGRATION = process.env.OPLAA_IT === '1';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    exclude: ['tests/e2e/**', 'node_modules/**', ...(INTEGRATION ? [] : ['tests/integration/**'])],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
