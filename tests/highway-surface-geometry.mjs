import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {smoothHighwayGraph,HIGHWAY_ASPHALT_COLOR} from '../src/highway-surface.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const source=JSON.stringify(data),graph=buildOsmGraph(data.roads.features,{geography,point});
const snapshot=()=>JSON.stringify({nodes:[...graph.nodes.values()].map(n=>[n.id,n.coord,n.position.toArray(),n.component]),edges:graph.edges.map(e=>[e.wayId,e.a.id,e.b.id,e.length])});
const before=snapshot();smoothHighwayGraph(graph);assert.equal(snapshot(),before,'Display smoothing must leave source nodes, topology and route costs intact');
let profileSamples=0,tangentJoins=0,maxLateralShift=0,minTangentDot=1;
for(const edge of graph.edges){
 if(!edge.surfacePoints)continue;
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
for(const mesh of [dark]){
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
 for(let i=0;i<index.count;i+=3){
  const t=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index.getX(i+k)));
  const box=new THREE.Box3().setFromPoints(t);
  for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++){
   const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);
  }
 }
}
function heights(p,interior=false){
 const out=[];
 for(const [a,b,c] of cells.get(Math.floor(p.x/cellSize)+':'+Math.floor(p.z/cellSize))||[]){
  const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-12)continue;
  const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
  if(interior?u>1e-7&&v>1e-7&&u+v<1-1e-7:u>=-1e-5&&v>=-1e-5&&u+v<=1+1e-5)out.push(u*a.y+v*b.y+(1-u-v)*c.y);
 }
 return out;
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
 assert(overlapping.length<=1,'Overlapping near-coplanar highway triangles can flicker at a merge');overlapProbes++;
}
assert(laneProbes>10000);
assert(transport.stats().roadSurface.highway.clippedOverlapSections>0);
console.log('HIGHWAY_SURFACE_GEOMETRY_PASS',JSON.stringify({profileSamples,tangentJoins,maxLateralShift,minTangentDot,laneProbes,overlapProbes,maxWheelGap,asphaltColor:dark.material.color.getHexString()}));
