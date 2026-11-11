// Audit d'accessibilité d'Oplaa — parcourt les écrans et toutes les fenêtres de l'app (format iPhone),
// passe axe-core (WCAG 2.x A/AA) et deux contrôles maison : nom accessible de chaque bouton, taille des cibles tactiles.
// Usage : node tests/a11y/audit.mjs [--json rapport.json]
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../www');
const axeSrc = fs.readFileSync(path.resolve(root, '../node_modules/axe-core/axe.min.js'), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = 'http://localhost:' + server.address().port + '/';

const MIN_TARGET = 44;   // recommandation Apple (points) pour une cible tactile
const MODALS = ['shiftModal','empModal','absModal','noteModal','confModal','settingsModal','historyModal','dupModal','tplModal','copyPlanModal',
  'sendEmpModal','sheetModal','accessModal','estbModal','importModal','offInboxModal','offReqModal','profileModal','teamsModal','paywallModal','onboardModal','wizardModal','payItemModal'];
const OPENERS = { shiftModal:'openShiftModal', empModal:'openEmpModal', absModal:'openAbsModal', noteModal:'openNoteModal', settingsModal:'openSettings',
  historyModal:'openHistory', dupModal:'openDup', tplModal:'openTpl', copyPlanModal:'openCopyPlan', sheetModal:'openSheet', accessModal:'openAccess',
  estbModal:'openEstb', offInboxModal:'openOffInbox', profileModal:'openProfileModal', teamsModal:'openTeams', paywallModal:'openPaywall',
  onboardModal:'openOnboard', wizardModal:'openWizard', payItemModal:'openPayItems' };

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('oplaa_onboarded', '1'); } catch (e) {} });
  await page.goto(base); await page.waitForSelector('#cloudSignUp', { state: 'visible', timeout: 20000 });
  return { ctx, page };
}
async function demo(page) { await page.locator('#welcomeDemo').click(); await page.waitForSelector('#demoBanner', { state: 'visible' }); await page.waitForTimeout(300); }

// Contrôles exécutés dans la page, limités à `scope` (sélecteur) et aux éléments réellement visibles.
async function inspect(page, scope) {
  await page.evaluate(axeSrc);
  return page.evaluate(async ({ scope, MIN_TARGET }) => {
    const rootEl = document.querySelector(scope) || document.body;
    const visible = el => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[hidden]'); };
    const sel = el => el.id ? '#' + el.id : (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    const nameOf = el => {
      const lab = el.getAttribute('aria-label'); if (lab && lab.trim()) return lab.trim();
      const by = el.getAttribute('aria-labelledby'); if (by) { const t = by.split(/\s+/).map(i => (document.getElementById(i) || {}).textContent || '').join(' ').trim(); if (t) return t; }
      if (el.matches('input,select,textarea')) {
        if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l && l.textContent.trim()) return l.textContent.trim(); }
        const wrap = el.closest('label'); if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
        if (el.type === 'submit' || el.type === 'button') return (el.value || '').trim();
        return '';   // un placeholder ou un title ne suffit pas comme nom de champ
      }
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim(); if (txt && /[\p{L}\p{N}]/u.test(txt)) return txt;
      const img = el.querySelector('img[alt],svg[aria-label]'); if (img) return (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
      return (el.getAttribute('title') || '').trim() ? '' : '';   // title seul : insuffisant pour VoiceOver sur iOS
    };
    const els = Array.from(rootEl.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, summary')).filter(visible);
    const noName = [], small = [];
    for (const el of els) {
      if (el.disabled) continue;
      const r0 = el.getBoundingClientRect();
      // zone de toucher effective : l'app agrandit les petites cibles avec un ::after invisible centré
      const af = getComputedStyle(el, '::after'); const hasHit = af && af.content !== 'none' && af.position === 'absolute';
      const r = { width: hasHit ? Math.max(r0.width, parseFloat(af.width) || 0) : r0.width, height: hasHit ? Math.max(r0.height, parseFloat(af.height) || 0) : r0.height };
      // case à cocher / bouton radio : la zone de toucher réelle est son libellé (cliquable en entier)
      if (el.matches('input[type=checkbox],input[type=radio]')) { const lab = el.closest('label') || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')); if (lab) { const lr = lab.getBoundingClientRect(); r.width = Math.max(r.width, lr.width); r.height = Math.max(r.height, lr.height); } }
      const nm = nameOf(el);
      if (!nm) noName.push({ sel: sel(el), tag: el.tagName.toLowerCase(), type: el.type || '', title: el.getAttribute('title') || '', html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 110) });
      const isText = el.matches('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]), select, textarea');
      const minH = isText ? 40 : MIN_TARGET, minW = isText ? 40 : MIN_TARGET;
      if (r.height < minH - 0.5 || r.width < minW - 0.5) small.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), name: (nm || el.getAttribute('title') || '').slice(0, 30) });
    }
    const ax = await window.axe.run(rootEl, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    const violations = ax.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, ex: v.nodes.slice(0, 4).map(n => n.target.join(' ') + (n.any && n.any[0] && n.any[0].data && n.any[0].data.contrastRatio ? ' (' + n.any[0].data.contrastRatio + ':1, attendu ' + n.any[0].data.expectedContrastRatio + ')' : '')) }));
    const pairs = {};
    for (const v of ax.violations) if (v.id === 'color-contrast') for (const n of v.nodes) { const d = n.any && n.any[0] && n.any[0].data; if (d) { const k = d.fgColor + ' sur ' + d.bgColor + ' (' + d.contrastRatio + ':1, attendu ' + d.expectedContrastRatio + ')'; pairs[k] = (pairs[k] || 0) + 1; } }
    return { controls: els.length, noName, small, violations, pairs };
  }, { scope, MIN_TARGET });
}

