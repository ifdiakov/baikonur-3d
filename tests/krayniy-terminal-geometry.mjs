import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildAirport,airportDisplaySpec,AIRPORT_DIMENSIONS,AIRPORT_SCALE} from '../src/airport-models.js';
import {KRAYNIY_TERMINAL_VERSION} from '../src/krayniy-terminal.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createRiverWaterModel} from '../src/river-surface.js';
import {buildAirportLightRecords} from '../src/airport-light-layout.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';

// Canvas text is the only browser-only operation in the static building.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},fillRect(){},fillText(){}})})};
const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const [catalog,matches,airports,waterData,roads,railways,railPoints,places,legacyData]=await Promise.all([
 'data/catalog.json','data/osm/catalog-matches.json','data/osm/airports.geojson','data/osm/river-water.geojson','data/osm/roads.geojson',
 'data/osm/railways.geojson','data/osm/rail-points.geojson','data/osm/places.geojson','data/transport-network.json'
].map(read));
const geography=createMuseumGeography({catalog,matches}),point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const project=coord=>{const p=point(...geography.project(coord));return[p.x,p.z];};
const runway=airports.features.find(f=>f.properties.osmId===37591623),a=project(runway.geometry.coordinates[0]),b=project(runway.geometry.coordinates.at(-1)),sign=b[0]>=a[0]?1:-1;
const root=new THREE.Group();buildAirport(root,'krayniy');
const metadata=root.userData.airport.terminal,terminal=root.getObjectByName('Крайний · аэровокзал по фотографиям');
assert.equal(metadata.version,KRAYNIY_TERMINAL_VERSION);assert.equal(metadata.source.photos.length,5);
assert.equal(metadata.center[0],-270,'The former +325 terminal must be on the other side of the runway');
assert.equal(root.userData.airport.apron[0],-132.5);assert.equal(root.userData.airport.apron[1],0);assert.equal(root.userData.airport.apronWidth,195);assert.equal(root.userData.airport.taxiX,-100);
assert.equal(AIRPORT_DIMENSIONS.krayniy.length,1380);assert.equal(AIRPORT_DIMENSIONS.krayniy.referenceLength,3100);
assert.equal(root.userData.airport.features['airport-terminal'],undefined,'The generic Krayniy hall must be gone');
assert.equal(root.userData.airport.features['control-tower'],undefined,'A separate generic control tower must not remain');
assert.deepEqual(metadata.signTexts,['БАЙКОНУР','АЭРОПОРТ']);
assert.deepEqual(terminal.children.filter(o=>o.userData.signText).map(o=>o.userData.signText),metadata.signTexts);
assert(metadata.meshCount<=22&&metadata.triangles<6000,'The terminal must remain batched and lightweight');
assert.equal(metadata.externalTextures,0);
assert.equal(metadata.features['integrated-control-tower'],1);assert.equal(metadata.features['sloped-pavilion-glazing'],2);
assert.equal(metadata.features['inclined-control-cab'],4);assert.equal(metadata.features['forecourt-diagonal-walk'],4);assert.equal(metadata.features['forecourt-circular-basin'],32);
assert(metadata.grounds.parking.maxX<metadata.grounds.garden.minX&&metadata.grounds.garden.maxX<metadata.center[0],'The landside composition must be garden then parking away from the runway');

root.updateMatrixWorld(true);let actualTriangles=0,meshCount=0,vertexCount=0;
const actualPoints=[],glazing=[];
terminal.traverse(mesh=>{
 if(!mesh.isMesh)return;meshCount++;
 const geometry=mesh.geometry,position=geometry.attributes.position,count=mesh.isInstancedMesh?mesh.count:1;
 actualTriangles+=(geometry.index?.count??position.count)/3*count;
 for(let n=0;n<count;n++){
  const matrix=mesh.matrixWorld.clone();if(mesh.isInstancedMesh){const instance=new THREE.Matrix4();mesh.getMatrixAt(n,instance);matrix.multiply(instance);}
  for(let i=0;i<position.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix);vertexCount++;
   assert(p.toArray().every(Number.isFinite));assert(p.x< -120,'No part of the new terminal or approach is on the runway');actualPoints.push(p);
   if(mesh.name==='Крайний · glass surfaces'&&p.y>=27.29)glazing.push(p);
  }
 }
});
assert.equal(actualTriangles,metadata.triangles);assert.equal(meshCount,metadata.meshCount);
const lower=glazing.filter(p=>Math.abs(p.y-27.3)<1e-4),upper=glazing.filter(p=>Math.abs(p.y-33.4)<1e-4);
const width=points=>Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));
assert(lower.length>=8&&upper.length>=8&&width(upper)>width(lower)+5,'The control cab must widen upward as in the photos');
for(const key of ['airside','landside','top']){
 const camera=metadata.camera[key];assert(camera.eye.every(Number.isFinite)&&camera.target.every(Number.isFinite));
 const offset=new THREE.Vector3(...camera.eye).sub(new THREE.Vector3(...camera.target));
 assert(Math.atan2(offset.y,Math.hypot(offset.x,offset.z))>=Math.PI/6-1e-6,'Presets must respect the museum camera elevation');
}

