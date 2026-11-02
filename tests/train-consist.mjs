import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createGroundTraffic,TRAIN_DURATION} from '../src/ground-traffic.js';
import {COACH_OFFSETS,TRAIN_START_DISTANCE,TRAIN_METRIC_SCALE,RAIL_VEHICLE_PROFILES,COUPLER_CLEARANCE} from '../src/rail-vehicles.js';
import {RAIL_PROFILE} from '../src/rail-profile.js';

const node={addEventListener(){},setAttribute(){}};
globalThis.document={...node,querySelector(){return null;},body:{classList:{add(){},remove(){}}},hidden:false};
const data=JSON.parse(fs.readFileSync('data/transport-network.json'));
const siteRecords=JSON.parse(fs.readFileSync('data/catalog.json')).sites;
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const read=path=>JSON.parse(fs.readFileSync(path));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const osmData={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const transport=buildOsmTransportNetwork({data:osmData,legacyData:data,geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const plan=transport.trainPath(),path=plan.path,transportStats=transport.stats();
assert.equal(plan.gauge,RAIL_PROFILE.gauge);
assert.equal(transportStats.railScheme.protectedRemovedEdges,0,'The rendered network retains every protected scheme edge');

// This index reads final Float32 steel triangles, independently of the route
// planner and its diagnostics. A shared but misplaced path cannot pass by
// comparing an axle position with another position from that same path.
function surfaceSampler(mesh,{regions=null}={}){
 assert(mesh?.isMesh,'The final merged OSM surface mesh exists');
 mesh.updateWorldMatrix(true,false);
 const positions=mesh.geometry.attributes.position,index=mesh.geometry.index,cells=new Map(),cell=8,tolerance=.0005;
 function edgeDistanceSquared(q,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
  return (q.x-a.x-t*dx)**2+(q.z-a.z-t*dz)**2;
 }
 let triangles=0;
 for(let i=0;i<(index?.count??positions.count);i+=3){
  const [a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
  const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
  if(Math.abs(den)<1e-12)continue; // Vertical rail sides cannot support a wheel.
  const t={a,b,c,den,minX:Math.min(a.x,b.x,c.x)-tolerance,maxX:Math.max(a.x,b.x,c.x)+tolerance,
   minZ:Math.min(a.z,b.z,c.z)-tolerance,maxZ:Math.max(a.z,b.z,c.z)+tolerance};
  if(regions&&!regions.some(r=>t.maxX>=r.minX&&t.minX<=r.maxX&&t.maxZ>=r.minZ&&t.minZ<=r.maxZ))continue;
  triangles++;
  for(let x=Math.floor(t.minX/cell);x<=Math.floor(t.maxX/cell);x++)for(let z=Math.floor(t.minZ/cell);z<=Math.floor(t.maxZ/cell);z++){
   const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);
  }
 }
 if(!regions)assert(triangles>0);
 return {triangles,heights(q){
  const heights=[];
  for(const t of cells.get(Math.floor(q.x/cell)+':'+Math.floor(q.z/cell))||[]){
   if(q.x<t.minX||q.x>t.maxX||q.z<t.minZ||q.z>t.maxZ)continue;
   const {a,b,c,den}=t,u=((b.z-c.z)*(q.x-c.x)+(c.x-b.x)*(q.z-c.z))/den,
    v=((c.z-a.z)*(q.x-c.x)+(a.x-c.x)*(q.z-c.z))/den;
   const inside=u>=0&&v>=0&&u+v<=1;
   // Use an actual world-distance tolerance, so an acute triangle cannot
   // turn a barycentric epsilon into a large invisible rail extension.
   if(inside||Math.min(edgeDistanceSquared(q,a,b),edgeDistanceSquared(q,b,c),edgeDistanceSquared(q,c,a))<=tolerance*tolerance)
    heights.push(u*a.y+v*b.y+(1-u-v)*c.y);
  }
  return heights;
 }};
}
const steel=surfaceSampler(layers.rails.getObjectByName('OSM · рельсы'));
let steelProbes=0,routeProbes=0,seamProbes=0,axleProbes=0,maxSteelError=0,steelFailures=0;
const missingSteel=[];
function probeSteel(distance,label,center=path.position(distance)){
 // The train path already stores TOP-of-head Y, including RAIL_PROFILE.headY.
 // Axle headings use the same short look-ahead as the actual wheel assembly.
 const direction=path.sample(distance,.25).tangent,normal=new THREE.Vector3(-direction.z,0,direction.x).normalize();
 for(const side of [-1,1]){
  const q=center.clone().addScaledVector(normal,side*plan.gauge/2),heights=steel.heights(q);
  const error=heights.length?Math.min(...heights.map(y=>Math.abs(y-q.y))):Infinity;
  if(Number.isFinite(error))maxSteelError=Math.max(maxSteelError,error);
  if(error>.001){steelFailures++;if(missingSteel.length<12)missingSteel.push({label,distance,side,point:q.toArray(),error:Number.isFinite(error)?error:null,heights});}
  steelProbes++;
 }
}
// Cover the entire shared route at <=0.5 world intervals, retaining every
// original vertex. Probe immediately on both sides of every source/display
// seam as well: a regular distance grid alone can jump over a narrow gap.
let routeDistance=0,maxRouteStep=0;
for(let i=1;i<path.points.length;i++){
 const length=path.points[i].distanceTo(path.points[i-1]),steps=Math.max(1,Math.ceil(length/.5));
 maxRouteStep=Math.max(maxRouteStep,length/steps);
 for(let j=i===1?0:1;j<=steps;j++){probeSteel(routeDistance+length*j/steps,'route');routeProbes+=2;}
 if(i>1)for(const offset of [-.001,0,.001]){
  probeSteel(THREE.MathUtils.clamp(routeDistance+offset,0,path.length),'seam');seamProbes+=2;
 }
 routeDistance+=length;
}
assert(maxRouteStep<=.5+1e-12);assert(routeProbes>=2*Math.ceil(path.length/.5));assert(seamProbes>0);

// Independent source-node locators and final road triangles catch a shared
// rail/train path buried below pavement. Diagnostic targetHeadY is never
// used as the expected height. Grade-separated bridges are not these four
// explicit OSM level_crossings and their bridge-deck meshes are excluded.
const crossingIds=['1833467958','1833467552','1833284716','1833467226'];
const gradeSeparated=feature=>['bridge','tunnel'].some(key=>feature.properties.tags?.[key]&&feature.properties.tags[key]!=='no');
const crossingSources=crossingIds.map(nodeId=>{
 const feature=osmData.railPoints.features.find(f=>String(f.properties.osmId)===nodeId);
 assert.equal(feature?.properties.tags.railway,'level_crossing');
 const roadWays=osmData.roads.features.filter(f=>f.properties.sourceNodeIds?.some(id=>String(id)===nodeId));
 assert(roadWays.length>0);assert(roadWays.every(f=>!gradeSeparated(f)));
 return {nodeId,position:point(...geography.project(...feature.geometry.coordinates),0),roadWays};
});
const crossingRegions=crossingSources.map(({position:p})=>({minX:p.x-10,maxX:p.x+10,minZ:p.z-10,maxZ:p.z+10}));
const corridorFrom=crossingSources.find(c=>c.nodeId==='1833284716'),corridorTo=crossingSources.find(c=>c.nodeId==='1833467226');
const corridorRail=osmData.railways.features.find(f=>{
 const ids=f.properties.sourceNodeIds?.map(String)??[],from=ids.indexOf(corridorFrom.nodeId),to=ids.indexOf(corridorTo.nodeId);
 return from>=0&&to>=0&&Math.abs(from-to)===1;
});
const corridorRoad=osmData.roads.features.find(f=>String(f.properties.osmId)==='173082916');
assert(corridorRail&&!gradeSeparated(corridorRail)&&corridorRoad&&!gradeSeparated(corridorRoad),
 'The parallel corridor consists of real at-grade source ways, not a bridge exception');
crossingRegions.push({minX:Math.min(corridorFrom.position.x,corridorTo.position.x)-10,maxX:Math.max(corridorFrom.position.x,corridorTo.position.x)+10,
 minZ:Math.min(corridorFrom.position.z,corridorTo.position.z)-10,maxZ:Math.max(corridorFrom.position.z,corridorTo.position.z)+10});
const roadSamplers=['OSM · единое дорожное полотно','OSM · асфальт трассы','OSM · грунтовые проезды']
 .map(name=>layers.roads.getObjectByName(name)).filter(Boolean).map(mesh=>surfaceSampler(mesh,{regions:crossingRegions}));
assert(roadSamplers.length>=2,'Both ordinary and highway pavement are inspected');
const roadHeights=p=>roadSamplers.flatMap(sampler=>sampler.heights(p));
function nearestRouteDistance(target,routePoints=path.points){
 let best=null,along=0;
 for(let i=1;i<routePoints.length;i++){
  const a=routePoints[i-1],b=routePoints[i],dx=b.x-a.x,dz=b.z-a.z,length=a.distanceTo(b);
  const t=THREE.MathUtils.clamp(((target.x-a.x)*dx+(target.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1),p=a.clone().lerp(b,t);
  const error=Math.hypot(p.x-target.x,p.z-target.z);
  if(!best||error<best.error)best={error,distance:along+length*t};along+=length;
 }
 return best;
}
const crossingChecks=[],crossingFailures=[];let crossingProbes=0,crossingFailureCount=0;
for(const source of crossingSources){
 const diagnostic=transportStats.railCrossings?.crossings?.find(c=>String(c.nodeId)===source.nodeId);
 assert(diagnostic,'The explicit source crossing has a local profile: '+source.nodeId);
 const at=nearestRouteDistance(source.position);assert(at.error<1e-6,'The shared route keeps the exact crossing source point: '+source.nodeId);
 const visible=roadHeights(source.position).length>0;
 if(source.roadWays.some(f=>['primary','secondary','tertiary'].includes(f.properties.tags.highway)))
  assert(visible,'The arterial crossing must have actual pavement: '+source.nodeId);
 if(!visible){
  const wayIds=new Set(source.roadWays.map(f=>String(f.properties.osmId)));
  const displayed=transport.roadPaths().filter(route=>route.osmWayIds?.some(id=>wayIds.has(String(id)))&&route.points.length>1);
  assert(displayed.every(route=>nearestRouteDistance(source.position,route.points).error>.01),
   'A road reported as displayed cannot silently lose its pavement at the crossing: '+source.nodeId);
 }
 let probes=0,minClearance=Infinity,maxClearance=-Infinity;
 if(visible)for(let offset=-8;offset<=8;offset+=.25){
  const distance=at.distance+offset,pose=path.sample(distance,.25),normal=new THREE.Vector3(-pose.tangent.z,0,pose.tangent.x).normalize();
  for(const side of [-1,1]){
   const q=pose.position.clone().addScaledVector(normal,side*plan.gauge/2),roads=roadHeights(q);
   if(!roads.length)continue;
   const roadTop=Math.max(...roads),heads=steel.heights(q).filter(y=>Math.abs(y-q.y)<.001),head=heads.length?Math.max(...heads):null;
   const clearance=head===null?-Infinity:head-roadTop;probes++;crossingProbes++;
   minClearance=Math.min(minClearance,clearance);maxClearance=Math.max(maxClearance,clearance);
   if(clearance<.005||clearance>.05){
    crossingFailureCount++;if(crossingFailures.length<12)crossingFailures.push({nodeId:source.nodeId,offset,side,point:q.toArray(),roadTop,head,clearance:Number.isFinite(clearance)?clearance:null});
   }
  }
 }
 if(visible)assert(probes>=2,'Both rails are tested over the crossing pavement');
 crossingChecks.push({nodeId:source.nodeId,renderedRoad:visible,probes,minClearance:visible?minClearance:null,maxClearance:visible?maxClearance:null,
  ...(!visible?{skippedReason:'Source road has no rendered centreline at this crossing'}:{})});
}
assert(crossingChecks.filter(c=>c.renderedRoad).length>=3,'The crossing test cannot pass without inspecting rendered roads');

// The widened primary173082916 overlaps the railway between these source
// nodes, including the middle of the otherwise sparse 537-world edge. Merely
// lengthening the crossing plateaus would leave that middle under asphalt.
// Sample actual road/steel throughout this confirmed at-grade corridor.
const corridorEnds=[nearestRouteDistance(corridorFrom.position),nearestRouteDistance(corridorTo.position)];
assert(corridorEnds.every(at=>at.error<1e-6));
const corridorStart=Math.min(...corridorEnds.map(at=>at.distance)),corridorEnd=Math.max(...corridorEnds.map(at=>at.distance));
const corridorLength=corridorEnd-corridorStart,corridorSteps=Math.ceil(corridorLength/.5),midpointDistance=(corridorStart+corridorEnd)/2;
assert(corridorLength>500);assert(corridorLength/corridorSteps<=.5);
const corridorSamples=Array.from({length:corridorSteps+1},(_,i)=>({distance:corridorStart+corridorLength*i/corridorSteps,midpoint:false}));
corridorSamples.push({distance:midpointDistance,midpoint:true});
let corridorProbes=0,corridorFailureCount=0,minCorridorClearance=Infinity,maxCorridorClearance=-Infinity;
const corridorFailures=[],corridorMidpoint=[];
for(const sample of corridorSamples){
 const pose=path.sample(sample.distance,.25),normal=new THREE.Vector3(-pose.tangent.z,0,pose.tangent.x).normalize();
 for(const side of [-1,1]){
  const q=pose.position.clone().addScaledVector(normal,side*plan.gauge/2),roads=roadHeights(q);
  if(!roads.length)continue;
  const roadTop=Math.max(...roads),heads=steel.heights(q).filter(y=>Math.abs(y-q.y)<.001),head=heads.length?Math.max(...heads):null;
  const clearance=head===null?-Infinity:head-roadTop;corridorProbes++;
  minCorridorClearance=Math.min(minCorridorClearance,clearance);maxCorridorClearance=Math.max(maxCorridorClearance,clearance);
  const detail={distance:sample.distance,side,point:q.toArray(),roadTop,head,clearance:Number.isFinite(clearance)?clearance:null};
  if(sample.midpoint)corridorMidpoint.push(detail);
  if(clearance<.005||clearance>.05){corridorFailureCount++;if(corridorFailures.length<12)corridorFailures.push(detail);}
 }
}
assert.equal(corridorMidpoint.length,2,'Both actual road-covered rails are explicitly checked at the corridor midpoint');
const corridorCheck={from:corridorFrom.nodeId,to:corridorTo.nodeId,railWayId:String(corridorRail.properties.osmId),roadWayId:String(corridorRoad.properties.osmId),
 length:corridorLength,maxStep:corridorLength/corridorSteps,samples:corridorSamples.length,probes:corridorProbes,
 minClearance:minCorridorClearance,maxClearance:maxCorridorClearance,midpoint:corridorMidpoint};
const camera=new THREE.PerspectiveCamera(52,1.6,.1,80000);
const controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
const traffic=createGroundTraffic({layers,transport,camera,controls,canvas:node,button:{...node}});
let minCoachGap=Infinity,maxRailError=0;
const vehicles=layers.rails.children.find(o=>o.name==='Поезд · площадка 1 → город').children.filter(o=>o.userData.railVehicle);
// Separating-axis test on oriented vehicle footprints: a centre-distance test
// alone misses side swipes on the sharper bends of the actual OSM route.
function footprint(v){v.updateWorldMatrix(true,false);const half=v.userData.profile.bodyLength/2;return [-1,1].flatMap(x=>[-1,1].map(z=>new THREE.Vector3(x*v.userData.profile.width/2,0,z*half).applyMatrix4(v.matrixWorld)));}
function separated(a,b){const A=footprint(a),B=footprint(b);return [a,b].some(v=>[new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)].some(axis=>{axis.applyQuaternion(v.quaternion);const p=A.map(c=>c.dot(axis)),q=B.map(c=>c.dot(axis));return Math.max(...p)<Math.min(...q)||Math.max(...q)<Math.min(...p);}));}

for(let t=0;t<=TRAIN_DURATION;t+=3){
 traffic.seek(t);const stats=traffic.stats().train;
 for(let i=1;i<vehicles.length;i++)assert(separated(vehicles[i-1],vehicles[i]),'Vehicle footprints must not overlap on OSM bends');
 assert.equal(stats.coachCount,4);assert.equal(stats.coaches.length,4);
 assert.equal(stats.coaches.filter(c=>c.tailLights).length,1);assert.equal(stats.coaches[3].tailLights,true);
 assert.ok(stats.coaches[3].distance>RAIL_VEHICLE_PROFILES.coach.bodyLength/2*TRAIN_METRIC_SCALE,'The actual rear body is on the track at departure');
 assert.ok(stats.distance<=stats.length-8,'The locomotive stops before the route ends');
 const units=[stats.locomotive,...stats.coaches.map(c=>c.position)];
 for(let i=1;i<units.length;i++){
  const gap=new THREE.Vector3(...units[i]).distanceTo(new THREE.Vector3(...units[i-1]));
  minCoachGap=Math.min(minCoachGap,gap);
  assert.ok(gap>(i===1?(RAIL_VEHICLE_PROFILES.m62.bodyLength+RAIL_VEHICLE_PROFILES.coach.bodyLength)/2:RAIL_VEHICLE_PROFILES.coach.bodyLength)*TRAIN_METRIC_SCALE,'The physical coupler spacing survives the shared metric scale');
 }
 for(const contact of stats.wheelContacts){
  const error=new THREE.Vector3(...contact.position).distanceTo(new THREE.Vector3(...contact.railPosition));
  maxRailError=Math.max(maxRailError,error);assert.ok(error<1e-8,'Each axle follows its own route distance');
  assert.ok(contact.distance>=0&&contact.distance<=stats.length,'No axle is clamped at a route end');
  probeSteel(contact.distance,'axle',new THREE.Vector3(...contact.position));axleProbes+=2;
 }
 assert.equal(stats.wheelContacts.length,22);assert.equal(stats.wheels.length,44);
 assert.deepEqual(stats.coaches.map(c=>c.offset),COACH_OFFSETS);
}
assert.equal(traffic.stats().train.startDistance,TRAIN_START_DISTANCE);
const details=traffic.stats().train.vehicleDetails;
assert.equal(details[0].bodyLength,RAIL_VEHICLE_PROFILES.m62.bodyLength*TRAIN_METRIC_SCALE);
assert(details.slice(1).every(v=>v.bodyLength===RAIL_VEHICLE_PROFILES.coach.bodyLength*TRAIN_METRIC_SCALE));
assert.equal(details[0].axles,6);assert.equal(details[0].bogies,2);
assert.equal(details[0].detailCounts['kosmotrans-lettering'],2);
assert(details.slice(1).every(v=>v.axles===4&&v.bogies===2&&v.detailCounts['lit-window']===20));
assert.equal(details[4].detailCounts['tail-lamp'],2);
traffic.seek(80);traffic.setFollowing(true);
const frameSpans=[];
for(const aspect of [1.6,390/844]){
 camera.aspect=aspect;camera.updateProjectionMatrix();traffic.seek(80);
 const stats=traffic.stats().train;
 const screens=[];
 for(const p of [stats.locomotive,...stats.coaches.map(c=>c.position)]){
  const screen=new THREE.Vector3(...p).project(camera);
  screens.push(screen);
  assert.ok(Math.abs(screen.x)<.9&&Math.abs(screen.y)<.9,'Follow framing includes all four coaches on desktop and mobile');
 }
 const span=Math.max(...screens.map(p=>p.x))-Math.min(...screens.map(p=>p.x));frameSpans.push(span);
 assert(span>.45,'The uniformly scaled train still fills a useful part of its close view');
}
traffic.setEvening(false);assert.equal(traffic.stats().night,false);traffic.setEvening(true);
assert.ok(traffic.stats().train.vehicleDetails.every(v=>v.meshes<=12),'Static detail is batched by material');
if(steelFailures||crossingFailureCount||corridorFailureCount)console.error('TRAIN_RAIL_SURFACE_DIAGNOSTICS',JSON.stringify({steelFailures,crossingFailureCount,crossingChecks,corridorFailureCount,corridorCheck,
 firstSteel:missingSteel,firstCrossings:crossingFailures,firstCorridor:corridorFailures}));
assert.equal(steelFailures,0,'Both actual rail heads must support the complete route and every axle: '+JSON.stringify({steelFailures,steelProbes,routeProbes,seamProbes,axleProbes,maxSteelError,first:missingSteel}));
assert.equal(crossingFailureCount,0,'Actual rail heads must clear actual crossing pavement by .005–.05 world: '+JSON.stringify({crossingFailureCount,crossingProbes,crossingChecks,first:crossingFailures}));
assert.equal(corridorFailureCount,0,'The full parallel-road corridor, including its middle, clears real asphalt by .005–.05 world: '+JSON.stringify({corridorFailureCount,corridorCheck,first:corridorFailures}));
console.log('TRAIN_CONSIST_PASS',JSON.stringify({coachCount:4,axles:22,wheels:44,minCoachGap,maxRailError,startDistance:TRAIN_START_DISTANCE,frameSpans,lights:traffic.stats().train.vehicleDetails.map(v=>v.lightCount),steelProbes,routeProbes,seamProbes,axleProbes,maxRouteStep,maxSteelError,steelTriangles:steel.triangles,crossingProbes,crossingChecks,corridorCheck}));
