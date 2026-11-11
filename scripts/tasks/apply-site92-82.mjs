import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const edit=(path,fn)=>{const before=readFileSync(path,'utf8'),after=fn(before);writeFileSync(path,after);};
edit('src/archive-buildings.js',s=>{
 if(s.includes('detailSite92Hall'))return s;
 s="import {detailSite92Hall,SITE92_VERSION} from './site92-detail.js?v=20261111-v2';\nexport {buildSite82} from './site82.js?v=20261111-v1';\n"+s;
 const a="return k.hall({x,z,w:w*.6,d:d*.6,h,yaw:imageAxisYaw([0,0],[260,198]),...opts});";
 assert(s.includes(a));s=s.replace(a,"const hall=k.hall({x,z,w:w*.6,d:d*.6,h,yaw:imageAxisYaw([0,0],[260,198]),...opts});detailSite92Hall(k,hall,{w:w*.6,d:d*.6,h,main:!!opts.monitor});return hall;");
 const b="root.userData.tracedAxes=[{part:'two-main-halls',a:[580,280],b:[838,478]}];return k.finish();";assert(s.includes(b));s=s.replace(b,"root.userData.tracedAxes=[{part:'two-main-halls',a:[580,280],b:[838,478]}];root.userData.site92Model={version:SITE92_VERSION,mainHalls:2,retainedBuildings:10,displayOffsetMap:[-5,-2.5]};return {...k.finish(),model:root.userData.site92Model};");return s;
});
edit('src/archive-models.js',s=>s.replace("const builders={site113:","const builders={buried82:buildings.buildSite82,site113:").replaceAll('archive-buildings.js?v=20261109-site95-courtyards-v2','archive-buildings.js?v=20261111-site92-82-v1').replaceAll('archive-manifest.js?v=20261111-site118-v2','archive-manifest.js?v=20261111-site92-82-v1'));
edit('src/archive-manifest.js',s=>s.includes("kind:'buried82'")?s:s.replace('export const ARCHIVE_MAP=[',"export const ARCHIVE_MAP=[\n {id:'pad-82',kind:'buried82',title:'Заглублённое сооружение · пл.82',scale:MUSEUM_METRE,yaw:0,elevation:-2.755,orientation:'owner-directed-buried-structure',modelVersion:'20261111-site82-buried-v1'},"));
edit('src/osm-geography.js',s=>s.includes("'pad-92': Object.freeze([-5,-2.5])")?s:s.replace("export const MUSEUM_DISPLAY_OFFSETS = Object.freeze({","export const MUSEUM_DISPLAY_OFFSETS = Object.freeze({\n  'pad-92': Object.freeze([-5,-2.5]),"));
for(const file of ['index.html','museum.html','workshop.html'])edit(file,s=>{
 s=s.replaceAll('archive-models.js?v=20261111-site118-v2','archive-models.js?v=20261111-site92-82-v1').replaceAll('osm-geography.js?v=20261108-pad202-204-shifts-v4','osm-geography.js?v=20261111-site92-offset-v1');
 if(!s.includes('applySite82Ground')){
  s=s.replace("import * as THREE from 'three';","import {applySite82Ground} from './src/site82.js?v=20261111-v1';\nimport * as THREE from 'three';");
  const marker='// DETAIL_FIDELITY_V2';assert(s.includes(marker));s=s.replace(marker,"applySite82Ground(objects.find(o=>o.record.id==='pad-82')?.g,{referenceMaterial:satelliteGround.material,steppeSurface,width:W*S,height:H*S,flankDistricts});\n"+marker);
 }
 assert(s.includes('import {applySite82Ground}'));return s;
});
const c=JSON.parse(readFileSync('data/catalog.json'));const p=c.sites.find(s=>s.id==='pad-82');p.titleShort='Заглублённое сооружение';p.titleFull='пл. №82 · Заглублённое сооружение';p.modelStatus='Заглублённый тип сооружения — по указанию владельца. Геометрия и размеры музейно-интерпретационные; отдельное историческое назначение требует подтверждения.';writeFileSync('data/catalog.json',JSON.stringify(c,null,2)+'\n');
assert.equal(readFileSync('index.html','utf8'),readFileSync('museum.html','utf8'));
console.log('SITE92_82_PREPARED');
