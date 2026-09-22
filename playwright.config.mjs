import { defineConfig, devices } from '@playwright/test';

// Tests fonctionnels (E2E) : Playwright lance un serveur statique sur www/ et pilote l'app.
// Prérequis une fois : npx playwright install chromium
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:8820',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'python3 -m http.server 8820 --directory www',
    url: 'http://localhost:8820',
    reuseExistingServer: true,
    timeout: 20000,
  },
});
