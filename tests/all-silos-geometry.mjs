import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {SILO_SITE_IDS} from '../src/silo-sites.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {buildSiloPad,siloController} from '../src/silo-pad.js';
import {createTerrainVoids} from '../src/terrain-voids.js';
const catalogue=JSON.parse(fs.readFileSync('data/catalog.json')).sites;
const expected=catalogue.filter(s=>/шахт|ШПУ|позиция Р-36орб/i.test(['purpose','purposeLong','titleShort','titleFull'].map(k=>s[k]||'').join(' '))).map(s=>s.id).sort();
assert.deepEqual([...SILO_SITE_IDS].sort(),expected);assert.equal(SILO_SITE_IDS.length,31);
assert(!SILO_SITE_IDS.includes('pad-130'));assert(!SILO_SITE_IDS.includes('pad-182'));
assert.deepEqual(ARCHIVE_MAP.filter(s=>s.kind==='silo').map(s=>s.id),SILO_SITE_IDS);
assert.equal(new Set(ARCHIVE_MAP.map(s=>s.id)).size,ARCHIVE_MAP.length);
const scene=new THREE.Scene(),roots=[],controllers=[],voids=createTerrainVoids();
for(const [i,id]of SILO_SITE_IDS.entries()){
 const root=new THREE.Group();root.scale.setScalar(.28);root.position.set(i*60,-2.72,0);scene.add(root);buildSiloPad(root,{siteId:id});roots.push(root);controllers.push(siloController(root));voids.add(root,root.userData.archiveCutouts[0]);
}
const geometries=new Set();let meshCount=0;for(const root of roots)root.traverse(o=>{if(o.isMesh){meshCount++;geometries.add(o.geometry);}});
assert(geometries.size<40,'Identical sites share immutable geometry');assert(meshCount>900);
const camera=new THREE.PerspectiveCamera(52,1.5,.1,80000),controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);}};let time=0;
function advance(){for(let frame=0;frame<240;frame++){time+=1000/60;for(const c of controllers)c.update(time,camera,controls.target);}}
for(const index of [0,1,8,17,30]){
 controllers[index].inspect('close',camera,controls);advance();
 assert.equal(controllers[index].stats().siteId,SILO_SITE_IDS[index]);assert.equal(controllers[index].stats().state,'open');
 assert.equal(controllers.filter(c=>c.stats().open).length,1,'Independent lids: opening one does not open the others');
 assert.equal(controllers.filter(c=>c.stats().steamVisible).length,1,'Only the inspected shaft emits vapour');
 assert(controllers.filter(c=>!c.stats().detailVisible).length>=28,'Distant sites use the light overview mesh');
}
const m=new THREE.MeshStandardMaterial();voids.mask(m);const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>'};m.onBeforeCompile(shader,{});
assert.equal(Object.keys(shader.uniforms).length,31,'One vec4 per silo void, keeping mobile shader uniform usage bounded');
assert(Object.keys(shader.uniforms).every(k=>k.endsWith('Circle')));
roots[1].visible=false;voids.update();assert.equal(shader.uniforms.museumVoid1Circle.value.w,0);
console.log('ALL_SILOS_GEOMETRY_PASS',JSON.stringify({sites:roots.length,meshInstances:meshCount,uniqueGeometries:geometries.size,clipUniforms:Object.keys(shader.uniforms).length}));
