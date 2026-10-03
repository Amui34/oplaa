// Tests fonctionnels (E2E) — parcours réels dans l'app web.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // On neutralise le guide de 1re utilisation par défaut (sinon il s'ouvre par-dessus la démo
  // et masque les contrôles). Les tests dédiés au guide le réactivent explicitement.
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('oplaa_onboarded', '1'); } catch (e) {} });
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

test('démo : on peut quitter la démo et revenir à l’écran d’accueil', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // Le bandeau démo + le bouton Quitter apparaissent
  await expect(page.locator('#demoBanner')).toBeVisible();
  await expect(page.locator('#demoQuit')).toBeVisible();
  // Quitter la démo → l’écran d’accueil revient (et le bandeau disparaît)
  await page.locator('#demoQuit').click();
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#demoBanner')).toBeHidden();
  await expect(page.locator('#welcomePatron')).toBeVisible();
});

test('affichage : aucune dérive horizontale de la page (iPad 768px)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({ inner: window.innerWidth, scrollW: document.documentElement.scrollWidth }));
  // La page ne doit jamais dépasser la largeur de l'écran (le planning scrolle dans sa propre zone)
  expect(m.scrollW).toBeLessThanOrEqual(m.inner + 1);
});

test('guide : s’affiche au premier lancement et se parcourt jusqu’au bout', async ({ page }) => {
  // Réactive le guide (le beforeEach l'avait neutralisé) puis recharge
  await page.addInitScript(() => { try { localStorage.removeItem('oplaa_onboarded'); } catch (e) {} });
  await page.reload();
  await page.locator('#welcomeDemo').click();
  // Le guide apparaît (petit délai d'animation)
  await expect(page.locator('#onboardModal')).toBeVisible();
  await expect(page.locator('#obTitle')).toContainText('Bienvenue');
  // On parcourt les 5 étapes jusqu'à « Commencer »
  for (let i = 0; i < 4; i++) await page.locator('#obNext').click();
  await expect(page.locator('#obNext')).toHaveText('Commencer');
  await page.locator('#obNext').click();
  await expect(page.locator('#onboardModal')).toBeHidden();
});

test('équipes : on peut renommer / ajouter un segment d’équipe', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.locator('#btnData').click();
  await page.locator('#btnTeams').click();
  await expect(page.locator('#teamsModal')).toBeVisible();
  const before = await page.evaluate(() => state.teams.length);
  // Ajoute une équipe et la nomme
  await page.locator('#addTeamRow2').click();
  const lastLabel = page.locator('#teamsList .set-team .s-label').last();
  await lastLabel.fill('Terrasse');
  await page.locator('#teamsForm button[type="submit"]').click();
  await expect(page.locator('#teamsModal')).toBeHidden();
  const after = await page.evaluate(() => state.teams.map(t => t.label));
  expect(after.length).toBe(before + 1);
  expect(after).toContain('Terrasse');
});

test.describe('fuseau horaire Europe/Paris (UTC+1/+2)', () => {
  test.use({ timezoneId: 'Europe/Paris' });
  test('calendrier : les jours correspondent aux dates (le « Lundi » est un vrai lundi)', async ({ page }) => {
    await page.locator('#welcomeDemo').click();
    await page.waitForTimeout(200);
    // weekStart doit être un LUNDI (dow===1), même en fuseau en avance sur UTC
    const dow = await page.evaluate(() => parseLocalDate(state.weekStart).getDay());
    expect(dow).toBe(1);
    // La 1re colonne de jour est bien « Lundi » et sa date est réellement un lundi
    await expect(page.locator('#gridHead th').nth(1)).toContainText('Lundi');
    const col0IsMonday = await page.evaluate(() => addDays(state.weekStart, 0).getDay() === 1);
    expect(col0IsMonday).toBe(true);
  });
});

test('planning : ruban de jours continu (dimanche → lundi suivant, sans coupure)', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // Le mode Semaine affiche plus de 7 jours d'affilée (ruban continu multi-semaines)
  const headers = page.locator('#gridHead th');
  const count = await headers.count();
  expect(count).toBeGreaterThan(8); // colonne « Équipe » + > 7 jours
  // La 8e colonne de JOURS (nth(8) : la colonne « Équipe » occupe nth(0)) est un Lundi : la semaine ne s'arrête pas au dimanche
  await expect(headers.nth(8)).toContainText('Lundi');
  // Une cellule de cette colonne cible bien la semaine suivante (data-add-week distinct de la 1re)
  const firstWeek = await page.locator('#gridBody td[data-add-week]').first().getAttribute('data-add-week');
  const laterWeek = await page.locator('#gridBody td[data-add-week]').nth(7).getAttribute('data-add-week');
  expect(laterWeek).not.toBe(firstWeek);
});
