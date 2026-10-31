import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildRoadMarkings} from '../src/road-markings.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createInterchangeAprons} from '../src/interchange-aprons.js';
import {clipOrdinaryRoadMeshes,unionRoadSurfacePolygons} from '../src/road-surface.js';
import {smoothLocalRoadGraph} from '../src/access-transitions.js';

const V=(x=0,y=.72,z=0)=>new THREE.Vector3(x,y,z),normal=d=>V(-d.z,0,d.x).normalize();
function triangle(p,a,b,c){
 const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-12)return false;
 const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
 return u>-1e-7&&v>-1e-7&&u+v<1+1e-7;
}
const contains=(q,p)=>Math.abs(q.vertices[0].y-p.y)<1.2&&(triangle(p,q.vertices[0],q.vertices[2],q.vertices[1])||triangle(p,q.vertices[1],q.vertices[2],q.vertices[3]));
const hits=(quads,p)=>quads.filter(q=>q.kind==='edge'&&contains(q,p));
function fixture(definitions,surfaceHeightAt){
 const nodes=new Map(),edges=[],roads=[];
 for(const row of definitions){
  const tags={highway:'primary',surface:'asphalt',lanes:'2',...row.tags},points=row.points.map(([id,x,y,z])=>{
   if(!nodes.has(id))nodes.set(id,{id,position:V(x,y,z),edges:[]});return nodes.get(id);
  });
  for(let i=1;i<points.length;i++){const edge={a:points[i-1],b:points[i],width:3.6,tags,wayId:row.id};edges.push(edge);edge.a.edges.push(edge);edge.b.edges.push(edge);}
  roads.push({id:row.id,wayId:row.id,points:points.map(n=>n.position.clone()),width:3.6,tags,marked:true,startNodeId:points[0].id,endNodeId:points.at(-1).id,...row.extra});
 }
 return {graph:{nodes,edges},roads,surfaceHeightAt};
}

// A side branch on an otherwise continuous source way must not replace
// the incoming host frame with its different outgoing chord. The source
// node is pinned and the third arm keeps its own original approach frame.
const throughT=fixture([
 {id:'through',points:[['a',-8,.72,0],['t',0,.72,0],['b',8,.72,1.2]]},
 {id:'side',points:[['t',0,.72,0],['c',0,.72,9]]}
],()=>.72).graph;
const topology=()=>JSON.stringify({nodes:[...throughT.nodes.values()].map(n=>[n.id,n.position.toArray()]),edges:throughT.edges.map(e=>[e.a.id,e.b.id,e.wayId])});
const sourceT=topology();smoothLocalRoadGraph(throughT);assert.equal(topology(),sourceT);
const [incoming,outgoing,sideRoad]=throughT.edges;
assert(incoming.surfaceTangents[1].dot(outgoing.surfaceTangents[0])>1-1e-12,'Both same-way host arms at a T must share one C1 display frame');
assert.equal(sideRoad.surfacePoints,undefined,'The side branch must not inherit the host-road frame');
assert.deepEqual(incoming.surfacePoints.at(-1).toArray(),throughT.nodes.get('t').position.toArray());
assert.deepEqual(outgoing.surfacePoints[0].toArray(),throughT.nodes.get('t').position.toArray());

// Irregular source sampling must preserve the exact pavement frames. A
// second resampling pass used to rotate the offset and leave short hooks.
const angles=[0,.012,.055,.20,.215,.49,.52,.81,.83,1.05,1.32,1.34,1.57];
const curvedPoints=angles.map(a=>V(9*Math.cos(a),.72,9*Math.sin(a)));
const directionAt=(p,fallback)=>{const i=curvedPoints.findIndex(q=>q.distanceTo(p)<1e-8);return i<0?fallback:V(-Math.sin(angles[i]),0,Math.cos(angles[i]));};
const curved=buildRoadMarkings({roads:[{id:'irregular-curve',wayId:'irregular-curve',points:curvedPoints,width:3.6,tags:{highway:'trunk',lanes:'2'},marked:true,directionAt,surfaceSmoothed:true}],surfaceHeightAt:()=>.726});
let frameChecks=0;
for(const p of curvedPoints)for(const side of [-1,1]){
 const expected=p.clone().addScaledVector(normal(directionAt(p)),side*1.58);
 const distance=Math.min(...curved.quads.filter(q=>q.kind==='edge').flatMap(q=>[[q.vertices[0],q.vertices[1]],[q.vertices[2],q.vertices[3]]]).map(([a,b])=>Math.hypot((a.x+b.x)/2-expected.x,(a.z+b.z)/2-expected.z)));
 assert(distance<2e-6,'A resampled line moves away from the rendered pavement cross-section');frameChecks++;
}

