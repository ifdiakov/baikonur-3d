import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildRoadMarkings} from '../src/road-markings.js';
import {buildOsmGraph,buildOsmTransportNetwork} from '../src/osm-transport.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createInterchangeAprons} from '../src/interchange-aprons.js';

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

// Check the two published trouble spots in the real museum geometry.
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const geography=createMuseumGeography({catalog:read('data/catalog.json'),matches:read('data/osm/catalog-matches.json')});
const point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4),data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')};
const network=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers:{roads:new THREE.Group(),rails:new THREE.Group()},siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
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
console.log('ROAD_MARKING_CONTOURS_PASS',JSON.stringify({frameChecks,gradedMouthChecks:3,seamChecks,actualUpperArcChecks:3,actualContourChecks,replacementContourOpenings:network.roadMarkingPlan.stats.replacementContourOpenings}));
