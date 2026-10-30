import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {airportDisplaySpec,AIRPORT_SCALE} from '../src/airport-models.js';
import {krayniyTerminalLayout} from '../src/krayniy-terminal.js';
import {rectangleSegmentInterval} from '../src/exhibit-road-filter.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson'),airports:read('data/osm/airports.geojson')};
const sourceBefore=JSON.stringify(data),siteRecords=geography.sites.filter(s=>!s.aliasOf&&s.render!==false);
for(const [id,wayId]of [['airfield',37591623],['pad-251',24949215]]){
 const site=siteRecords.find(s=>s.id===id),runway=data.airports.features.find(f=>f.properties.osmId===wayId);
 const a=geography.project(runway.geometry.coordinates[0]),b=geography.project(runway.geometry.coordinates.at(-1)),sign=b[0]>=a[0]?1:-1;
 site.x=(a[0]+b[0])/2;site.y=(a[1]+b[1])/2;site.runtimeYaw=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);
}
const sourceGraph=buildOsmGraph(data.roads.features,{geography,point}),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords});
const stats=transport.stats(),roads=transport.roadPaths(),site=siteRecords.find(s=>s.id==='airfield');
assert.equal(JSON.stringify(data),sourceBefore,'Display clearance changed source GeoJSON');
assert.equal(stats.roadNodes,sourceGraph.nodes.size);assert.equal(stats.roadRoutes,sourceGraph.ways.length);
const pose=new THREE.Group();pose.position.copy(point(site.x,site.y));pose.rotation.y=site.runtimeYaw;pose.scale.setScalar(AIRPORT_SCALE);pose.updateMatrixWorld(true);
const spec=airportDisplaySpec('krayniy'),layout=krayniyTerminalLayout(spec.apron[1]),source=sourceGraph.nodes.get(layout.access.sourceNodeId);
assert.equal(source.component,sourceGraph.largest,'The new source junction is disconnected');
assert(sourceGraph.route(source,sourceGraph.nodes.get('11928484224')).edges.length>0,'The original terminal source graph was rewritten');
const region=stats.exhibitRoadSimplification.regions.find(r=>r.id==='krayniy'),report=stats.exhibitRoadSimplification.displayClearance.additionalAirports.find(r=>r.id==='krayniy');
assert.equal(region.access.nodeId,layout.access.sourceNodeId);assert.equal(region.access.source,'way/'+layout.access.sourceWayId);
assert.equal(region.access.connected,true);assert.equal(region.access.sourceGraphConnected,true);assert.equal(region.access.displayConnected,true);
assert.equal(report.campus.bypassCount,0);assert.deepEqual(report.campus.protectedConflicts,[]);
assert(report.hiddenWayIds.includes('854975695'),'The earlier runway cleanup was lost');
assert.equal(report.campus.gateAccess.sourceRendered,true);assert(report.campus.gateAccess.sourceGap<1e-5);
const sourceRoad=roads.find(r=>r.source==='OpenStreetMap'&&r.osmWayIds?.includes(layout.access.sourceWayId)&&r.points.some(p=>p.distanceTo(source.position)<1e-5));
assert(sourceRoad,'The new terminal driveway does not meet a rendered source road');
assert(roads.every(r=>r.id!=='airport-clearance-krayniy'),'An unnecessary airport perimeter road was added');

