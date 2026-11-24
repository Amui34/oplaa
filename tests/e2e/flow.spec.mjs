// Tests fonctionnels (E2E) — parcours réels dans l'app web.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // On neutralise le guide de 1re utilisation par défaut (sinon il s'ouvre par-dessus la démo
  // et masque les contrôles). Les tests dédiés au guide le réactivent explicitement.
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('oplaa_onboarded', '1'); } catch (e) {} });
  await page.goto('/');
});

test("ouverture : on arrive directement sur « Créer mon compte » (pas d'écran intermédiaire)", async ({ page }) => {
  // La fenêtre compte s'affiche en plein écran, en mode création
  await expect(page.locator('#cloudModal')).toBeVisible();
  await expect(page.locator('#cloudModal')).toHaveClass(/onb/);
  await expect(page.locator('#cloudSignUp')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#cloudAuthIntro')).toContainText('Crée ton compte');
  await expect(page.locator('#cloudSignIn')).toBeHidden();
  await expect(page.locator('#cloudForgot')).toBeHidden();
  await expect(page.locator('#wizardModal')).toBeHidden();          // l'assistant ne s'ouvre qu'après connexion
  await expect(page.locator('#welcomeDemo')).toBeVisible();          // la démo reste accessible sans compte
  // Bascule « J'ai déjà un compte » + mot de passe oublié (réclame l'e-mail s'il est vide)
  await page.locator('#cloudAuthSwitch').click();
  await expect(page.locator('#cloudSignIn')).toBeVisible();
  await expect(page.locator('#cloudSignUp')).toBeHidden();
  await page.locator('#cloudForgot').click();
  await expect(page.locator('#cloudAuthMsg')).toContainText('Entre ton email');
  // Sans compte, on ne peut pas fermer cet écran pour atteindre un planning vide
  await page.keyboard.press('Escape');
  await expect(page.locator('#cloudModal')).toBeVisible();
  await expect(page.locator('#cloudModal')).toHaveClass(/onb/);
});

test('ouverture : recharger la page ramène toujours sur la création de compte, sans rien écrire sur l’appareil', async ({ page }) => {
  await expect(page.locator('#cloudSignUp')).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.locator('#cloudModal')).toHaveClass(/onb/);
  await expect(page.locator('#cloudSignUp')).toBeVisible({ timeout: 15000 });
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('planning_resto')));
  expect(keys).toEqual([]);   // rien n'a été écrit sur l'appareil
});

test('mode démo : charge le planning de démonstration', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // L'écran de création de compte disparaît, le planning s'affiche avec l'établissement de démo
  await expect(page.locator('#restoName')).toContainText('Bistrot');
  await expect(page.locator('#cloudModal')).toBeHidden();
  // Les employés de démo sont bien rendus dans l'app
  await expect(page.getByText('Camille Durand').first()).toBeAttached();
});

test('confidentialité : le filigrane RGPD est inactif hors connexion', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // Sans compte connecté, pas de filigrane
  await expect(page.locator('body')).not.toHaveClass(/rgpd-on/);
});

test('démo : on peut quitter la démo et revenir à la création de compte', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // Le bandeau démo + le bouton Quitter apparaissent
  await expect(page.locator('#demoBanner')).toBeVisible();
  await expect(page.locator('#demoQuit')).toBeVisible();
  // Quitter la démo → retour à l'écran de création de compte (et le bandeau disparaît)
  await page.locator('#demoQuit').click();
  await expect(page.locator('#cloudModal')).toHaveClass(/onb/);
  await expect(page.locator('#demoBanner')).toBeHidden();
  await expect(page.locator('#cloudSignUp')).toBeVisible({ timeout: 15000 });
});

test('démo : éphémère — recharger après la démo ramène sur la création de compte', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await expect(page.locator('#demoBanner')).toBeVisible();
  await expect(page.locator('#demoSignup')).toBeVisible();      // bouton « Créer mon compte » dans le bandeau
  await page.reload();
  await expect(page.locator('#cloudModal')).toHaveClass(/onb/);
  await expect(page.locator('#cloudSignUp')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#demoBanner')).toBeHidden();
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('planning_resto') || k.startsWith('oplaa_estb_')));
  expect(keys).toEqual([]);   // la démo n'a rien laissé sur l'appareil
});

