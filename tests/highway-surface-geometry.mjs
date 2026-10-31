import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {smoothHighwayGraph,isHighwayRoad,HIGHWAY_ASPHALT_COLOR,HIGHWAY_ASPHALT_LIFT,HIGHWAY_MARKINGS} from '../src/highway-surface.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';
import {createInterchangeAprons,INTERCHANGE_APRON_VERSION} from '../src/interchange-aprons.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const source=JSON.stringify(data),graph=buildOsmGraph(data.roads.features,{geography,point});
const snapshot=()=>JSON.stringify({nodes:[...graph.nodes.values()].map(n=>[n.id,n.coord,n.position.toArray(),n.component]),edges:graph.edges.map(e=>[e.wayId,e.a.id,e.b.id,e.length])});
const before=snapshot();smoothHighwayGraph(graph);assert.equal(snapshot(),before,'Display smoothing must leave source nodes, topology and route costs intact');
let profileSamples=0,tangentJoins=0,maxLateralShift=0,minTangentDot=1;
for(const edge of graph.edges){
 // Local degree-two rounding now also exposes surfacePoints. The original
 // highway's strict .15-width corridor bound remains unchanged here.
 if(!isHighwayRoad(edge.tags)||!edge.surfacePoints)continue;
 const ps=edge.surfacePoints,a=edge.a.position,b=edge.b.position;
 assert.deepEqual(ps[0].toArray(),a.toArray());assert.deepEqual(ps.at(-1).toArray(),b.toArray());
 const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
 for(const p of ps){
  assert(p.toArray().every(Number.isFinite));
  assert(p.y>=Math.min(a.y,b.y)-1e-8&&p.y<=Math.max(a.y,b.y)+1e-8,'A smoothed approach overshoots its bridge datum');
  const lateral=Math.abs((p.x-a.x)*dz-(p.z-a.z)*dx)/length;maxLateralShift=Math.max(maxLateralShift,lateral);
  assert(lateral<edge.width*.15,'The curve leaves the established OSM road corridor');profileSamples++;
 }
}
for(const node of graph.nodes.values()){
 const edges=node.edges.filter(e=>['motorway','trunk'].includes(e.tags.highway));if(edges.length!==2)continue;
 const tangent=e=>e.surfaceTangents[e.a===node?0:1].clone().multiplyScalar(e.a===node?1:-1);
 const dot=-tangent(edges[0]).dot(tangent(edges[1]));minTangentDot=Math.min(minTangentDot,dot);
 assert(dot>1-1e-10,'The main highway has an angular or vertical kink at '+node.id);tangentJoins++;
}
assert(profileSamples>9000&&tangentJoins>100);

const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
assert.equal(JSON.stringify(data),source,'Original source geography is immutable');
const dark=layers.roads.getObjectByName('OSM · асфальт трассы'),bridge=transport.bridgeObjects()[0].getObjectByName('Виадук · asphalt');
assert(dark&&bridge);assert.equal(dark.material.color.getHex(),HIGHWAY_ASPHALT_COLOR);
assert.equal(bridge.material.color.getHex(),HIGHWAY_ASPHALT_COLOR);assert.equal(bridge.material.roughness,dark.material.roughness);
assert.equal(layers.roads.getObjectByName('OSM · единое дорожное полотно').material.color.getHex(),0xadb2b3,'Cosmodrome roads retain their own surface');

// Probe actual road triangles at both traffic lanes. Choosing the highest
// nearby pavement detects raised flat junction patches as well as missing
// segments: a valid centreline alone does not prove a smooth carriageway.
const cells=new Map(),cellSize=12;
function indexPavement(meshes,grid){
for(const mesh of meshes){
 mesh.updateWorldMatrix(true,false);
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
 for(let i=0;i<(index?.count??p.count);i+=3){
  const t=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
  const box=new THREE.Box3().setFromPoints(t);
  for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++){
   const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(t);
  }
 }
}
}
indexPavement([dark,bridge],cells);
function heights(p,interior=false,grid=cells){
 const out=[],nearby=[];
 for(const [a,b,c] of grid.get(Math.floor(p.x/cellSize)+':'+Math.floor(p.z/cellSize))||[]){
  const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-12)continue;
  const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
  const tolerance=.0004*Math.max(a.distanceTo(b),b.distanceTo(c),a.distanceTo(c))/Math.abs(den);
  const y=u*a.y+v*b.y+(1-u-v)*c.y;
  if(interior?u>1e-7&&v>1e-7&&u+v<1-1e-7:u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)out.push(y);
  else if(!interior&&u>=-tolerance&&v>=-tolerance&&u+v<=1+tolerance)nearby.push(y);
 }
 return out.length||interior?out:nearby;
}
const highway=buildRoadVehicleRoutes(transport.roadPaths()).highway;
let laneProbes=0,maxWheelGap=0,overlapProbes=0;
for(const direction of [-1,1])for(let distance=2;distance<highway.length-2;distance+=.7){
 const state=roadVehiclePose(highway,0,{phase:distance/highway.length,direction,speed:12});
 const candidates=heights(state.position).filter(y=>Math.abs(y-state.position.y)<1);
 assert(candidates.length,'A highway lane is missing its rendered pavement at '+state.position.toArray());
 const gap=state.position.y-Math.max(...candidates);maxWheelGap=Math.max(maxWheelGap,Math.abs(gap));
 assert(gap>-.08&&gap<.08,'A road junction or slope leaves a visible step under traffic: '+JSON.stringify({position:state.position.toArray(),gap}));laneProbes++;
 const jitter=state.position.clone().add(new THREE.Vector3(.001237,0,.000913));
 const overlapping=heights(jitter,true).filter(y=>Math.abs(y-state.position.y)<.2);
 assert(overlapping.length<=1,'Overlapping near-coplanar highway/bridge triangles can flicker at '+state.position.toArray());overlapProbes++;
}
assert(laneProbes>10000);
assert(transport.stats().roadSurface.highway.clippedOverlapSections>0);

