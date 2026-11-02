import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildOsmGraph} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {pruneTerminalBranches} from '../src/transport-pruning.js';
import {RAIL_SCHEME_REFERENCE,RAIL_SCHEME_LINKS,RAIL_SCHEME_STATIONS,RAIL_SCHEME_YARDS,createRailSchemePlan} from '../src/rail-scheme.js';
import {createRailSiteClearancePlan,RAIL_SITE_FOOTPRINTS} from '../src/rail-site-clearance.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {protonHalls,mik42Facade} from '../src/archive-buildings.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url)));
const railways=read('data/osm/railways.geojson'),railPoints=read('data/osm/rail-points.geojson');
const sourceBefore=JSON.stringify({railways,railPoints});
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
// This intentionally builds only the light source railway graph, without the
// road surfaces, paint, building meshes or the full transport renderer.
const graph=buildOsmGraph(railways.features,{geography,point,rail:true});
const graphSnapshot=()=>JSON.stringify({
 nodes:[...graph.nodes.values()].map(n=>[n.id,n.coord,n.position.toArray(),n.component,n.edges.map(e=>[e.wayId,e.a.id,e.b.id])]),
 edges:graph.edges.map(e=>[e.wayId,e.a.id,e.b.id,e.length,e.abandoned])
});
const graphBefore=graphSnapshot(),sourceEdges=new Set(graph.edges),pairKey=(a,b)=>[String(a),String(b)].sort().join(':');

// Independent anchors were checked against actual source rails while reading
// the supplied drawing. Station markers are often beside a track; their IDs
// are not substituted for railway nodes and proximity is not a connection.
const expectedLinks=[
 ['Городская — Торетам','1833283984','271091726'],
 ['Торетам — БП 3 км','271091726','1833284245'],
 ['БП 3 км — Напорная','1833284245','1834605419'],
 ['Напорная — Разъезд','1834605419','1833640133'],
 ['Разъезд — Северная','1833640133','1833468317'],
 ['Разъезд — Томская','1833640133','439812257'],
 ['Томская — Минская','439812257','2620204313'],
 ['Минская — Донская','2620204313','439816425'],
 ['Минская — Восточная','2620204313','1836852861'],
 ['Разъезд — Братская','1833640133','1834606298'],
 ['Братская — Горная','1834606298','1834612703'],
 ['Горная — Алмазная','1834612703','1834614111'],
 ['Алмазная — Жигули','1834614111','1834614729'],
 ['Жигули — Западная','1834614729','1834615520'],
 ['Жигули — Ивановская','1834614729','1834615317'],
 ['Ивановская — Ясная','1834615317','1834617701'],
 ['Западная — Ясная','1834615520','1834617701'],
 ['Горная — Юбилейная','1834612703','2486834188'],
 ['Братская — Песчаная','1834606298','1835823607'],
 ['Песчаная — Северная, промышленная дуга','1835823607','1833468317']
];
assert.equal(RAIL_SCHEME_REFERENCE.sha256,'78cd7e691cc97d7719e32cdad33279855eb34628661d49f66ab1145d44303c04');
assert.equal(RAIL_SCHEME_REFERENCE.url,'https://drive.google.com/file/d/1gONZXQYrHThNCu7M8wwifIM05SIdF7_6/view');
assert.match(RAIL_SCHEME_REFERENCE.title,/Схема.*Байконур/);
assert.equal(new Set(RAIL_SCHEME_LINKS.map(link=>link.id)).size,RAIL_SCHEME_LINKS.length);
const declaredPairs=new Set(RAIL_SCHEME_LINKS.map(link=>pairKey(link.from,link.to)));
assert.equal(declaredPairs.size,RAIL_SCHEME_LINKS.length,'A duplicated link cannot replace a missing scheme connection');
for(const [label,from,to]of expectedLinks){
 assert(declaredPairs.has(pairKey(from,to)),'Missing scheme connection: '+label);
 const a=graph.nodes.get(from),b=graph.nodes.get(to);assert(a&&b,'Real source anchors exist: '+label);
 assert.equal(a.component,graph.largest);assert.equal(b.component,graph.largest);
 const route=graph.route(a,b);assert(route.edges.length>0,'The source connection is traversable: '+label);
}

