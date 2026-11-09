import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createMuseumGeography,MUSEUM_DISPLAY_OFFSETS} from '../src/osm-geography.js';
import {restoreBakedTransport} from '../src/transport-bake.js';
const ref='c3f6a737dc5f9c78332c7db3806251b104bc6456',git=args=>execFileSync('git',args,{maxBuffer:50*1024*1024});
try{git(['cat-file','-e',ref+'^{commit}']);}catch{git(['fetch','--no-tags','--depth=1','origin',ref]);}
const allowed=new Set(['src/transport-bake.js','src/site110.js','src/road-editor-mesh.js','src/owner-rail-curves.js','src/road-lod.js','src/owner-ad-refinements.js','src/road-editor.js','src/workshop-road-editor.js','src/site113-road-grade.js','src/road-editor-style.js','src/site113.js','src/osm-transport.js','data/road-edits-authoritative-20261103.json','data/osm/transport-geometry-bake-v1.json.gz','data/osm/road-lod-authoritative-v1.json.gz']);
const norm=s=>s.replace(/\?v=[^'"\s]+/g,'');let unchanged=0,cacheKeysOnly=0;
for(const row of git(['ls-tree','-r','-z',ref,'--','src','data','assets']).toString().split('\0').filter(Boolean)){
 const split=row.indexOf('\t'),meta=row.slice(0,split),path=row.slice(split+1);if(allowed.has(path))continue;const bytes=await readFile(path),expected=meta.split(' ')[2],actual=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 if(actual===expected){unchanged++;continue;}
 assert(path.endsWith('.js')&&norm(bytes.toString())===norm(git(['show',ref+':'+path]).toString()),'Unrelated original museum resource changed: '+path);cacheKeysOnly++;
}
const index=await readFile('index.html','utf8');assert.equal(await readFile('museum.html','utf8'),index);assert(!index.includes('PUBLIC_MUSEUM_DEFAULT')&&!index.includes('public-museum.js'));
const original=git(['show',ref+':index.html']).toString(),a=original.indexOf('// Targeted correction: an illustrative building overlaps'),b=original.indexOf('animate();startup.ready();',a);
const expected=original.slice(0,a)+'// Only the source-traced house at 589/342.7 is removed in site110.js.\n// Never hide a whole material/instance batch to remove one building.\n'+original.slice(b);
assert.equal(norm(index),norm(expected),'Public entrypoint changed outside requested geometry/cache keys');
const site110=await readFile('src/site110.js','utf8');assert.equal(norm(site110),norm(git(['show',ref+':src/site110.js']).toString().replace(',[-260,350,27,87,5]','')),'Only the requested technical house may be removed');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
assert.deepEqual(MUSEUM_DISPLAY_OFFSETS['pad-204'],[-10,0]);assert.deepEqual(MUSEUM_DISPLAY_OFFSETS['pad-202'],[0,-5]);
const g=createMuseumGeography({catalog:await json('data/catalog.json'),matches:await json('data/osm/catalog-matches.json')});
for(const id of ['pad-202','pad-204'])assert.deepEqual(g.sites.find(s=>s.id===id).geoSource.displayOffset,MUSEUM_DISPLAY_OFFSETS[id]);
const baked=JSON.parse(gunzipSync(await readFile('data/osm/transport-geometry-bake-v1.json.gz'))),lod=JSON.parse(gunzipSync(await readFile('data/osm/road-lod-authoritative-v1.json.gz')));
assert.equal(baked.ownerRevision,'20261109-owner19-exact-junctions-v2');assert.equal(lod.ownerRevision,baked.ownerRevision);assert.equal(lod.sourceFingerprint,baked.sourceFingerprint);
assert(baked.terrain.rails.some(r=>r.sourceWayId==='37546649'));
const restored=restoreBakedTransport({bake:baked,layers:{roads:new THREE.Group(),rails:new THREE.Group()},sourceFingerprint:baked.sourceFingerprint});
const old=baked.editable.find(r=>r.id==='osm-road-172704701'),fresh=restored.editableRoadPaths().find(r=>r.id===old.id);assert.deepEqual(fresh.points.map(p=>p.toArray()),old.points,'Prepared road must not shift again while restoring the cache');
const d=await json('data/road-edits-authoritative-20261103.json');assert(!d.added.some(r=>r.id==='road-4'));assert.equal(d.added.find(r=>r.id==='road-3').width,3.2);
await mkdir('qa-owner19',{recursive:true});await writeFile('qa-owner19/source-contract.json',JSON.stringify({passed:true,reference:ref,unchangedResources:unchanged,onlyImportCacheKeys:cacheKeysOnly,allowedRequestedFiles:[...allowed],offsets:{'204':[-10,0],'202':[0,-5]},preparedRoadsNotShiftedAgain:true},null,2));
console.log('OWNER19_SOURCE_CONTRACT_PASS',JSON.stringify({unchanged,cacheKeysOnly}));
