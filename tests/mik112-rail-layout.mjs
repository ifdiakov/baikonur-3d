import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmGraph} from '../src/osm-transport.js';
import {buildMik112,MIK112} from '../src/mik112.js';
import {RAIL_PROFILE,RAIL_METRES} from '../src/rail-profile.js';
import {MIK112_RAIL_LAYOUT,MIK112_OSM_WAY_IDS,createMik112RailSourcePlan,createMik112RailApproaches} from '../src/mik112-rail-plan.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const source=read('data/osm/railways.geojson'),sourceBefore=JSON.stringify(source);
const graph=buildOsmGraph(source.features,{geography,point,rail:true});
const snapshot=()=>JSON.stringify({nodes:[...graph.nodes.values()].map(node=>[node.id,node.coord,node.position.toArray()]),edges:graph.edges.map(edge=>[edge.wayId,edge.a.id,edge.b.id,edge.length])});
const before=snapshot(),plan=createMik112RailSourcePlan(graph);
assert.equal(plan.gates.length,2);assert.equal(plan.destinationRoutes.length,8);
assert.equal(new Set(plan.gates.map(gate=>gate.sourceNodeId)).size,2,'Four approaches must reach two real OSM switches');
assert.deepEqual(plan.gates.map(gate=>gate.sourceNodeId),['1834612063','1834612065']);
assert.equal(plan.replacedEdges.size,39);assert.equal(plan.protectedEdges.size,194);
for(const edge of plan.replacedEdges){assert(graph.edges.includes(edge));assert(!plan.protectedEdges.has(edge),'A display replacement cannot remove downstream destination track');}
for(const edge of plan.protectedEdges)assert(graph.edges.includes(edge));
let connectedSourceSegments=0;
for(const route of plan.destinationRoutes){
 assert.equal(route.nodeIds[0],plan.gates[route.gateIndex].sourceNodeId);
 assert.equal(route.points.length,route.edges.length+1);
 for(let i=0;i<route.edges.length;i++){
  const edge=route.edges[i],a=route.nodeIds[i],b=route.nodeIds[i+1];
  assert(edge.a.id===a&&edge.b.id===b||edge.a.id===b&&edge.b.id===a,'A rail route contains an invented connection');
  assert(route.points[i].equals(graph.nodes.get(a).position));assert(route.points[i+1].equals(graph.nodes.get(b).position));
  assert(plan.protectedEdges.has(edge));connectedSourceSegments++;
 }
 for(const way of route.sourceWayIds)assert(MIK112_OSM_WAY_IDS.includes(way),'Live OSM check must cover each retained destination way');
}
assert.deepEqual([...new Set(plan.destinationRoutes.map(route=>route.destination))].sort(),['mzk','sdi','site110-left','site110-right']);

const root=new THREE.Group(),site=geography.sites.find(site=>site.id==='pad-112');
root.position.copy(point(site.x,site.y));root.rotation.y=MIK112.yaw;root.scale.setScalar(MIK112.scale);
const exhibit=buildMik112(root),stats=exhibit.stats(),manifest=read('assets/models/tua/manifest-v2.json');
assert.equal(stats.features['energia-gate'],2);assert.equal(stats.features['low-hall-gate'],2);
assert.equal(MIK112.dimensions.high.bays,3,'Two exterior doors must not erase the three structural high bays');
assert.equal(stats.railLayout.trackCount,4);assert.equal(stats.railLayout.tracksPerGate,2);
assert.deepEqual(exhibit.railHeadEntries,[[-82.4,4.305,-258.5],[-59.6,4.305,-258.5],[-30.4,4.305,-258.5],[-7.6,4.305,-258.5]]);
assert.deepEqual(manifest.placements.map(placement=>placement.position),[[-71,4.305,-183],[-19,4.305,-183]]);
assert.deepEqual(root.scale.toArray(),[.14,.14,.14]);assert.equal(root.rotation.y,-Math.PI/4);

