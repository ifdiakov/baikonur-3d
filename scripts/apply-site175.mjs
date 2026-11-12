import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
const version='20261112-site175-shpu-v1';
function edit(path,fn){const old=read(path,'utf8'),next=fn(old);if(next!==old)write(path,next);}
// A rendering correction must not silently re-route the road network.
edit('src/silo-sites.js',s=>{
 if(s.includes('SILO_ROAD_SITE_IDS'))return s;
 return s.replace('export const SILO_SITE_IDS=', 'export const SILO_ROAD_SITE_IDS=')+`\n// Owner correction: site 175 uses the existing exterior silo exhibit.\n// Keep pre-existing automatic road ports stable; no road edit was requested.\nexport const SILO_SITE_IDS=Object.freeze([...SILO_ROAD_SITE_IDS,'pad-175']);\n`;
});
edit('src/facility-ports.js',s=>s.replace('import {SILO_SITE_IDS}', 'import {SILO_ROAD_SITE_IDS as SILO_SITE_IDS}'));
for(const path of ['src/archive-manifest.js','src/model-catalog.js','src/facility-ports.js'])edit(path,s=>s.replace(/(silo-sites\.js\?v=)[\w.-]+/g,'$1'+version));
edit('src/archive-models.js',s=>s.replace(/(archive-manifest\.js\?v=)[\w.-]+/g,'$1'+version));
for(const path of ['index.html','museum.html','workshop.html'])edit(path,s=>s.replace(/((?:archive-models\.js|archive-manifest\.js|model-catalog\.js|catalog\.json)\?v=)[\w.-]+/g,'$1'+version));
edit('data/catalog.json',s=>{
 const c=JSON.parse(s),p=c.sites.find(p=>p.id==='pad-175');assert(p,'Missing site175');
 Object.assign(p,{titleShort:'ШПУ',titleFull:'пл. №175 · Шахтная пусковая установка',purpose:'Шахтная пусковая установка; исторический комплекс конверсионных космических пусков',purposeShort:'Шахтная пусковая установка',purposeLong:'Шахтная пусковая установка; исторический комплекс конверсионных космических пусков',modelTypeOwnerConfirmed:'launch-silo',modelStatus:'Тип модели уточнён владельцем: ШПУ. Использован общий музейный внешний облик шахты; точное инженерное устройство и историческая комплектация площадки не воспроизводятся.'});
 return JSON.stringify(c,null,2)+'\n';
});
edit('tests/all-silos-geometry.mjs',s=>s.replace('SILO_SITE_IDS.length,31','SILO_SITE_IDS.length,32').replace('Object.keys(shader.uniforms).length,31','Object.keys(shader.uniforms).length,SILO_SITE_IDS.length').replace('any of the 31 shafts','any shaft'));
edit('tests/silo-browser.mjs',s=>s.replace('result.length,31','result.length,SILO_SITE_IDS.length'));
assert.equal(read('index.html','utf8'),read('museum.html','utf8'));
console.log('SITE175_SHPU_PREPARED');
