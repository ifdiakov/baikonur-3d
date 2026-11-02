import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createAccessTransition,smoothLocalRoadGraph} from '../src/access-transitions.js';
import {FACILITY_PORTS,portWorld} from '../src/facility-ports.js';
import {RAIL_PROFILE,RAIL_METRES} from '../src/rail-profile.js';
import {buildRailVehicle,TRAIN_METRIC_SCALE,COACH_OFFSETS,RAIL_VEHICLE_PROFILES,COUPLER_CLEARANCE} from '../src/rail-vehicles.js';
import {buildMik112,MIK112} from '../src/mik112.js';
import {SITE110_REFERENCE} from '../src/site110.js';
import {buildSite45} from '../src/site45.js';
import {MUSEUM_METRE} from '../src/museum-scale.js';
import {distancePath} from '../src/traffic-paths.js';

const V=(...p)=>new THREE.Vector3(...p),near=(a,b,e,message)=>assert(Math.abs(a-b)<=e,`${message}: ${a} != ${b}`);
const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const tangent=(points,i)=>points[Math.min(points.length-1,i+1)].clone().sub(points[Math.max(0,i-1)]).setY(0).normalize();
const normal=d=>V(-d.z,0,d.x).normalize();
const synthetic=createAccessTransition({start:V(0,2,0),end:V(34,-2.7,22),startTangent:V(1,0,0),endTangent:V(0,0,1),startWidth:3.1,endWidth:.84,sampleStep:.08});
near(synthetic.points[0].distanceTo(V(0,2,0)),0,1e-12,'Exact source entry');near(synthetic.points.at(-1).distanceTo(V(34,-2.7,22)),0,1e-12,'Exact model gate');
assert(tangent(synthetic.points,0).dot(V(1,0,0))>.9999);assert(tangent(synthetic.points,synthetic.points.length-1).dot(V(0,0,1))>.9999);
near(synthetic.widthAt(synthetic.points[0]),3.1,1e-12,'Source width');near(synthetic.widthAt(synthetic.points.at(-1)),.84,1e-12,'Gate width');
let previousY=Infinity,previousWidth=Infinity;
for(const p of synthetic.points){const width=synthetic.widthAt(p);assert(p.y<=previousY+1e-10&&p.y>=-2.7-1e-10);assert(width<=previousWidth+1e-9&&width>=.84-1e-9);previousY=p.y;previousWidth=width;}
for(const i of [1,synthetic.points.length-1])assert(Math.abs(synthetic.points[i].y-synthetic.points[i-1].y)/horizontal(synthetic.points[i],synthetic.points[i-1])<.002,'Flat approach grade at both seams');

// A split ordinary-road corner has one shared tangent, without rewriting the
// source point or introducing a junction at an unrelated crossing.
const nodes=[[-12,0],[0,0],[0,12]].map(([x,z],i)=>({id:String(i),position:V(x,.72,z),edges:[]}));
const edges=[0,1].map(i=>({a:nodes[i],b:nodes[i+1],width:2.4,tags:{highway:'unclassified'},wayId:String(i)}));
for(const e of edges){e.a.edges.push(e);e.b.edges.push(e);}
const saved=nodes.map(n=>n.position.toArray()),graph={nodes:new Map(nodes.map(n=>[n.id,n])),edges};smoothLocalRoadGraph(graph);
assert.deepEqual(nodes.map(n=>n.position.toArray()),saved,'Source corner coordinates are immutable');
near(edges[0].surfaceTangents[1].dot(edges[1].surfaceTangents[0]),1,1e-12,'C1 at the source-way split');
for(const e of edges){assert(e.surfacePoints.length>5);near(e.surfacePoints[0].distanceTo(e.a.position),0,1e-12,'Source start remains exact');near(e.surfacePoints.at(-1).distanceTo(e.b.position),0,1e-12,'Source end remains exact');}

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')}),point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson'),airports:read('data/osm/airports.geojson')};
const original=JSON.stringify(data),siteRecords=geography.sites.filter(s=>!s.aliasOf&&s.render!==false);
const site110=siteRecords.find(s=>s.id==='pad-110');[site110.x,site110.y]=geography.project(...SITE110_REFERENCE.originLonLat);
for(const [id,wayId]of [['airfield',37591623],['pad-251',24949215]]){
 const site=siteRecords.find(s=>s.id===id),f=data.airports.features.find(f=>f.properties.osmId===wayId&&f.geometry.type==='LineString'),a=geography.project(...f.geometry.coordinates[0]),b=geography.project(...f.geometry.coordinates.at(-1)),sign=b[0]>=a[0]?1:-1;
 site.x=(a[0]+b[0])/2;site.y=(a[1]+b[1])/2;site.runtimeYaw=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);
}
const layers={roads:new THREE.Group(),rails:new THREE.Group()},transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords});
assert.equal(JSON.stringify(data),original,'Display joins preserve the archived source graph/data');
const stats=transport.stats(),paths=transport.roadPaths();assert.equal(stats.facilityPorts.length,42);assert.equal(stats.facilityRailPorts.length,14);
assert(stats.roadSurface.local.smoothedNodeIds.includes('439813528'),'The visibly broken ordinary-road corner receives the shared curve');
const sourceGraph=buildOsmGraph(data.roads.features,{geography,point}),corner=sourceGraph.nodes.get('439813528');
const cornerDirections=corner.edges.map(e=>e.surfaceTangents[e.a===corner?0:1]);near(Math.abs(cornerDirections[0].dot(cornerDirections[1])),1,1e-12,'Both real source ways share an exact curve frame');

