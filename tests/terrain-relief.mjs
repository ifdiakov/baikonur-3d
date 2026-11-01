import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {buildTerrainRelief,createTerrainReliefField} from '../src/terrain-relief.js';
import {createVerticalGroundQuery} from '../src/vertical-ground-query.js';

const baseY=-2.755,near=(a,b,tolerance,message)=>assert(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const bounds={minX:-800,maxX:800,minZ:-640,maxZ:640},width=41,height=33;
// A non-square, independently constructed elevation grid catches swapped axes,
// inverted north/south rows and a mistaken conversion of decimetres to metres.
const values=Array.from({length:width*height},(_,i)=>{
 const col=i%width,row=Math.floor(i/width);
 return 800+4*col+2*row+Math.round(70*Math.exp(-((col-24)**2+(row-13)**2)/75));
});
const dem={width,height,bounds,metresPerUnit:.1,offsetMetres:0,values,source:'synthetic asymmetric DEM fixture'};
const protection={
 circles:[{x:13.17,z:27.83,radius:43}],
 rectangles:[{minX:-545,maxX:-355,minZ:-215,maxZ:-135}],
 corridors:[{points:[{x:-730.3,z:357.7},{x:-130.7,z:182.3},{x:470.9,z:407.1}],width:2.2}],
 polygons:[[{x:181.3,z:-305.7},{x:322.7,z:-331.3},{x:365.9,z:-217.1},{x:218.1,z:-171.9}]],
};
const options={dem,protection,step:16,baseY,verticalExaggeration:2.5,baseElevationMetres:68,transitionWidth:120,edgeFadeWidth:96};
const map=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map,side:THREE.FrontSide});
const originalCompile=()=>{},originalCache=()=>'shared-steppe-fixture';
material.onBeforeCompile=originalCompile;material.customProgramCacheKey=originalCache;
const relief=buildTerrainRelief({...options,material}),mesh=relief.mesh;
mesh.updateMatrixWorld(true);
assert.strictEqual(mesh.material,material,'The relief retains the material carrying the shared ground masks');
assert.strictEqual(mesh.material.map,map);
assert.strictEqual(mesh.material.onBeforeCompile,originalCompile,'Portal/soil shader composition survives mesh construction');
assert.strictEqual(mesh.material.customProgramCacheKey,originalCache);

function inspectGeometry(terrain,label){
 const g=terrain.mesh.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),index=g.index,s=terrain.stats();
 assert(p&&n&&index,`${label}: relief has positions, normals and indexed triangles`);
 assert(index.count>0&&index.count%3===0);
 assert(index.count/3<=350000,`${label}: the regional relief stays within its 350,000-triangle budget`);
 assert.equal(s.vertices,p.count);assert.equal(s.triangles,index.count/3);
 for(const [name,attribute]of Object.entries(g.attributes)){
  assert.equal(attribute.count,p.count,`${label}: attribute ${name} covers every vertex`);
  assert(attribute.array.every(Number.isFinite),`${label}: finite ${name} values`);
 }
 let minHeight=Infinity,maxHeight=-Infinity,minNormalY=1,maxNormalError=0,maxSlope=0;
 for(let i=0;i<p.count;i++){
  const y=p.getY(i);minHeight=Math.min(minHeight,y);maxHeight=Math.max(maxHeight,y);
  assert(y>=baseY-1e-6,`${label}: the overlay never excavates through the underlying ground`);
  minNormalY=Math.min(minNormalY,n.getY(i));
  maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));
 }
 assert(maxHeight-baseY>1,`${label}: the geometry contains visible elevation, not only a flat material`);
 assert(maxHeight-baseY<80,`${label}: geographic heights remain at the museum's scale`);
 assert(minNormalY>0,`${label}: every vertex normal faces above the horizon`);
 assert(maxNormalError<1e-5,`${label}: normals stay normalized, including omitted flat cells`);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3();
 for(let i=0;i<index.count;i+=3){
  for(let j=0;j<3;j++)assert(index.getX(i+j)>=0&&index.getX(i+j)<p.count,`${label}: valid triangle index`);
  a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
  cross.crossVectors(b.sub(a),c.sub(a));
  assert(cross.y>0,`${label}: no degenerate or inverted terrain triangles`);
  maxSlope=Math.max(maxSlope,Math.hypot(cross.x,cross.z)/cross.y);
 }
 assert(maxSlope<.65,`${label}: engineering transitions and steppe slopes do not form cliffs (${maxSlope})`);
 near(maxSlope,s.maxSlope,1e-7,`${label}: the reported slope is the actual triangle gradient`);
 return {vertices:p.count,triangles:index.count/3,minHeight,maxHeight,minNormalY,maxNormalError,maxSlope};
}
const syntheticGeometry=inspectGeometry(relief,'Synthetic terrain');
const repeat=createTerrainReliefField(options);
assert.deepEqual(repeat.positions,mesh.geometry.attributes.position.array,'Terrain construction is deterministic');
assert.deepEqual(repeat.indices,mesh.geometry.index.array);
for(const [col,row]of [[3,7],[29,4],[12,26],[35,21]]){
 const x=bounds.minX+col*40,z=bounds.minZ+row*40;
 near(relief.sample(x,z).elevationMetres,values[row*width+col]*.1,1e-10,'DEM samples retain row-major geographic orientation');
}

