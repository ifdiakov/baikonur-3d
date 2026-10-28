import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork,buildOsmGraph} from '../src/osm-transport.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {SATURN_ACCESS,saturnTerrainHeight} from '../src/saturn-access.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json');
const geography=createMuseumGeography({catalog,matches});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const stats=transport.stats();
assert.equal(stats.source,'OpenStreetMap');assert.equal(stats.roadFeatureCount,3185);assert.equal(stats.railFeatureCount,543);assert(stats.roadRoutes>2000);assert(stats.railRoutes>400);
assert(stats.junctionCount>100);assert(stats.mergedMeshCount<=10);assert(stats.stationCount>=20);assert.equal(stats.abandonedRailWays,30);
assert(stats.markingSegments>100);assert(stats.railTies>1000);assert(stats.interchange.bridges.length>0);
assert.equal(stats.roadStyle.asphaltColor,'#adb2b3');assert.equal(stats.roadStyle.widths.trunk,3.6);assert.equal(stats.roadStyle.widths.service,1.6);
assert.equal(stats.cityRoadSimplification.sourceBoundary,'way/39209179');assert(stats.cityRoadSimplification.hiddenWays>100);
assert(stats.renderedRoadWays>1000&&stats.renderedRoadWays<stats.roadRoutes);
const settlements=Object.fromEntries(stats.settlementRoadSimplification.map(s=>[s.id,s]));
assert.equal(settlements.akai.sourceBoundary,'relation/16783113');assert.equal(settlements.tyuratam.sourceBoundary,'relation/15005695');
assert(settlements.baikonur.renderedWayCount<settlements.baikonur.sourceWayCount*.12);
assert(settlements.akai.renderedWayCount<=10&&settlements.akai.hiddenWays>250);
assert(settlements.tyuratam.renderedWayCount<=6&&settlements.tyuratam.hiddenWays>250);
for(const region of Object.values(settlements)){
 assert.equal(region.sourceWayCount,region.renderedWayCount+region.hiddenWays);
 assert.equal(region.keptWayIds.length,region.renderedWayCount);
 for(const id of region.preservedTrafficWayIds)assert(region.keptWayIds.includes(id));
}
let meshCount=0,vertices=0,upwardTriangles=0;
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
for(const layer of Object.values(layers))layer.traverse(m=>{
 if(!m.isMesh)return;meshCount++;const p=m.geometry.attributes.position;
 if(p){vertices+=p.count;for(const v of p.array)assert(Number.isFinite(v),'non-finite mesh vertex');}
 if(!m.userData.osmSource)return;
 const ns=m.geometry.attributes.normal,index=m.geometry.index;
 for(let i=0;i<index.count;i+=3){
  a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
  b.sub(a);c.sub(a);normal.crossVectors(b,c).normalize();
  assert(normal.y>0,`${m.name}: road/rail sheet has downward or degenerate winding`);
  for(let j=0;j<3;j++){
   a.fromBufferAttribute(ns,index.getX(i+j));
   assert(normal.dot(a)>.9999,`${m.name}: winding and lighting normal disagree`);
  }
  upwardTriangles++;
 }
});
assert(upwardTriangles>100000);
assert(meshCount<100,`Unexpected draw-call growth: ${meshCount}`);
// Probe the actual rendered surface, including road edges. Sampling only
// source nodes missed long wedges where the nonlinear hill hid the pavement.
const saturn=geography.sites.find(s=>s.id==='pad-23'),saturnCenter=point(saturn.x,saturn.y),surfaceCells=new Map(),surfaceCell=16;
let terrainSamples=0,minTerrainClearance=Infinity;
layers.roads.traverse(m=>{
 if(m.name!=='OSM · единое дорожное полотно')return;
 assert.equal(m.material.color.getHexString(),'adb2b3');
 const p=m.geometry.attributes.position,ix=m.geometry.index;
 for(let i=0;i<ix.count;i+=3){
  const triangle=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+k)));
  for(let x=Math.floor(Math.min(...triangle.map(v=>v.x))/surfaceCell);x<=Math.floor(Math.max(...triangle.map(v=>v.x))/surfaceCell);x++)for(let z=Math.floor(Math.min(...triangle.map(v=>v.z))/surfaceCell);z<=Math.floor(Math.max(...triangle.map(v=>v.z))/surfaceCell);z++){
   const key=x+':'+z;if(!surfaceCells.has(key))surfaceCells.set(key,[]);surfaceCells.get(key).push(triangle);
  }
  for(const v of [...triangle,triangle[0].clone().add(triangle[1]).add(triangle[2]).multiplyScalar(1/3)])if(Math.abs(v.x-saturnCenter.x)<240&&Math.abs(v.z-saturnCenter.z)<250){
   const height=SATURN_ACCESS.elevation+SATURN_ACCESS.scale*saturnTerrainHeight((v.x-saturnCenter.x)/SATURN_ACCESS.scale,(v.z-saturnCenter.z)/SATURN_ACCESS.scale);
   minTerrainClearance=Math.min(minTerrainClearance,v.y-height);terrainSamples++;
  }
 }
});
assert(terrainSamples>1000);assert(minTerrainClearance>.3,'Pavement cuts into Saturn terrain');
function pavementHeights(x,z){
 const out=[];for(const [a,b,c] of surfaceCells.get(Math.floor(x/surfaceCell)+':'+Math.floor(z/surfaceCell))||[]){
  const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(!den)continue;
  const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;
  if(u>=-1e-5&&v>=-1e-5&&u+v<=1+1e-5)out.push(u*a.y+v*b.y+(1-u-v)*c.y);
 }return out;
}
let paintVertices=0;
layers.roads.traverse(m=>{if(m.name!=='OSM · разметка')return;const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){
 const heights=pavementHeights(p.getX(i),p.getZ(i)),y=p.getY(i);
 assert(heights.some(h=>y-h>.02&&y-h<.08),'Road paint has no pavement beneath it');paintVertices++;
}});
assert(paintVertices>1000);
const plan=buildRoadVehicleRoutes(transport.roadPaths());assert.equal(plan.source,'OpenStreetMap');assert.equal(plan.routes.length,4);
for(const route of plan.routes){assert(route.length>500);assert(route.osmWayIds.length>3);assert(route.nodeIds.length>20);for(const id of route.osmWayIds)assert(!stats.cityRoadSimplification.hiddenWayIds.includes(id),'An active traffic road was hidden');for(let t=0;t<1000;t+=7.3){const pose=roadVehiclePose(route,t,{phase:.2,direction:1,speed:12});assert(pose.position.toArray().every(Number.isFinite));assert(Math.abs(pose.tangent.length()-1)<1e-6);assert(Math.abs(pose.laneOffset)+.9*route.vehicleScale<route.widthAt(pose.distance)/2,'car does not fit inside the narrowed road');}}
const hotelSpec=ARCHIVE_MAP.find(s=>s.id==='pad-75'),hotelSite=geography.sites.find(s=>s.id==='pad-75'),hotelOrigin=point(hotelSite.x,hotelSite.y),up=new THREE.Vector3(0,1,0);
for(const route of plan.routes)for(const direction of [-1,1])for(let d=2;d<route.length-2;d+=2){
 const pose=roadVehiclePose(route,0,{phase:d/route.length,direction,speed:12}),p=pose.position,heights=pavementHeights(p.x,p.z);
 assert(heights.some(y=>Math.abs(p.y-y)<.08),'A moving car leaves the rendered OSM pavement');
 const hotelLocal=p.clone().sub(hotelOrigin).applyAxisAngle(up,-hotelSpec.yaw).divideScalar(hotelSpec.scale);
 assert(!(hotelLocal.x>-33&&hotelLocal.x<34&&hotelLocal.z>-10&&hotelLocal.z<42),'Through traffic crosses the hotel courtyard');
}
const train=transport.trainPath();assert.equal(train.source,'OpenStreetMap');assert(train.path.length>500);assert(train.osmWayIds.length>5);
for(let d=0;d<train.path.length-1;d+=1){const a=train.path.position(d),b=train.path.position(d+1);assert(a.distanceTo(b)<=1.00001,'train path jump');assert(a.toArray().every(Number.isFinite));}
assert(stats.facilityPorts.length>=6);for(const p of stats.facilityPorts)assert(p.roadGap<1e-7);assert(stats.saturnAccess?.gateError<1e-7);
assert(stats.facilityRailPorts.length>=5);for(const p of stats.facilityRailPorts){assert(p.headCenterGap<1e-7);assert(p.networkDatumGap<1e-7);assert(new THREE.Vector3(...p.headCenter).distanceTo(new THREE.Vector3(...p.renderedHeadCenter))<1e-7);}
// A drawn crossing without a common source node must never form a junction.
const fixture=(id,ids,coordinates)=>({id:'way/'+id,properties:{osmId:id,sourceNodeIds:ids,tags:{highway:'secondary'}},geometry:{type:'LineString',coordinates}});
const graph=buildOsmGraph([fixture(1,[1,2],[[63.3,45.9],[63.5,45.9]]),fixture(2,[3,4],[[63.4,45.8],[63.4,46]])],{geography,point});assert.equal(graph.components.length,2);
console.log('OSM_TRANSPORT_GEOMETRY_PASS',JSON.stringify({stats,meshCount,vertices,upwardTriangles,terrainSamples,minTerrainClearance,paintVertices,trainLength:train.path.length,routeLengths:plan.routes.map(r=>r.length)}));