function surfaceSampler(meshes){
 const cells=new Map(),cell=8;
 for(const mesh of meshes.filter(Boolean)){
  mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
  for(let i=0;i<(index?.count??p.count);i+=3){
   const t=[0,1,2].map(k=>V().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld)),[a,b,c]=t;
   const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-12)continue;
   const box=new THREE.Box3().setFromPoints(t),epsilon=.0005*Math.max(a.distanceTo(b),a.distanceTo(c),b.distanceTo(c))/Math.abs(den);
   for(let x=Math.floor(box.min.x/cell);x<=Math.floor(box.max.x/cell);x++)for(let z=Math.floor(box.min.z/cell);z<=Math.floor(box.max.z/cell);z++){
    const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push({t,den,epsilon});
   }
  }
 }
 return q=>{
  const heights=[];for(const {t:[a,b,c],den,epsilon}of cells.get(Math.floor(q.x/cell)+':'+Math.floor(q.z/cell))||[]){
   const u=((b.z-c.z)*(q.x-c.x)+(c.x-b.x)*(q.z-c.z))/den,v=((c.z-a.z)*(q.x-c.x)+(a.x-c.x)*(q.z-c.z))/den;
   if(u>=-epsilon&&v>=-epsilon&&u+v<=1+epsilon)heights.push(u*a.y+v*b.y+(1-u-v)*c.y);
  }return heights;
 };
}
const asphaltAt=surfaceSampler(['OSM · единое дорожное полотно','OSM · асфальт трассы'].map(name=>layers.roads.getObjectByName(name)));
// The published close view of this T exposed a tiny folded white stroke on
// way54566004. Inspect the final merged paint triangles, independently of
// the curve planner: interior points must have a single visible owner.
const localJunction=sourceGraph.nodes.get('687038520').position,localPaint=layers.roads.getObjectByName('OSM · разметка'),localPaintTriangles=[];
localPaint.updateWorldMatrix(true,false);
const localPositions=localPaint.geometry.attributes.position,localIndices=localPaint.geometry.index;
for(let i=0;i<(localIndices?.count??localPositions.count);i+=3){
 const t=[0,1,2].map(k=>V().fromBufferAttribute(localPositions,localIndices?localIndices.getX(i+k):i+k).applyMatrix4(localPaint.matrixWorld));
 if(t.some(p=>horizontal(p,localJunction)<18)&&Math.abs(t[0].y-localJunction.y)<.05)localPaintTriangles.push(t);
}
function interiorPaintHit(p,[a,b,c]){
 const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-14)return false;
 const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
 return u>1e-7&&v>1e-7&&u+v<1-1e-7;
}
let localPaintProbes=0;
for(const t of localPaintTriangles){
 const p=t.reduce((sum,p)=>sum.add(p),V()).multiplyScalar(1/3);if(horizontal(p,localJunction)>=18)continue;
 const hits=localPaintTriangles.filter(other=>interiorPaintHit(p,other));
 assert.equal(hits.length,1,'A local road stroke folds into duplicate visible triangles near T687038520: '+JSON.stringify({point:p.toArray(),hits:hits.length}));localPaintProbes++;
}
assert(localPaintProbes>300,'The close T view includes the actual curved stroke and neighbouring source seams');
// These source junctions exposed an unrelated service/residential tangent
// overwriting the through-road frame. Probe real lane pavement, independently
// of the direction-map implementation and its QA metadata.
for(const [label,position]of [
 ['trunk172422650/service172514574',[-316.5618040044522,.742,1041.024637556821]],
 ['tertiary173082860/residential1286218000',[-171.97232670317302,.742,1192.9663674576357]]
]){
 const p=V(...position);assert(asphaltAt(p).some(y=>Math.abs(y-p.y)<.035),'A foreign junction tangent removed actual lane pavement: '+label);
}
// The external Site 45 drive must clear the actual buildings and the incoming
// railway, then continue into the road tested by site45-geometry.mjs.
const site45=siteRecords.find(site=>site.id==='pad-45'),site45Root=new THREE.Group();
site45Root.position.copy(point(site45.x,site45.y,-2.72));site45Root.scale.setScalar(MUSEUM_METRE);
buildSite45(site45Root,{rocket:false});site45Root.updateMatrixWorld(true);
const site45Road=paths.find(path=>path.id==='osm-access-pad-45');
const site45Rail=stats.facilityRailPorts.find(port=>port.id==='pad-45').points;
let site45RailClearance=Infinity;
for(const p of site45Road.points){
 let distance=Infinity;
 for(let i=1;i<site45Rail.length;i++){
  const a=site45Rail[i-1],b=site45Rail[i],dx=b[0]-a[0],dz=b[2]-a[2];
  const t=THREE.MathUtils.clamp(((p.x-a[0])*dx+(p.z-a[2])*dz)/(dx*dx+dz*dz||1),0,1);
  distance=Math.min(distance,Math.hypot(p.x-a[0]-t*dx,p.z-a[2]-t*dz));
 }
 const halfWidth=site45Road.widthAt(p)/2+.3;
 site45RailClearance=Math.min(site45RailClearance,distance-halfWidth-RAIL_PROFILE.ballastWidth/2);
 const direction=tangent(site45Road.points,site45Road.points.indexOf(p)),across=normal(direction);
 for(const side of [-1,0,1]){
  const q=p.clone().addScaledVector(across,side*halfWidth);
  const obstruction=new THREE.Raycaster(V(q.x,30,q.z),V(0,-1,0)).intersectObject(site45Root,true)[0];
  assert(!obstruction||obstruction.point.y<=p.y+.035,'Site 45 approach passes through a model structure: '+q.toArray());
 }
}
assert(site45RailClearance>.5,'Site 45 road and shoulders must clear the incoming railway: '+site45RailClearance);
let accessProbes=0,minSourceDot=1,minGateDot=1;
for(const report of stats.facilityPorts){
 const path=paths.find(p=>p.id==='osm-access-'+report.id);assert(path&&path.points.length>3,'Every model gate has its actual rendered approach');
 const site=siteRecords.find(s=>s.id===report.id),base=FACILITY_PORTS[report.id],spec={...base,yaw:site.runtimeYaw??base.yaw},gate=portWorld(spec,spec.road,site,point);
 near(path.points.at(-1).distanceTo(gate),0,1e-7,'Actual approach endpoint '+report.id);
 const sourceDot=tangent(path.points,0).dot(V(...report.sourceTangent).setY(0).normalize()),gateDot=tangent(path.points,path.points.length-1).dot(V(...report.gateInward).normalize());
 minSourceDot=Math.min(minSourceDot,sourceDot);minGateDot=Math.min(minGateDot,gateDot);
 assert(sourceDot>.985&&gateDot>.985,`No abrupt model access corner ${report.id}: ${sourceDot}/${gateDot}`);
 near(report.endWidth,spec.roadWidth*spec.scale,1e-10,'Model entrance width '+report.id);
 for(let i=0;i<path.points.length;i+=Math.max(1,Math.floor(path.points.length/60))){
  const p=path.points[i],d=i===0?V(...report.sourceTangent):i===path.points.length-1?V(...report.gateInward):tangent(path.points,i),n=normal(d),width=path.widthAt(p);
  for(const side of [-1,0,1]){const q=p.clone().addScaledVector(n,side*(width/2-.035)),heights=asphaltAt(q);assert(heights.some(y=>Math.abs(y-p.y)<.035),'Approach pavement gap '+report.id+' '+q.toArray());accessProbes++;}
 }
}
const replacement=stats.exhibitRoadSimplification.site41DisplayReplacement;assert.equal(replacement.attachmentNodeId,'1836853974');assert.equal(replacement.preservedAccessEdges,9);assert(replacement.removedEdges>100);assert(!replacement.removedWayIds.includes('172837020'),'The through-road beside the former compound survives');

