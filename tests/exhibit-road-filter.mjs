import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {buildExhibitRoadFilter,clipRoadOutsideRectangle,rectangleSegmentInterval,airportPerimeterBypass} from '../src/exhibit-road-filter.js';
import {AIRPORT_DIMENSIONS,AIRPORT_SCALE} from '../src/airport-models.js';
import {YUBILEINY_SOURCE_LAYOUT} from '../src/yubileiny-layout.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';

// An entry/exit exactly at an existing source vertex must remain a join.
const rectangle={minX:-1,maxX:1,minZ:-1,maxZ:1};
for(const points of [
 [[-2,0,0],[2,0,0]],
 [[-2,0,0],[-1,0,0],[1,0,0],[2,0,0]],
 [[-2,0,0],[-1,0,0],[0,0,0],[1,0,0],[2,0,0]]
]){
 const clipped=clipRoadOutsideRectangle(points,rectangle);
 assert.equal(clipped.runs.length,2);
 assert.deepEqual(clipped.runs[0].at(-1),[-1,0,0]);
 assert.deepEqual(clipped.runs[1][0],[1,0,0]);
 assert(clipped.cuts.some(p=>p[0]===-1)&&clipped.cuts.some(p=>p[0]===1));
}
assert.deepEqual(clipRoadOutsideRectangle([[0,0,0],[.5,0,.5]],rectangle),{runs:[],cuts:[]});
assert.equal(clipRoadOutsideRectangle([[-2,0,-1],[2,0,-1]],rectangle).runs.length,1);
assert.equal(clipRoadOutsideRectangle([[-2,0,-1],[2,0,-1]],rectangle).cuts.length,0);
const fixtureBypass=airportPerimeterBypass([[-1,0,0],[0,0,-1],[1,0,0]],rectangle);
let fixtureLength=0;
for(let i=1;i<fixtureBypass.length;i++){
 assert.equal(rectangleSegmentInterval(fixtureBypass[i-1],fixtureBypass[i],rectangle),null);
 fixtureLength+=Math.hypot(fixtureBypass[i][0]-fixtureBypass[i-1][0],fixtureBypass[i][2]-fixtureBypass[i-1][2]);
}
assert(Math.abs(fixtureLength-4)<1e-9,'The perimeter bypass is not the shortest connected arc');

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const feature=(id,ids,coordinates,highway='service')=>({id:'way/'+id,properties:{osmId:id,sourceNodeIds:ids,tags:{highway}},geometry:{type:'LineString',coordinates}});
const fixture=buildOsmGraph([
 feature(1,[1,2,3],[[63,45.8],[63.01,45.8],[63.02,45.8]],'unclassified'),
 feature(2,[2,4,5,2],[[63.01,45.8],[63.009,45.802],[63.012,45.802],[63.01,45.8]]),
 feature(3,[2,6],[[63.01,45.8],[63.01,45.804]]),
 feature(4,[2,7],[[63.01,45.8],[63.011,45.797]])
],{geography,point});
const snapshot=graph=>JSON.stringify({nodes:[...graph.nodes.values()].map(n=>({id:n.id,coord:n.coord,position:n.position.toArray(),component:n.component,edges:n.edges.map(e=>[e.wayId,e.a.id,e.b.id])})),
 edges:graph.edges.map(e=>({a:e.a.id,b:e.b.id,wayId:e.wayId,length:e.length,tags:e.tags})),ways:graph.ways.map(w=>({id:w.osmId,edges:w.segments.map(e=>[e.a.id,e.b.id])}))});
const fixtureBefore=snapshot(fixture),protectedSpur=fixture.edges.find(e=>e.wayId==='3');
const fixtureFilter=buildExhibitRoadFilter(fixture,{protectedEdges:new Set([protectedSpur]),
 areas:[{id:'fixture',source:'fixture',bbox:[63.005,45.795,63.015,45.805]}]});
