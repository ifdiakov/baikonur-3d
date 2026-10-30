import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createNorthBankMask} from '../src/river-bank.js';
import {createRiverWaterModel} from '../src/river-surface.js';
import {AIRPORT_DIMENSIONS,AIRPORT_SCALE,airportDisplaySpec} from '../src/airport-models.js';
import {buildAirportLightRecords} from '../src/airport-light-layout.js';
import {buildEveningScene} from '../src/evening-scene.js';
import {createArrivalPath,arrivalPose,FLIGHT_CYCLE_DURATION} from '../src/arrival-flight.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const project=coord=>{const p=geography.project(coord);return[(p[0]-650)*3.4,(p[1]-522.5)*3.4];};
const waterData=read('data/osm/river-water.geojson'),waterDataBefore=JSON.stringify(waterData);
const water=createRiverWaterModel({data:waterData,project});
const sourceRunway=read('data/osm/airports.geojson').features.find(f=>f.properties.osmId===37591623&&f.geometry.type==='LineString');
const a=project(sourceRunway.geometry.coordinates[0]),b=project(sourceRunway.geometry.coordinates.at(-1)),sign=b[0]>=a[0]?1:-1;
const airport=new THREE.Group();airport.position.set((a[0]+b[0])/2,-2.72,(a[1]+b[1])/2);
airport.rotation.y=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);airport.scale.setScalar(AIRPORT_SCALE);
airport.userData.airport=airportDisplaySpec('krayniy');
const expectedCenter=airport.position.toArray(),expectedYaw=airport.rotation.y;
const sourceRiver=read('data/osm/river.geojson').features.find(f=>f.geometry.type==='LineString').geometry.coordinates;
const bank=createNorthBankMask(sourceRiver.map(project));
const shoreReserve=5;
function checkCandidate(length){
 airport.userData.airport=airportDisplaySpec('krayniy',{length});
 const layout=buildAirportLightRecords(airport),lights=[...layout.runway,...layout.apron];
 let clearance=Infinity,critical=null;
 for(const light of lights){
  const distance=water.landClearance(light.x,light.z)-(light.radius||0);
  if(distance<clearance){clearance=distance;critical={kind:light.kind,local:light.local,world:[light.x,light.z]};}
  if(!bank.contains(light.x,light.z))return{clearance:-Infinity,critical:{...critical,oppositeBank:true},count:lights.length};
 }
 // A sparse approach array must not jump across a narrow water channel.
 // Check its entire continuous centreline, not only individual lamps.
 const extent=length/2+layout.approachLength,steps=Math.ceil(2*extent*AIRPORT_SCALE/2);
 for(let i=0;i<=steps;i++){
  const p=airport.localToWorld(new THREE.Vector3(0,2.1,-extent+2*extent*i/steps));
  const distance=water.landClearance(p.x,p.z);
  if(distance<clearance){clearance=distance;critical={kind:'continuous-light-axis',world:[p.x,p.z]};}
  if(!bank.contains(p.x,p.z))return{clearance:-Infinity,critical:{...critical,oppositeBank:true},count:lights.length};
 }
 return {clearance,critical,count:lights.length};
}
const length=AIRPORT_DIMENSIONS.krayniy.length;
assert(length<1550,'Krayniy was not shortened');
const candidate=checkCandidate(length);
assert(candidate.clearance>=shoreReserve-1e-5,'Airport lighting still touches water or lacks its shore reserve: '+JSON.stringify(candidate));
if(length+10<1550){
 const longer=checkCandidate(length+10);
 assert(longer.clearance<shoreReserve,'The runway was shortened more than needed for the chosen shore reserve');
}
airport.userData.airport=airportDisplaySpec('krayniy');
assert.deepEqual(airport.position.toArray(),expectedCenter);assert.equal(airport.rotation.y,expectedYaw);
assert.equal(airport.userData.airport.referenceLength,3100,'The geographic source length must stay explicit');

