import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSite31Exhibit} from '../src/site31-exhibit.js';
import {buildFacilityTowerLighting} from '../src/facility-tower-lighting.js';
import {MUSEUM_METRE} from '../src/museum-scale.js';

const scene=new THREE.Scene(),site=new THREE.Group();
site.name='Площадка 31 · добавленные светильники';
site.scale.setScalar(MUSEUM_METRE);
scene.add(site);
buildSite31Exhibit(site,{autoLoad:false});
const data=site.userData.site31AdditionalLighting;
assert.equal(data.version,'site31-mast-light-heads-v1');
assert.equal(data.sourceFloodTowers,3);assert.equal(data.serviceMasts,2);
assert.equal(data.panels,32);assert.equal(data.boards,5);
const heads=site.children.find(child=>child.userData.site31FloodlightHeads);
assert(heads,'Luminous panel geometry must belong to the permanent Site31 model root');
const instances=heads.children.filter(m=>m.isInstancedMesh);
assert.equal(instances.length,1);assert.equal(instances[0].count,32);
assert(!heads.children.some(m=>m.isPointLight||m.isSpotLight),'No per-lamp dynamic lights');
const anchors=site.userData.facilityLighting;
const boards=anchors.boards.filter(b=>b.id.startsWith('site31-source-flood-'));
assert.equal(boards.length,5);assert.equal(boards.reduce((n,b)=>n+b.lamps.length,0),32);
for(const board of boards){
 assert(board.lamps.every(l=>l.size[0]>0&&l.size[1]>0));
 assert(board.target[2]>-120&&board.target[2]<150);
}
const light=buildFacilityTowerLighting({scene,objects:[{record:{id:'pad-31'},g:site}]});
const all=light.records(),bySite=all.floodlights.filter(r=>r.siteId==='pad-31');
assert.equal(bySite.length,32);
assert.equal(all.boards.filter(b=>b.siteId==='pad-31').length,5);
for(const r of bySite){
 assert(r.powered,'A mast panel should be powered in the evening');
 assert(r.normal.every(Number.isFinite));
 assert.equal(r.source,'Site 31 source mast with added physical illuminated panel faces');
}
light.setEvening(true);light.update(0);
assert.equal(light.stats().visibleFixtures,32,'All mast faces must light up at night');
assert.equal(light.stats().rendered.activeLenses,32,'All emitted panels must render at night');
light.setEvening(false);
assert.equal(light.stats().rendered.activeLenses,0,'No mast emission during daytime');
assert.equal(light.stats().dynamicLights,0,'Instancing avoids 32 actual dynamic scene lights');
console.log('SITE31_ADDED_LIGHTING_PASS',JSON.stringify({panels:32,boards:5,
 beacons:all.beacons.length,drawCalls:light.stats().drawCalls,nightly:true}));