assert.equal(snapshot(fixture),fixtureBefore,'The display filter mutated the source graph');
assert(fixtureFilter.removed.has(fixture.edges.find(e=>e.wayId==='4')),'Empty service dead end remains');
assert(fixture.edges.filter(e=>e.wayId==='2').every(e=>fixtureFilter.removed.has(e)),'Internal service loop remains');
assert(!fixtureFilter.removed.has(protectedSpur),'Physical attachment edge was removed');
assert(fixture.route(fixture.nodes.get('1'),fixture.nodes.get('3')).edges.every(e=>!fixtureFilter.removed.has(e)),'Through access was cut');

const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson'),airports:read('data/osm/airports.geojson')};
const sourceDataBefore=JSON.stringify(data),siteRecords=geography.sites.filter(s=>!s.aliasOf&&s.render!==false),airportPoses=[];
// Match the real entry point: the historical schematic yaw is not the live yaw.
for(const [id,wayId,key] of [['airfield',37591623,'krayniy'],['pad-251',24949215,'yubileiny']]){
 const site=siteRecords.find(s=>s.id===id),runway=data.airports.features.find(f=>f.properties.osmId===wayId&&f.geometry.type==='LineString');
 const a=geography.project(runway.geometry.coordinates[0]),b=geography.project(runway.geometry.coordinates.at(-1)),sign=b[0]>=a[0]?1:-1;
 site.x=(a[0]+b[0])/2;site.y=(a[1]+b[1])/2;site.runtimeYaw=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);
 airportPoses.push({id,key,origin:point(site.x,site.y),yaw:site.runtimeYaw,spec:AIRPORT_DIMENSIONS[key]});
}
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords});
const stats=transport.stats(),simplification=stats.exhibitRoadSimplification,roads=transport.roadPaths();
assert.equal(JSON.stringify(data),sourceDataBefore,'Source GeoJSON was modified');
assert.equal(simplification.version,'exhibit-access-only-v1');assert.equal(simplification.sourceGraphUnchanged,true);
assert.deepEqual(simplification.regions.map(r=>r.id),['pad-75','napornaya','krayniy','yubileiny']);
for(const region of simplification.regions){
 assert.equal(region.keptEdgeCount+region.hiddenEdgeCount,region.sourceEdgeCount);
 assert.equal(region.keptWayIds.length+region.hiddenWayIds.length,region.sourceWayCount);
 assert(region.hiddenEdgeCount>region.keptEdgeCount,region.id+': the local web was not materially reduced');
 assert(region.hiddenWayIds.every(id=>!region.keptWayIds.includes(id)));
 assert(region.preservedTrafficWayIds.every(id=>region.keptWayIds.includes(id)));
 if(region.access)assert.equal(region.access.connected,true,region.id+': terminal access lost');
}
const hotel=simplification.regions.find(r=>r.id==='pad-75');
assert.deepEqual([...hotel.keptWayIds].sort(),['172971509','173082916']);
assert.equal(stats.facilityPorts.length,40);assert.equal(stats.facilityRailPorts.length,8);assert.equal(stats.stationCount,32);
for(const port of stats.facilityPorts)assert(port.roadGap<1e-7);
for(const port of stats.facilityRailPorts)assert(port.headCenterGap<1e-7&&port.networkDatumGap<1e-7);
const train=transport.trainPath();
assert.deepEqual(train.osmWayIds,['37547653','37543646','37545112','172422609','1468604922','173086738','256360833']);
let trainPlanLength=0;for(let i=1;i<train.path.points.length;i++)trainPlanLength+=Math.hypot(train.path.points[i].x-train.path.points[i-1].x,train.path.points[i].z-train.path.points[i-1].z);
assert(Math.abs(trainPlanLength-1712.7127365959147)<1e-6,'Airport road cleanup changed the train route');
assert.equal(roads.osmVehiclePlan.routes.length,4);
for(const route of roads.osmVehiclePlan.routes)for(const region of simplification.regions)
 for(const id of route.osmWayIds)assert(!region.hiddenWayIds.includes(id),'A working vehicle road was hidden');

