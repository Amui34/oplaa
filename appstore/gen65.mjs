import fs from 'fs';
const html = fs.readFileSync('appstore-visuals.html','utf8');
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const symbol = html.match(/<svg width="0" height="0"[\s\S]*?<\/svg>/)[0];
const shots=[]; let i=0;
while(true){ const s=html.indexOf('<div class="shot',i); if(s<0)break; let d=0,j=s;
  while(j<html.length){ if(html.startsWith('<div',j)){d++;j+=4;continue;} if(html.startsWith('</div>',j)){d--;j+=6;if(d===0)break;continue;} j++; }
  shots.push(html.slice(s,j)); i=j; }
const names=['1-planning','2-employe','3-feuille','4-suivi','5-conges'];
shots.forEach((shot,k)=>{ const page=`<!doctype html><html><head><meta charset="utf8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap" rel="stylesheet">
${style}
<style>html,body{margin:0;background:#fff}
#stage{width:1284px;height:2778px;overflow:hidden;background:#fff}
#stage .shot{width:300px;height:649.07px;transform:scale(4.28);transform-origin:0 0;border-radius:0;box-shadow:none}
</style></head><body>${symbol}<div id="stage">${shot}</div></body></html>`;
  fs.writeFileSync(`screenshots/p65_${names[k]}.html`, page); });
console.log('posters 6.5" générés:', shots.length);
