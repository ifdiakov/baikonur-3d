import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {projectOsm} from '../src/osm-geography.js';
import {createNorthBankMask} from '../src/river-bank.js';
import {createRiverWaterModel,buildRiverSurface,RIVER_SURFACE_VERSION} from '../src/river-surface.js';

const read=name=>JSON.parse(readFileSync(new URL('../data/osm/'+name,import.meta.url),'utf8'));
const data=read('river-water.geojson'),original=JSON.stringify(data);
let sourceIslands=0;
for(const source of data.sourceEvidence){
 const raw=gunzipSync(readFileSync(new URL('../data/osm/'+source.archive,import.meta.url)));
 assert.equal(createHash('sha256').update(raw).digest('hex'),source.sha256,'Preserved primary source changed: '+source.archive);
 if(source.archive.endsWith('.json.gz')){
  for(const relation of JSON.parse(raw).elements.filter(e=>e.type==='relation'&&e.tags?.water==='river'))
   sourceIslands+=relation.members.filter(member=>member.role==='inner').length;
 }else sourceIslands+=(raw.toString().match(/<member\b[^>]*\brole="inner"[^>]*\/>/g)||[]).length;
}
assert.equal(sourceIslands,108,'Every island must originate in an archived inner member');
const world=coordinate=>{const p=projectOsm(coordinate);return [(p[0]-650)*3.4,(p[1]-522.5)*3.4];};
const model=createRiverWaterModel({data,project:world}),scene=new THREE.Group();
const surface=buildRiverSurface({model,parent:scene}),report=surface.stats();
scene.updateWorldMatrix(true,true);
assert.equal(model.version,RIVER_SURFACE_VERSION);
assert.equal(report.polygonCount,12);assert.equal(report.islandCount,108);
assert.equal(report.transparentWaterLayers,0);assert.equal(report.drawCalls,2);
assert.equal(surface.water.material.transparent,false,'Overlapping alpha must not darken the river bends');
assert.equal(surface.water.material.depthWrite,true);
assert.equal(surface.islands.material.transparent,false);
assert.ok(report.islandElevation>report.waterElevation,'Actual islands must emerge above the water');
assert.equal(JSON.stringify(data),original,'Rendering must not mutate geographic source coordinates');
assert.equal(model.isWater(NaN,0),false);assert.ok(Number.isNaN(model.landClearance(NaN,0)));

// Every rendered contour comes directly from a source polygon, including its
// holes. There is no schematic offset, arbitrary island or resampled spline.
let sourceIndex=0;
for(const feature of data.features)for(const polygon of feature.geometry.coordinates){
 const actual=model.polygons[sourceIndex++];assert.equal(actual.sourceId,feature.id);
 assert.deepEqual([actual.outer,...actual.holes],polygon.map(ring=>ring.map(world)));
 assert.equal(actual.holes.length,feature.properties.sourceIslandWayIds.length);
}
function area(ring){
 const [x,z]=ring[0];let twice=0;
 for(let i=1;i<ring.length;i++)twice+=(ring[i-1][0]-x)*(ring[i][1]-z)-(ring[i][0]-x)*(ring[i-1][1]-z);
 return Math.abs(twice)/2;
}
const expectedWaterArea=model.polygons.reduce((sum,p)=>sum+area(p.outer)-p.holes.reduce((n,h)=>n+area(h),0),0);
const expectedIslandArea=model.islands.reduce((sum,island)=>sum+area(island.ring),0);
assert.ok(expectedWaterArea>0&&expectedIslandArea>0);

const line=read('river.geojson').features.find(f=>f.geometry.type==='LineString').geometry.coordinates.map(world);
const north=createNorthBankMask(line),landBank=createNorthBankMask(line,{water:model});
assert.equal(landBank.version,'north-of-syr-darya-water-v2');
for(const ll of [[63.3209,45.6322],[63.2107,45.6219],[63.34,45.70],[63.32,46.0]]){
 const p=world(ll);assert.ok(landBank.contains(...p),'Existing city/airport/cosmodrome land remains allowed');
 assert.ok(model.landClearance(...p)>0);
}

