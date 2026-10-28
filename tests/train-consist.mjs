import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildTransportNetwork} from '../src/transport-network.js';
import {createGroundTraffic,TRAIN_DURATION} from '../src/ground-traffic.js';
import {COACH_OFFSETS,TRAIN_START_DISTANCE} from '../src/rail-vehicles.js';

const node={addEventListener(){},setAttribute(){}};
globalThis.document={...node,querySelector(){return null;},body:{classList:{add(){},remove(){}}},hidden:false};
const data=JSON.parse(fs.readFileSync('data/transport-network.json'));
const siteRecords=JSON.parse(fs.readFileSync('data/catalog.json')).sites;
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const transport=buildTransportNetwork({data,siteRecords,point,layers});
const camera=new THREE.PerspectiveCamera(52,1.6,.1,80000);
const controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
const traffic=createGroundTraffic({layers,transport,camera,controls,canvas:node,button:{...node}});
let minCoachGap=Infinity,maxRailError=0;
for(let t=0;t<=TRAIN_DURATION;t+=3){
 traffic.seek(t);const stats=traffic.stats().train;
 assert.equal(stats.coachCount,4);assert.equal(stats.coaches.length,4);
 assert.equal(stats.coaches.filter(c=>c.tailLights).length,1);assert.equal(stats.coaches[3].tailLights,true);
 assert.ok(stats.coaches[3].distance>3,'The entire consist is on the track at departure');
 assert.ok(stats.distance<=stats.length-8,'The locomotive stops before the route ends');
 const units=[stats.locomotive,...stats.coaches.map(c=>c.position)];
 for(let i=1;i<units.length;i++){
  const gap=new THREE.Vector3(...units[i]).distanceTo(new THREE.Vector3(...units[i-1]));
  minCoachGap=Math.min(minCoachGap,gap);
  assert.ok(gap>4.65,'Coach bodies do not overlap on curves');
 }
 for(const contact of stats.wheelContacts){
  const error=new THREE.Vector3(...contact.position).distanceTo(new THREE.Vector3(...contact.railPosition));
  maxRailError=Math.max(maxRailError,error);assert.ok(error<1e-8,'Each axle follows its own point on the rendered rails');
  assert.ok(contact.distance>=0&&contact.distance<=stats.length,'No axle is clamped at a route end');
 }
 assert.equal(stats.wheelContacts.length,18);assert.equal(stats.wheels.length,36);
 assert.deepEqual(stats.coaches.map(c=>c.offset),COACH_OFFSETS);
}
assert.equal(traffic.stats().train.startDistance,TRAIN_START_DISTANCE);
traffic.seek(80);traffic.setFollowing(true);
for(const aspect of [1.6,390/844]){
 camera.aspect=aspect;camera.updateProjectionMatrix();traffic.seek(80);
 const stats=traffic.stats().train;
 for(const p of [stats.locomotive,...stats.coaches.map(c=>c.position)]){
  const screen=new THREE.Vector3(...p).project(camera);
  assert.ok(Math.abs(screen.x)<.9&&Math.abs(screen.y)<.9,'Follow framing includes all four coaches on desktop and mobile');
 }
}
traffic.setEvening(false);assert.equal(traffic.stats().night,false);traffic.setEvening(true);
assert.ok(traffic.stats().train.vehicleDetails.every(v=>v.meshes<=10),'Static detail is batched by material');
console.log('TRAIN_CONSIST_PASS',JSON.stringify({coachCount:4,axles:18,wheels:36,minCoachGap,maxRailError,startDistance:TRAIN_START_DISTANCE,lights:traffic.stats().train.vehicleDetails.map(v=>v.lightCount)}));