test('compte obligatoire : des données locales sans session ramènent sur l’identification, et la fenêtre ne se ferme pas', async ({ page }) => {
  // Un planning local « orphelin » (créé sans compte, ancienne version ou démo convertie) est présent sur l'appareil
  await page.evaluate(() => {
    localStorage.setItem('planning_resto_v4', JSON.stringify({ profile:'restaurant', restaurant:'Planning local', teams:[{key:'salle',label:'Salle',color:'#C4562F'}], periods:[], employees:[{id:'e1',name:'Léa',role:'salle',contract:'35h'}], shifts:[], notes:[] }));
  });
  await page.reload();
  await expect(page.locator('#cloudModal')).toHaveClass(/onb/);
  await expect(page.locator('#cloudSignIn, #cloudSignUp').first()).toBeVisible({ timeout: 15000 });
  // Impossible de fermer la fenêtre sans être rattaché à un établissement
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(page.locator('#cloudModal')).toBeVisible();
  await expect(page.locator('#cloudModal')).toHaveClass(/onb/);
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

test('équipes : on peut renommer / ajouter un segment d’équipe (via Réglages)', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.locator('#btnData').click();
  // L'édition des équipes se fait désormais dans la fenêtre Réglages (section Équipes inline)
  await page.locator('#btnSettings').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  const before = await page.evaluate(() => state.teams.length);
  // Ajoute une équipe et la nomme
  await page.locator('#addTeamRow').click();
  const lastLabel = page.locator('#setTeams .set-team .s-label').last();
  await lastLabel.fill('Terrasse');
  await page.locator('#settingsForm button[type="submit"]').click();
  await expect(page.locator('#settingsModal')).toBeHidden();
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

test('congés : un congé réduit les heures et est compté par type', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const res = await page.evaluate(() => {
    const e = state.employees[0];
    const before = empHours(e.id, [state.weekStart]).prevu;
    state.absences.push({ id: uid(), week: state.weekStart, empId: e.id, day: 0, type: 'conge' });
    const after = empHours(e.id, [state.weekStart]).prevu;
    const bd = absenceBreakdown(e.id, [state.weekStart]);
    const solde = congesSolde(e);
    return { before, after, congeCount: bd.by.conge || 0, total: bd.total, soldeLeft: solde.left, soldeAllow: solde.allow };
  });
  expect(res.after).toBeLessThan(res.before);   // le congé retire les heures du jour
  expect(res.congeCount).toBe(1);
  expect(res.total).toBe(1);
  expect(res.soldeLeft).toBe(res.soldeAllow - 1); // 1 congé décompté du solde
});

test('employé : heures libres (semaine/mois) + salaire mensuel calculé', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    // 120 h/mois à 15 €/h → ~1800 €/mois brut, ~27,69 h/semaine
    const e = { contractType: 'Temps partiel', hours: 120, hoursUnit: 'mois', rate: 15 };
    return { weekly: contractHours(e), monthly: Math.round(monthlyGross(e)), label: contractLabel(e) };
  });
  expect(r.monthly).toBe(1800);
  expect(r.weekly).toBeCloseTo(27.69, 1);
  expect(r.label).toContain('120 h/mois');
  expect(r.label).toContain('Temps partiel');
});

test('modèles de semaine : enregistrer puis appliquer sur une semaine vide', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const cur = state.weekStart;
    const n = weekShifts(cur).length;
    openTpl();
    document.getElementById('tplName').value = 'Semaine test';
    document.getElementById('tplSave').click();
    const tpl = state.weekTemplates[state.weekTemplates.length - 1];
    state.weekStart = isoDay(addDays(cur, 21)); saveQuiet();
    const before = weekShifts(state.weekStart).length;
    applyTemplate(tpl.id);
    const after = weekShifts(state.weekStart).length;
    return { saved: tpl.shifts.length, srcCount: n, before, after };
  });
  expect(r.saved).toBe(r.srcCount);
  expect(r.before).toBe(0);
  expect(r.after).toBe(r.saved);
});

