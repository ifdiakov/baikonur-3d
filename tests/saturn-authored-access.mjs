import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {SATURN_ACCESS,addSaturnNorthwestGate,findSaturnAuthoredAccess} from '../src/saturn-access.js';

const json=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [catalog,matches,edits]=await Promise.all([json('data/catalog.json'),json('data/osm/catalog-matches.json'),json('data/road-edits-authoritative-20261103.json')]);
const site=createMuseumGeography({catalog,matches}).sites.find(site=>site.id==='pad-23');
const center=new THREE.Vector3((site.x-650)*3.4,0,(site.y-522.5)*3.4);
const original=JSON.stringify(edits),access=findSaturnAuthoredAccess({ownerRoadEdits:edits,center});
assert.equal(access?.roadId,'road-31');
const road=edits.added.find(road=>road.id==='road-31');
assert.deepEqual(access.endpoint,road.points.at(-1));
assert(access.gateGap>8&&access.gateGap<9,'The retained road joins the inner pavement, not an invented snap to the outer gate');

// Independent ray against the actual model confirms the endpoint is inside
// its pavement, including the curve and real Float32 strip geometry.
const root=new THREE.Group();root.position.set(center.x,SATURN_ACCESS.elevation,center.z);root.scale.setScalar(SATURN_ACCESS.scale);
addSaturnNorthwestGate(root);root.updateMatrixWorld(true);
const pavement=root.getObjectByName('northwest-gate-pavement');
const ray=new THREE.Raycaster(new THREE.Vector3(access.endpoint[0],50,access.endpoint[2]),new THREE.Vector3(0,-1,0));
const hit=ray.intersectObject(pavement,false)[0];assert(hit,'Retained owner endpoint must hit real gate pavement');
assert(Math.abs(hit.point.y-access.endpoint[1])<.2);
assert(Math.abs(hit.point.y-(SATURN_ACCESS.elevation+SATURN_ACCESS.gate.y*SATURN_ACCESS.scale))<1e-6);

const shifted=structuredClone(road);shifted.points.at(-1)[0]+=8;
assert.equal(findSaturnAuthoredAccess({ownerRoadEdits:{added:[shifted]},center}),null,'A nearby endpoint outside the paved strip must not suppress access');
const lower=structuredClone(road);lower.points.at(-1)[1]-=3;
assert.equal(findSaturnAuthoredAccess({ownerRoadEdits:{added:[lower]},center}),null,'A road at another level must not suppress access');
assert.equal(findSaturnAuthoredAccess({ownerRoadEdits:{added:[]},center}),null);
assert.equal(findSaturnAuthoredAccess({ownerRoadEdits:null,center}),null);
assert.equal(JSON.stringify(edits),original,'Detection must not change owner controls');
for(const name of ['index.html','museum.html','workshop.html']){
 const source=await readFile(new URL('../'+name,import.meta.url),'utf8');
 assert(source.includes('geography,point,layers,siteRecords,ownerRoadEdits,checkpoint7RoadGrade:displayRoadGrade'),name+' initial source must receive owner edits');
 assert(source.includes('catalog,matches:osmMatches,siteRecords,ownerRoadEdits,checkpointAnchor'),name+' worker input must receive owner edits');
}
console.log('SATURN_AUTHORED_ACCESS_PASS',JSON.stringify({roadId:access.roadId,actualPavementFace:hit.faceIndex,gateGap:access.gateGap,pavementDeltaY:access.pavementDeltaY}));
