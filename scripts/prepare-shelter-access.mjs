import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
const version='20261112-road-facing-v1';
function edit(path,fn){const before=read(path,'utf8'),after=fn(before);if(before!==after)write(path,after);}
function once(s,a,b){if(s.includes(b))return s;assert(s.includes(a),'Missing integration anchor '+a.slice(0,100));return s.replace(a,b);}
edit('src/archive-models.js',s=>{
 if(!s.includes('planShelterRoadAccess'))s="import {planShelterRoadAccess,buildShelterRoadAccess,shelterAccessView} from './shelter-road-access.js?v="+version+"';\n"+s;
 s=once(s,'referenceGroundMaterial,width,height})','referenceGroundMaterial,width,height,roadPaths=[]})');
 s=once(s,'  const built=buildArchiveModel(root,spec);',"  const accessPlan=spec.kind==='pantsir'?planShelterRoadAccess(root,spec.id,roadPaths):null;\n  if(accessPlan)root.rotation.y=accessPlan.yaw;\n  const built=buildArchiveModel(root,spec);\n  if(accessPlan)buildShelterRoadAccess(root,accessPlan);");
 s=s.replace(/(archive-manifest\.js\?v=|earth-covered-shelters\.js\?v=)[\w.-]+/g,'$1'+version);
 const old="  if(o.archive.kind==='pantsir'){const p=o.g.userData.pantsirModel,w=p.width/2+8;return fitArchiveView(o.g,{eye:[68,64,p.end+70],target:[0,-1,14],framePoints:[[-w,0,-p.depth/2-8],[w,3.2,-p.depth/2-8],[-w,0,p.end+8],[w,0,p.end+8]]},'all',camera,controls,'pantsirFraming');}";
 s=once(s,old,"  if(o.archive.kind==='pantsir')return fitArchiveView(o.g,shelterAccessView(o.g),'all',camera,controls,'pantsirFraming');");
 return s.replace('const entry={...spec,version:ARCHIVE_VERSION','const entry={...spec,yaw:root.rotation.y,version:ARCHIVE_VERSION');
});
edit('src/archive-manifest.js',s=>s.replace("title:'Панцирь · пл.'+n","title:'Заглублённое сооружение · пл.'+n"));
edit('src/earth-covered-shelters.js',s=>s.replace("material.name='Панцирь · общая текстура степи'","material.name='Сооружение · общая текстура степи'"));
edit('data/catalog.json',s=>{const c=JSON.parse(s);for(const n of [82,83]){const r=c.sites.find(o=>o.id==='pad-'+n);assert(r);Object.assign(r,{titleShort:'Заглублённое сооружение',titleFull:'пл. №'+n+' · Заглублённое сооружение',purposeShort:'Заглублённое сооружение',modelStatus:'Заглублённое сооружение с подъездом от существующей дороги. Геометрия и размеры — музейная интерпретация, не обмерная реконструкция.'});}return JSON.stringify(c,null,2)+'\n';});
for(const file of ['index.html','museum.html','workshop.html'])edit(file,s=>{
 s=once(s,'const portalArchive=installArchiveModels({objects,clickable,voids:', 'const portalArchive=installArchiveModels({objects,clickable,roadPaths:transport.roadPaths(),voids:');
 return s.replace(/((?:archive-models\.js|archive-manifest\.js|catalog\.json)\?v=)[\w.-]+/g,'$1'+version);
});
edit('tests/pantsirs-source.mjs',s=>s.replace("assert(r.titleFull.includes('Панцирь'))","assert(!/панцирь/i.test(r.titleFull));assert(r.titleFull.includes('Заглублённое сооружение'))"));
assert.equal(read('index.html','utf8'),read('museum.html','utf8'));
console.log('SHELTER_ACCESS_PREPARED: existing roads, worker and caches remain unchanged');