// Inspect actual triangle buffers, including shoulders, paint and junction
// discs. Node-only tests missed the final Krayniy road crossing the enlarged
// runway outside the source airport bounding box.
const cellSize=16,cells=new Map(),triangles=[];
const surfaceNames=new Set(['OSM · единое дорожное полотно','OSM · асфальт трассы','OSM · единые обочины','OSM · грунтовые проезды','OSM · разметка']);
layers.roads.traverse(mesh=>{
 if(!mesh.isMesh||!surfaceNames.has(mesh.name))return;
 const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
 for(let i=0;i<ix.count;i+=3){
  const vertices=[0,1,2].map(j=>{const n=ix.getX(i+j);return [p.getX(n),p.getY(n),p.getZ(n)];});
  const tri={vertices,name:mesh.name};triangles.push(tri);
  const minX=Math.floor(Math.min(...vertices.map(v=>v[0]))/cellSize),maxX=Math.floor(Math.max(...vertices.map(v=>v[0]))/cellSize),
   minZ=Math.floor(Math.min(...vertices.map(v=>v[2]))/cellSize),maxZ=Math.floor(Math.max(...vertices.map(v=>v[2]))/cellSize);
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
   const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(tri);
  }
 }
});
function heights(x,z,{asphaltOnly=false}={}){
 const values=[];
 for(const tri of cells.get(Math.floor(x/cellSize)+':'+Math.floor(z/cellSize))||[]){
  if(asphaltOnly&&!['OSM · единое дорожное полотно','OSM · асфальт трассы'].includes(tri.name))continue;
  const [a,b,c]=tri.vertices,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-12)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)values.push(u*a[1]+v*b[1]+(1-u-v)*c[1]);
 }return values;
}
function triangleIntersectsRect(vertices,r){
 const center=[(r.minX+r.maxX)/2,(r.minZ+r.maxZ)/2],half=[(r.maxX-r.minX)/2,(r.maxZ-r.minZ)/2];
 const axes=[[1,0],[0,1]];
 for(let i=0;i<3;i++){const a=vertices[i],b=vertices[(i+1)%3];axes.push([a[2]-b[2],b[0]-a[0]]);}
 for(const [x,z] of axes){
  const length=Math.hypot(x,z);if(length<1e-10)continue;
  const projected=vertices.map(p=>(p[0]*x+p[2]*z)/length),middle=(center[0]*x+center[1]*z)/length,radius=(half[0]*Math.abs(x)+half[1]*Math.abs(z))/length;
  if(Math.max(...projected)<=middle-radius+1e-5||Math.min(...projected)>=middle+radius-1e-5)return false;
 }return true;
}
let airportTriangleChecks=0;
for(const airport of airportPoses){
 const {origin,yaw,spec}=airport,c=Math.cos(yaw),s=Math.sin(yaw),local=v=>[(c*(v[0]-origin.x)-s*(v[2]-origin.z))/AIRPORT_SCALE,v[1]/AIRPORT_SCALE,(s*(v[0]-origin.x)+c*(v[2]-origin.z))/AIRPORT_SCALE];
 const protectedAreas=[{label:'runway and shoulders',minX:-(spec.width+18)/2,maxX:(spec.width+18)/2,minZ:-spec.length/2-60,maxZ:spec.length/2+60}];
 // The new north-western taxiways and two aprons follow the source polygons,
 // all uniformly reduced by .5 inside the airport's .28 display root.
 if(airport.key==='yubileiny')for(const feature of YUBILEINY_SOURCE_LAYOUT.features){
  const polygons=feature.type==='Polygon'?[feature.coordinates]:feature.type==='MultiPolygon'?feature.coordinates:[];
  for(const [ring] of polygons)protectedAreas.push({label:feature.kind+' source '+feature.id,
   minX:Math.min(...ring.map(p=>p[0]))*.5,maxX:Math.max(...ring.map(p=>p[0]))*.5,
   minZ:Math.min(...ring.map(p=>p[1]))*.5,maxZ:Math.max(...ring.map(p=>p[1]))*.5});
 }
 for(const tri of triangles){
  if(!tri.vertices.some(v=>Math.hypot(v[0]-origin.x,v[2]-origin.z)<spec.length*AIRPORT_SCALE*.7))continue;
  const points=tri.vertices.map(local);
  for(const area of protectedAreas){airportTriangleChecks++;assert(!triangleIntersectsRect(points,area),`${airport.key}: ${tri.name} intersects ${area.label}: ${JSON.stringify(points)}`);}
 }
}
assert(airportTriangleChecks>1000);

