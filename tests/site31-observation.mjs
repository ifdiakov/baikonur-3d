import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SITE31_NP_VERSION,planSite31Observation,buildSite31Observation} from '../src/site31-observation-platform.js';

const launch=new THREE.Vector3(0,.72,0),reference=new THREE.Vector3(-1100,.72,0);
const road=[{id:'road-between-sites-31-1',width:3.2,points:[
 new THREE.Vector3(-70,.72,-10),new THREE.Vector3(-185,.72,-10)]}];
const roadJSON=JSON.stringify(road.map(r=>r.points.map(p=>p.toArray())));
const plan=planSite31Observation({launch,reference,roads:road});
assert.equal(plan.connectedToRoad,true,'NP must be road-adjacent, not suspended in the steppe');
assert.equal(plan.roadId,'road-between-sites-31-1');
assert(Math.abs(plan.actualDistanceMetres-2400)<450,'NP must be about 2.4 km from Pad 31');
assert(plan.clearanceFromRoad>=6,'NP deck must not occupy the asphalt');
assert.equal(JSON.stringify(road.map(r=>r.points.map(p=>p.toArray()))),roadJSON,'Road coordinates stay unchanged');
const np=buildSite31Observation({plan});
const data=np.userData.observationPlatform;
assert.equal(data.version,SITE31_NP_VERSION);
assert.equal(data.id,'np-31-1');
assert.equal(data.widthMetres,35);assert.equal(data.lengthMetres,50);
assert.equal(data.shelters,2);assert.equal(data.shelterAreaM2,100);
assert.equal(data.roadConnected,true);
assert.equal(np.userData.skipGenericSiteLights,true,'Do not generate false street poles around the small stand');
np.updateWorldMatrix(true,true);
const size=new THREE.Box3().setFromObject(np).getSize(new THREE.Vector3());
assert(size.x>4&&size.x<14&&size.z>4&&size.z<14,'Keep the observation stand compact and to scale');
const names=[];
np.traverse(o=>{if(o.isMesh)names.push(o.name);});
assert(names.some(n=>n.includes('экран')));
assert(names.filter(n=>n.includes('крыша укрытия')).length===2);
assert(names.filter(n=>n.includes('плафон')).length===2);
const source=readFileSync('index.html','utf8'),light=readFileSync('src/evening-scene.js','utf8');
assert(source.includes("id:'np-31-1'"),'NP is a visible map object, not only an unloaded source file');
assert(source.includes("if(new URLSearchParams(location.search).get('view')==='np31-1')"));
assert(source.includes("item.kind==='observation'?'НП'"));
assert(light.includes('o.g.userData.skipGenericSiteLights'),'No unsupported floodlights outside the NP yard');
console.log('SITE31_NP_GEOMETRY_PASS',JSON.stringify({version:data.version,road:plan.roadId,
 radiusM:Math.round(plan.actualDistanceMetres),platformM:[data.widthMetres,data.lengthMetres],
shelters:data.shelters,meshes:data.geometry.meshes,triangles:data.geometry.triangles}));