test('service : dupliquer sur plusieurs jours en 1 clic', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const s = state.shifts.find(x => x.empId === state.employees[0].id);
    const before = state.shifts.filter(x => x.empId === s.empId && x.week === s.week).length;
    openShiftModal(s);
    document.getElementById('dupShiftBtn').click();        // ouvre le picker
    document.getElementById('dupDaysAll').click();         // toute la semaine
    const selected = document.querySelectorAll('#dupDaysChips .dup-day.bg-teal-600').length;
    document.getElementById('dupDaysGo').click();          // duplique
    const after = state.shifts.filter(x => x.empId === s.empId && x.week === s.week).length;
    return { selected, added: after - before };
  });
  expect(r.selected).toBe(6);        // 7 jours - le jour actuel (désactivé)
  expect(r.added).toBe(6);
});

test('envoi : WhatsApp disponible + numéro converti au format international', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({
    btn: !!document.getElementById('sendByWhatsApp'),
    fr: waNumber('06 12 34 56 78'),
    plus: waNumber('+33 6 12 34 56 78'),
  }));
  expect(r.btn).toBe(true);
  expect(r.fr).toBe('33612345678');
  expect(r.plus).toBe('33612345678');
});

test('planning : copier le planning d’un employé vers un autre', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const wk = state.weekStart;
    const from = state.employees.find(e => state.shifts.some(s => s.week === wk && s.empId === e.id));
    const to = state.employees.find(e => e.id !== from.id);
    const srcCount = state.shifts.filter(s => s.week === wk && s.empId === from.id).length;
    openCopyPlan();
    document.getElementById('copyPlanFrom').value = from.id;
    document.getElementById('copyPlanTo').value = to.id;
    document.getElementById('copyPlanReplace').checked = true;
    document.getElementById('copyPlanGo').click();
    const toAfter = state.shifts.filter(s => s.week === wk && s.empId === to.id).length;
    return { srcCount, toAfter };
  });
  expect(r.srcCount).toBeGreaterThan(0);
  expect(r.toAfter).toBe(r.srcCount);
});

test('planning : vue « par employé » (une ligne par personne)', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    setGroup('employe');
    const header = document.querySelector('#gridHead th')?.innerText;
    const firstRowLabel = document.querySelector('#gridBody tr td')?.innerText.split('\n')[0];
    const empCells = document.querySelectorAll('#gridBody td[data-add-emp]').length;
    return { header, firstRowLabel, empCells, group: state.gridGroup };
  });
  expect(r.header).toBe('EMPLOYÉ');
  expect(r.empCells).toBeGreaterThan(0);
  expect(r.group).toBe('employe');
  // Les 1res lignes sont des noms d'employés (pas des noms d'équipe)
  expect(r.firstRowLabel).toBeTruthy();
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

test('export comptable : 3 feuilles au format Combo (72 colonnes, TOTAL en formules)', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const d = buildComptaExport(weeksOfScope());
    const sections = d.synth[0].filter(Boolean);
    const total = d.synth[d.synth.length - 1];
    return { cols: d.synth[1].length, sections: sections.length, firstCol: d.synth[1][0], lastCol: d.synth[1][71], rows: d.synth.length - 3,
      totalLabel: total[1], totalIsFormula: typeof total[9] === 'object' && /^SUM\(/.test(total[9].f), evpHead: d.evp[0].length, absHead: d.absRows[0].length,
      buttons: !!document.getElementById('btnSuiviXlsx') && !!document.getElementById('btnImportCombo') };
  });
  expect(r.cols).toBe(72);
  expect(r.sections).toBe(7);
  expect(r.firstCol).toBe('Nom');
  expect(r.lastCol).toBe('Avance sur salaire ');
  expect(r.rows).toBeGreaterThan(0);
  expect(r.totalLabel).toBe('TOTAL');
  expect(r.totalIsFormula).toBe(true);
  expect(r.evpHead).toBe(7);
  expect(r.absHead).toBe(9);
  expect(r.buttons).toBe(true);
});