const bridgeRoot=transport.bridgeObjects()[0],yellow=layers.roads.getObjectByName('Трасса · двойная жёлтая'),white=layers.roads.getObjectByName('Трасса · белые кромки');
// A hard compatibility cutoff used to switch the host segment abruptly on
// three side-ramp samples. Check the final displayed profiles, after grade
// blending, in the interchange corridor that exposed those visible cusps.
let approachSegments=0,maxApproachGradeChange=0;
for(const road of transport.roadPaths()){
 let previous=null;
 for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],local=bridgeRoot.worldToLocal(a.clone().lerp(b,.5));
  if(Math.abs(local.x)>=18||Math.abs(local.z)>=90){previous=null;continue;}
  const length=Math.hypot(b.x-a.x,b.z-a.z),rise=b.y-a.y,grade=rise/(length||1e-9);approachSegments++;
  assert(!(length<1.5&&Math.abs(rise)>.4),'An interchange approach has an abrupt height step');
  if(previous&&length<1.5&&previous.length<1.5){
   const change=Math.abs(grade-previous.grade);maxApproachGradeChange=Math.max(maxApproachGradeChange,change);
   assert(change<.3,'A side-ramp grade has a visible cusp: '+JSON.stringify({road:road.id,local:local.toArray(),change}));
  }
  previous={length,grade};
 }
}
assert(approachSegments>1000);
assert(yellow&&white,'The entire main highway uses the two bridge paint colors');
for(const [mesh,color] of [[yellow,HIGHWAY_MARKINGS.yellowColor],[white,HIGHWAY_MARKINGS.whiteColor]]){
 assert.equal(mesh.material.color.getHex(),color);assert.equal(mesh.material.roughness,.72);
}
for(const [name,color] of [['yellow',HIGHWAY_MARKINGS.yellowColor],['white',HIGHWAY_MARKINGS.whiteColor]])assert.equal(bridgeRoot.getObjectByName('Виадук · '+name).material.color.getHex(),color);
assert.equal(transport.stats().roadSurface.highway.asphaltLift,HIGHWAY_ASPHALT_LIFT);