// Check source-derived world placement, including vertices and the complete
// landside driveway; the model may not solve the side change by using water.
root.position.set((a[0]+b[0])/2,0,(a[1]+b[1])/2);
root.rotation.y=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);root.scale.setScalar(AIRPORT_SCALE);root.updateMatrixWorld(true);
const water=createRiverWaterModel({data:waterData,project}),footprint=new Map();
for(const p of actualPoints)footprint.set(p.x.toFixed(3)+':'+p.z.toFixed(3),p);
let minimumLandClearance=Infinity;
for(const p of footprint.values()){
 const world=root.localToWorld(p.clone());assert(!water.isWater(world.x,world.z),'A terminal/driveway vertex lies over water '+JSON.stringify({local:p.toArray(),world:world.toArray()}));
 minimumLandClearance=Math.min(minimumLandClearance,water.landClearance(world.x,world.z));
}
assert(minimumLandClearance>5,'The forecourt is too close to the riverbank');
for(const light of [...buildAirportLightRecords(root).runway,...buildAirportLightRecords(root).apron])assert(water.landClearance(light.x,light.z)-(light.radius||0)>=5,'Relocated apron lights touch water');

const sourceWay=roads.features.find(f=>String(f.properties.osmId)===metadata.access.sourceWayId),sourceNode=sourceWay.properties.sourceNodeIds.indexOf(Number(metadata.access.sourceNodeId));
assert(sourceNode>=0);const source=point(...geography.project(sourceWay.geometry.coordinates[sourceNode]),.72);
const driveway=terminal.children.find(mesh=>mesh.name==='Крайний · asphalt surfaces');assert(driveway);
const positions=driveway.geometry.attributes.position;
const roadStart=driveway.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,0).add(new THREE.Vector3().fromBufferAttribute(positions,5)).multiplyScalar(.5));
assert(roadStart.distanceTo(source)<2e-5,'The real driveway geometry does not meet the archived source road');
// The source road must also survive the museum's display simplification.
const siteRecords=geography.sites.filter(s=>!s.aliasOf&&s.render!==false);
for(const [id,wayId]of [['airfield',37591623],['pad-251',24949215]]){
 const site=siteRecords.find(s=>s.id===id),r=airports.features.find(f=>f.properties.osmId===wayId),p=geography.project(r.geometry.coordinates[0]),q=geography.project(r.geometry.coordinates.at(-1)),d=q[0]>=p[0]?1:-1;
 site.x=(p[0]+q[0])/2;site.y=(p[1]+q[1])/2;site.runtimeYaw=Math.atan2((q[0]-p[0])*d,(q[1]-p[1])*d);
}
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data:{roads,railways,railPoints,places,airports},legacyData,geography,point,layers,siteRecords});
assert(transport.roadPaths().some(path=>path.source==='OpenStreetMap'&&path.points.some(p=>p.distanceTo(source)<1e-5)),'Terminal road anchor was filtered out');
// Yubileiny uses a separate source-grounded metric layout; Krayniy is unchanged.
const y=airportDisplaySpec('yubileiny');assert.equal(y.length,2250);assert.equal(y.width,42);assert.deepEqual(y.apron,[312.5,-557.5]);assert.equal(y.taxiX,226.8);assert.equal(y.apronLightRadius,5);assert.equal(y.physicalToLocal,.5);
console.log('KRAYNIY_TERMINAL_GEOMETRY_PASS',JSON.stringify({version:metadata.version,sourcePhotos:5,meshCount,triangles:actualTriangles,vertexCount,footprintProbes:footprint.size,minimumLandClearance,sourceRoadGap:roadStart.distanceTo(source),center:metadata.center,cameras:Object.keys(metadata.camera)}));