// A shallow connected ramp mouth can have up to .9 scene units of grade
// difference across its width. Its inner line must open on the actual
// neighbouring pavement; an unrelated upper crossing must remain separate.
const host={id:'host',tags:{highway:'trunk'},points:[['west',-30,.72,0],['join',0,.72,0],['east',30,.72,0]]};
const branch={id:'ramp',tags:{highway:'trunk_link',oneway:'yes',lanes:'1'},points:[['join',0,.72,0],['raised',5,1.57,5/6],['end',30,1.57,5]]};
function gradedSurface(p){
 const line=new THREE.Line3(V(0,0,0),V(30,0,5)),t=line.closestPointToPointParameter(p.clone().setY(0),true),at=line.at(t,V(0,0,0));
 const inHost=Math.abs(p.z)<=1.8&&Math.abs(p.x)<=30,inBranch=Math.hypot(p.x-at.x,p.z-at.z)<=1.8;
 const y=.72+.85*Math.min(1,t*6),result=inHost&&inBranch?(Math.abs(p.y-y)<Math.abs(p.y-.72)?y:.72):inHost?.72:inBranch?y:null;
 // Match the production sampler's level selection, not an infinite plane.
 return result!==null&&Math.abs(result-p.y)<.6?result:null;
}
const graded=buildRoadMarkings(fixture([host,branch],gradedSurface)),tangent=V(30,0,5).normalize(),n=normal(tangent);
const inner=V(8,1.57,8/6).addScaledVector(n,-1.58),outer=V(8,1.57,8/6).addScaledVector(n,1.58);
assert(!hits(graded.quads,inner).some(q=>q.roadIds.includes('ramp')),'A connected .85-high grade difference leaves an internal ramp-mouth arc');
assert(hits(graded.quads,outer).some(q=>q.roadIds.includes('ramp')),'The exposed outside ramp line is retained');
const upper={...branch,points:branch.points.map(([id,x,y,z])=>['upper-'+id,x,y+5.8,z])};
const separated=buildRoadMarkings(fixture([host,upper],p=>p.y>4?gradedSurface(p.clone().add(V(0,-5.8,0)))+5.8:gradedSurface(p)));
assert(hits(separated.quads,inner.clone().add(V(0,5.8,0))).some(q=>q.roadIds.includes('ramp')),'A disconnected upper road incorrectly opens its edge at a lower-road crossing');

// The rounded replacement contour starts exactly on the old host edge.
// Only that contour may continue past the tangent seam: otherwise a tiny
// straight tail forks away from it before the ordinary mouth probe opens.
const contour=Array.from({length:25},(_,i)=>{const a=-Math.PI/2-i*Math.PI/48;return V(4.8+3.22*Math.cos(a),.72,4.8+3.22*Math.sin(a));});
const contourDirection=(p,fallback)=>{const i=contour.findIndex(q=>q.distanceToSquared(p)<1e-12);if(i<0)return fallback;const a=-Math.PI/2-i*Math.PI/48;return V(Math.sin(a),0,-Math.cos(a));};
const apronSurface=p=>Math.abs(p.z)<=1.8||Math.abs(p.x)<=1.8||p.x<=4.8&&p.z<=4.8&&p.x>=1.8&&p.z>=1.8&&Math.hypot(p.x-4.8,p.z-4.8)>=3?.72:null;
const apronInput=fixture([
 {id:'host',points:[['west',-20,.72,0],['join',0,.72,0],['east',20,.72,0]]},
 {id:'branch',tags:{highway:'trunk_link'},points:[['join',0,.72,0],['north',0,.72,20]]}
],apronSurface);
apronInput.extraEdges=[{id:'replacement-edge',family:'highway',points:contour,directionAt:contourDirection}];
const apron=buildRoadMarkings(apronInput);
let seamChecks=0;
for(const i of [0,1,2,3,4,6,20,22,23]){
 const p=contour[i].clone().lerp(contour[i+1],.371),paint=hits(apron.quads,p);
 assert.equal(paint.length,1,'A replacement contour has duplicate edge paint beside its tangent seam');assert(paint[0].roadIds.includes('replacement-edge'));seamChecks++;
}
assert(hits(apron.quads,V(5,.72,1.58)).some(q=>q.roadIds.includes('host')),'The exposed host edge before the exact replacement seam is lost');

