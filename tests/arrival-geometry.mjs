import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createArrivalPath,FLIGHT_DURATION,TOUCHDOWN_TIME} from '../src/arrival-flight.js';
const airport=new THREE.Group();airport.scale.setScalar(.28);airport.rotation.y=2.06;airport.position.set((539-650)*3.4,0,(962-522.5)*3.4);
const path=createArrivalPath(airport),start=path.sample(0);
assert.equal(FLIGHT_DURATION,120);assert.equal(TOUCHDOWN_TIME,108);
assert.ok(start.position.x<airport.position.x&&start.position.z<airport.position.z,'Entry must be northwest');
let minHeight=Infinity,maxLateral=0;
for(let t=0;t<=120;t+=.1){const s=path.sample(t);
 assert.ok([...s.position.toArray(),...s.velocity.toArray()].every(Number.isFinite));
 minHeight=Math.min(minHeight,s.position.y-path.runwayY-path.clearance);
 assert.ok(s.position.y>=path.runwayY+path.clearance-1e-8,'No below-ground part of the approach');
 if(t>=72){const d=s.position.clone().sub(path.touchdown);d.y=0;maxLateral=Math.max(maxLateral,new THREE.Vector3().crossVectors(d,path.axis).length());}
}
assert.ok(maxLateral<1e-8,'Final approach and rollout follow actual transformed runway centreline');
for(const t of [38,72,96,108]){
 assert.ok(path.sample(t-.0001).position.distanceTo(path.sample(t+.0001).position)<.02);
 assert.ok(path.sample(t-.0001).velocity.distanceTo(path.sample(t+.0001).velocity)<.02,'No velocity jumps at segment boundaries');
}
assert.ok(path.sample(108).position.distanceTo(path.touchdown)<1e-10);
assert.equal(path.sample(108).gear,1);assert.equal(path.sample(120).phase,'parked');assert.equal(path.sample(120).velocity.length(),0);
for(const t of [108,112,120]){
 const local=airport.worldToLocal(path.sample(t).position.clone());assert.ok(Math.abs(local.x)<1e-8&&Math.abs(local.z)<1550,'Rollout stays on runway');
}
assert.deepEqual(path.sample(180).position.toArray(),path.sample(120).position.toArray());
console.log('ARRIVAL_GEOMETRY_PASS',JSON.stringify({duration:FLIGHT_DURATION,touchdown:TOUCHDOWN_TIME,maxLateral,minHeight}));