// The airport's enlarged display footprint also covered a source railway
// beyond the real runway end. Test every railway sheet and the exported paths,
// not only road buffers or railway centre nodes, so ballast and sleepers cannot
// survive across the runway after the centreline has been clipped.
const railClearance=simplification.displayClearance.rail,railAirport=airportPoses.find(p=>p.key==='yubileiny');
assert.equal(railClearance.version,'airport-rail-display-clearance-v1');
assert.equal(railClearance.sourceGraphUnchanged,true);
assert(railClearance.marginWorld>RAIL_PROFILE.ballastWidth/2);
assert(railClearance.clippedWayIds.includes('172571069'),'The railway crossing the displayed runway was not clipped');
assert(railClearance.clippedWayIds.every(id=>!train.osmWayIds.includes(id)),'Airport clearance changed an active train way');
assert(railClearance.cuts.length>=1);
const railLocal=p=>p.clone().sub(railAirport.origin).applyAxisAngle(new THREE.Vector3(0,1,0),-railAirport.yaw).divideScalar(AIRPORT_SCALE).toArray();
const railSurfaceNames=new Set(['OSM · балласт','OSM · шпалы','OSM · рельсы','OSM · бывшие пути']),railSurfaceChecks={};
let airportRailTriangleChecks=0,airportRailPathChecks=0;
layers.rails.traverse(mesh=>{
 if(!mesh.isMesh||!railSurfaceNames.has(mesh.name))return;
 const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
 railSurfaceChecks[mesh.name]=0;
 for(let i=0;i<ix.count;i+=3){
  const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+j)));
  if(!vertices.some(v=>Math.hypot(v.x-railAirport.origin.x,v.z-railAirport.origin.z)<450))continue;
  const points=vertices.map(railLocal);airportRailTriangleChecks++;railSurfaceChecks[mesh.name]++;
  assert(!triangleIntersectsRect(points,railClearance.envelope),`${mesh.name} remains inside the displayed airport: ${JSON.stringify(points)}`);
 }
});
assert(airportRailTriangleChecks>1000);
for(const name of ['OSM · балласт','OSM · шпалы','OSM · рельсы'])assert(railSurfaceChecks[name]>100,'No meaningful airport coverage for '+name);
assert.equal(new Set(transport.routes.rail.map(r=>r.id)).size,transport.routes.rail.length,'Clipped railway fragments need distinct IDs');
assert(transport.routes.rail.some(r=>r.osmWayIds.includes('172571069')),'The exterior portion of the airport railway must remain visible');
for(const route of transport.routes.rail){
 const points=route.points.map(railLocal);
 for(let i=1;i<points.length;i++){
  airportRailPathChecks++;
  assert.equal(rectangleSegmentInterval(points[i-1],points[i],railClearance.envelope),null,'A returned rail path still crosses the airport: '+route.id);
 }
}
assert(airportRailPathChecks>1000);