// Two close, explicit side mouths leave a real short curb between them.
// Both neighbouring samples are inside a mouth, so checking only their
// endpoints used to discard the whole section of otherwise required paint.
const closeMouths=fixture([
 {id:'host',points:[['west',-6,.72,0],['a',0,.72,0],['b',2,.72,0],['east',6,.72,0]]},
 {id:'branch-a',points:[['a',0,.72,0],['north-a',0,.72,10]],extra:{width:1.6,marked:false}},
 {id:'branch-b',points:[['b',2,.72,0],['north-b',2,.72,10]],extra:{width:1.6,marked:false}}
],p=>Math.abs(p.z)<=1.8||p.z>=0&&p.z<=10&&(Math.abs(p.x)<=.8||Math.abs(p.x-2)<=.8)?.72:null);
const shortCurb=buildRoadMarkings(closeMouths);
assert.equal(hits(shortCurb.quads,V(1.037,.72,1.58)).length,1,'A genuine exposed curb between two nearby mouths loses its edge marking');
assert.equal(hits(shortCurb.quads,V(1.037,.72,-1.58)).length,1,'The opposite curb stays continuous beside the same two mouths');
const narrowMouth=fixture([
 {id:'host',points:[['west',-2,.72,0],['middle',0,.72,0],['east',2,.72,0]]},
 {id:'access',points:[['access-end',1,.72,0],['north',1,.72,10]],extra:{width:.5,marked:false,connections:[{nodeId:'explicit-access',position:V(1,.72,0),hostWayId:'host'}]}}
],p=>Math.abs(p.z)<=1.8||Math.abs(p.x-1)<=.25&&p.z>=0&&p.z<=10?.72:null);
const shortOpening=buildRoadMarkings(narrowMouth);
assert.equal(hits(shortOpening.quads,V(1.037,.72,1.58)).length,0,'Two painted samples must not span a genuine narrow mouth between them');
assert.equal(hits(shortOpening.quads,V(1.037,.72,-1.58)).length,1,'A narrow side mouth must retain the opposite edge');

// A bent ribbon has two different grade planes. A pale shoulder above its
// lower triangle must disappear, while a genuinely lower road stays intact.
function triangleMesh(y,name){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.95,y,-.95,-.65,y,-.95,-.8,y,-.65],3));geometry.setIndex([0,2,1]);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.name=name;return mesh;
}
const pale=triangleMesh(.05,'pale overlay'),lowerRoad=triangleMesh(-5.8,'lower road');
clipOrdinaryRoadMeshes([pale,lowerRoad],null,[[V(-1,0,-1),V(1,0,-1),V(1,2,1),V(-1,0,1)]]);
assert.equal(pale.geometry.attributes.position.count,0,'A nonplanar owner extrapolates the wrong grade plane and leaves a pale chip');
assert.equal(lowerRoad.geometry.attributes.position.count,3,'An upper ribbon must not remove the lower road');

// Clipping a graded ramp in plan must also weld its exposed cut to the
// owning main-road plane. Otherwise oblique cameras see ground through a
// vertical slit although a top-down coverage test reports no missing X/Z.
const seamHeight=x=>1+.04*x;
const ownerPoints=[V(-3,seamHeight(-3),-2),V(3,seamHeight(3),-2),V(3,seamHeight(3),2),V(-3,seamHeight(-3),2)];
const rampPoints=[V(0,.95,-1),V(7,1.23,-1),V(7,1.23,5),V(0,.95,5)];
const seamInput=[];
for(const [points,priority] of [[ownerPoints,0],[rampPoints,1],[rampPoints.map(p=>p.clone().add(V(0,-5.8,0))),1]])for(const indices of [[0,1,2],[0,2,3]]){
 const poly=indices.map(i=>points[i]);poly.priority=priority;seamInput.push(poly);
}
const seamSource=JSON.stringify(seamInput),seamUnion=unionRoadSurfacePolygons(seamInput);assert.equal(JSON.stringify(seamInput),seamSource);
let seamHeightChecks=0,lowerSeamChecks=0;
for(const poly of seamUnion.polygons)for(const p of poly){
 if(p.y<0){assert(Math.abs(p.y-(.95+.04*p.x-5.8))<1e-10,'An upper-road seam changes the lower underpass');lowerSeamChecks++;continue;}
 if(p.x>=0&&p.x<=3&&(Math.abs(p.z-2)<1e-8||Math.abs(p.x-3)<1e-8&&p.z>=-1&&p.z<=2)){
  assert(Math.abs(p.y-seamHeight(p.x))<1e-10,'The ramp cut and its owning main-road plane have different heights');seamHeightChecks++;
 }
}
assert(seamHeightChecks>2&&lowerSeamChecks>2);
// Ordinary asphalt owns its visible footprint too: a slightly raised old
// connector shoulder must not protrude, while a lower-level road survives.
const localOwner=triangleMesh(.72,'ordinary asphalt');localOwner.geometry=localOwner.geometry.toNonIndexed();
const oldShoulder=triangleMesh(.735,'old connector shoulder'),underpassShoulder=triangleMesh(-5.08,'underpass shoulder');
clipOrdinaryRoadMeshes([oldShoulder,underpassShoulder],localOwner,[],{onlyProtruding:true});
assert.equal(oldShoulder.geometry.attributes.position.count,0);
assert.equal(underpassShoulder.geometry.attributes.position.count,3);