// All-zero triangles are intentionally absent from the overlay. Include the
// existing flat ground to test the actual visible surface beneath engineering
// areas, not just an analytic helper which could hide interpolated road bumps.
function makeFloor(box){
 const g=new THREE.PlaneGeometry(box.maxX-box.minX+200,box.maxZ-box.minZ+200);
 g.rotateX(-Math.PI/2);
 const floor=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.FrontSide}));
 floor.position.set((box.minX+box.maxX)/2,baseY,(box.minZ+box.maxZ)/2);floor.updateMatrixWorld(true);
 return floor;
}
const floor=makeFloor(bounds),ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
let rayChecks=0,flatChecks=0,maxRayError=0,maxFlatError=0;
function checkRay(terrain,flat,x,z,{flatExpected=false,tolerance=2e-6}={}){
 ray.ray.origin.set(x,1000,z);
 const hit=ray.intersectObjects([terrain.mesh,flat],false)[0];assert(hit,'A downward ray has physical ground beneath it');
 const expected=terrain.heightAt(x,z),error=Math.abs(hit.point.y-expected);
 maxRayError=Math.max(maxRayError,error);rayChecks++;
 assert(error<=tolerance,`heightAt follows the actual triangle at ${x}, ${z}: error ${error}`);
 near(terrain.sample(x,z).height,expected,1e-10,'The public sample and camera query use the same surface');
 if(flatExpected){
  const flatError=Math.abs(hit.point.y-baseY);maxFlatError=Math.max(maxFlatError,flatError);flatChecks++;
  assert(flatError<1e-6,`Protected infrastructure must stay physically level at ${x}, ${z}: error ${flatError}`);
  near(expected,baseY,1e-6,'The navigation surface remains flat under protected infrastructure');
 }
 return hit;
}
const circle=protection.circles[0];
for(const radius of [0,circle.radius*.5,circle.radius])for(let i=0;i<24;i++){
 const a=i*Math.PI/12;checkRay(relief,floor,circle.x+Math.cos(a)*radius,circle.z+Math.sin(a)*radius,{flatExpected:true});
}
const rect=protection.rectangles[0];
for(let u=0;u<=10;u++)for(let v=0;v<=4;v++)
 checkRay(relief,floor,rect.minX+(rect.maxX-rect.minX)*u/10,rect.minZ+(rect.maxZ-rect.minZ)*v/4,{flatExpected:true});
const road=protection.corridors[0];
for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
 for(let t=0;t<=25;t++)for(const edge of [-.5,0,.5]){
  const offset=edge*road.width;
  checkRay(relief,floor,a.x+dx*t/25-dz/length*offset,a.z+dz*t/25+dx/length*offset,{flatExpected:true});
 }
}
const polygon=protection.polygons[0],centre=polygon.reduce((p,v)=>({x:p.x+v.x/polygon.length,z:p.z+v.z/polygon.length}),{x:0,z:0});
checkRay(relief,floor,centre.x,centre.z,{flatExpected:true});
for(let i=0;i<polygon.length;i++){
 const a=polygon[i],b=polygon[(i+1)%polygon.length];
 for(let t=0;t<=12;t++){
  const x=a.x+(b.x-a.x)*t/12,z=a.z+(b.z-a.z)*t/12;
  checkRay(relief,floor,x,z,{flatExpected:true});
  checkRay(relief,floor,(x+centre.x)/2,(z+centre.z)/2,{flatExpected:true});
 }
}
// Fractional probes cross both diagonals of cells and the curved protective
// transitions. A bilinear approximation does not satisfy these ray checks.
for(let i=0;i<180;i++){
 const x=bounds.minX+((i*373.231+89.713)%1600),z=bounds.minZ+((i*197.171+43.193)%1280);
 checkRay(relief,floor,x,z);
}
assert(flatChecks>350,'Protection is measured across surfaces and their boundaries');
assert.equal(relief.stats().flatChecks.violations,0);
assert(relief.stats().flatChecks.protectedVertices>0);
assert(relief.stats().flatChecks.gridMarginSafe);

