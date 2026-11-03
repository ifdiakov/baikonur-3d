import assert from 'node:assert/strict';
import * as THREE from 'three';
import {repairRoadTriangleMesh,ROAD_JUNCTION_REPAIR_VERSION} from '../src/road-junction-repair.js';

const area=(a,b,c)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
function geom(triangles){
 const verts=[];
 for(let t of triangles){
  if(area(...t)>0)t=[t[0],t[2],t[1]];
  for(const p of t)verts.push(...p);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));return g;
}
function annulus(inner){
 const o=[[-2,0,-2],[2,0,-2],[2,0,2],[-2,0,2]],
  i=[[-inner,0,-inner],[inner,0,-inner],[inner,0,inner],[-inner,0,inner]];
 const triangles=[];
 for(let j=0;j<4;j++){
  const n=(j+1)%4,a=o[j],b=o[n],c=i[n],d=i[j];
  triangles.push([a,b,d],[b,c,d]);
 }
 return geom(triangles);
}
function hasSurface(g,x,z){
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 const ray=new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0),0,30);
 return ray.intersectObject(mesh,false).length>0;
}
const tiny=repairRoadTriangleMesh(annulus(.35));
assert.equal(tiny.stats.holesSealed,1,'A small internal junction void must be filled exactly once');
assert(hasSurface(tiny.geometry,0,0),'Road junction must cover its missing centre');
assert(tiny.stats.welded>0,'Adjacent road ribbons must share identical GPU vertices');

const large=repairRoadTriangleMesh(annulus(1.1));
assert.equal(large.stats.holesSealed,0,'A large intentional opening cannot be sealed');
assert(!hasSurface(large.geometry,0,0),'Protect intentionally absent pavement');

const original=geom([
 [[0,0,0],[4,0,0],[4,0,2]],
 [[0,0,0],[4,0,2],[0,0,2]],
 [[2,.065,0],[4,0,0],[2,.065,-2]]
]);
const welded=repairRoadTriangleMesh(original);
assert(welded.stats.gradeAligned>=1,'Tiny graded T-vertex mismatches must weld to the existing road edge');
for(const g of [tiny.geometry,large.geometry,welded.geometry]){
 const p=g.getAttribute('position');
 for(let j=0;j<p.count;j+=3){
  const a=[p.getX(j),p.getY(j),p.getZ(j)],
   b=[p.getX(j+1),p.getY(j+1),p.getZ(j+1)],
   c=[p.getX(j+2),p.getY(j+2),p.getZ(j+2)];
  assert(area(a,b,c)<-1e-8,'Road surface is inverted or has zero-area faces');
 }
}
console.log('ROAD_JUNCTION_REPAIR_PASS',JSON.stringify({version:ROAD_JUNCTION_REPAIR_VERSION,
 closedGaps:tiny.stats.holesSealed,sharedNodes:tiny.stats.welded,Tseams:welded.stats.gradeAligned}));
