import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {stitchEditedRoads,sampleEditedRoad,buildEditedRoadMeshes} from '../src/road-editor-mesh.js';
import {deriveEditedRoadStyle} from '../src/road-editor-style.js';
import {projectOsm,MUSEUM_DISPLAY_OFFSETS} from '../src/osm-geography.js';
import {SATURN_ACCESS,SATURN_TERRAIN_BOUNDS,saturnTerrainMeshHeight} from '../src/saturn-access.js';

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
assert(ownerMesh.stats.endCaps>0,'At least one owner access terminus should have a clean rounded cap');
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
for(let i=0;i<verts.count;i++)assert(verts.getY(i)>=hillside(verts.getX(i))+.007,
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

// Fine-grained physical coverage at the real owner-authored T junctions.
// The earlier smoke tests checked 337 road centres but missed side cracks.
const rayOn=(mesh,x,z)=>{
 const caster=new THREE.Raycaster(new THREE.Vector3(x,150,z),new THREE.Vector3(0,-1,0),0,250);
 return caster.intersectObject(mesh,false).length>0;
};
const fine={junctions:0,checks:0};
for(const [shortId,hostId]of [['road-3','road-4'],['road-24','road-14'],['road-29','road-28']]){
 const branch=ownerMesh.paths.find(p=>p.id===shortId),host=ownerMesh.paths.find(p=>p.id===hostId);
 if(!branch||!host)continue;
 const distanceTo=(p,points)=>{
  let best=Infinity;
  for(let k=1;k<points.length;k++){
   const a=points[k-1],b=points[k],dx=b[0]-a[0],dz=b[2]-a[2],den=dx*dx+dz*dz;
   const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/(den||1)));
   best=Math.min(best,Math.hypot(p[0]-a[0]-dx*t,p[2]-a[2]-dz*t));
  }
  return best;
 };
 const anchors=[branch.points[0],branch.points.at(-1)].sort((a,b)=>distanceTo(a,host.points)-distanceTo(b,host.points));
 const center=anchors[0];
 if(distanceTo(center,host.points)>3.0)continue;
 fine.junctions++;
 for(let dx=-1.15;dx<=1.16;dx+=.38)for(let dz=-1.15;dz<=1.16;dz+=.38){
  const x=center[0]+dx,z=center[2]+dz;
  const near=Math.min(distanceTo([x,center[1],z],branch.points),distanceTo([x,center[1],z],host.points));
  if(near>Math.min(branch.width,host.width)*.38)continue;
  assert(rayOn(surfaces.asphalt,x,z),shortId+'/'+hostId+' has a road hole at '+x.toFixed(2)+','+z.toFixed(2));
  fine.checks++;
 }
}
assert(fine.junctions>=2,'No owner T junctions were checked at road-pixel scale');
assert(fine.checks>=20,'Insufficient test pixels around edited road joints');
assert(ownerMesh.stats.seamWelds>0,'Road fragments must share welded GPU vertices');
assert(ownerMesh.stats.joins>=1,'Road junctions should receive unified fillet aprons');
// Regression: owner road-31 is a FOUR-point steep approach to the north-west
// Saturn gate. Sampling only its stored Y coordinates hides large portions
// inside the world-registered hill, even though the satellite soil is correct.
const osmMatches=JSON.parse(readFileSync(new URL('../data/osm/catalog-matches.json',import.meta.url),'utf8'));
const saturnMatch=osmMatches.matches.find(m=>m.siteId==='pad-23');
assert(saturnMatch?.representativeLonLat,'Saturn needs its registered OSM position');
const [mapX,mapZ]=projectOsm(...saturnMatch.representativeLonLat);
const [offsetX,offsetZ]=MUSEUM_DISPLAY_OFFSETS['pad-23'];
const saturnWorldX=(mapX+offsetX-650)*3.4,saturnWorldZ=(mapZ+offsetZ-522.5)*3.4;
function saturnRoadTerrainAt(x,z){
 const localX=(x-saturnWorldX)/SATURN_ACCESS.scale,localZ=(z-saturnWorldZ)/SATURN_ACCESS.scale;
 const b=SATURN_TERRAIN_BOUNDS;
 if(localX<b.minX||localX>b.maxX||localZ<b.minZ||localZ>b.maxZ)return -2.755;
 return Math.max(-2.755,SATURN_ACCESS.elevation+SATURN_ACCESS.scale*saturnTerrainMeshHeight(localX,localZ));
}
const road31=owner.added.find(r=>r.id==='road-31');
assert(road31,'Missing approved road-31 approach');
const originalRamp=sampleEditedRoad(road31);
const beforeClearance=Math.max(...originalRamp.map(p=>saturnRoadTerrainAt(p[0],p[2])-p[1]));
assert(beforeClearance>.12,'Regression fixture no longer crosses the Saturn hill');
const gradeFixture={...road31,profile:{startY:road31.points[0][1],endY:road31.points.at(-1)[1]-.7}};
const correctedRamp=sampleEditedRoad(gradeFixture,{terrainHeightAt:saturnRoadTerrainAt});
assert.equal(correctedRamp.length,originalRamp.length);
let minimumClearance=Infinity;
for(let i=0;i<correctedRamp.length;i++){
 const p=correctedRamp[i],original=originalRamp[i];
 assert.equal(p[0],original[0]);assert.equal(p[2],original[2]);
 const clearance=p[1]-saturnRoadTerrainAt(p[0],p[2]);
 minimumClearance=Math.min(minimumClearance,clearance);
 assert(clearance>=.034999,'Saturn road-31 still penetrates hill at sample '+i);
}
const indexHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert(indexHtml.includes('terrainHeightAt:(x,z)=>museumTerrainHeightAt(x,z),defaultEdits:ownerRoadEdits'),
 'Published road editor must receive the actual raised terrain, not the flat DEM');

console.log('ROAD_EDITOR_MESH_PASS',JSON.stringify({segments:stats.segments,overlapCuts:stats.overlaps,ownerOverlapCuts:ownerMesh.stats.overlaps,ownerSamples:roadSamples,junctionChecks:fine.checks,junctions:fine.junctions,welds:ownerMesh.stats.seamWelds,
 topTriangles:geometries.asphalt.attributes.position.count/3}));
