// Rend les posters HTML en PNG (tailles App Store). Usage : node appstore/render.mjs [nom...]
import { chromium } from '@playwright/test'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['1-planning','2-employe','3-feuille','4-suivi','5-conges','6-acces'];
const sets = [ ['p65', 1284, 2778, 'oplaa'], ['p69', 1320, 2868, 'oplaa69'] ];
const b = await chromium.launch(); const pg = await b.newPage();
for (const [pre, w, h, out] of sets) for (const n of names) {
  const f = path.join(dir, 'screenshots', `${pre}_${n}.html`); if (!fs.existsSync(f)) continue;
  await pg.setViewportSize({ width: w, height: h }); await pg.goto('file://' + f); await pg.waitForTimeout(1200);
  const o = path.join(dir, 'screenshots', `${out}-${n}.png`); await pg.screenshot({ path: o, clip: { x: 0, y: 0, width: w, height: h } }); console.log('✓', path.basename(o), `${w}×${h}`);
}
await b.close();