const browser = await chromium.launch();
const report = [];
const add = (scene, r) => { report.push({ scene, ...r }); };

// 1) Première ouverture : création de compte, connexion, écrans code / nouveau mot de passe / dernière étape
{ const { ctx, page } = await fresh(browser);
  add('ouverture · créer mon compte', await inspect(page, '#cloudModal'));
  await page.locator('#cloudAuthSwitch').click();
  add('ouverture · connexion', await inspect(page, '#cloudModal'));
  for (const st of ['cloudCode', 'cloudRecover', 'cloudOnboard', 'cloudMember']) {
    await page.evaluate(s => { showCloudState(s); if (s === 'cloudRecover') document.getElementById('cloudCodeBox').hidden = false; }, st);
    add('fenêtre compte · ' + st, await inspect(page, '#cloudModal'));
  }
  await ctx.close(); }

// 2) Démo : les 4 onglets, le menu, puis chaque fenêtre
{ const { ctx, page } = await fresh(browser); await demo(page);
  for (const v of ['planning', 'equipe', 'suivi', 'conformite']) {
    await page.locator(`.btab[data-view="${v}"]`).click(); await page.waitForTimeout(250);
    add('onglet · ' + v, await inspect(page, 'body'));
  }
  await page.locator('.btab[data-view="planning"]').click();
  await page.evaluate(() => document.getElementById('dataMenu').classList.remove('hidden')); await page.waitForTimeout(100);
  add('menu ⋯', await inspect(page, '#dataMenu'));
  await page.evaluate(() => document.getElementById('dataMenu').classList.add('hidden'));
  for (const id of MODALS) {
    const how = await page.evaluate(({ id, fn }) => {
      document.querySelectorAll('[id$="Modal"]').forEach(m => { m.classList.add('hidden'); m.classList.remove('flex'); });
      let via = 'forcé';
      try { if (fn && typeof window[fn] === 'function') { const a = (id === 'absModal' || id === 'profileModal' || id === 'confModal' || id === 'sendEmpModal' || id === 'payItemModal') ? [state.employees[0] && state.employees[0].id] : []; window[fn](...a); via = fn + '()'; } } catch (e) { via = 'forcé (' + e.message.slice(0, 40) + ')'; }
      const m = document.getElementById(id); if (m.classList.contains('hidden')) { m.classList.remove('hidden'); m.classList.add('flex'); if (via.endsWith('()')) via += ' + forcé'; }
      return via;
    }, { id, fn: OPENERS[id] });
    await page.waitForTimeout(200);
    add('fenêtre · ' + id + ' [' + how + ']', await inspect(page, '#' + id));
  }
  await ctx.close(); }

await browser.close(); server.close();

// ---- Synthèse
const out = { date: new Date().toISOString(), scenes: report };
const j = process.argv.indexOf('--json'); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1));
const uniq = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); if (!m.has(k)) m.set(k, x); } return [...m.values()]; };
const allNo = uniq(report.flatMap(s => s.noName.map(x => ({ ...x, scene: s.scene }))), x => x.html);
const allSmall = uniq(report.flatMap(s => s.small.map(x => ({ ...x, scene: s.scene }))), x => x.sel + x.w + 'x' + x.h);
const byRule = new Map();
for (const s of report) for (const v of s.violations) { const e = byRule.get(v.id) || { impact: v.impact, help: v.help, n: 0, scenes: new Set(), ex: [] }; e.n += v.n; e.scenes.add(s.scene); for (const x of v.ex) if (e.ex.length < 6 && !e.ex.includes(x)) e.ex.push(x); byRule.set(v.id, e); }
console.log(`Scènes auditées : ${report.length} · contrôles interactifs vus : ${report.reduce((a, s) => a + s.controls, 0)}`);
console.log(`\n== Contrôles SANS nom accessible : ${allNo.length}`);
for (const x of allNo.slice(0, 60)) console.log(`  [${x.scene}] ${x.sel}${x.title ? ' (title="' + x.title + '")' : ''}  ${x.html}`);
console.log(`\n== Cibles tactiles < ${MIN_TARGET} pt (champs < 40) : ${allSmall.length}`);
for (const x of allSmall.slice(0, 80)) console.log(`  [${x.scene}] ${x.sel} ${x.w}×${x.h} ${x.name ? '« ' + x.name + ' »' : ''}`);
console.log(`\n== Règles axe (WCAG A/AA) en infraction : ${byRule.size}`);
for (const [id, e] of [...byRule].sort((a, b) => b[1].n - a[1].n)) { console.log(`  ${id} [${e.impact}] ×${e.n} — ${e.help} — ${e.scenes.size} scène(s)`); for (const x of e.ex) console.log('      ' + x); }
const pairs = {}; for (const s of report) for (const [k, n] of Object.entries(s.pairs || {})) pairs[k] = (pairs[k] || 0) + n;
console.log(`\n== Contrastes insuffisants par couple de couleurs : ${Object.keys(pairs).length}`);
for (const [k, n] of Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ×${n}  ${k}`);
process.exitCode = (allNo.length || [...byRule.values()].some(e => e.impact === 'critical' || e.impact === 'serious')) ? 1 : 0;