const plan=createRailSchemePlan(graph);
assert(plan.protectedEdges instanceof Set);assert.equal(plan.connections.length,RAIL_SCHEME_LINKS.length);
assert(plan.protectedEdges.size>0);
const connections=new Map(plan.connections.map(connection=>[connection.id,connection]));
assert.equal(connections.size,plan.connections.length);
let connectedSegments=0;
for(const link of RAIL_SCHEME_LINKS){
 const connection=connections.get(link.id);assert(connection,'Missing planned connection '+link.id);
 assert.equal(connection.from,link.from);assert.equal(connection.to,link.to);
 assert.equal(connection.nodeIds[0],link.from);assert.equal(connection.nodeIds.at(-1),link.to);
 assert.equal(connection.nodeIds.length,connection.edges.length+1);
 for(let i=0;i<connection.edges.length;i++){
  const edge=connection.edges[i],a=connection.nodeIds[i],b=connection.nodeIds[i+1];
  assert(sourceEdges.has(edge),'A connection must use actual source edges, not invented joins');
  assert(!edge.abandoned,'A black active connection cannot route over an abandoned railway');
  assert(edge.a.id===a&&edge.b.id===b||edge.a.id===b&&edge.b.id===a,'Consecutive nodes share the same physical source edge');
  assert(plan.protectedEdges.has(edge),'A scheme connection is missing pruning protection: '+link.id);connectedSegments++;
 }
 assert.deepEqual(connection.sourceWayIds,[...new Set(connection.edges.map(edge=>edge.wayId))]);
}
// The northern industrial arc is a distinct connection; routing this pair
// back through Bratskaya/Razyezd would lose the loop shown in the drawing.
const industrialArc=plan.connections.find(c=>pairKey(c.from,c.to)===pairKey('1835823607','1833468317'));
for(const way of ['172441874','172441861'])assert(industrialArc.sourceWayIds.includes(way),'The industrial loop retains source way '+way);
const historicalWays=new Set(RAIL_SCHEME_YARDS.filter(y=>y.includeAbandoned).flatMap(y=>y.sourceWayIds.map(String)));
for(const edge of plan.protectedEdges){
 assert(sourceEdges.has(edge));
 assert(!edge.abandoned||historicalWays.has(edge.wayId),'An abandoned way needs explicit historical attribution, not an active route');
}
assert(RAIL_SCHEME_YARDS.length>0,'The named industrial parks have explicit protected source ways');
for(const yard of RAIL_SCHEME_YARDS){
 assert(yard.sourceWayIds.length>0);
 for(const id of yard.sourceWayIds){
  const edges=graph.edges.filter(e=>e.wayId===String(id)&&(!e.abandoned||yard.includeAbandoned));
  assert(edges.length>0,'A protected industrial way must exist: '+id);
  for(const edge of edges)assert(plan.protectedEdges.has(edge),'A protected park loses part of source way '+id);
 }
}

assert.deepEqual(RAIL_SCHEME_STATIONS.map(s=>s.name).sort(),['БП 9 км','Космотранс','Кубань','Предобъектная'].sort());
assert.equal(new Set(RAIL_SCHEME_STATIONS.map(s=>s.id)).size,4);assert.equal(plan.stations.length,4);
const existingStationIds=new Set(railPoints.features.filter(f=>['station','halt'].includes(f.properties.tags?.railway)).map(f=>'osm-station-'+f.properties.osmId));
assert.equal(existingStationIds.size,32,'The archived station catalogue remains intact');
for(const definition of RAIL_SCHEME_STATIONS){
 assert(!existingStationIds.has(definition.id),'A derived label cannot replace an existing station ID');
 assert.match(definition.positionBasis,/схем|schem|diagram/i,'A derived name must declare its schematic attribution');
 const node=graph.nodes.get(definition.sourceNodeId),station=plan.stations.find(s=>s.id===definition.id);
 assert(node&&station,'Every derived label has an actual source anchor');assert.equal(node.component,graph.largest);
 assert.deepEqual(definition.coordinates,node.coord);assert.deepEqual(station.coordinates,node.coord);
 assert(station.position.distanceTo(node.position)<1e-10,'The label uses its actual source node position');
 assert(definition.sourceWayIds.length>0);
 assert(node.edges.some(e=>definition.sourceWayIds.map(String).includes(e.wayId)),'The named source ways really meet the label anchor');
 for(const id of definition.sourceWayIds){
  const edges=graph.edges.filter(e=>e.wayId===String(id)&&(!e.abandoned||historicalWays.has(e.wayId)));assert(edges.length>0);
  for(const edge of edges)assert(plan.protectedEdges.has(edge),'A derived location loses its displayed source way '+id);
 }
}

