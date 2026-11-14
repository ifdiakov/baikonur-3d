import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {isMapSiteHidden} from '../src/map-visible-sites.js';
import {SILO_SITE_IDS} from '../src/silo-sites.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {buildSiloPad,siloController,SILO_REFERENCE} from '../src/silo-pad.js';
import {MUSEUM_METRE,MUSEUM_MAP_SCALE} from '../src/museum-scale.js';
import {createTerrainVoids} from '../src/terrain-voids.js';
const catalogue=JSON.parse(fs.readFileSync('data/catalog.json')).sites;
const expected=catalogue.filter(s=>/шахт|ШПУ|позиция Р-36орб/i.test(['purpose','purposeLong','titleShort','titleFull'].map(k=>s[k]||'').join(' '))).map(s=>s.id).sort();
assert.deepEqual([...SILO_SITE_IDS].sort(),expected);assert.equal(SILO_SITE_IDS.length,32);
assert(!SILO_SITE_IDS.includes('pad-130'));assert(!SILO_SITE_IDS.includes('pad-182'));
const visibleSilos=SILO_SITE_IDS.filter(id=>!isMapSiteHidden(id));
assert.deepEqual(SILO_SITE_IDS.filter(isMapSiteHidden),['pad-174']);
assert.equal(visibleSilos.length,31);assert(visibleSilos.includes('pad-175'));
assert.deepEqual(ARCHIVE_MAP.filter(s=>s.kind==='silo').map(s=>s.id),visibleSilos);
assert.equal(new Set(ARCHIVE_MAP.map(s=>s.id)).size,ARCHIVE_MAP.length);
const scene=new THREE.Scene(),roots=[],controllers=[],voids=createTerrainVoids();
assert.equal(MUSEUM_METRE,.14);assert.equal(SILO_REFERENCE.openHeight,8);assert.equal(SILO_REFERENCE.closeHeight,9);
for(const [i,id]of SILO_SITE_IDS.entries()){
 const root=new THREE.Group();root.scale.setScalar(MUSEUM_METRE);root.position.set(i*60,-2.72,0);scene.add(root);buildSiloPad(root,{siteId:id,activation:'height'});roots.push(root);controllers.push(siloController(root));voids.add(root,root.userData.archiveCutouts[0]);
}
const geometries=new Set();let meshCount=0;for(const root of roots)root.traverse(o=>{if(o.isMesh){meshCount++;geometries.add(o.geometry);}});
assert(geometries.size<40,'Identical sites share immutable geometry');assert(meshCount>900);
const camera=new THREE.PerspectiveCamera(52,1.5,.1,80000),controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);}};let time=0;
function advance(seconds=4){for(let frame=0;frame<Math.ceil(seconds*60);frame++){time+=1000/60;for(const c of controllers)c.update(time,camera,controls.target);}}
function heightView(index,height,{aimX=0,horizontalDistance}={}){
 const root=roots[index];root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(new THREE.Vector3(aimX,.8,0)));
 camera.position.copy(controls.target);camera.position.y=height*MUSEUM_MAP_SCALE;
 camera.position.x+=horizontalDistance??(camera.position.y-controls.target.y)/Math.tan(Math.PI/6);controls.update();
}
for(const index of SILO_SITE_IDS.keys()){
 heightView(index,8.1);advance();
 assert.equal(controllers[index].stats().state,'closed',SILO_SITE_IDS[index]+' stays closed at H=8.1');
 assert.equal(controllers.filter(c=>c.stats().open).length,0,'Moving the target away closes the previously inspected shaft');
 heightView(index,8);advance(1);
 const opening=controllers[index].stats();
 assert.equal(opening.state,'opening');assert.equal(opening.detailVisible,true);assert(opening.cameraDistance>300);
 assert(Math.abs(opening.cameraHeight-8)<1e-8,'Every silo uses normalized H at the actual .14 scale');
 assert.equal(controllers.filter(c=>c.stats().open).length,1,'At H=8 only the shaft under the current target starts opening');
 advance(3);
 assert.equal(controllers[index].stats().siteId,SILO_SITE_IDS[index]);assert.equal(controllers[index].stats().state,'open');
 assert.equal(controllers[index].stats().detailVisible,true,'The open lid is rendered beyond the old 300-local-unit detail cutoff');
 assert.equal(controllers.filter(c=>c.stats().open).length,1,'Independent lids: opening one does not open the others');
 assert.equal(controllers.filter(c=>c.stats().state==='open').length,1,'All other actual lids finish closed');
 assert.equal(controllers.filter(c=>c.stats().steamVisible).length,1,'Only the inspected shaft emits vapour');
 assert(controllers.filter(c=>!c.stats().detailVisible).length>=28,'Distant sites use the light overview mesh');
}
const last=roots.length-1;roots[last].visible=false;advance(.1);
assert.equal(controllers[last].stats().progress,0);assert.equal(controllers[last].stats().steamVisible,false);
assert.equal(Math.abs(roots[last].getObjectByName('ШПУ · шарнир крышки').rotation.x),0,'A hidden selected shaft resets its real lid');
roots[last].visible=true;heightView(0,8,{horizontalDistance:1000});advance();
assert.equal(controllers.filter(c=>c.stats().open).length,0,'A far low view cannot open any shaft');
heightView(last,8,{aimX:20});advance();
assert.equal(controllers.filter(c=>c.stats().open).length,0,'A low camera with its target outside the shaft cannot open neighbouring lids');
const m=new THREE.MeshStandardMaterial();voids.mask(m);const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>'};m.onBeforeCompile(shader,{});
assert.equal(Object.keys(shader.uniforms).length,SILO_SITE_IDS.length,'One vec4 per silo void, keeping mobile shader uniform usage bounded');
assert(Object.keys(shader.uniforms).every(k=>k.endsWith('Circle')));
roots[1].visible=false;voids.update();assert.equal(shader.uniforms.museumVoid1Circle.value.w,0);
console.log('ALL_SILOS_GEOMETRY_PASS',JSON.stringify({sites:roots.length,heightThresholdChecked:controllers.length,openHeight:8,physicalMetre:MUSEUM_METRE,meshInstances:meshCount,uniqueGeometries:geometries.size,clipUniforms:Object.keys(shader.uniforms).length}));