// Compare actual triangles against the model footprint, independently of the
// renderer's padded clip rectangles. This includes paint and junction discs.
const H=spec.length/2,areas=[
 {id:'runway',minX:-(spec.width+18)/2,maxX:(spec.width+18)/2,minZ:-H-60,maxZ:H+60},
 {id:'apron',minX:spec.apron[0]-spec.apronWidth/2,maxX:spec.apron[0]+spec.apronWidth/2,minZ:spec.apron[1]-spec.apronLength/2,maxZ:spec.apron[1]+spec.apronLength/2},
 {id:'parallel-taxiway',minX:spec.taxiX-9,maxX:spec.taxiX+9,minZ:-H+60,maxZ:H-60},
 ...[-H+80,H-80,spec.apron[1]-130,spec.apron[1]+130].map(z=>({id:'connecting-taxiway',minX:spec.taxiX-9,maxX:9,minZ:Math.min(z,z+Math.sign(z)*22)-9,maxZ:Math.max(z,z+Math.sign(z)*22)+9})),
 {id:'terminal',minX:layout.center[0]-41,maxX:layout.center[0]+41,minZ:layout.center[2]-55,maxZ:layout.center[2]+55},
 {id:'garden',...layout.grounds.garden},{id:'parking',...layout.grounds.parking},
 {id:'hangar',minX:spec.apron[0]-177.5,maxX:spec.apron[0]-112.5,minZ:spec.apron[1]+115,maxZ:spec.apron[1]+185}
];
function intersects(vertices,r){
 const center=[(r.minX+r.maxX)/2,(r.minZ+r.maxZ)/2],half=[(r.maxX-r.minX)/2,(r.maxZ-r.minZ)/2],axes=[[1,0],[0,1]];
 for(let i=0;i<3;i++){const a=vertices[i],b=vertices[(i+1)%3];axes.push([a[2]-b[2],b[0]-a[0]]);}
 for(const [x,z]of axes){
  const length=Math.hypot(x,z);if(length<1e-10)continue;
  const projected=vertices.map(p=>(p[0]*x+p[2]*z)/length),middle=(center[0]*x+center[1]*z)/length,radius=(half[0]*Math.abs(x)+half[1]*Math.abs(z))/length;
  if(Math.max(...projected)<=middle-radius+1e-5||Math.min(...projected)>=middle+radius-1e-5)return false;
 }return true;
}
const names=new Set(['OSM · единое дорожное полотно','OSM · единые обочины','OSM · грунтовые проезды','OSM · разметка']);
let triangleChecks=0,sourceCovered=false;
layers.roads.updateMatrixWorld(true);
layers.roads.traverse(mesh=>{
 if(!mesh.isMesh||!names.has(mesh.name))return;
 const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
 for(let i=0;i<ix.count;i+=3){
  const world=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+j)).applyMatrix4(mesh.matrixWorld));
  if(world.every(v=>v.distanceToSquared(pose.position)>300**2))continue;
  const vertices=world.map(v=>pose.worldToLocal(v).toArray());
  for(const area of areas){triangleChecks++;assert(!intersects(vertices,area),mesh.name+' overlaps '+area.id+': '+JSON.stringify(vertices));}
  if(mesh.name==='OSM · единое дорожное полотно'){
   const at=pose.worldToLocal(source.position.clone()),r={minX:at.x-.002,maxX:at.x+.002,minZ:at.z-.002,maxZ:at.z+.002};
   if(intersects(vertices,r))sourceCovered=true;
  }
 }
});
assert(triangleChecks>1000);assert(sourceCovered,'The source junction has a light path but no real pavement');
for(const road of roads)if(road.source==='OpenStreetMap'){
 const points=road.points.map(p=>pose.worldToLocal(p.clone()).toArray());
 for(let i=1;i<points.length;i++)for(const area of areas)assert.equal(rectangleSegmentInterval(points[i-1],points[i],area),null,'A lighting path crosses '+area.id);
}

// Optional release comparison against a snapshot captured before this change.
// It verifies complete traffic positions and real rail vertex/index buffers.
let baselineCompared=false;
if(process.argv[2]){
 const baseline=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 assert.deepEqual(roads.osmVehiclePlan.routes.map(r=>({id:r.id,ways:r.osmWayIds,nodes:r.nodeIds,points:r.points.map(p=>p.toArray())})),baseline.traffic);
 assert.deepEqual({osmWayIds:transport.trainPath().osmWayIds,points:transport.trainPath().path.points.map(p=>p.toArray())},baseline.train);
 const railMeshes=[];layers.rails.traverse(m=>{if(m.isMesh)railMeshes.push({name:m.name,position:Array.from(m.geometry.attributes.position.array),index:m.geometry.index?Array.from(m.geometry.index.array):null});});
 assert.deepEqual(railMeshes,baseline.railMeshes);assert.deepEqual(stats.facilityPorts,baseline.stats.facilityPorts);assert.deepEqual(stats.facilityRailPorts,baseline.stats.facilityRailPorts);
 const withoutAdditional=({additionalAirports,...report})=>report;
 assert.deepEqual(withoutAdditional(stats.exhibitRoadSimplification.displayClearance),withoutAdditional(baseline.stats.exhibitRoadSimplification.displayClearance));
 baselineCompared=true;
}
console.log('KRAYNIY_CAMPUS_ROADS_PASS',JSON.stringify({triangleChecks,sourceNode:source.id,sourceWay:layout.access.sourceWayId,sourceCovered,sourceGap:report.campus.gateAccess.sourceGap,
 clippedWayIds:report.campus.clippedWayIds,hiddenWayIds:report.campus.hiddenWayIds,trafficRoutes:roads.osmVehiclePlan.routes.length,baselineCompared}));