// Count the actual full-height facade leaves, not just declared gate metadata.
const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),leaves=[];
root.traverse(mesh=>{
 if(!mesh.isInstancedMesh||mesh.parent!==root)return;
 for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));matrix.decompose(p,q,s);
  if(Math.abs(s.y-50)<1e-5&&Math.abs(s.z-1)<1e-5&&Math.abs(p.z+119.3)<1e-5)leaves.push({center:p.clone(),size:s.clone()});
 }
});
leaves.sort((a,b)=>a.center.x-b.center.x);assert.equal(leaves.length,2);
for(let i=0;i<2;i++){
 const leaf=leaves[i],gate=stats.railGates[i],carrier=manifest.placements[i];
 assert(Math.abs(leaf.center.x-carrier.position[0])<1e-6,'Each visible gate is directly behind its fixed carrier');
 assert(Math.abs(leaf.size.x-MIK112_RAIL_LAYOUT.clearWidth)<1e-6);
 for(const index of gate.trackIndices){
  const entry=exhibit.railHeadEntries[index];
  assert(Math.abs(entry[0]-gate.centerX)+RAIL_METRES.gauge/2+RAIL_METRES.headWidth/2<leaf.size.x/2,'Both full track sections fit through their own gate');
 }
}
const towerBeacon=root.userData.facilityLighting.beacons.find(beacon=>beacon.id==='mik112-stair-tower');
assert.deepEqual(towerBeacon.position,[33,48.6,110],'The beacon belongs to the actual existing tower roof');

const tracks=createMik112RailApproaches(root,plan,{headY:RAIL_PROFILE.headY});
assert.equal(tracks.length,4);let approachSamples=0,minEndTangentDot=1;
for(const track of tracks){
 const entry=root.localToWorld(new THREE.Vector3(...exhibit.railHeadEntries[track.trackIndex]));
 const sourceHead=graph.nodes.get(track.sourceNodeId).position.clone().add(new THREE.Vector3(0,RAIL_PROFILE.headY,0));
 assert(track.points[0].distanceTo(entry)<1e-10);assert(track.points.at(-1).distanceTo(sourceHead)<1e-10);
 const endTangent=track.points.at(-1).clone().sub(track.points.at(-2)).setY(0).normalize(),expected=new THREE.Vector3(...track.sourceTangent);
 const dot=endTangent.dot(expected);minEndTangentDot=Math.min(minEndTangentDot,dot);assert(dot>.99,'The approach must meet its outward OSM tangent');
 for(const world of track.points){
  assert(world.toArray().every(Number.isFinite));const local=root.worldToLocal(world.clone());
  assert(local.z<=MIK112_RAIL_LAYOUT.entryZ+1e-6,'An exterior approach doubles back through the carrier or hall');
  assert(world.y>=Math.min(entry.y,sourceHead.y)-1e-8&&world.y<=Math.max(entry.y,sourceHead.y)+1e-8,'An approach overshoots its rail-head elevation');approachSamples++;
 }
}
// Separate door pairs may not acquire an invented crossing on the apron.
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
for(const a of tracks.slice(0,2))for(const b of tracks.slice(2))for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++){
 const [p,q]=[a.points[i-1],a.points[i]],[r,s]=[b.points[j-1],b.points[j]];
 assert(!(cross(p,q,r)*cross(p,q,s)<-1e-12&&cross(r,s,p)*cross(r,s,q)<-1e-12),'The two gate pairs cross before their source switches');
}
assert.equal(snapshot(),before,'The museum rail approaches must preserve original source topology and coordinates');
assert.equal(JSON.stringify(source),sourceBefore);
console.log('MIK112_RAIL_LAYOUT_PASS',JSON.stringify({gates:leaves.length,tracks:tracks.length,sourceSwitches:plan.gates.map(gate=>gate.sourceNodeId),
 destinationRoutes:plan.destinationRoutes.length,connectedSourceSegments,protectedSourceEdges:plan.protectedEdges.size,replacedDisplayEdges:plan.replacedEdges.size,
 approachSamples,minEndTangentDot,gauge:RAIL_METRES.gauge,headWidth:RAIL_METRES.headWidth}));