// Check the two published trouble spots in the real museum geometry.
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4),data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const network=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const nearby=network.roadMarkingPlan.quads.filter(q=>q.kind==='edge'&&q.vertices.some(p=>p.x>-140&&p.x<-80&&p.z>985&&p.z<1025));
for(const p of [V(-100.7991066,2.4476557,1003.2613678),V(-99.6374130,2.3869651,1002.7759705),V(-99.3511639,2.3686178,1002.6624603)])
 assert(!hits(nearby,p).some(q=>q.roadIds.some(id=>id.startsWith('marking-road-369722065-'))),'The published internal upper-ramp arc remains painted');
const graph=buildOsmGraph(data.roads.features,{geography,point}),aprons=createInterchangeAprons(graph);let actualContourChecks=0;
for(const patch of aprons)for(const [side,edge] of patch.edgeLines.entries()){
 const id='apron-'+patch.spec.nodeId+'-'+side;
 for(const i of [0,1,2,3,4,6,edge.points.length-4,edge.points.length-3,edge.points.length-2]){
  const p=edge.points[i].clone().lerp(edge.points[i+1],.371),paint=hits(nearby,p);
  assert.equal(paint.length,1,'A lower T-junction replacement edge has a gap or duplicate tail: '+JSON.stringify({id,i,p:p.toArray(),owners:paint.map(q=>q.roadIds)}));
  assert(paint[0].roadIds.includes(id));actualContourChecks++;
 }
 for(const quad of nearby.filter(q=>q.roadIds.some(id=>patch.spec.connectorWayIds.some(way=>id.startsWith('marking-road-'+way+'-'))))){
  const p=quad.vertices.reduce((sum,p)=>sum.add(p),V(0,0,0)).multiplyScalar(.25);
  assert(!patch.contains(p),'Old replaced connector paint survives inside the new apron');
 }
}
// The published U rims had repeated same-way paint and asphalt folds at
// almost every short source interval. Probe their complete emitted strips,
// not just the source-node endpoints or the earlier large mouth opening.
const physicalPaint=[];
for(const mesh of [layers.roads.getObjectByName('Трасса · белые кромки'),network.bridgeObjects()[0].getObjectByName('Виадук · white')]){
 mesh.updateWorldMatrix(true,false);const positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
 for(let i=0;i<(index?.count??positions.count);i+=3){
  const vertices=[0,1,2].map(k=>V().fromBufferAttribute(positions,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
  if(vertices.some(p=>p.x>-140&&p.x<-80&&p.z>985&&p.z<1025))physicalPaint.push(vertices);
 }
}
let loopOwnershipChecks=0,physicalLoopChecks=0;
for(const quad of nearby.filter(q=>q.roadIds.some(id=>/^marking-road-36972206[12]-/.test(id)))){
 const [a,b,c,d]=quad.vertices,p=a.clone().lerp(b,.413).lerp(c.clone().lerp(d,.413),.371),owners=hits(nearby,p);
 assert.equal(owners.length,1,'A U-rim has folded or duplicate paint: '+JSON.stringify({p:p.toArray(),owners:owners.map(q=>q.roadIds)}));loopOwnershipChecks++;
 const actual=physicalPaint.filter(t=>Math.abs(t[0].y-p.y)<1.2&&triangle(p,...t));
 assert.equal(actual.length,1,'The final Float32 U-rim mesh must have exactly one physical paint triangle at each interior probe');physicalLoopChecks++;
}
assert(loopOwnershipChecks>100,'Both complete U-rims are covered by the overlap probes');
const surfaceCells=new WeakMap(),surfaceCellSize=6;
function meshHeights(mesh,p,edgeTolerance=0){
 let cells=surfaceCells.get(mesh);
 if(!cells){
  mesh.updateWorldMatrix(true,false);
  cells=new Map();const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
  for(let i=0;i<(index?.count??position.count);i+=3){
   const points=[0,1,2].map(k=>V().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld)),box=new THREE.Box3().setFromPoints(points);
   for(let x=Math.floor(box.min.x/surfaceCellSize);x<=Math.floor(box.max.x/surfaceCellSize);x++)for(let z=Math.floor(box.min.z/surfaceCellSize);z<=Math.floor(box.max.z/surfaceCellSize);z++){
    const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(points);
   }
  }
  surfaceCells.set(mesh,cells);
 }
 const result=[],nearby=new Set();
 for(let x=Math.floor((p.x-edgeTolerance)/surfaceCellSize);x<=Math.floor((p.x+edgeTolerance)/surfaceCellSize);x++)for(let z=Math.floor((p.z-edgeTolerance)/surfaceCellSize);z<=Math.floor((p.z+edgeTolerance)/surfaceCellSize);z++)
  for(const t of cells.get(x+':'+z)||[])nearby.add(t);
 for(const [a,b,c] of nearby){
  const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-12)continue;
  const u=((b.z-c.z)*(p.x-c.x)+(c.x-b.x)*(p.z-c.z))/den,v=((c.z-a.z)*(p.x-c.x)+(a.x-c.x)*(p.z-c.z))/den;
  if(u<0||v<0||u+v>1){
   if(!edgeTolerance)continue;
   let distance=Infinity,height=null;
   for(const [start,end] of [[a,b],[b,c],[c,a]]){
    const dx=end.x-start.x,dz=end.z-start.z,t=THREE.MathUtils.clamp(((p.x-start.x)*dx+(p.z-start.z)*dz)/(dx*dx+dz*dz||1),0,1);
    const d=Math.hypot(p.x-start.x-t*dx,p.z-start.z-t*dz);
    if(d<distance){distance=d;height=THREE.MathUtils.lerp(start.y,end.y,t);}
   }
   if(distance<=edgeTolerance)result.push(height);
   continue;
  }
  result.push(u*a.y+v*b.y+(1-u-v)*c.y);
 }
 return result;
}
let shoulderChipChecks=0;
const dark=layers.roads.getObjectByName('OSM · асфальт трассы'),shoulder=layers.roads.getObjectByName('OSM · единые обочины');
for(const center of [V(-101.6824584,3.0732456,990.2943364),V(-100.1709601,3.1498889,991.8727639)])for(const dx of [-.12,0,.12])for(const dz of [-.12,0,.12]){
 const p=center.clone().add(V(dx,0,dz)),pavement=meshHeights(dark,p).filter(y=>Math.abs(y-p.y)<1.2);
 assert(pavement.length,'The published chip probe must retain actual dark pavement');
 assert(!meshHeights(shoulder,p).some(y=>pavement.some(top=>y>top&&y-top<1.2)),'A detached pale shoulder chip survives above the dark ramp');shoulderChipChecks++;
}
// These exact public-v3 camera rays passed between the clipped ramp and
// main road despite their continuous plan footprints. Both upper joins
// must now have real asphalt in front of the visible ground.
const raycaster=new THREE.Raycaster();let obliqueSeamChecks=0;
dark.updateWorldMatrix(true,false);
for(const view of [
 {position:[-101.46706142284488,21.845853203085692,1009.8127201063572],target:[-88.26706142284488,2.0458532030856924,995.5127201063573],pixels:[[704,674],[707,668],[697,514],[719,496]]},
 {position:[-117.38813820783946,23.436540219278715,1012.6406333868829],target:[-104.18813820783946,3.636540219278713,998.3406333868829],pixels:[[856,529],[900,490]]}
]){
 const camera=new THREE.PerspectiveCamera(52,1.6,.1,80000);camera.position.fromArray(view.position);camera.lookAt(V(...view.target));camera.updateMatrixWorld(true);
 for(const [x,y] of view.pixels){
  raycaster.setFromCamera(new THREE.Vector2(x/800-1,1-y/500),camera);
  assert(raycaster.intersectObject(dark,false).some(hit=>hit.point.y>1.8&&hit.point.y<4&&hit.point.x>-108&&hit.point.x<-85&&hit.point.z>992&&hit.point.z<1003),'An oblique ray still sees ground through the upper ramp seam: '+[x,y]);obliqueSeamChecks++;
 }
}
// The two older ordinary connector shoulders remain outside the rounded
// replacement boundary, but cannot paint a beige crescent over its host.
const ordinary=layers.roads.getObjectByName('OSM · единое дорожное полотно');let ordinaryShoulderChecks=0;
for(const p of [V(-125.0242656,.9808682,1007.3363964),V(-124.6730805,.9808682,1006.9241348),V(-124.1997428,.9808682,1006.6645649),V(-123.8027498,.9808682,1006.5729542),V(-123.2988746,.9808682,1006.5576899),V(-122.9629584,.9808682,1006.5576931),V(-120.6725809,.9797363,1015.8718446),V(-120.2450413,.9797363,1015.6886106),V(-119.9243870,.9797363,1015.5511853)]){
 const asphalt=meshHeights(ordinary,p);assert(asphalt.length,'The lower crescent probe has no retained ordinary road');
 assert(!meshHeights(shoulder,p).some(y=>y>Math.max(...asphalt)-.0003&&y<Math.max(...asphalt)+1.2),'An old connector shoulder remains above the ordinary host asphalt');ordinaryShoulderChecks++;
}
let upwardTriangles=0,seamPaintChecks=0,seamPaintEdgeChecks=0,maxUpperCrossfall=0,maxSeamPaintLiftError=0;
const positions=dark.geometry.attributes.position,index=dark.geometry.index;
for(let i=0;i<(index?.count??positions.count);i+=3){
 const [a,b,c]=[0,1,2].map(k=>V().fromBufferAttribute(positions,index?index.getX(i+k):i+k)),normal=b.clone().sub(a).cross(c.clone().sub(a));
 assert(normal.y>0,'A pavement seam has an inverted or vertical Float32 triangle');upwardTriangles++;
 if([a,b,c].every(p=>p.x>-108&&p.x<-85&&p.z>992&&p.z<1003)){
  const crossfall=Math.hypot(normal.x,normal.z)/normal.y;maxUpperCrossfall=Math.max(maxUpperCrossfall,crossfall);
  assert(crossfall<.6,'The welded upper seam forms a steep needle triangle');
 }
}
const white=layers.roads.getObjectByName('Трасса · белые кромки').geometry.attributes.position;
const pavementOwners=[dark,ordinary,network.bridgeObjects()[0].getObjectByName('Виадук · asphalt')];
const float32Ulp=value=>2**Math.max(-149,Math.floor(Math.log2(Math.abs(value)||2**-149))-23);
for(let i=0;i<white.count;i++){
 const p=V().fromBufferAttribute(white,i);if(p.x<=-108||p.x>=-85||p.z<=992||p.z>=1003)continue;
 const atLevel=y=>y<p.y+.0003&&y>p.y-.1;
 // Include the canonical bridge in world coordinates. Strict containment
 // across all owners wins; only an otherwise unsupported Float32 vertex
 // may use an actual triangle edge within one coordinate ULP. A fixed
 // barycentric epsilon cannot express that physical precision on slivers.
 let tops=pavementOwners.flatMap(mesh=>meshHeights(mesh,p)).filter(atLevel);
 if(!tops.length){
  const tolerance=Math.max(float32Ulp(p.x),float32Ulp(p.z));
  tops=pavementOwners.flatMap(mesh=>meshHeights(mesh,p,tolerance)).filter(atLevel);seamPaintEdgeChecks++;
 }
 assert(tops.length,'A marking has no pavement support in the welded upper seam: '+JSON.stringify({vertex:i,point:p.toArray()}));
 const error=Math.abs(p.y-Math.max(...tops)-.011);maxSeamPaintLiftError=Math.max(maxSeamPaintLiftError,error);
 assert(error<.002,'A marking loses exact asphalt support in the welded upper seam');seamPaintChecks++;
}
assert(seamPaintChecks>100);
console.log('ROAD_MARKING_CONTOURS_PASS',JSON.stringify({throughTChecks:5,frameChecks,gradedMouthChecks:3,seamChecks,seamHeightChecks,lowerSeamChecks,shortVisibilityChecks:4,actualUpperArcChecks:3,actualContourChecks,loopOwnershipChecks,physicalLoopChecks,shoulderChipChecks,obliqueSeamChecks,ordinaryShoulderChecks,upwardTriangles,maxUpperCrossfall,seamPaintChecks,seamPaintEdgeChecks,maxSeamPaintLiftError,replacementContourOpenings:network.roadMarkingPlan.stats.replacementContourOpenings}));
