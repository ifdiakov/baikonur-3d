import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const version='20261112-remove-groups-v1';
for(const path of ['index.html','museum.html','workshop.html']){
 let s=readFileSync(path,'utf8');
 if(s.includes('// OWNER_REMOVED_MAP_GROUPS_V1'))continue;
 const anchor='const sites=siteRecords.map(s=>[s.name,s.x,s.y,s.model,s.firstYear]);';
 assert(s.includes(anchor),'Missing display boundary: '+path);
 s=s.replace(anchor,`// OWNER_REMOVED_MAP_GROUPS_V1: keep transport anchors and legacy seeds unchanged.\nconst displayedSiteRecords=visibleMapSites(siteRecords);\nconst originalSiteIndices=new Map(siteRecords.map((record,index)=>[record.id,index]));\nconst sites=displayedSiteRecords.map(s=>[s.name,s.x,s.y,s.model,s.firstYear]);`);
 const moduleMarker="import * as THREE from 'three';";assert(s.includes(moduleMarker));
 s=s.replace(moduleMarker,`import {visibleMapSites} from './src/map-visible-sites.js?v=${version}';\n`+moduleMarker);
 assert(s.includes('const seed=(i*17)%11;'));
 s=s.replace('const seed=(i*17)%11;','const seed=(originalSiteIndices.get(displayedSiteRecords[i].id)*17)%11;');
 // Picking indices stay dense; retained records keep their original model seed.
 const begin=s.indexOf('function makeSite(s,i){'),end=s.indexOf('// Keep the introduction responsive',begin);
 assert(begin>0&&end>begin);
 let make=s.slice(begin,end).replaceAll('siteRecords[i]','displayedSiteRecords[i]');
 const old=make.indexOf(" if(displayedSiteRecords[i]?.id==='sector-nw2'){");
 if(old>=0){const next=make.indexOf(' g.traverse(m=>{if(m.isMesh&&m.userData.pickable!==false)',old);assert(next>old);make=make.slice(0,old)+make.slice(next);}
 s=s.slice(0,begin)+make+s.slice(end);
 writeFileSync(path,s);
}
assert.equal(readFileSync('index.html','utf8'),readFileSync('museum.html','utf8'));
const current='docs/CURRENT_WORK.md';
const text=readFileSync(current,'utf8');if(!text.includes('remove-map-groups-20261112.md'))writeFileSync(current,'## Текущая правка · удаление девяти условных групп\nПеречень, ограничения и фактический статус приёмки: `docs/tasks/remove-map-groups-20261112.md`. Служебные привязки дорог сохранены; группы исключаются до создания моделей и карточек. Готовность проверять по протоколам, не по наличию коммита.\n\n'+text);
console.log('MAP_GROUP_REMOVAL_PREPARED');
