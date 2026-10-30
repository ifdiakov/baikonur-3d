import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildAirport,AIRPORT_SCALE} from '../src/airport-models.js';
import {buildAlrosaAircraft as buildAircraft,AIRCRAFT_SCALE} from '../src/aircraft-livery.js';
import {buildMzkSdi} from '../src/mzk-sdi.js';
import {energia110} from '../src/archive-launches.js';
import {UKSS_TRENCH} from '../src/ukss-pad.js';
import {buildTransportNetwork} from '../src/transport-network.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';
const ctx=new Proxy({measureText:t=>({width:t.length*15}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||(()=>{})});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>ctx})};
const runways=[];
for(const key of ['krayniy','yubileiny']){const root=new THREE.Group();root.scale.setScalar(AIRPORT_SCALE);const model=buildAirport(root,key);const runway=root.children.find(m=>m.isInstancedMesh&&m.name==='Архив · asphalt');assert.ok(runway);const matrix=new THREE.Matrix4();runway.getMatrixAt(0,matrix);const scale=new THREE.Vector3();matrix.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);runways.push(scale.z*AIRPORT_SCALE);assert.ok(Math.abs(scale.z-(key==='krayniy'?1550:2250))<1e-8,'User-requested half-length runway');assert.ok(Math.abs(scale.x-(key==='krayniy'?45:84))<1e-8,'Runway width is preserved');if(key==='yubileiny'){assert.equal(model.features['mriya-engine'],6);assert.equal(model.features['mriya-twin-tail'],2);assert.equal(model.features['buran-fuselage'],1);assert.equal(model.features['loading-ramp-crosshead'],2);}}
assert.ok(Math.abs(runways[1]/runways[0]-4500/3100)<1e-8);assert.equal(AIRPORT_SCALE,AIRCRAFT_SCALE);
const craft=buildAircraft(new THREE.Group());craft.updateGear(0,60);assert.equal(craft.gear.visible,false);craft.updateGear(.5,85);assert.ok(craft.stats().gearDoorAngles.every(a=>Math.abs(a)>1));assert.ok(craft.stats().gearLegRotations.some(v=>v.some(a=>Math.abs(a)>.5)));craft.updateGear(1,100);assert.ok(craft.stats().gearLegRotations.flat().every(a=>a===0));assert.ok(craft.stats().gearDoorAngles.every(a=>a===0));
const launch=energia110(new THREE.Group());assert.equal(launch.cutouts.length,8);assert.equal(launch.cutouts.filter(c=>c.polygon).length,6);assert.ok(launch.meshCount<25,'Flame-channel faces must be batched');
const mzk=buildMzkSdi(new THREE.Group());assert.equal(mzk.features['mzk-main-volume'],1);assert.equal(mzk.features['mzk-end-portal-recess'],2);assert.equal(mzk.features['sdi-closed-side-wall'],2);assert.equal(mzk.features['sdi-closed-rear-wall'],1);assert.ok(mzk.features['sdi-gate-diagonal-brace']>0);
assert.ok(UKSS_TRENCH.at(-1)[0]>4*Math.abs(UKSS_TRENCH[0][0]));assert.ok(UKSS_TRENCH.at(-1)[1]<UKSS_TRENCH[4][1]/10,'Single petal tapers toward its distant outlet');
const data=JSON.parse(fs.readFileSync('data/transport-network.json')),siteRecords=JSON.parse(fs.readFileSync('data/catalog.json')).sites,point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const network=buildTransportNetwork({data,siteRecords,point,layers}),roads=network.roadPaths(),routes=buildRoadVehicleRoutes(roads).routes;assert.equal(routes.length,4);assert.equal(network.stats().interchange.ramps,4);
for(const r of routes){assert.ok(r.length>2000);for(let t=0;t<600;t+=.2){const p=roadVehiclePose(r,t,{phase:.12,direction:1,speed:10});assert.ok([...p.position.toArray(),...p.tangent.toArray()].every(Number.isFinite));}let maxStep=0;for(let d=10;d<r.length-10;d+=.5)maxStep=Math.max(maxStep,r.position(d).distanceTo(r.position(d+.5)));assert.ok(maxStep<=.500001,'Cars follow a continuous arc-length route');}
assert.ok(network.stats().facilityRailPorts.length>=6);assert.ok(network.stats().facilityRailPorts.every(p=>Math.abs(p.gauge-.5859466666666666)<1e-8));
console.log('REFINEMENT_GEOMETRY_PASS',JSON.stringify({runways,petals:6,launchDrawCalls:launch.meshCount,cityRoutes:routes.length}));