const mikSite=siteRecords.find(s=>s.id==='pad-112'),mikRoot=new THREE.Group();mikRoot.position.copy(point(mikSite.x,mikSite.y,0));mikRoot.scale.setScalar(MIK112.scale);mikRoot.rotation.y=MIK112.yaw;buildMik112(mikRoot);
const mik=transport.connectMik112(mikRoot);assert.equal(mik.tracks.length,4);assert.deepEqual(mik.sourceSwitches,['1834612063','1834612065']);assert.equal(mik.destinationRoutes.length,8);
const steelAt=surfaceSampler([layers.rails.getObjectByName('OSM · рельсы')]);let railHeadProbes=0;
for(const report of stats.facilityRailPorts){
 near(report.networkGauge,.2128,1e-12,'Uniform network gauge');near(report.portGauge,.2128,1e-12,'Uniform model gauge');
 const points=report.points.map(p=>V(...p));
 for(const i of [0,Math.floor(points.length/3),Math.floor(points.length*2/3),points.length-1]){
  const p=points[i].clone().add(V(0,RAIL_PROFILE.headY,0)),d=i===0?V(...report.sourceTangent):i===points.length-1?V(...report.gateInward):tangent(points,i),n=normal(d);
  for(const side of [-1,1])for(const across of [-.011,0,.011]){
   const q=p.clone().addScaledVector(n,side*RAIL_PROFILE.gauge/2+across);assert(steelAt(q).some(y=>Math.abs(y-q.y)<.001),'Rendered rail-head gap '+report.portId+' '+i+' '+q.toArray());railHeadProbes++;
  }
 }
}
assert.equal(stats.facilityRailPorts.filter(p=>p.sourceRouteId).length,8,'All eight source-bound destination sockets are rendered');
const fan=stats.site110RailFan;assert.equal(fan.version,'site110-four-track-source-fan-v1');assert.equal(fan.joinedLinks.length,3);
// Verify the new source fan against the final merged steel, including the
// formerly floating physical diamond and the auxiliary source connections.
let fanHeadProbes=0;
for(const link of fan.joinedLinks){
 const points=link.points.map(p=>V(...p));
 for(const i of [0,Math.floor(points.length/2),points.length-1]){
  const p=points[i].clone().add(V(0,RAIL_PROFILE.headY,0)),d=i===0?V(...link.startTangent):i===points.length-1?V(...link.endTangent):tangent(points,i),n=normal(d);
  for(const side of [-1,1]){const q=p.clone().addScaledVector(n,side*RAIL_PROFILE.gauge/2);assert(steelAt(q).some(y=>Math.abs(y-q.y)<.001),'Actual source-link head gap '+link.id);fanHeadProbes++;}
 }
}
const diamond=V(...fan.crossingPosition),diamondRows=['site110-left-east','site110-right-west'].map(id=>stats.facilityRailPorts.find(p=>p.portId===id).points.map(p=>V(...p)));
for(const points of diamondRows)for(let i=1;i<points.length-1;i++){
 if(horizontal(points[i],diamond)>.4)continue;
 const n=normal(tangent(points,i));
 for(const side of [-1,1]){
  const q=points[i].clone().addScaledVector(n,side*RAIL_PROFILE.gauge/2);q.y=diamond.y+RAIL_PROFILE.headY;
  const heights=steelAt(q);assert(heights.some(y=>Math.abs(y-q.y)<.0003),'The source diamond has an actual common running level');
  assert(!heights.some(y=>y>q.y+.001),'An old raised rail fragment remains above the source diamond');fanHeadProbes++;
 }
}
// These exact source fragments were visible as two disconnected old sidings
// in the published MIK frame. Their source nodes remain in the graph, while
// their steel geometry is owned by the reconstructed four-track apron.
const railGraph=buildOsmGraph(data.railways.features,{geography,point,rail:true});let removedStubProbes=0;
for(const [from,to]of [['1834611997','1834612003'],['1834611980','1834611993'],['1834611993','1834612001']]){
 const a=railGraph.nodes.get(from).position,b=railGraph.nodes.get(to).position,n=normal(b.clone().sub(a));
 for(const t of [.25,.5,.75])for(const side of [-1,1]){
  const q=a.clone().lerp(b,t).addScaledVector(n,side*RAIL_PROFILE.gauge/2);q.y+=RAIL_PROFILE.headY;
  assert(!steelAt(q).some(y=>Math.abs(y-q.y)<.001),'Detached MIK siding steel remains at '+from+'/'+to);removedStubProbes++;
 }
}
// The first adapter sleepers meet the canonical model cadence at half a
// period; inspect real top triangles, not only the placement helper.
const sleeperAt=surfaceSampler([layers.rails.getObjectByName('OSM · шпалы')]);let sleeperSeamProbes=0;
const sleeperRows=[...stats.facilityRailPorts.map(row=>({id:row.portId,points:row.points.map(p=>V(...p)),anchor:'end'})),
 ...mik.tracks.map(row=>({id:row.gateId+'-'+row.trackIndex,points:row.curveSamples.map(p=>V(...p).add(V(0,-RAIL_PROFILE.headY,0))),anchor:'start'}))];