// A deliberately permissive pruning fixture exercises the same source edge
// objects. Full-renderer diagnostics separately verify that this protection
// is actually passed through integration and that steel stays beneath trains.
const pruned=pruneTerminalBranches(graph,{maxLength:55,protectedEdges:plan.protectedEdges,protectedNode:()=>false,eligible:e=>!e.abandoned});
for(const edge of plan.protectedEdges)assert(!pruned.removed.has(edge),'Pruning removed a required schematic connection');
const diagnostics=JSON.parse(JSON.stringify(plan.stats));
assert.equal(diagnostics.connectionCount,plan.connections.length);assert.equal(diagnostics.protectedEdges,plan.protectedEdges.size);
assert.equal(diagnostics.connections.length,plan.connections.length);assert(diagnostics.connections.every(c=>!Object.hasOwn(c,'edges')));
assert.deepEqual([...diagnostics.protectedWayIds].sort(),[...new Set([...plan.protectedEdges].map(e=>e.wayId))].sort());

// A long segment has both endpoints outside the building. Analytical cuts
// must remove its middle even without an input vertex inside the footprint.
const V=(...p)=>new THREE.Vector3(...p),near=(a,b,message)=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);
const localPoint=(x,z,y=0)=>V(x,y,z),local42=createRailSiteClearancePlan({siteRecords:[{id:'pad-42',x:0,y:0}],point:localPoint,marginWorld:0});
const crossing42=[V(-30,7,0),V(30,13,0)],crossingBefore=JSON.stringify(crossing42),cut42=local42.clipPath(crossing42,{sourceWayId:'test-long-segment'});
assert.equal(cut42.runs.length,2);assert.equal(cut42.cuts.length,2);
near(cut42.runs[0].at(-1).x,-20.16,'The 144 m frontage clips at its actual .28-scale west edge');
near(cut42.runs[1][0].x,20.16,'The east edge stays equally precise');
for(const {position:p}of cut42.cuts)near(p.y,7+(p.x+30)/10,'Clipping interpolates the original grade');
assert.equal(JSON.stringify(crossing42),crossingBefore,'Clipping never edits input points');
const boundary42=[V(-30,2,-35.32*.28/2),V(30,2,-35.32*.28/2)];
assert.equal(local42.clipPath(boundary42).runs[0],boundary42,'A tangent segment on the building perimeter stays visible');
const yaw=.7,origin=V(123,0,-87),rotate=p=>p.clone().applyAxisAngle(V(0,1,0),yaw).add(origin);
const rotated42=createRailSiteClearancePlan({siteRecords:[{id:'pad-42',x:123,y:-87,runtimeYaw:yaw}],point:localPoint,marginWorld:0});
const rotatedCuts=rotated42.clipPath(crossing42.map(rotate));assert.equal(rotatedCuts.runs.length,2);
for(let i=0;i<2;i++)near(rotatedCuts.cuts[i].position.distanceTo(rotate(cut42.cuts[i].position)),0,'Rotated/translated cuts preserve the same local geometry');

const local92=createRailSiteClearancePlan({siteRecords:[{id:'pad-92',x:0,y:0}],point:localPoint,marginWorld:0});
const tankCenter=V(-19.908,0,-22.68),tankLine=[tankCenter.clone().add(V(0,2,-1)),tankCenter.clone().add(V(0,6,1))];
const tankCuts=local92.clipPath(tankLine);assert.equal(tankCuts.runs.length,2);assert.equal(tankCuts.cuts.length,2);
for(let i=0;i<2;i++)near(tankCuts.cuts[i].position.z,tankCenter.z+(i?1:-1)*3.34*.14,'Circular tank clipping uses its real outer band radius');
// These coordinates lie in empty model space, well inside the former broad
// circles. They must survive unchanged instead of becoming invisible gaps.
for(const [clearance,radius,empty]of [
 [local42,22,[V(-5,.75,10),V(5,.75,10)]],
 [local92,25,[V(14,.75,-15),V(16,.75,-15)]]
]){
 assert(empty.every(p=>Math.hypot(p.x,p.z)<radius));
 assert.equal(clearance.clipPath(empty).runs[0],empty,'Empty space in an old circular mask remains visible');
}

