import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createFlightCircuit,flightPose,FLIGHT_CYCLE_DURATION,FLIGHT_LEG_DURATION,FLIGHT_CIRCUIT_VERSION} from '../src/flight-circuit.js';
import {AIRPORT_DIMENSIONS,AIRPORT_SCALE} from '../src/airport-models.js';

const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const matches=JSON.parse(await readFile('data/osm/catalog-matches.json','utf8'));
const airportFeatures=JSON.parse(await readFile('data/osm/airports.geojson','utf8')).features;
const geography=createMuseumGeography({catalog,matches});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const byId=new Map(geography.sites.map(s=>[s.id,s]));
assert.equal(byId.size,catalog.sites.length);
assert.deepEqual(geography.sites.map(s=>s.id),catalog.sites.map(s=>s.id));
for(let i=0;i<catalog.sites.length;i++){
 const before=catalog.sites[i],after=geography.sites[i];
 assert.ok(Number.isFinite(after.x)&&Number.isFinite(after.y),after.id+' has finite coordinates');
 assert.deepEqual(after.organisation,before.organisation,'OSM must preserve the owner attribution of '+after.id);
 assert.equal(after.model,before.model);assert.equal(after.aliasOf,before.aliasOf);
}
const sourcePoints=[['pad-1',[63.3422511,45.9202466]],['pad-31',[63.5641925,45.9960669]],['pad-110',[63.3086165,45.9658555]],['airfield',[63.2107783,45.6208636]]];
for(const [id,lonlat] of sourcePoints){
 const site=byId.get(id),geo=geography.inverseProject(site.x,site.y);
 assert.ok(Math.hypot(geo[0]-lonlat[0],geo[1]-lonlat[1])<2e-6,id+' is anchored to the actual OSM feature');
}
const origin=geography.project(63.35,45.85),east=geography.project(63.36,45.85),north=geography.project(63.35,45.86);
assert.ok(Math.abs(origin[0]-650)<1e-8&&Math.abs(origin[1]-522.5)<1e-8);
assert.ok(east[0]>origin[0]&&north[1]<origin[1],'The released map remains north-up');
assert.ok(Math.abs(east[1]-origin[1])<1e-8&&Math.abs(north[0]-origin[0])<1e-8);
assert.ok(geography.stats().anchored>=70&&geography.stats().inferred>0);

