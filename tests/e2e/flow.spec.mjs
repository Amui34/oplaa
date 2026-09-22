// Tests fonctionnels (E2E) — parcours réels dans l'app web.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto('/');
});

test("écran d'accueil : choix patron / employé + démo (web)", async ({ page }) => {
  await expect(page.locator('#welcomePatron')).toBeVisible();
  await expect(page.locator('#welcomeEmploye')).toBeVisible();
  // Le bouton démo n'est visible que sur le web (pas dans l'app native)
  await expect(page.locator('#welcomeDemo')).toBeVisible();
});

test('mode démo : charge le planning de démonstration', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // L'écran d'accueil disparaît, le planning s'affiche avec l'établissement de démo
  await expect(page.locator('#restoName')).toContainText('Bistrot');
  await expect(page.locator('#welcome')).not.toBeVisible();
  // Les employés de démo sont bien rendus dans l'app
  await expect(page.getByText('Camille Durand').first()).toBeAttached();
});

test('création patron : ouvre l’assistant de configuration', async ({ page }) => {
  await page.locator('#welcomePatron').click();
  await expect(page.locator('#wizardModal')).toBeVisible();
});

test('confidentialité : le filigrane RGPD est inactif hors connexion', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // Sans compte connecté, pas de filigrane
  await expect(page.locator('body')).not.toHaveClass(/rgpd-on/);
});