test('équipe : une fiche employé se saisit avec prénom et nom séparés', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  // Les fiches existantes sont découpées automatiquement
  const parts = await page.evaluate(() => { const e = state.employees.find(x => x.name === 'Camille Durand'); return [e.firstName, e.lastName]; });
  expect(parts).toEqual(['Camille', 'Durand']);
  // Nouvelle fiche : deux champs, le nom complet affiché est « Prénom Nom »
  await page.locator('.tab-btn[data-view="equipe"]:visible').first().click();
  await page.locator('#addEmpHeaderBtn').click();
  await expect(page.locator('#empFirstName')).toBeVisible();
  await page.locator('#empFirstName').fill('Marie Anne');
  await page.locator('#empLastName').fill('Dupont');
  // Arrivée / départ de l'entreprise : visibles directement dans la fiche (purement informatif)
  await expect(page.locator('#empStart')).toBeVisible();
  await expect(page.locator('#empEnd')).toBeVisible();
  await page.locator('#empStart').fill('2026-03-02');
  await page.locator('#empEnd').fill('2026-02-01');
  await page.locator('#empForm button[type="submit"]').click();
  await expect(page.locator('#empModal')).toBeVisible();                 // sortie avant l'entrée → refusé
  await page.locator('#empEnd').fill('2026-11-30');
  await page.locator('#empForm button[type="submit"]').click();
  const saved = await page.evaluate(() => { const e = state.employees.find(x => x.lastName === 'Dupont'); return e && [e.name, e.firstName, e.lastName, e.startDate, e.endDate]; });
  expect(saved).toEqual(['Marie Anne Dupont', 'Marie Anne', 'Dupont', '2026-03-02', '2026-11-30']);
  await expect(page.getByText('Arrivée le 02/03/2026 · Départ le 30/11/2026').first()).toBeAttached();
  await expect(page.getByText('Marie Anne Dupont').first()).toBeAttached();
});

test('planning : les alertes légales s’affichent (repos < 11 h) et se désactivent dans les réglages', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.evaluate(() => {
    const e = state.employees[0]; const w = state.weekStart;
    state.shifts = state.shifts.filter(s => s.empId !== e.id);
    state.shifts.push({ id: 'tA', week: w, day: 0, team: e.role, period: 'soir', start: '18:00', end: '23:30', breaks: [], empId: e.id });
    state.shifts.push({ id: 'tB', week: w, day: 1, team: e.role, period: 'midi', start: '07:00', end: '12:00', breaks: [], empId: e.id });
    renderAll();
  });
  await expect(page.locator('#legalBanner')).toBeVisible();
  await expect(page.locator('#legalBanner')).toContainText('Repos de 7,5 h');
  await expect(page.locator('#legalBanner')).toContainText(/alertes? légales?/);
  // Désactivation dans Réglages → Règles
  await page.evaluate(() => openSettings());
  await page.locator('#setLegalOn').uncheck();
  await page.locator('#settingsForm button[type="submit"], #saveSettings').first().click();
  await expect(page.locator('#legalBanner')).toBeHidden();
});

test('compteurs : congés acquis / pris / solde dans l’équipe et « Mes compteurs » dans l’espace employé', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.locator('.tab-btn[data-view="equipe"]:visible').first().click();
  await expect(page.locator('#view-equipe')).toContainText(/j acquis · \d+ pris · solde/);
  await page.evaluate(() => { setView('employe'); renderEmploye(); });
  await expect(page.locator('#empCounters')).toContainText('Mes compteurs');
  await expect(page.locator('#empCounters')).toContainText('congés disponibles');
  await expect(page.locator('#empCounters')).toContainText('ce mois');
});

