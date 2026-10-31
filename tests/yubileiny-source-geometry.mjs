import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildAirport,airportDisplaySpec,AIRPORT_SCALE} from '../src/airport-models.js';
import {YUBILEINY_SOURCE_LAYOUT} from '../src/yubileiny-layout.js';
import {YUBILEINY_PHYSICAL,YUBILEINY_VERSION} from '../src/yubileiny-airport.js';
import {airportLocalLightLayout,buildAirportLightRecords} from '../src/airport-light-layout.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},fillRect(){},fillText(){}})})};
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const spec=airportDisplaySpec('yubileiny');
assert.equal(spec.version,YUBILEINY_VERSION);
assert.equal(spec.length,2250);assert.equal(spec.width,42);
assert.deepEqual(spec.physicalDimensions.runway,[4500,84]);
assert.equal(spec.physicalToLocal,.5);assert.equal(spec.longitudinalScale,.5);
near(AIRPORT_SCALE*spec.physicalToLocal,.14);
near(spec.length/spec.width,4500/84);
assert.deepEqual(spec.apron,[312.5,-557.5]);
assert.equal(YUBILEINY_PHYSICAL.taxiwayWidth,24);assert.equal(YUBILEINY_PHYSICAL.connectorWidth,21);
assert.equal(YUBILEINY_PHYSICAL.endSafetyLength,250);
assert.deepEqual(YUBILEINY_SOURCE_LAYOUT.features.map(f=>f.id).sort((a,b)=>a-b),
 [20700858,241008132,241008134,241008138,241008143,241008144,241008147,241008154,241008163,1239975065,1515715355].sort((a,b)=>a-b));

const root=new THREE.Group();root.scale.setScalar(AIRPORT_SCALE);buildAirport(root,'yubileiny');root.updateWorldMatrix(true,true);
const physical=root.getObjectByName('Юбилейный · физическая геометрия в метрах');assert(physical);
assert.deepEqual(physical.scale.toArray(),[.5,.5,.5]);
const inverse=physical.matrixWorld.clone().invert(),instance=new THREE.Matrix4();
let checkedVertices=0,triangles=0,runwayBoxes=0,endSafetyBoxes=0,highObjects=0;
root.traverse(mesh=>{
 if(!mesh.isMesh)return;
 const geo=mesh.geometry,positions=geo.attributes.position,count=mesh.isInstancedMesh?mesh.count:1;
 triangles+=(geo.index?.count??positions.count)/3*count;
 for(let n=0;n<count;n++){
  const transform=inverse.clone().multiply(mesh.matrixWorld);
  if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);transform.multiply(instance);}
  const bounds=new THREE.Box3();
  for(let i=0;i<positions.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(transform);
   assert(p.toArray().every(Number.isFinite));bounds.expandByPoint(p);checkedVertices++;
   if(p.y>3.1){assert(!(Math.abs(p.x)<50&&Math.abs(p.z)<2500),'An elevated structure intrudes on the runway: '+p.toArray());highObjects++;}
  }
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(Math.abs(size.x-84)<.001&&Math.abs(size.z-4500)<.001){near(size.y,.3);near(center.y,1.6);runwayBoxes++;}
  if(Math.abs(size.x-84)<.001&&Math.abs(size.z-250)<.001){near(Math.abs(center.z),2375);endSafetyBoxes++;}
 }
});
assert.equal(runwayBoxes,1);assert.equal(endSafetyBoxes,2);assert(highObjects>500);
assert.equal(root.userData.airport.features['concrete-runway'],1);
assert.equal(root.userData.airport.features['parallel-taxiway'],undefined,'No fabricated full-length taxiway remains');
assert.equal(root.userData.airport.features['airport-terminal'],undefined,'No generic terminal is retained');
assert.equal(root.userData.airport.geometry.taxiwaySourceFeatures,11);
assert.equal(root.userData.airport.mriya.physicalToAirportLocal,.5);
const aircraft=root.getObjectByName('Ан-225 «Мрия» с «Бураном» · импортированная модель');assert(aircraft);
near(aircraft.getWorldPosition(new THREE.Vector3()).y,1.75*.28);
assert(aircraft.position.x>500,'The loading complex belongs to the NW facilities side');
for(const building of root.userData.airport.buildingFootprints)assert(building.polygon.every(([x])=>x>350),'Building belongs behind the taxiway/aprons');

const lights=airportLocalLightLayout(spec);assert.equal(lights.apron.length,8);
for(const light of lights.apron){assert(light.x>200);assert(!(Math.abs(light.x)<36&&Math.abs(light.z)<1250));}
const taxi=lights.runway.filter(l=>l.kind==='taxiway');assert(taxi.length>60&&taxi.length<160);
function segmentDistance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a[0]-dx*t,p.z-a[1]-dz*t);}
for(const light of taxi)assert(spec.lightPaths.some(path=>path.points.slice(1).some((p,i)=>segmentDistance(light,path.points[i],p)<1e-5)),'Taxiway light must follow an actual source path');
assert.equal(buildAirportLightRecords(root).apron.length,8);
console.log('YUBILEINY_SOURCE_GEOMETRY_PASS',JSON.stringify({version:spec.version,reference:[4500,84],local:[2250,42],world:[630,11.76],checkedVertices,triangles,taxiLights:taxi.length,apronPoles:lights.apron.length,sourceFeatures:11}));