// Build only these small archival models, without the scene/transport mesh.
// Their real primitive vertices independently check that the effective rail
// clearance covers the displayed buildings at the manifest scale and yaw.
let modelBoundsProbes=0;
for(const [siteId,build]of [['pad-42',mik42Facade],['pad-92',protonHalls]]){
 const manifest=ARCHIVE_MAP.find(row=>row.id===siteId),footprints=RAIL_SITE_FOOTPRINTS.find(row=>row.siteId===siteId);
 assert.equal(footprints.scale,manifest.scale);assert.equal(footprints.yaw,manifest.yaw);
 const model=new THREE.Group();model.scale.setScalar(manifest.scale);model.rotation.y=manifest.yaw;build(model);model.updateWorldMatrix(true,true);
 const clearance=createRailSiteClearancePlan({siteRecords:[{id:siteId,x:0,y:0}],point:localPoint});
 model.traverse(mesh=>{
  if(!mesh.isInstancedMesh)return;
  const kind=mesh.geometry.type;
  if(kind!=='BoxGeometry'&&!(siteId==='pad-92'&&['CylinderGeometry','SphereGeometry'].includes(kind)))return;
  const vertices=kind==='BoxGeometry'?[-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[-.5,.5].map(z=>V(x,y,z)))):
   Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>V().fromBufferAttribute(mesh.geometry.attributes.position,i));
  for(let i=0;i<mesh.count;i++){
   const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
   // Low sleepers/track pieces are not buildings. Site 42's decorative
   // trees are cylinders, deliberately outside its structural footprints.
   if(new THREE.Vector3().setFromMatrixPosition(matrix).y<=1)continue;
   matrix.premultiply(mesh.matrixWorld);
   for(const vertex of vertices){const p=vertex.clone().applyMatrix4(matrix);
    assert(clearance.containsSite(siteId,p),'An actual structural primitive escapes rail clearance: '+siteId+' '+p.toArray());modelBoundsProbes++;
   }
  }
 });
}
assert(modelBoundsProbes>1000,'The check includes real hall fronts, roofs, piers, tanks and stairs');

const clearance=createRailSiteClearancePlan({siteRecords:geography.sites,point});
assert.equal(clearance.stats().footprintCount,19);let clearanceProbes=0;
for(const feature of railways.features.filter(f=>f.properties.tags?.railway==='rail')){
 const points=feature.geometry.coordinates.map(coord=>point(...geography.project(...coord),.75));
 const clipped=clearance.clipPath(points,{sourceWayId:String(feature.properties.osmId)});
 for(const run of clipped.runs)for(let i=1;i<run.length;i++)for(const t of [.01,.25,.5,.75,.99]){
  const p=run[i-1].clone().lerp(run[i],t);assert(!clearance.contains(p),'A retained source rail passes through a building footprint');
  near(p.y,.75,'Source elevation survives footprint clipping');clearanceProbes++;
 }
 for(const cut of clipped.cuts){
  let error=Infinity;
  for(let i=1;i<points.length;i++)error=Math.min(error,new THREE.Line3(points[i-1],points[i]).closestPointToPoint(cut.position,true,V()).distanceTo(cut.position));
  assert(error<1e-7,'A cut must remain on its original source segment');
 }
}
const clearanceStats=clearance.stats();assert(clearanceProbes>20000);assert(clearanceStats.clippedWayIds.length>0);
assert(clearanceStats.hiddenLength>0&&clearanceStats.hiddenLength<307.5678+259.5113,'Building masks preserve more source track than the former site circles');
assert.equal(graphSnapshot(),graphBefore,'Deriving/protecting the scheme does not rewrite source topology or coordinates');
assert.equal(JSON.stringify({railways,railPoints}),sourceBefore,'The original OSM files and station records remain unchanged');
console.log('RAIL_SCHEME_PASS',JSON.stringify({sourceNodes:graph.nodes.size,sourceEdges:graph.edges.length,connections:plan.connections.length,
 connectedSegments,protectedEdges:plan.protectedEdges.size,protectedKept:plan.protectedEdges.size,derivedLabels:plan.stations.length,
 sourceStations:existingStationIds.size,yards:RAIL_SCHEME_YARDS.length,clearanceProbes,modelBoundsProbes,footprints:clearanceStats.footprintCount,
 clippedWays:clearanceStats.clippedWayIds.length,hiddenLength:clearanceStats.hiddenLength}));