let edgeChecks=0,maxEdgeRise=0,maxEdgeSlope=0,maxJoinJump=0;
const delta=1e-4;
for(let t=0;t<=20;t++){
 const x=bounds.minX+(bounds.maxX-bounds.minX)*t/20,z=bounds.minZ+(bounds.maxZ-bounds.minZ)*t/20;
 for(const [ex,ez,dx,dz]of [[bounds.minX,z,1,0],[bounds.maxX,z,-1,0],[x,bounds.minZ,0,1],[x,bounds.maxZ,0,-1]]){
  near(relief.heightAt(ex,ez),baseY,1e-6,'The outer edge joins the existing ground');
  near(relief.heightAt(ex-dx,ez-dz),baseY,1e-9,'No relief escapes the DEM footprint');
  const inner=relief.heightAt(ex+dx*.01,ez+dz*.01),rise=Math.abs(inner-baseY);
  maxEdgeRise=Math.max(maxEdgeRise,rise);maxEdgeSlope=Math.max(maxEdgeSlope,rise/.01);edgeChecks++;
 }
}
assert(maxEdgeRise<.001,'The mesh edge has no visible vertical step');
assert(maxEdgeSlope<.05,'The outermost triangle gently meets the base plane');
for(let i=1;i<repeat.xAxis.length-1;i+=3){
 const x=repeat.xAxis[i],z=-527.193+((i*113.761)%1024);
 maxJoinJump=Math.max(maxJoinJump,Math.abs(relief.heightAt(x-delta,z)-relief.heightAt(x+delta,z)));
}
for(let i=1;i<repeat.zAxis.length-1;i+=3){
 const z=repeat.zAxis[i],x=-693.127+((i*137.913)%1378);
 maxJoinJump=Math.max(maxJoinJump,Math.abs(relief.heightAt(x,z-delta)-relief.heightAt(x,z+delta)));
}
assert(maxJoinJump<2*delta*syntheticGeometry.maxSlope+1e-6,'Adjacent cells share continuous heights without cracks');

// Lighting must query the finished relief triangles, with no stale geometry
// fallback and with exactly the same contact point as THREE's native raycast.
const ground=[mesh,floor],query=createVerticalGroundQuery(ground,{cellSize:32,minimumTriangles:1});
let queryChecks=0;
for(let i=0;i<48;i++){
 ray.ray.origin.set(-730.719+(i*97.223)%1450,1000,-572.713+(i*183.117)%1144);
 const expected=ray.intersectObjects(ground,false),actual=query.intersections(ray);
 assert.equal(actual.length,expected.length,'The lighting index retains every terrain hit');
 for(let j=0;j<expected.length;j++){
  near(actual[j].point.distanceTo(expected[j].point),0,1e-9,'Accelerated lighting uses the rendered terrain triangle');
  assert.strictEqual(actual[j].object,expected[j].object);
 }
 queryChecks++;
}
assert.equal(query.stats().staleFallbacks,0,'The indexed terrain remains static after construction');

const actualDem=JSON.parse(readFileSync(new URL('../data/terrain/baikonur-dem.json',import.meta.url),'utf8'));
assert.equal(actualDem.values.length,actualDem.width*actualDem.height);
assert(actualDem.values.every(Number.isFinite),'The saved elevation asset contains no missing samples');
assert(actualDem.source,'The saved elevation grid retains its provenance');
const actual=buildTerrainRelief({dem:actualDem,material:new THREE.MeshBasicMaterial(),step:16,baseY,
 verticalExaggeration:2.5,baseElevationMetres:68,transitionWidth:120,edgeFadeWidth:240});
actual.mesh.updateMatrixWorld(true);
const actualGeometry=inspectGeometry(actual,'Baikonur DEM'),actualStats=actual.stats(),actualFloor=makeFloor(actualDem.bounds);
assert(actualStats.nonZeroVertices>actualStats.vertices*.15,'The elevation asset supplies useful relief across a substantial part of the map');
assert(actualStats.triangles>10000,'The regional surface has enough geometric resolution for oblique views');
for(let i=0;i<36;i++){
 const u=((i*617+193)%1000)/1000,v=((i*331+71)%1000)/1000,b=actualDem.bounds;
 checkRay(actual,actualFloor,b.minX+(b.maxX-b.minX)*u,b.minZ+(b.maxZ-b.minZ)*v);
}
for(const b of [actualDem.bounds])for(const [x,z]of [[b.minX,b.minZ],[b.maxX,b.minZ],[b.minX,b.maxZ],[b.maxX,b.maxZ],
 [b.minX,(b.minZ+b.maxZ)/2],[b.maxX,(b.minZ+b.maxZ)/2],[(b.minX+b.maxX)/2,b.minZ],[(b.minX+b.maxX)/2,b.maxZ]])
 near(actual.heightAt(x,z),baseY,1e-6,'The real DEM also meets the surrounding flat ground');

console.log('TERRAIN_RELIEF_PASS',JSON.stringify({synthetic:syntheticGeometry,actual:actualGeometry,
 rayChecks,flatChecks,maxRayError,maxFlatError,edgeChecks,maxEdgeRise,maxEdgeSlope,maxJoinJump,queryChecks,
 protection:relief.stats().protection,actualSource:typeof actualStats.source==='object'?
  {name:actualStats.source.name,zoom:actualStats.source.zoom,tiles:actualStats.source.tiles?.length}:actualStats.source}));
