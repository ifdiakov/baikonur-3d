import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createArrivalPath,arrivalPose} from '../src/arrival-flight.js';
import {buildTransportNetwork} from '../src/transport-network.js';
import {buildHighwayPath} from '../src/traffic-paths.js';
import {highwayVehiclePose,trainDistance,TRAIN_DURATION} from '../src/ground-traffic.js';
const airport=new THREE.Group();airport.scale.setScalar(.28);airport.rotation.y=2.06;airport.position.set((539-650)*3.4,0,(962-522.5)*3.4);
const flight=createArrivalPath(airport);
for(let t=58;t<=108;t+=.25){const p=arrivalPose(flight,t);assert.ok(p.pitchDeg>=3.49&&p.pitchDeg<=6.01,'Positive pitch throughout final approach');assert.ok(p.airframeHeading.y>0);}
let noseGap;
for(const t of [108,109,110,112,114,115,120]){
 const p=arrivalPose(flight,t),q=p.attitude;
 const bottom=z=>new THREE.Vector3(3,-2.72,z).multiplyScalar(.55).applyQuaternion(q).add(p.bodyPosition).y-.46*.55;
 assert.ok(Math.abs(bottom(-3)-flight.runwayY-.011)<1e-6,'Main wheels stay on the runway while nose is lowered');
 assert.ok(bottom(12)>=bottom(-3)-1e-9);if(t===108)noseGap=bottom(12)-bottom(-3);
 if(t>=115)assert.equal(p.pitchDeg,0);
}
assert.ok(noseGap>.8,'Touch the main gear first');
const data=JSON.parse(fs.readFileSync('data/transport-network.json')),siteRecords=JSON.parse(fs.readFileSync('data/catalog.json')).sites;
const layers={roads:new THREE.Group(),rails:new THREE.Group()},point=(x,y,z=0)=>new THREE.Vector3((x-650)*3.4,z,(y-522.5)*3.4);
const network=buildTransportNetwork({data,siteRecords,point,layers}),plan=network.trainPath(),highway=buildHighwayPath(network.roadPaths());
assert.equal(plan.extraRails.length,2);assert.ok(plan.joins.every(j=>j.gap<1e-4&&j.tangentDot>.999));
assert.ok(highway.joinGap<1e-4);assert.equal(network.stats().railRoutes,14);assert.equal(network.stats().roadRoutes,23);
let maxDeviation=0;
for(const section of plan.sections){
 const pair=layers.rails.children.filter(m=>m.userData.railRoute===section.id&&m.geometry?.type==='TubeGeometry');assert.equal(pair.length,2);
 const a=pair[0].geometry.parameters.path,b=pair[1].geometry.parameters.path;
 const center=Array.from({length:2001},(_,i)=>a.getPoint(i/2000).lerp(b.getPoint(i/2000),.5));
 for(let i=0;i<=30;i++){
  const t=THREE.MathUtils.lerp(section.from,section.to,i/30),p=section.curve.getPoint(t);p.y=(section.datum?section.datum(t):.75)+1.3*.43*.28/1.5;
  let nearest=Infinity;
  for(let j=1;j<center.length;j++){const line=new THREE.Line3(center[j-1],center[j]);nearest=Math.min(nearest,line.closestPointToPoint(p,true,new THREE.Vector3()).distanceTo(p));}
  maxDeviation=Math.max(maxDeviation,nearest);
 }
}
assert.ok(maxDeviation<.06,'Animation follows the rendered track buffers');
for(const t of [0,1,30,120,300,420,480,1000]){
 const distance=trainDistance(t,plan.path.length);assert.ok(distance>=7&&distance<=plan.path.length-8);
 const states=Array.from({length:6},(_,i)=>highwayVehiclePose(highway,t,i));
 for(const s of states){assert.ok(s.position.y>=.72);assert.equal(Math.abs(s.laneOffset),highway.width/4);assert.ok([...s.position.toArray(),...s.tangent.toArray()].every(Number.isFinite));}
 for(const dir of [-1,1]){const cars=states.filter(s=>s.direction===dir);for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
  const gap=Math.abs(cars[i].distance-cars[j].distance);assert.ok(Math.min(gap,highway.length-gap)>1000,'Sparse traffic, no catching the car ahead');
 }}
}
assert.equal(trainDistance(TRAIN_DURATION+100,plan.path.length),trainDistance(TRAIN_DURATION,plan.path.length));
console.log('TRAFFIC_GEOMETRY_PASS',JSON.stringify({noseGap,maxDeviation,trainLength:plan.path.length,highwayLength:highway.length,joins:plan.joins.length}));