for(const row of sleeperRows){
 const path=distancePath(row.points);
 for(const period of [.5,1.5]){
  const d=RAIL_PROFILE.sleeperStep*period;if(d>=path.length)continue;
  const p=path.sample(row.anchor==='start'?d:path.length-d).position;p.y+=RAIL_PROFILE.sleeperY+RAIL_PROFILE.sleeperHeight/2;
  assert(sleeperAt(p).some(y=>Math.abs(y-p.y)<.0004),'Sleeper cadence/phase gap at '+row.id);sleeperSeamProbes++;
 }
}
assert(sleeperSeamProbes>=30);
near(RAIL_PROFILE.headWidth,.028,1e-12,'Physical head width');near(RAIL_PROFILE.railHeight,.0378,1e-12,'Physical rail height');
const trainRoot=new THREE.Group(),engine=buildRailVehicle(trainRoot,{gauge:RAIL_PROFILE.gauge}),coach=buildRailVehicle(trainRoot,{gauge:RAIL_PROFILE.gauge,wagon:true});trainRoot.updateWorldMatrix(true,true);
for(const vehicle of [engine,coach])for(const axle of vehicle.axles){
 const centers=axle.wheels.map(w=>w.getWorldPosition(V()));near(centers[0].distanceTo(centers[1]),RAIL_PROFILE.gauge,1e-8,'Actual train wheel-centre gauge');
 for(const wheel of axle.wheels){const b=new THREE.Box3().setFromObject(wheel);assert(b.min.y<.001&&b.max.y>vehicle.wheelRadius,'Wheel treads reach the running datum');}
}
near(engine.bodyLength/coach.bodyLength,RAIL_VEHICLE_PROFILES.m62.bodyLength/RAIL_VEHICLE_PROFILES.coach.bodyLength,1e-12,'Coherent locomotive/coach scale');near(COACH_OFFSETS[0],(RAIL_VEHICLE_PROFILES.m62.couplerHalf+RAIL_VEHICLE_PROFILES.coach.couplerHalf+COUPLER_CLEARANCE)*TRAIN_METRIC_SCALE,1e-12,'Scaled coupler spacing');
console.log('ACCESS_RAIL_CONTINUITY_PASS',JSON.stringify({roadGates:stats.facilityPorts.length,railPorts:stats.facilityRailPorts.length,accessProbes,railHeadProbes,fanHeadProbes,removedStubProbes,sleeperSeamProbes,localPaintProbes,minSourceDot,minGateDot,sourceSwitches:mik.sourceSwitches,profile:RAIL_METRES.version,gauge:RAIL_PROFILE.gauge,headWidth:RAIL_PROFILE.headWidth}));