// Build the real evening-light meshes with no shoreline hiding: every bulb
// must fit on land by construction, rather than pass because it was culled.
const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.FogExp2(0,0);
scene.add(new THREE.HemisphereLight());const sun=new THREE.DirectionalLight();scene.add(sun,airport);
const layers={roads:new THREE.Group(),sites:new THREE.Group(),city:new THREE.Group()};scene.add(...Object.values(layers));
const evening=buildEveningScene({scene,camera:new THREE.PerspectiveCamera(),renderer:{},sun,layers,
 objects:[{g:airport,type:'air',record:{id:'airfield'}}],roads:[],airfield:airport,groundMeshes:[],isLightAllowed:()=>true});
let actualBufferLights=0,minBufferClearance=Infinity;
scene.updateMatrixWorld(true);
for(const name of ['Аэродромы · ВПП, глиссада и рулёжные огни · свечение','Аэродромы · перроны · свечение']){
 const glow=scene.getObjectByName(name);assert(glow?.isPoints,'Actual airport light buffer is missing');
 const position=glow.geometry.attributes.position;
 for(let i=0;i<glow.geometry.drawRange.count;i++){
  const p=glow.localToWorld(new THREE.Vector3().fromBufferAttribute(position,i)),distance=water.landClearance(p.x,p.z);
  assert(!water.isWater(p.x,p.z)&&bank.contains(p.x,p.z),'A rendered airport light lies over water');
  assert(distance>=shoreReserve-1e-3,'A rendered airport light lost its shore reserve through transforms');
  minBufferClearance=Math.min(minBufferClearance,distance);actualBufferLights++;
 }
}
assert.equal(actualBufferLights,candidate.count);
assert.equal(evening.airportLightPositions('krayniy').length,actualBufferLights);
assert.equal(evening.stats().bankFilter.excludedByBank.runway,0,'The airport relied on hiding wet runway lights');
assert.equal(evening.stats().bankFilter.excludedByBank.apron,0);

// Fly both complete sorties at the actual source-derived transform. Besides
// runway position, test the rendered tyre footprint during every ground phase.
const path=createArrivalPath(airport,{complexCenter:new THREE.Vector3(...(()=>{const p=project([63.33,45.94]);return[p[0],0,p[1]];})())});
let groundStates=0,tyreProbes=0,maxWheelHeightError=0;
for(let t=0;t<FLIGHT_CYCLE_DURATION;t+=.1){
 const state=path.sample(t);if(!state.onGround)continue;
 const pose=arrivalPose(path,t);groundStates++;
 for(const [x,z] of [[0,12],[-3,-3],[3,-3]])for(const side of [-1,1])for(const dx of [-.135,.135])for(const dz of [-.46,.46]){
  const p=new THREE.Vector3(x+side*.26+dx,-2.72,z+dz).multiplyScalar(.28).applyQuaternion(pose.attitude).add(pose.bodyPosition),local=airport.worldToLocal(p.clone());
  assert(Math.abs(local.x)<airport.userData.airport.width/2&&Math.abs(local.z)<length/2,'A tyre leaves the shortened asphalt');
  assert(!water.isWater(p.x,p.z),'A ground tyre reaches water');tyreProbes++;
 }
 const bottom=new THREE.Vector3(3,-2.72,-3).multiplyScalar(.28).applyQuaternion(pose.attitude).add(pose.bodyPosition).y-.46*.28;
 maxWheelHeightError=Math.max(maxWheelHeightError,Math.abs(bottom-state.runwayY));
}
assert(maxWheelHeightError<1e-7);assert(groundStates>1000&&tyreProbes>20000);
assert.equal(JSON.stringify(waterData),waterDataBefore,'The runway update mutated the water source');
console.log('AIRPORT_SHORE_CLEARANCE_PASS',JSON.stringify({displayLength:length,worldLength:length*AIRPORT_SCALE,referenceLength:3100,
 approachLength:airport.userData.airport.approachLength,actualBufferLights,shoreReserve,minClearance:candidate.clearance,minBufferClearance,critical:candidate.critical,
 center:expectedCenter,yaw:expectedYaw,groundStates,tyreProbes,maxWheelHeightError}));