test('primes / avances : saisie dans le Suivi et reprise dans l’export comptable', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await page.locator('.tab-btn[data-view="suivi"]:visible').first().click();
  await page.locator('.payItemsBtn').first().click();
  await expect(page.locator('#payItemModal')).toBeVisible();
  await page.locator('#payItemCode').selectOption('prime_exceptionnelle');
  await page.locator('#payItemAmount').fill('150');
  await page.locator('#payItemForm button[type="submit"]').click();
  await expect(page.locator('#payItemList')).toContainText('150 €');
  await page.locator('#payItemCode').selectOption('avance');
  await page.locator('#payItemAmount').fill('200');
  await page.locator('#payItemForm button[type="submit"]').click();
  await expect(page.locator('#payItemList')).toContainText('Total du mois : 350 €');
  await page.locator('.closePayItem').click();
  await expect(page.locator('.payItemsBtn').first()).toHaveText('350 €');
  // Export comptable du mois : la ligne de l'employé porte bien les montants dans les colonnes Combo
  const cells = await page.evaluate(() => {
    const emp = activeEmployees()[0]; setScope('mois');
    const d = buildComptaExport(weeksOfScope()); const hdr = d.synth[1];
    const row = d.synth.slice(2).find(r => r[hdr.indexOf('Prénom')] === nameParts(emp).prenom || r[hdr.indexOf('Nom')] === nameParts(emp).nom.toUpperCase());
    return { prime: row[hdr.indexOf('Prime exceptionnelle')], avance: row[hdr.indexOf('Avance sur salaire ')], evp: d.evp.filter(r => r[3] === 'Prime exceptionnelle' || r[3] === 'Avance sur salaire').length };
  });
  expect(cells.prime).toBe(150); expect(cells.avance).toBe(200); expect(cells.evp).toBe(2);
});

test('planning : bouton « Publier » (démo : simulation, mention « Pas encore publié »)', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  await expect(page.locator('#btnPublish')).toBeVisible();
  await expect(page.locator('#publishedAt')).toHaveText('Pas encore publié');
  await page.locator('#btnPublish').click();
  await expect(page.locator('#toast')).toContainText('Mode démo');
});

test('sécurité : les données reçues du cloud sont assainies avant affichage (heures, couleurs, libellés)', async ({ page }) => {
  await page.locator('#welcomeDemo').click();
  const r = await page.evaluate(() => {
    window.__pwned = 0;
    const s = { teams:[{ key:'x', label:'<img src=x onerror="window.__pwned=1">Salle', color:'red;background:url(x)' }],
      periods:[{ key:'p', label:'Midi<script>', start:'11:00<b>', end:'15:00' }],
      shifts:[{ start:'<svg onload=1>', end:'23:00', team:'x', period:'p' }], employees:[{ name:'Jo<script>alert(1)</script>', firstName:"L'Atelier" }] };
    sanitizeState(s);
    return { label:s.teams[0].label, color:s.teams[0].color, pstart:s.periods[0].start, sstart:s.shifts[0].start, name:s.employees[0].name, apos:s.employees[0].firstName };
  });
  expect(r.label).not.toContain('<');
  expect(r.color).toBe('#64748b');
  expect(r.pstart).toBe('09:00');
  expect(r.sstart).toBe('09:00');
  expect(r.name).not.toContain('<');
  expect(r.apos).toBe("L'Atelier");
  expect(await page.evaluate(() => window.__pwned)).toBe(0);
  const code = await page.evaluate(() => randCode());
  expect(code).toMatch(/^[A-Z0-9]{10}$/);
});

// ── Abonnement (désactivé en production : ces tests l'activent avec un faux module d'achat) ──
const fakePurchases = () => {
  window.__OPLAA_SUB_TEST = true;
  const rc = (window.__rc = { logIn: [], purchased: null, active: false });
  window.Purchases = {
    configure: async () => {},
    getCustomerInfo: async () => ({ customerInfo: { entitlements: { active: rc.active ? { pro: { expirationDate: '2028-01-01' } } : {} } } }),
    getOfferings: async () => ({ current: { availablePackages: [
      { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { priceString: '19,99 €' } },
      { identifier: '$rc_annual', packageType: 'ANNUAL', product: { priceString: '199,99 €' } } ] } }),
    logIn: async (o) => { rc.logIn.push(o.appUserID); }, logOut: async () => {},
    purchasePackage: async (o) => { rc.purchased = o.aPackage.identifier; rc.active = true; },
    restorePurchases: async () => {},
  };
};
const expiredTrial = () => { try { localStorage.setItem('oplaa_trial_start', String(Date.now() - 40 * 86400000)); } catch (e) {} };
const EST = '11111111-2222-3333-4444-555555555555';

