// Extrait les fonctions de calcul PURES depuis www/index.html (source unique, sans dupliquer le code).
// Toutes ces fonctions tiennent sur une seule ligne → extraction fiable par nom.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../www/index.html'), 'utf8');

export const CORE_FUNCTIONS = [
  'mondayOf','isoDay','addDays','toMin','addMin','hoursBetween',
  'breakMinutes','shiftHours','realHours','shiftSpan','coversLunch',
  'easterDate','frHolidays','isHoliday',
];

let src = '';
for (const name of CORE_FUNCTIONS) {
  const m = html.match(new RegExp('^function ' + name + '\\(.*$', 'm'));
  if (!m) throw new Error('Fonction pure introuvable dans index.html : ' + name);
  src += m[0] + '\n';
}
src += 'return {' + CORE_FUNCTIONS.join(',') + '};';

// eslint-disable-next-line no-new-func
const core = new Function(src)();
export default core;