// Test real paint geometry, including the bridge in world coordinates, so a
// source-way split cannot silently leave a missing or doubled lane marking.
function markingQuery(meshes,queryBounds=null){
 const grid=new Map();
 for(const mesh of meshes){
  mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?.count||p.count;
  for(let i=0;i<count;i+=3){
   const triangle=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
   const box=new THREE.Box3().setFromPoints(triangle);
   if(queryBounds&&!box.intersectsBox(queryBounds))continue;
   for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++){
    const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(triangle);
   }
  }
 }
 return p=>{
  const found=[];
  for(const [a,b,c] of grid.get(Math.floor(p.x/cellSize)+':'+Math.floor(p.z/cellSize))||[]){
   const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-12)continue;
   const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
   if(u>=-1e-5&&v>=-1e-5&&u+v<=1+1e-5)found.push(u*a.y+v*b.y+(1-u-v)*c.y);
  }
  return found;
 };
}
const yellowAt=markingQuery([yellow,bridgeRoot.getObjectByName('Виадук · yellow')]),whiteAt=markingQuery([white,bridgeRoot.getObjectByName('Виадук · white')]),bridgePavementAt=markingQuery([bridge]);
// Resolve the source carriageway at the route centre before offsetting to
// its edge. At a divided-road fork that edge can be closer to a different
// carriageway's centre; its junction rule does not own this paint probe.
const highwayWayIds=new Set(highway.osmWayIds.map(String)),routeSegmentCells=new Map();
for(const edge of graph.edges){
 if(!highwayWayIds.has(String(edge.wayId)))continue;
 const points=edge.surfacePoints||[edge.a.position,edge.b.position];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],segment={a,b,wayId:edge.wayId};
  for(let x=Math.floor((Math.min(a.x,b.x)-3)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+3)/cellSize);x++)for(let z=Math.floor((Math.min(a.z,b.z)-3)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+3)/cellSize);z++){
   const key=x+':'+z;if(!routeSegmentCells.has(key))routeSegmentCells.set(key,[]);routeSegmentCells.get(key).push(segment);
  }
 }
}
function routeWayAt(p){
 let best=Infinity,wayId=null;
 for(const segment of routeSegmentCells.get(Math.floor(p.x/cellSize)+':'+Math.floor(p.z/cellSize))||[]){
  const {a,b}=segment,dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
  if(Math.abs(a.y+(b.y-a.y)*t-p.y)>.65)continue;
  const distance=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
  if(distance<best){best=distance;wayId=segment.wayId;}
 }
 assert(wayId!=null&&best<.5,'The sampled highway centre must retain its source carriageway: '+p.toArray());
 return wayId;
}
let markingCoverageProbes=0,markingPaintProbes=0,markingOpeningProbes=0,markingSurfaceProbes=0,maxMarkingLiftError=0;
for(let distance=1.234;distance<highway.length-1;distance+=.73){
 const at=highway.sample(distance,.25),normal=new THREE.Vector3(-at.tangent.z,0,at.tangent.x).normalize(),wayId=routeWayAt(at.position);
 for(const side of [-1,1])for(const [query,offset,label] of [[yellowAt,HIGHWAY_MARKINGS.centerOffset,'yellow'],[whiteAt,highway.width/2-HIGHWAY_MARKINGS.edgeInset,'white']]){
  const p=at.position.clone().addScaledVector(normal,side*offset);
  const bridgeOwns=bridgePavementAt(p).some(y=>Math.abs(y-p.y-HIGHWAY_ASPHALT_LIFT)<.012);
  const policy=bridgeOwns?{allowed:true}:transport.roadMarkingPlan.coveragePolicyAt(p,label,wayId);
  if(!policy.allowed){
   assert(policy.reason&&policy.reason!=='no-marked-road','A required highway marking disappeared outside a declared junction or lane rule: '+JSON.stringify({point:p.toArray(),label,distance,policy}));markingOpeningProbes++;
  }else{
   assert(query(p).some(y=>Math.abs(y-p.y-HIGHWAY_MARKINGS.lift)<.012),'Missing required '+label+' marking at '+p.toArray());markingPaintProbes++;
  }
  markingCoverageProbes++;
 }
}
// A rounded ramp edge can end on the host road's ordinary asphalt, just
// outside the dark apron. Strict hits on any real asphalt owner take
// precedence over tolerated extrapolations from the neighbouring surface.
const paintCells=new Map([...cells].map(([key,triangles])=>[key,[...triangles]]));
indexPavement([layers.roads.getObjectByName('OSM · единое дорожное полотно')],paintCells);
for(const mesh of [yellow,white]){
 const p=mesh.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const q=new THREE.Vector3().fromBufferAttribute(p,i),surface=heights(q,false,paintCells).filter(y=>y<q.y+.0003&&y>q.y-.1);
  assert(surface.length,'A paint vertex has no actual pavement below it at '+q.toArray());
  const error=Math.abs(q.y-Math.max(...surface)-(HIGHWAY_MARKINGS.lift-HIGHWAY_ASPHALT_LIFT));maxMarkingLiftError=Math.max(maxMarkingLiftError,error);
  assert(error<.002,'Paint floats over or sinks below a sloping approach: '+JSON.stringify({mesh:mesh.name,point:q.toArray(),surface,error}));markingSurfaceProbes++;
 }
}
assert(markingPaintProbes>25000&&markingSurfaceProbes>150000,'Actual paint remains continuous along the main highway outside legitimate openings');
assert.equal(transport.stats().roadSurface.highway.markings.projectionMisses,0,'Every emitted marking vertex must be projected onto actual pavement');
const junctionBounds=new THREE.Box3().setFromCenterAndSize(bridgeRoot.position,new THREE.Vector3(300,30,300));
// All paint is now generated after pavement ownership is resolved. Correct
// host-road markings may continue on the dark junction apron; only paving
// and shoulders belong in the independent duplicate-surface query.
const paleAt=markingQuery(['OSM · единое дорожное полотно','OSM · единые обочины','OSM · грунтовые проезды'].map(name=>layers.roads.getObjectByName(name)),junctionBounds);
let junctionOwnershipProbes=0;
for(let distance=highway.bridgeDistance-110;distance<highway.bridgeDistance+110;distance+=.4){
 const at=highway.sample(distance,.25),normal=new THREE.Vector3(-at.tangent.z,0,at.tangent.x).normalize();
 for(const offset of [-1.6,-.8,0,.8,1.6]){
  const p=at.position.clone().addScaledVector(normal,offset),overlaps=paleAt(p).filter(y=>Math.abs(y-p.y)<1.19);
  assert.equal(overlaps.length,0,'A pale road or shoulder overlays the dark interchange pavement at '+p.toArray());junctionOwnershipProbes++;
 }
}
assert(transport.stats().roadSurface.highway.ordinarySurfaceClip.reports.some(r=>r.clipped>0));
const aprons=createInterchangeAprons(graph),apronStats=transport.stats().roadSurface.highway.lowerJunctionAprons;
assert.equal(apronStats.version,INTERCHANGE_APRON_VERSION);assert.equal(aprons.length,2);assert.equal(apronStats.junctions.length,2);
assert.equal(snapshot(),before,'Rounded junctions must not change source nodes, topology or route costs');
let apronOwnershipProbes=0,apronFarCurbProbes=0,apronSeamProbes=0;
for(const apron of aprons){
 for(const triangle of apron.triangles){
  const p=triangle[0].clone().multiplyScalar(.23).addScaledVector(triangle[1],.31).addScaledVector(triangle[2],.46);
  const darkHits=heights(p,true).filter(y=>Math.abs(y-p.y)<1.2),paleHits=paleAt(p).filter(y=>Math.abs(y-p.y)<1.2);
  assert.equal(darkHits.length,1,'An apron interior has missing/overlapping dark pavement: '+JSON.stringify({node:apron.spec.nodeId,p:p.toArray(),darkHits}));
  assert.equal(paleHits.length,0,'An apron interior retains ordinary asphalt or a shoulder: '+JSON.stringify({node:apron.spec.nodeId,p:p.toArray(),paleHits}));
  apronOwnershipProbes++;
 }
 // The railway runs immediately behind these host roads. Every far-side
 // vertex must remain within the existing primary-road carriageway.
 const center=new THREE.Vector3(...apron.report.center),outward=new THREE.Vector3(...apron.report.throat).sub(center).setY(0).normalize();
 const nearby=graph.edges.filter(e=>e.tags.highway==='primary'&&Math.min(e.a.position.distanceTo(center),e.b.position.distanceTo(center))<15);
 for(const p of apron.outline){
  if(p.clone().sub(center).setY(0).dot(outward)>=-.05)continue;
  const distance=Math.min(...nearby.flatMap(e=>{
   // The host's own degree-two bends now have a displayed centreline too.
   // Compare with that actual carriageway, keeping the original tolerance.
   const points=e.surfacePoints||[e.a.position,e.b.position];
   return points.slice(1).map((b,i)=>{
    const a=points[i].clone().setY(0),q=new THREE.Line3(a,b.clone().setY(0)).closestPointToPoint(p.clone().setY(0),true,new THREE.Vector3());
    return p.clone().setY(0).distanceTo(q)-e.width/2;
   });
  }));
  assert(distance<.0005,'A rounded apron widens the host road toward its neighbouring railway');apronFarCurbProbes++;
 }
 const top=apron.grid.at(-1),previous=apron.grid.at(-2);
 for(let i=2;i<top.length-2;i+=2){
  const tangent=top[i].clone().sub(previous[i]).setY(0).normalize();
  for(const sign of [-1,1]){
   const p=top[i].clone().addScaledVector(tangent,sign*.012),hits=heights(p).filter(y=>Math.abs(y-p.y)<.012);
   assert(hits.length,'The rounded apron has a gap/step at its ramp seam');apronSeamProbes++;
  }
 }
}
assert(apronOwnershipProbes>2000&&apronFarCurbProbes>30&&apronSeamProbes>30);
console.log('HIGHWAY_SURFACE_GEOMETRY_PASS',JSON.stringify({profileSamples,tangentJoins,maxLateralShift,minTangentDot,laneProbes,overlapProbes,maxWheelGap,
 approachSegments,maxApproachGradeChange,markingCoverageProbes,markingPaintProbes,markingOpeningProbes,markingSurfaceProbes,maxMarkingLiftError,junctionOwnershipProbes,
 apronOwnershipProbes,apronFarCurbProbes,apronSeamProbes,asphaltColor:dark.material.color.getHexString()}));
