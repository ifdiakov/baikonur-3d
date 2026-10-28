import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {ARCHIVE_MAP,ARCHIVE_GALLERY,EXISTING_ARCHIVE,PORTAL_ROOT} from '../src/archive-manifest.js';
import './patch-gagarin.mjs';
import './optimise-archive.mjs';
let h=readFileSync('index.html','utf8');
if(!h.includes('PORTAL_ARCHIVE_INTEGRATION')){
 h=h.replace("import {buildGagarinPad} from './src/gagarin-pad.js';", "import {buildGagarinPad,GAGARIN_RIM_Y} from './src/gagarin-pad.js?v=below-grade-portal-v1';\nimport {createTerrainVoids,gagarinVoid} from './src/terrain-voids.js';\nimport {installArchiveModels} from './src/archive-models.js';");
 h=h.replace('organisation-logos.js?v=20261028-catalog','organisation-logos.js?v=portal-partners-v1');
 h=h.replace('const groundMaterials=new Set();let ukssCutout=null;', 'const groundMaterials=new Set();let ukssCutout=null;const portalVoids=createTerrainVoids();let portalVoidsReady=false;');
 h=h.replace(' groundMaterials.add(mesh.material);', ' groundMaterials.add(mesh.material);\n if(portalVoidsReady)portalVoids.mask(mesh.material);');
 const anchor='padGroup.scale.setScalar(GAGARIN_SCALE);';assert.ok(h.includes(anchor));
 h=h.replace(anchor,anchor+`\n// Align the traced rim with the actual texture surface, not the deep background plane.
padGroup.position.y=-2.755-GAGARIN_RIM_Y*GAGARIN_SCALE;
padGroup.updateWorldMatrix(true,true);portalVoids.add(padGroup,gagarinVoid());`);
 const slot='// Coordinates are provisional — the numbered facility itself is documented.';assert.ok(h.includes(slot));
 h=h.replace(slot,slot+`\n// PORTAL_ARCHIVE_INTEGRATION: owner folder only; unlocated studies stay off the map.
const portalArchive=installArchiveModels({objects,clickable,voids:portalVoids});
portalVoidsReady=true;
for(const mat of groundMaterials)portalVoids.mask(mat);
for(const layer of [layers.roads,layers.rails])layer.traverse(m=>{if(m.isMesh)for(const mat of (Array.isArray(m.material)?m.material:[m.material]))portalVoids.mask(mat);});
portalVoids.update();`);
 h=h.replace('}else camera.position.copy(ctl.target).add(new THREE.Vector3(90,115,135).multiplyScalar(MODEL_SCALE));', '}else if(o.archive){portalArchive.focus(i,camera,ctl);}else camera.position.copy(ctl.target).add(new THREE.Vector3(90,115,135).multiplyScalar(MODEL_SCALE));');
 h=h.replace('o.g.visible=val>=o.from;', 'o.g.visible=!Number.isFinite(o.from)||val>=o.from;');
 const qa='inspectMik112:focusMik112,stats(){return{';assert.ok(h.includes(qa));
 h=h.replace(qa,qa+'portalArchive:portalArchive.stats(),terrainVoids:portalVoids.stats(),gagarinGround:{rootY:padGroup.position.y,rimY:padGroup.position.y+GAGARIN_RIM_Y*GAGARIN_SCALE,floorY:padGroup.position.y+.32*GAGARIN_SCALE,groundY:-2.755,railHeadY:padGroup.position.y+(GAGARIN_RIM_Y+1.3)*GAGARIN_SCALE},');
 h=h.replace('ctl.update();updateLabels();ukssCutout.enabled', 'ctl.update();updateLabels();portalVoids.update();ukssCutout.enabled');
 h=h.replace('<button id="all">Весь космодром</button>', '<button id="all">Весь космодром</button><a href="./archive.html" target="_blank" rel="noopener" class="archive-link" style="padding:9px;border:1px solid #738592;border-radius:7px;color:#edf3f6;text-decoration:none;font:600 11px Arial">Архив моделей ↗</a>');
}
assert.ok(h.includes('PORTAL_ARCHIVE_INTEGRATION'));assert.ok(h.includes('portalVoids.update();ukssCutout.enabled'));assert.ok(h.includes('portalArchive:portalArchive.stats()'));
writeFileSync('index.html',h);
let logos=readFileSync('src/organisation-logos.js','utf8');
if(!logos.includes("['infracos'"))logos=logos.replace('const logos = [',`const logos = [
  ['infracos','РГП «Инфракос»',/и(?:н)?фракос|infracos/iu],
  ['baiterek','АО «СП «Байтерек»',/байтерек|бәйтерек|ba[yit]+erek/iu],`);
writeFileSync('src/organisation-logos.js',logos);
const cat=JSON.parse(readFileSync('data/catalog.json','utf8'));
for(const id of ['pad-1','pad-112a','pad-42','pad-45']){
 const p=cat.sites.find(s=>s.id===id);assert.ok(p);
 p.organisation={org:['pad-1','pad-112a'].includes(id)?'РГП «Инфракос»':'АО «СП «Байтерек»',role:'Принадлежность по уточнению владельца проекта',attributionSource:'owner-correction-2026-10-28'};
}
for(const spec of ARCHIVE_MAP){const p=cat.sites.find(s=>s.id===spec.id);assert.ok(p);p.modelStatus='Фотореконструкция первого прохода; высоты и скрытая геометрия ориентировочны.';p.archiveModel={version:'1.0-portal-photo-pass',kind:spec.kind,orientation:spec.orientation,satellite:spec.satellite||null,folder:spec.folder||PORTAL_ROOT.satelliteFolder};
 p.modelOrientationVerified=spec.orientation==='image-traced';
 if(spec.id==='pad-112a'){p.titleShort='МЗК и СДИ';p.titleFull='пл. №112А · МЗК и СДИ';}
}
writeFileSync('data/catalog.json',JSON.stringify(cat,null,2)+'\n');
writeFileSync('data/portal-source-register.json',JSON.stringify({scope:PORTAL_ROOT,map:ARCHIVE_MAP,unlocatedStudies:ARCHIVE_GALLERY,existing:EXISTING_ARCHIVE,limitations:['No unlocated photo is assigned a fictional map point.','Ground photographs do not establish north.','Only the downloaded, visually inspected subset is modelled; loose unclassified root photographs and remaining interiors are not declared complete.','КПП №1: empty folder at inspection.']},null,2)+'\n');
mkdirSync('/tmp/portal-check',{recursive:true});writeFileSync('/tmp/portal-check/main.mjs',h.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
console.log('Integrated',ARCHIVE_MAP.length,'map groups and',ARCHIVE_GALLERY.length,'unlocated studies. Ownership corrected. Gagarin rim at -2.755.');
