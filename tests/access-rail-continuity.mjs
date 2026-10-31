import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createAccessTransition,smoothLocalRoadGraph} from '../src/access-transitions.js';
import {FACILITY_PORTS,portWorld} from '../src/facility-ports.js';
import {RAIL_PROFILE,RAIL_METRES} from '../src/rail-profile.js';
import {buildRailVehicle,TRAIN_METRIC_SCALE,COACH_OFFSETS} from '../src/rail-vehicles.js';
import {buildMik112,MIK112} from '../src/mik112.js';
import {SITE110_REFERENCE} from '../src/site110.js';

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
const stats=transport.stats(),paths=transport.roadPaths();assert.equal(stats.facilityPorts.length,41);assert.equal(stats.facilityRailPorts.length,12);
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
// These source junctions exposed an unrelated service/residential tangent
// overwriting the through-road frame. Probe real lane pavement, independently
// of the direction-map implementation and its QA metadata.
for(const [label,position]of [
 ['trunk172422650/service172514574',[-316.5618040044522,.742,1041.024637556821]],
 ['tertiary173082860/residential1286218000',[-171.97232670317302,.742,1192.9663674576357]]
]){
 const p=V(...position);assert(asphaltAt(p).some(y=>Math.abs(y-p.y)<.035),'A foreign junction tangent removed actual lane pavement: '+label);
}
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
near(RAIL_PROFILE.headWidth,.028,1e-12,'Physical head width');near(RAIL_PROFILE.railHeight,.0378,1e-12,'Physical rail height');
const trainRoot=new THREE.Group(),engine=buildRailVehicle(trainRoot,{gauge:RAIL_PROFILE.gauge}),coach=buildRailVehicle(trainRoot,{gauge:RAIL_PROFILE.gauge,wagon:true});trainRoot.updateWorldMatrix(true,true);
for(const vehicle of [engine,coach])for(const axle of vehicle.axles){
 const centers=axle.wheels.map(w=>w.getWorldPosition(V()));near(centers[0].distanceTo(centers[1]),RAIL_PROFILE.gauge,1e-8,'Actual train wheel-centre gauge');
 for(const wheel of axle.wheels){const b=new THREE.Box3().setFromObject(wheel);assert(b.min.y<.001&&b.max.y>vehicle.wheelRadius,'Wheel treads reach the running datum');}
}
near(engine.bodyLength/coach.bodyLength,6.1/8.3,1e-12,'Coherent locomotive/coach scale');near(COACH_OFFSETS[0],7.9*TRAIN_METRIC_SCALE,1e-12,'Scaled coupler spacing');
console.log('ACCESS_RAIL_CONTINUITY_PASS',JSON.stringify({roadGates:stats.facilityPorts.length,railPorts:stats.facilityRailPorts.length,accessProbes,railHeadProbes,minSourceDot,minGateDot,sourceSwitches:mik.sourceSwitches,profile:RAIL_METRES.version,gauge:RAIL_PROFILE.gauge,headWidth:RAIL_PROFILE.headWidth}));