test('abonnement : essai expiré → paywall mensuel / annuel, achat rattaché à l’établissement, accès rétabli', async ({ page }) => {
  await page.addInitScript(fakePurchases); await page.addInitScript(expiredTrial);
  await page.goto('/');
  await page.locator('#welcomeDemo').click();
  expect(await page.evaluate(() => isPro())).toBe(true);                  // la démo n'est jamais bridée
  // Établissement réel créé il y a longtemps (avant le lancement) mais essai terminé : on simule une date de lancement passée
  await page.evaluate((est) => { state.demo = false; cloudMembership = { role: 'owner', establishment_id: est, establishments: { name: 'Test', created_at: '2020-01-01T00:00:00Z' } }; }, EST);
  await page.evaluate(() => { localStorage.setItem('oplaa_trial_start', String(Date.now() - 40 * 86400000)); });
  const left = await page.evaluate(() => trialDaysLeft());
  if (left > 0) await page.evaluate(() => { cloudMembership.establishments.created_at = null; });   // PRO_LAUNCH futur → repli sur l'essai local expiré
  expect(await page.evaluate(() => ensurePro())).toBe(false);
  await expect(page.locator('#paywallModal')).toBeVisible();
  await expect(page.locator('#paywallNative')).toBeVisible();
  await expect(page.locator('#paywallWeb')).toBeHidden();
  await expect(page.locator('#planMonthlyPrice')).toHaveText('19,99 €');
  await expect(page.locator('#planAnnualPrice')).toHaveText('199,99 €');
  await expect(page.locator('#planMonthly')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#planAnnual').click();
  await expect(page.locator('#planAnnual')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#paywallBuy').click();
  await expect(page.locator('#paywallModal')).toBeHidden();
  expect(await page.evaluate(() => window.__rc.purchased)).toBe('$rc_annual');
  expect(await page.evaluate(() => window.__rc.logIn)).toContain('est_' + EST);   // l'abonnement appartient à l'établissement
  expect(await page.evaluate(() => isPro())).toBe(true);
});

test('abonnement : un employé n’est jamais bridé', async ({ page }) => {
  await page.addInitScript(fakePurchases); await page.addInitScript(expiredTrial);
  await page.goto('/');
  await page.locator('#welcomeDemo').click();
  await page.evaluate((est) => { state.demo = false; cloudMembership = { role: 'employee', establishment_id: est, establishments: { name: 'Test' } }; }, EST);
  expect(await page.evaluate(() => isPro())).toBe(true);
});

test('abonnement : sur le web (sans module d’achat), le paywall renvoie vers l’app iPhone', async ({ page }) => {
  await page.addInitScript(() => { window.__OPLAA_SUB_TEST = true; }); await page.addInitScript(expiredTrial);
  await page.goto('/');
  await page.locator('#welcomeDemo').click();
  await page.evaluate(() => { state.demo = false; });
  expect(await page.evaluate(() => ensurePro())).toBe(false);
  await expect(page.locator('#paywallWeb')).toBeVisible();
  await expect(page.locator('#paywallWeb')).toContainText('iPhone');
  await expect(page.locator('#paywallNative')).toBeHidden();
});

test('abonnement : désactivé par défaut → rien n’est bridé', async ({ page }) => {
  await page.addInitScript(expiredTrial);
  await page.goto('/');
  await page.locator('#welcomeDemo').click();
  await page.evaluate(() => { state.demo = false; });
  expect(await page.evaluate(() => ensurePro())).toBe(true);
  await expect(page.locator('#paywallModal')).toBeHidden();
});