let waterArea=0,islandArea=0,waterProbes=0,blockedNorthWater=0,boundarySlivers=0;
for(const [name,mesh,elevation] of [['water',surface.water,report.waterElevation],['islands',surface.islands,report.islandElevation]]){
 const geometry=mesh.geometry,p=geometry.attributes.position,normal=geometry.attributes.normal,index=geometry.index;
 assert.ok(p.count>100&&index.count>100);
 for(const attribute of Object.values(geometry.attributes))
  for(const value of attribute.array)assert.ok(Number.isFinite(value),'Non-finite river geometry');
 for(let i=0;i<p.count;i++){
  assert.ok(Math.abs(p.getY(i)-elevation)<1e-6,'Water/land polygon must be planar');
  assert.ok(Math.abs(normal.getY(i)-1)<1e-6,'River normals must face upward');
 }
 for(let i=0;i<index.count;i+=3){
  const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i));
  const b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1));
  const c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));
  const cross=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).y;
  assert.ok(cross>0,'A reversed/folded river triangle returned');
  if(name==='islands'){islandArea+=cross/2;continue;}
  waterArea+=cross/2;
  const centre=a.clone().add(b).add(c).multiplyScalar(1/3);
  if(!model.isWater(centre.x,centre.z)){
   // Float32 positions can put almost-collinear sub-pixel triangles a few
   // micrometres outside a double-precision boundary; never accept a wedge.
   assert.ok(model.distanceToShore(centre.x,centre.z)<.001,'Water triangles cover dry bank or island land');
   boundarySlivers++;continue;
  }
  if(waterProbes%73===0)assert.ok(model.landClearance(centre.x,centre.z)<0);waterProbes++;
  if(north.contains(centre.x,centre.z)){
   assert.ok(!landBank.contains(centre.x,centre.z),'North-bank lighting must still exclude actual water');
   blockedNorthWater++;
  }
 }
}
assert.ok(waterProbes>10000&&blockedNorthWater>100);
assert.ok(boundarySlivers<10,'Unexpected sliver growth along actual banks');
assert.ok(Math.abs(waterArea/expectedWaterArea-1)<2e-5,'Triangulation must preserve water area and island holes');
assert.ok(Math.abs(islandArea/expectedIslandArea-1)<2e-5,'Rendered island area must match the source holes');

// Probe an actual interior point of every source island. The largest
// triangulated face supplies a robust point even for deeply concave islands.
const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
let islandProbes=0,minIslandClearance=Infinity;
for(const island of model.islands){
 assert.ok(Number.isInteger(island.sourceWayId),'Every island needs its original OSM way ID');
 const contour=island.ring.slice(0,-1).map(p=>new THREE.Vector2(...p));
 const triangles=THREE.ShapeUtils.triangulateShape(contour,[]);let largest=-1,point;
 for(const triangle of triangles){
  const [a,b,c]=triangle.map(i=>contour[i]);
  const size=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
  if(size>largest){largest=size;point=[(a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3];}
 }
 assert.ok(point&&largest>0,'Invalid source island');
 assert.equal(model.isWater(...point),false,'A source island was filled with water');
 const clearance=model.landClearance(...point);assert.ok(clearance>0);minIslandClearance=Math.min(minIslandClearance,clearance);
 ray.ray.origin.set(point[0],100,point[1]);
 assert.equal(ray.intersectObject(surface.water,false).length,0,'The actual water mesh spans an island hole');
 const hit=ray.intersectObject(surface.islands,false)[0];assert.ok(hit,'The actual island mesh is missing');
 assert.ok(Math.abs(hit.point.y-report.islandElevation)<1e-6);islandProbes++;
}
assert.equal(islandProbes,108);

console.log('RIVER_SURFACE_PASS',JSON.stringify({version:report.version,polygons:report.polygonCount,
 islands:islandProbes,waterTriangles:report.waterTriangles,islandTriangles:report.islandTriangles,
 waterArea,expectedWaterArea,islandArea,expectedIslandArea,waterProbes,blockedNorthWater,boundarySlivers,
 minIslandClearance,drawCalls:report.drawCalls,preservedPrimaryArchives:data.sourceEvidence.length}));