function airport(id,key){
 const s=byId.get(id),root=new THREE.Group(),spec=AIRPORT_DIMENSIONS[key],H=spec.length/2;
 const feature=airportFeatures.find(f=>f.properties.osmId===(key==='yubileiny'?24949215:37591623));
 const ends=[feature.geometry.coordinates[0],feature.geometry.coordinates.at(-1)].sort((a,b)=>a[1]-b[1]);
 const a=point(...geography.project(...ends[0])),b=point(...geography.project(...ends[1]));
 root.position.copy(a.clone().lerp(b,.5)).setY(-2.72);root.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);root.scale.setScalar(AIRPORT_SCALE);
 root.userData.airport={...spec,key,threshold:H-15,touchdown:H-380*spec.longitudinalScale};return root;
}
const krayniy=airport('airfield','krayniy');
const hub=point(...geography.project(63.33,45.94));
const circuit=createFlightCircuit(krayniy,{complexCenter:hub,aircraftScale:.28});
assert.equal(FLIGHT_CIRCUIT_VERSION,'krayniy-osm-circuit-v6');
assert.equal(FLIGHT_CYCLE_DURATION,812);assert.equal(FLIGHT_LEG_DURATION,406);
assert.deepEqual(circuit.runways.map(r=>r.key),['krayniy','krayniy']);
assert.deepEqual(circuit.runways.map(r=>r.length),[1550,1550]);
assert.equal(circuit.phases.length,18);
let probes=0,maxWheelError=0,maxLateral=0,minFlightHeight=Infinity;
for(let t=0;t<FLIGHT_CYCLE_DURATION;t+=.1){
 const s=circuit.sample(t),pose=flightPose(circuit,t),r=circuit.runways[s.leg-1];probes++;
 assert.equal(s.airport,'krayniy','Every flight phase returns to Krayniy');
 assert.ok([...s.position.toArray(),...s.velocity.toArray(),...pose.bodyPosition.toArray(),...pose.attitude.toArray()].every(Number.isFinite));
 const height=s.position.y-s.runwayY-r.clearance;minFlightHeight=Math.min(minFlightHeight,height);
 assert.ok(height>=-1e-7,'Flight remains above the active airport at t='+t);
 if(s.segment==='approach'&&s.phaseTime>=82||s.segment==='rollout'){
  const delta=s.position.clone().sub(r.touchdown).setY(0);
  maxLateral=Math.max(maxLateral,new THREE.Vector3().crossVectors(delta,r.axis).length());
 }
 if(s.onGround){
  const local=r.airfield.worldToLocal(s.position.clone());
  assert.ok(Math.abs(local.x)<r.width/2&&Math.abs(local.z)<r.length/2,'Ground manoeuvre remains on '+r.key);
  const bottom=new THREE.Vector3(3,-2.72,-3).multiplyScalar(.28).applyQuaternion(pose.attitude).add(pose.bodyPosition).y-.46*.28;
  maxWheelError=Math.max(maxWheelError,Math.abs(bottom-s.runwayY));
  for(const [x,z]of [[0,12],[-3,-3],[3,-3]])for(const side of [-1,1])for(const dx of [-.135,.135])for(const dz of [-.46,.46]){
   const tyre=new THREE.Vector3(x+side*.26+dx,-2.72,z+dz).multiplyScalar(.28).applyQuaternion(pose.attitude).add(pose.bodyPosition);
   const wheel=r.airfield.worldToLocal(tyre);
   assert.ok(Math.abs(wheel.x)<r.width/2&&Math.abs(wheel.z)<r.length/2,'All tyres stay on the shortened '+r.key+' runway');
  }
 }
}
assert.ok(maxLateral<1e-7&&maxWheelError<1e-7);
for(let leg=0;leg<2;leg++){
 const r=circuit.runways[leg],offset=leg*FLIGHT_LEG_DURATION;
 const touchdown=circuit.sample(offset+120);assert.equal(touchdown.airport,r.key);assert.ok(touchdown.position.distanceTo(r.touchdown)<1e-8);
 const hold=circuit.phases.find(p=>p.leg===leg&&p.phase==='hold');assert.equal(hold.duration,20);
 for(const dt of [0,10,19.999]){const s=circuit.sample(hold.start+dt);assert.equal(s.velocity.length(),0);assert.ok(Math.abs(s.runwayProgress-.8)<1e-9);}
 const takeoff=circuit.phases.find(p=>p.leg===leg&&p.phase==='takeoff');
 assert.ok(circuit.sample(takeoff.start).position.distanceTo(r.startTakeoff)<1e-8);
 const departure=circuit.phases.find(p=>p.leg===leg&&p.phase==='departure');
 const overComplex=circuit.sample(departure.start+56);
 assert.ok(overComplex.position.clone().setY(0).distanceTo(hub)<1e-8,'Each departure crosses the actual complex');
 const exit=circuit.sample(departure.end-.001),delta=exit.position.clone().sub(hub);
 assert.ok(delta.z<-2900);assert.ok(leg===0?delta.x>2800:Math.abs(delta.x)<1);
 const away=circuit.phases.find(p=>p.leg===leg&&p.phase==='away');assert.equal(away.duration,60);
 for(const dt of [0,30,59.999])assert.equal(circuit.sample(away.start+dt).visible,false);
}
const west=circuit.sample(406).position.clone().sub(hub);
assert.ok(west.x<-2800&&Math.abs(west.z)<500,'The second approach returns from the geographic west');
assert.deepEqual(circuit.sample(812).position.toArray(),circuit.sample(0).position.toArray());
for(const p of circuit.phases){
 if(!p.start||p.phase==='away'||p.phase==='approach')continue;
 const before=circuit.sample(p.start-.0001),after=circuit.sample(p.start+.0001);
 assert.ok(before.position.distanceTo(after.position)<.025,'Position continuity at '+p.phase);
 assert.ok(before.velocity.distanceTo(after.velocity)<.025,'Velocity continuity at '+p.phase);
}
console.log('OSM_RELEASE_GEOMETRY_PASS',JSON.stringify({geography:geography.stats(),airports:circuit.runways.map(r=>r.key),probes,cycle:812,stops:[20,20],returns:[60,60],maxWheelError,maxLateral,minFlightHeight}));