// Hidden local road midpoints and former junctions must not retain small
// pavement/shoulder discs. Avoid locations shared with a legitimate road.
const sourceGraph=buildOsmGraph(data.roads.features,{geography,point}),probes=[];
for(const region of simplification.regions){
 const hidden=new Set(region.hiddenWayIds),keep=new Set(region.keptWayIds),keptEdges=sourceGraph.edges.filter(e=>keep.has(e.wayId));
 const contains=p=>{const coord=geography.inverseProject(p.x/3.4+650,p.z/3.4+522.5),b=region.bounds.lonLat;
  if(coord[0]<b[0]||coord[0]>b[2]||coord[1]<b[1]||coord[1]>b[3])return false;
  return region.bounds.kind!=='circle'||Math.hypot(p.x-region.center[0],p.z-region.center[1])<region.bounds.radiusMeters/65*3.4*.92;};
 const candidates=sourceGraph.edges.filter(e=>hidden.has(e.wayId)).flatMap(e=>[e.a.position.clone().lerp(e.b.position,.5),...(e.a.edges.length>2?[e.a.position]:[])]);
 let count=0;
 for(const p of candidates){
  if(count>=50||!contains(p))continue;
  const nearKept=keptEdges.some(e=>new THREE.Line3(e.a.position,e.b.position).closestPointToPoint(p,true,new THREE.Vector3()).distanceTo(p)<e.width+3);
  const nearConnector=roads.filter(r=>r.source!=='OpenStreetMap').some(r=>r.points.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<r.width+3));
  if(nearKept||nearConnector)continue;
  assert.equal(heights(p.x,p.z).length,0,region.id+': a hidden road or junction disc is still rendered');
  probes.push({region:region.id,point:p.toArray()});count++;
 }
 assert(count>=10,region.id+': insufficient hidden surface probes');
}
const clearance=simplification.displayClearance;
assert.equal(clearance.bypassCount,1);assert.equal(clearance.source,'synthetic-museum-display-clearance');
assert.equal(clearance.gateAccess.airsideHits,0);assert(clearance.gateAccess.gateGap<1e-7&&clearance.gateAccess.sourceGap<1e-7);
for(const join of clearance.joinGaps){
 assert(join.gap<1e-7);assert(heights(join.position[0],join.position[2],{asphaltOnly:true}).some(y=>Math.abs(y-join.position[1])<.08),'Airport bypass has an uncovered source join');
}
const stub=clearance.additionalAirports.find(a=>a.id==='krayniy');
assert(stub.hiddenWayIds.includes('854975695'),'The Krayniy terminal road stub still crosses its enlarged runway');
const access=roads.find(r=>r.id==='osm-access-pad-251');
for(const p of [access.points[0],access.points.at(-1)])assert(heights(p.x,p.z,{asphaltOnly:true}).some(y=>Math.abs(y-p.y)<.08),'Airport access endpoint has no pavement');
for(const route of roads.osmVehiclePlan.routes)for(let at=4;at<route.length-4;at+=17){
 const p=route.position(at);assert(heights(p.x,p.z,{asphaltOnly:true}).some(y=>Math.abs(y-p.y)<.08),'A working vehicle route lost its pavement');
}
// Lighting receives exactly the clipped displayed runs, never the hidden
// source segment through the runway or a stale service-grid path.
const yubileiny=airportPoses.find(p=>p.key==='yubileiny');
for(const road of roads)if(road.id.startsWith('osm-road-'))for(const p of road.points){
 const local=p.clone().sub(yubileiny.origin).applyAxisAngle(new THREE.Vector3(0,1,0),-yubileiny.yaw).divideScalar(AIRPORT_SCALE);
 assert(!(Math.abs(local.x)<51&&Math.abs(local.z)<1185),'A road-light path remains over the runway');
}
console.log('EXHIBIT_ROAD_FILTER_PASS',JSON.stringify({regions:simplification.regions.map(r=>({id:r.id,sourceWays:r.sourceWayCount,keptWays:r.keptWayIds.length,hiddenWays:r.hiddenWayIds.length,hiddenEdges:r.hiddenEdgeCount})),
 airportTriangleChecks,airportRailTriangleChecks,airportRailPathChecks,railSurfaceChecks,clippedRailWays:railClearance.clippedWayIds,hiddenSurfaceProbes:probes.length,ports:stats.facilityPorts.length,railPorts:stats.facilityRailPorts.length,stations:stats.stationCount,
 bypassLength:clearance.bypassLength,airportSourceWay:clearance.gateAccess.sourceWayId,trainPlanLength}));
