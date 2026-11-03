import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {stitchEditedRoads,sampleEditedRoad,buildEditedRoadMeshes} from '../src/road-editor-mesh.js';
import {deriveEditedRoadStyle} from '../src/road-editor-style.js';

const a={id:'road-main',surface:'asphalt',width:4.5,points:[[0,.72,0],[45,.72,0],[90,-2.7,0]]};
const b={id:'road-spur',surface:'asphalt',width:3,points:[[45,.72,0],[45,.72,24]]};
const t={id:'road-turn',surface:'asphalt',width:2.5,points:[[110,.72,-12],[135,.72,-12],[135,.72,18]]};
const original=JSON.stringify([a,b,t]);
const done=stitchEditedRoads([a,b,t],{existingRoads:[{id:'old-main',width:5,points:[[0,.72,0],[90,.72,0]]}]});
assert.equal(JSON.stringify([a,b,t]),original,'Source coordinates cannot mutate');
assert.deepEqual(done.roads[1].points[0],b.points[0],'OSM anchors remain in place');
const points=sampleEditedRoad(t,{step:1.4,terrainHeightAt:()=>-2.72});
assert(points.length>40,'Corner interpolation must be sampled densely');
assert.deepEqual(points[0],t.points[0]);assert.deepEqual(points.at(-1),t.points.at(-1));
for(let i=1;i<points.length;i++)assert(Math.hypot(points[i][0]-points[i-1][0],points[i][2]-points[i-1][2])<=1.5);
const {geometries,stats}=buildEditedRoadMeshes(done.roads,{terrainHeightAt:()=>-2.72});
assert(stats.sourceQuads>100);assert(stats.overlaps>0,'The T-junction must merge overlapping road top surfaces');
assert(geometries.asphalt.attributes.position.count>100);
assert(geometries.shoulder.attributes.position.count>100);
for(const [kind,g] of Object.entries(geometries)){
 const p=g.attributes.position;
 for(let i=0;i<p.count;i+=3){
  const a=[p.getX(i),p.getY(i),p.getZ(i)],b=[p.getX(i+1),p.getY(i+1),p.getZ(i+1)],c=[p.getX(i+2),p.getY(i+2),p.getZ(i+2)];
  const ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-a[0],vz=c[2]-a[2],ny=uz*vx-ux*vz;
  assert(ny>1e-9,kind+': road facing downward or degenerate at triangle '+i/3);
 }
}

// Exercise the actual uploaded owner scheme, not only a synthetic junction.
const owner=JSON.parse(readFileSync(new URL('../data/road-edits-authoritative-20261103.json',import.meta.url),'utf8'));
assert.equal(owner.added.length,19);
assert.equal(owner.hidden.length,302);
const mapped=stitchEditedRoads(owner.added).roads;
const ownerMesh=buildEditedRoadMeshes(mapped,{terrainHeightAt:()=>-2.72});
let roadSamples=0;
const surfaces={asphalt:new THREE.Mesh(ownerMesh.geometries.asphalt,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),
 ground:new THREE.Mesh(ownerMesh.geometries.ground,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))};
for(const r of owner.added){
 const way=ownerMesh.paths.find(p=>p.id===r.id),mesh=surfaces[r.surface];
 for(let i=0;i<way.points.length-1;i+=Math.max(1,Math.floor(way.points.length/15))){
  // Probe INSIDE each strip, not precisely on a Float32 triangle end edge.
  const a=way.points[i],b=way.points[i+1],p=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];
  const ray=new THREE.Raycaster(new THREE.Vector3(p[0],100,p[2]),new THREE.Vector3(0,-1,0),0,200);
  assert(ray.intersectObject(mesh,false).length>0,'Owner '+r.id+' has a hole inside segment '+i);
  roadSamples++;
 }
}
assert(ownerMesh.stats.overlaps>0,'Owner junctions should be unioned into one continuous pavement');
assert(owner.added.some(r=>r.id==='road-31'&&r.points.some(p=>p[1]>20)),'Elevated road-31 is not loaded');
const ramp=ownerMesh.paths.find(p=>p.id==='road-31').points;
assert(ramp.length>70,'The steep owner road has too few vertical samples');
for(let i=1;i<ramp.length;i++){
 assert(Math.hypot(ramp[i][0]-ramp[i-1][0],ramp[i][2]-ramp[i-1][2])<=1.36);
 assert(Math.abs(ramp[i][1]-ramp[i-1][1])<1.0,
  'Abrupt elevation step along the northern access road at sample '+i);
}
// The outer shoulder must not cut into a rising terrain bank at an outside turn.
const hillside=x=>x*.25;
const terrainWay={id:'terrain-bank',surface:'asphalt',width:4,points:[[10,1,0],[30,1,0]]};
const bank=buildEditedRoadMeshes([terrainWay],{terrainHeightAt:(x,z)=>hillside(x)});
const verts=bank.geometries.shoulder.attributes.position;
for(let i=0;i<verts.count;i++)assert(verts.getY(i)>=hillside(verts.getX(i))+.07,
 'Road edge is under the hillside');


// Real OSM marking policy, geometric widths, shoulder-height and colour
// buckets must be produced by the same mesh build used in the browser.
const sources=[
 {id:'primary',source:'OpenStreetMap',width:3.6,marked:true,tags:{highway:'primary'},points:[[0,.72,0],[100,.72,0]]},
 {id:'service',source:'OpenStreetMap',width:1.6,marked:false,tags:{highway:'service'},points:[[30,.72,40],[100,.72,40]]},
 {id:'trunk',source:'OpenStreetMap',width:3.6,marked:true,highway:true,tags:{highway:'trunk'},points:[[140,.72,0],[220,.72,0]]}
];
const samples=[
 {id:'a-primary',surface:'asphalt',width:4.5,points:[[15,.76,0],[15,.72,28]]},
 {id:'b-service',surface:'asphalt',width:3.6,points:[[72,.72,40],[72,.72,80]]},
 {id:'c-highway',surface:'asphalt',width:4,points:[[168,.72,0],[168,.72,42]]}
].map(r=>({...r,profile:deriveEditedRoadStyle(r,sources)}));
const matched=buildEditedRoadMeshes(samples,{terrainHeightAt:()=>-3});
assert.equal(matched.stats.sourceClasses.asphalt,2);
assert.equal(matched.stats.sourceClasses.highway,1);
assert.equal(matched.stats.sourceClasses.ground,0);
assert(matched.stats.markedRoads>=2);
assert(matched.geometries.paintYellow.attributes.position.count>0,'Primary and highway must carry double-yellow paint');
assert(matched.geometries.paintWhite.attributes.position.count>0,'Marked roads require white edge stripes');
const primaryMatched=matched.paths.find(p=>p.id==='a-primary');
assert(Math.abs(primaryMatched.width-3.6)<.01);
assert(Math.abs(primaryMatched.widths[0]-3.6)<.01);
assert(Math.abs(primaryMatched.points[0][1]-.72)<.001,'Road surface must meet old height precisely at the join');
assert.equal(matched.paths.find(p=>p.id==='c-highway').style,'highway');
console.log('ROAD_EDITOR_MESH_PASS',JSON.stringify({segments:stats.segments,overlapCuts:stats.overlaps,ownerOverlapCuts:ownerMesh.stats.overlaps,ownerSamples:roadSamples,
 topTriangles:geometries.asphalt.attributes.position.count/3}));
