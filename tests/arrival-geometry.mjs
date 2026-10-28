import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createArrivalPath,arrivalPose,FLIGHT_DURATION,TOUCHDOWN_TIME,FLIGHT_CYCLE_DURATION,FLIGHT_LEG_DURATION} from '../src/arrival-flight.js';
import {AIRPORT_DIMENSIONS,AIRPORT_SCALE,buildAirport} from '../src/airport-models.js';

const canvasContext=new Proxy({measureText:t=>({width:t.length*15})},{get:(o,k)=>o[k]||(()=>{})});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>canvasContext})};
for(const [key,length,width,referenceLength] of [['krayniy',1550,45,3100],['yubileiny',2250,84,4500]]){
 const spec=AIRPORT_DIMENSIONS[key];assert.equal(spec.length,length);assert.equal(spec.width,width);
 assert.equal(spec.referenceLength,referenceLength);assert.equal(spec.length/spec.referenceLength,.5);
 const root=new THREE.Group();buildAirport(root,key);
 const runway=root.children.find(m=>m.isInstancedMesh&&m.name==='Архив · asphalt'),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
 assert.ok(runway);runway.getMatrixAt(0,matrix);matrix.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);
 assert.equal(scale.z,length,'The rendered asphalt length is halved');assert.equal(scale.x,width,'The runway width is preserved');
}
delete globalThis.document;
const airport=new THREE.Group();airport.scale.setScalar(AIRPORT_SCALE);airport.rotation.y=2.06;
airport.position.set((539-650)*3.4,0,(962-522.5)*3.4);
airport.userData.airport={...AIRPORT_DIMENSIONS.krayniy,threshold:760,touchdown:585};
const path=createArrivalPath(airport);
assert.equal(FLIGHT_DURATION,120);assert.equal(TOUCHDOWN_TIME,120);
assert.equal(FLIGHT_LEG_DURATION,406);assert.equal(FLIGHT_CYCLE_DURATION,812);
assert.equal(path.phases.length,18);
let minHeight=Infinity,maxLateral=0,maxContactError=0;
for(let t=0;t<FLIGHT_CYCLE_DURATION;t+=.1){
 const s=path.sample(t),pose=arrivalPose(path,t);
 assert.ok([...s.position.toArray(),...s.velocity.toArray(),...pose.bodyPosition.toArray(),...pose.attitude.toArray()].every(Number.isFinite));
 const height=s.position.y-path.runwayY-path.clearance;minHeight=Math.min(minHeight,height);
 assert.ok(height>=-1e-8,'The entire circuit stays above the runway surface');
 if(s.segment==='approach'&&s.phaseTime>=82||s.segment==='rollout'){
  const d=s.position.clone().sub(path.touchdown);d.y=0;
  maxLateral=Math.max(maxLateral,new THREE.Vector3().crossVectors(d,path.axis).length());
 }
 if(s.onGround){
  const local=airport.worldToLocal(s.position.clone());
  assert.ok(Math.abs(local.x)<22.5&&Math.abs(local.z)<775,'Ground manoeuvres stay inside the shortened runway');
  const bottom=new THREE.Vector3(3,-2.72,-3).multiplyScalar(.28).applyQuaternion(pose.attitude).add(pose.bodyPosition).y-.46*.28;
  maxContactError=Math.max(maxContactError,Math.abs(bottom-path.runwayY));
  for(const [x,z] of [[0,12],[-3,-3],[3,-3]])for(const side of [-1,1])for(const dx of [-.135,.135])for(const dz of [-.46,.46]){
   const tyre=new THREE.Vector3(x+side*.26+dx,-2.72,z+dz).multiplyScalar(.28).applyQuaternion(pose.attitude).add(pose.bodyPosition);
   const wheel=airport.worldToLocal(tyre);assert.ok(Math.abs(wheel.x)<22.5&&Math.abs(wheel.z)<775,'All six tyres stay on asphalt during both turns');
  }
 }
}
assert.ok(maxLateral<1e-7,'Both finals and landing rolls follow the actual runway centreline');
assert.ok(maxContactError<1e-7,'The main wheels stay on the runway through flare, rollout and rotation');
for(let leg=0;leg<2;leg++){
 const offset=leg*FLIGHT_LEG_DURATION;
 assert.ok(path.sample(offset+120).position.distanceTo(path.touchdown)<1e-10);
 assert.equal(path.sample(offset+120).gear,1);
 const hold=path.phases.find(p=>p.leg===leg&&p.phase==='hold');assert.equal(hold.duration,20);
 for(const dt of [0,10,19.999]){
  const s=path.sample(hold.start+dt);assert.equal(s.phase,'hold');assert.equal(s.velocity.length(),0);
  assert.ok(s.position.distanceTo(path.stop)<1e-8);assert.ok(Math.abs(s.runwayProgress-.8)<1e-10);
 }
 const taxi=path.phases.find(p=>p.leg===leg&&p.phase==='taxi-back');
 assert.ok(path.sample(taxi.start+2).velocity.dot(path.axis)>0,'Return taxi faces the landing end');
 const takeoff=path.phases.find(p=>p.leg===leg&&p.phase==='takeoff');
 assert.ok(path.sample(takeoff.start).position.distanceTo(path.taxiStart)<1e-8);
 assert.ok(path.sample(takeoff.start+4).velocity.dot(path.axis)<0,'Second turn aligns the departure with the runway');
 const away=path.phases.find(p=>p.leg===leg&&p.phase==='away');assert.equal(away.duration,60);
 for(const dt of [0,30,59.999])assert.equal(path.sample(away.start+dt).visible,false,'The one-minute return happens outside the visible scene');
 const departure=path.phases.find(p=>p.leg===leg&&p.phase==='departure');
 const leaving=path.sample(departure.end-.001);
 assert.ok(leaving.position.z<-2900,'Both departures leave to the north');
 if(leg===0)assert.ok(leaving.position.x>2800,'The first departure leaves northeast');
 else assert.ok(Math.abs(leaving.position.x)<60,'The second departure leaves north');
}
const west=path.sample(FLIGHT_LEG_DURATION);
assert.ok(west.position.x<-2800&&Math.abs(west.position.z)<500,'The return enters from the west');
assert.deepEqual(path.sample(FLIGHT_CYCLE_DURATION).position.toArray(),path.sample(0).position.toArray());
for(const phase of path.phases){
 if(!phase.start||phase.phase==='away'||phase.phase==='approach')continue;
 const before=path.sample(phase.start-.0001),after=path.sample(phase.start+.0001);
 assert.ok(before.position.distanceTo(after.position)<.02,'Visible position continuity at '+phase.phase);
 assert.ok(before.velocity.distanceTo(after.velocity)<.02,'Visible velocity continuity at '+phase.phase);
 assert.ok(arrivalPose(path,phase.start-.0001).bodyPosition.distanceTo(arrivalPose(path,phase.start+.0001).bodyPosition)<.02,'Rendered aircraft continuity at '+phase.phase);
}
for(const offset of [0,FLIGHT_LEG_DURATION])for(const t of [38,42,82,105]){
 const before=path.sample(offset+t-.0001),after=path.sample(offset+t+.0001);
 assert.ok(before.position.distanceTo(after.position)<.03);
 assert.ok(before.velocity.distanceTo(after.velocity)<.02,'Smooth approach joins');
}
console.log('ARRIVAL_GEOMETRY_PASS',JSON.stringify({approach:120,cycle:FLIGHT_CYCLE_DURATION,stopFraction:.8,stops:[20,20],returns:[60,60],maxLateral,minHeight,maxContactError}));
