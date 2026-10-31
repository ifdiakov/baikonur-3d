import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork,buildOsmGraph} from '../src/osm-transport.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {SATURN_ACCESS,saturnTerrainHeight,saturnTerrainSample} from '../src/saturn-access.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json');
const geography=createMuseumGeography({catalog,matches});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const stats=transport.stats();
assert.equal(stats.source,'OpenStreetMap');assert.equal(stats.roadFeatureCount,3185);assert.equal(stats.railFeatureCount,543);assert(stats.roadRoutes>2000);assert(stats.railRoutes>400);
assert(stats.junctionCount>100);assert(stats.mergedMeshCount<=11,'Road paint adds only two color batches');assert(stats.stationCount>=20);assert.equal(stats.abandonedRailWays,30);
assert(stats.markingSegments>100);assert(stats.railTies>1000);assert(stats.interchange.bridges.length>0);
assert.equal(stats.roadStyle.asphaltColor,'#adb2b3');assert.equal(stats.roadStyle.widths.trunk,3.6);assert.equal(stats.roadStyle.widths.service,1.6);
assert.equal(stats.cityRoadSimplification.sourceBoundary,'way/39209179');assert(stats.cityRoadSimplification.hiddenWays>100);
assert(stats.renderedRoadWays>1000&&stats.renderedRoadWays<stats.roadRoutes);
assert.equal(stats.branchSimplification.version,'terminal-branches-v2');
assert.equal(stats.branchSimplification.road.maxLength,80);
assert.equal(stats.branchSimplification.rail.maxLength,55);
assert(stats.branchSimplification.road.removedSegments>1000);
assert(stats.branchSimplification.rail.removedSegments>340);
assert(stats.renderedRoadWays<1320&&stats.renderedRailWays<510);
for(const kind of ['road','rail']){
 const pruning=stats.branchSimplification[kind];
 assert(pruning.branches.every(b=>b.length>0&&b.length<=pruning.maxLength));
 assert.equal(pruning.removedSegments,pruning.branches.reduce((sum,b)=>sum+b.segments,0));
}
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
 if(!['OSM · единое дорожное полотно','OSM · асфальт трассы','Виадук · asphalt'].includes(m.name))return;
 assert.equal(m.material.color.getHexString(),m.name==='OSM · единое дорожное полотно'?'adb2b3':'42494c');
 m.updateWorldMatrix(true,false);
 const p=m.geometry.attributes.position,ix=m.geometry.index;
 for(let i=0;i<(ix?.count??p.count);i+=3){
  const triangle=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(m.matrixWorld));
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
  // World-space Float32 precision, including source probes exactly on a
  // shared short section. This stays below 0.0004 map units at road edges.
  const epsilon=.0004*Math.max(a.distanceTo(b),b.distanceTo(c),a.distanceTo(c))/Math.abs(den);
  if(u>=-epsilon&&v>=-epsilon&&u+v<=1+epsilon)out.push(u*a.y+v*b.y+(1-u-v)*c.y);
 }return out;
}
// A lifted road can clear an oversized hill and still violate the requested
// layout. Check the full source-road corridor separately from vertical
// clearance, then compare the real rendered roads with the unmodified OSM
// elevations (including bridges). Keep the hill off both main roads and ramps.
const baselineRoads=buildOsmGraph(data.roads.features,{geography,point});
const arterialWays=new Map(baselineRoads.ways.filter(w=>['trunk','primary'].includes(w.tags.highway?.replace('_link',''))).map(w=>[w.osmId,w]));
const corridorRadius=320,corridorKinds=new Set(),checkedWays=new Set();
const steppe=SATURN_ACCESS.elevation+SATURN_ACCESS.scale*saturnTerrainHeight(1e6,1e6);
let corridorSamples=0,renderedArterialSamples=0,maxCorridorRelief=0,maxCorridorOpacity=0,maxArterialHeightError=0;
for(const way of arterialWays.values())for(const edge of way.segments){
 const start=edge.a.position,end=edge.b.position,dx=end.x-start.x,dz=end.z-start.z,length=Math.hypot(dx,dz);
 const half=(way.width+stats.roadStyle.shoulderExtra)/2,sections=Math.max(1,Math.ceil(length));
 const across=Math.max(2,Math.ceil(half*2));
 for(let i=0;i<=sections;i++){
  const t=i/sections,x=start.x+dx*t,z=start.z+dz*t;
  if(Math.hypot(x-saturnCenter.x,z-saturnCenter.z)>corridorRadius)continue;
  checkedWays.add(way.osmId);corridorKinds.add(way.tags.highway);
  for(let j=0;j<=across;j++){
   const offset=-half+2*half*j/across,px=x-dz/length*offset,pz=z+dx/length*offset;
   const sample=saturnTerrainSample((px-saturnCenter.x)/SATURN_ACCESS.scale,(pz-saturnCenter.z)/SATURN_ACCESS.scale);
   const relief=SATURN_ACCESS.elevation+SATURN_ACCESS.scale*sample.height-steppe;
   maxCorridorRelief=Math.max(maxCorridorRelief,relief);maxCorridorOpacity=Math.max(maxCorridorOpacity,sample.opacity);corridorSamples++;
   assert(relief<.01&&sample.opacity<1e-6,`Saturn hill reaches ${way.tags.highway} way/${way.osmId}, including its shoulders`);
  }
 }
}
assert(corridorSamples>1000,'The road corridor check did not sample the vicinity of Saturn');
for(const kind of ['trunk','primary','trunk_link','primary_link'])assert(corridorKinds.has(kind),`Missing Saturn corridor coverage for ${kind}`);
function sourceRoadHeight(way,p){
 let distance=Infinity,height;
 for(const edge of way.segments){
  // The same endpoint-preserving highway profile is consumed by the bridge,
  // road surface and cars. Terrain must not lift any of those samples.
  const samples=edge.surfacePoints||[edge.a.position,edge.b.position];
  for(let i=1;i<samples.length;i++){
   const a=samples[i-1],b=samples[i],dx=b.x-a.x,dz=b.z-a.z;
   const t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz),0,1);
   const d=(p.x-a.x-dx*t)**2+(p.z-a.z-dz*t)**2;
   if(d<distance){distance=d;height=a.y+(b.y-a.y)*t;}
  }
 }
 assert(distance<1e-8,'Rendered arterial left its shared source-anchored centerline');
 return baselineRoads.highwaySurfaceHeight(new THREE.Vector3(p.x,height,p.z),way.width);
}
for(const road of transport.roadPaths()){
 if(!road.id.startsWith('osm-road-'))continue;
 const way=arterialWays.get(road.osmWayIds?.[0]);if(!way||!checkedWays.has(way.osmId))continue;
 for(let i=1;i<road.points.length;i++){
  const start=road.points[i-1],end=road.points[i],sections=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)));
  for(let j=0;j<=sections;j++){
   const p=start.clone().lerp(end,j/sections);if(Math.hypot(p.x-saturnCenter.x,p.z-saturnCenter.z)>corridorRadius)continue;
   const expected=sourceRoadHeight(way,p),error=Math.abs(p.y-expected);
   maxArterialHeightError=Math.max(maxArterialHeightError,error);renderedArterialSamples++;
   assert(error<1e-6,`Saturn hill raised ${way.tags.highway} way/${way.osmId}`);
   // The triangular ribbon may differ slightly from its centreline on graded
   // bridge bends; use the same deck tolerance as the moving-car check below.
   const pavement=pavementHeights(p.x,p.z);
   assert(pavement.some(y=>Math.abs(y-expected)<.08),`The rendered pavement of way/${way.osmId} differs from the original road height: ${JSON.stringify({position:p.toArray(),expected,pavement})}`);
  }
 }
}
assert(renderedArterialSamples>1000,'No rendered main-road surfaces were checked near Saturn');
// The owner removed the broad, authored black approach. It must not survive
// as a rendered road or as a path used to generate evening roadside lamps.
const approaches=transport.roadPaths().filter(r=>r.id===SATURN_ACCESS.routeId);
assert.equal(approaches.length,0,'The removed black Saturn approach returned');
assert.equal(stats.saturnAccess,null);
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
 assert(heights.some(y=>Math.abs(p.y-y)<.08),'A moving car leaves the rendered OSM pavement: '+JSON.stringify({route:route.id,direction,distance:d,position:p.toArray(),heights}));
 const hotelLocal=p.clone().sub(hotelOrigin).applyAxisAngle(up,-hotelSpec.yaw).divideScalar(hotelSpec.scale);
 assert(!(hotelLocal.x>-33&&hotelLocal.x<34&&hotelLocal.z>-10&&hotelLocal.z<42),'Through traffic crosses the hotel courtyard');
}
const train=transport.trainPath();assert.equal(train.source,'OpenStreetMap');assert(train.path.length>500);assert(train.osmWayIds.length>5);
// The OSM route is unchanged. Its short museum connector now ends at the
// metric Gagarin socket (85.5 m × .14) instead of the old drawing-unit socket.
// This adds 1.75055 world units without changing any source railway way.
let trainHorizontalLength=0;
for(let i=1;i<train.path.points.length;i++)trainHorizontalLength+=Math.hypot(train.path.points[i].x-train.path.points[i-1].x,train.path.points[i].z-train.path.points[i-1].z);
assert(Math.abs(trainHorizontalLength-1712.7127365959147)<1e-6,'The working train route changed in plan');
assert.deepEqual(train.osmWayIds,['37547653','37543646','37545112','172422609','1468604922','173086738','256360833'],'The train must retain its established OSM route');
for(const route of plan.routes)for(const id of route.osmWayIds)assert(!stats.branchSimplification.road.affectedWayIds.includes(id),'Pruning touched an active vehicle route');
for(let d=0;d<train.path.length-1;d+=1){const a=train.path.position(d),b=train.path.position(d+1);assert(a.distanceTo(b)<=1.00001,'train path jump');assert(a.toArray().every(Number.isFinite));}
assert(stats.facilityPorts.length>=6);for(const p of stats.facilityPorts)assert(p.roadGap<1e-7);
assert.equal(stats.facilityPorts.length,40,'A facility lost its road connection');
assert.equal(stats.facilityRailPorts.length,8,'A facility lost its rail connection');
assert.deepEqual(Object.fromEntries(['pad-110','pad-250','pad-31','pad-45'].map(id=>[id,stats.facilityRailPorts.filter(p=>p.id===id).length])),{'pad-110':4,'pad-250':2,'pad-31':1,'pad-45':1});
for(const port of stats.facilityRailPorts)if(port.physicalGaugeMetres)assert(Math.abs(port.portGauge-port.physicalGaugeMetres*.14)<1e-9);
for(const p of stats.facilityRailPorts){assert(p.headCenterGap<1e-7);assert(p.networkDatumGap<1e-7);assert(new THREE.Vector3(...p.headCenter).distanceTo(new THREE.Vector3(...p.renderedHeadCenter))<1e-7);}
// A drawn crossing without a common source node must never form a junction.
const fixture=(id,ids,coordinates)=>({id:'way/'+id,properties:{osmId:id,sourceNodeIds:ids,tags:{highway:'secondary'}},geometry:{type:'LineString',coordinates}});
const graph=buildOsmGraph([fixture(1,[1,2],[[63.3,45.9],[63.5,45.9]]),fixture(2,[3,4],[[63.4,45.8],[63.4,46]])],{geography,point});assert.equal(graph.components.length,2);
console.log('OSM_TRANSPORT_GEOMETRY_PASS',JSON.stringify({stats,meshCount,vertices,upwardTriangles,terrainSamples,minTerrainClearance,
 saturnRoadClearance:{corridorSamples,renderedArterialSamples,checkedWays:[...checkedWays],kinds:[...corridorKinds],maxCorridorRelief,maxCorridorOpacity,maxArterialHeightError,externalApproaches:approaches.length},
 paintVertices,trainLength:train.path.length,trainHorizontalLength,routeLengths:plan.routes.map(r=>r.length)}));
