import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createEnergiaGroundOcclusion} from '../src/energia-ground-occlusion.js';

const manifest=JSON.parse(await readFile(new URL('../assets/models/ukss/manifest-v2.json',import.meta.url),'utf8'));
const site=new THREE.Group();
site.userData.ukssModel=manifest;
site.position.set(215,-2.755,-117);
site.rotation.y=-.56;site.scale.setScalar(.14);
const mesh=createEnergiaGroundOcclusion({siteRoot:site});site.add(mesh);
site.updateWorldMatrix(true,true);
assert.deepEqual(mesh.userData.energiaGroundOcclusion.contour,manifest.terrainCutout.polygon,
 'The depth collar must use the same imported opening as the visible terrain');
assert.equal(mesh.material.colorWrite,false,'The fix must not add a visible patch over the soil');
assert.equal(mesh.material.depthWrite,true);
assert.equal(mesh.material.depthTest,true);
assert.equal(mesh.material.isMeshBasicMaterial,true,'Built-in material inherits logarithmic depth');
assert.equal(mesh.material.transparent,true,'Depth must be inserted after transparent soil colour');
assert.ok(mesh.renderOrder>5&&mesh.renderOrder<28,'Write grade depth between soil and effects');
assert.ok(mesh.userData.energiaGroundOcclusion.triangles<40,'The local collar has a tiny fixed geometry budget');

const ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);
const hitsAt=(x,z)=>{
 const above=site.localToWorld(new THREE.Vector3(x,20,z));
 ray.set(above,up.clone().negate());
 return ray.intersectObject(mesh,false);
};
function inside(x,z){
 const ring=manifest.terrainCutout.polygon;let result=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
 }
 return result;
}
const b=mesh.userData.energiaGroundOcclusion.bounds;
let open=0,blocked=0;
// Sample the actual triangulated ring, including both banks, the narrow outlet
// and apron. This catches accidentally filled holes and bad X/Z rotations.
for(let x=b.minX+2.13;x<b.maxX;x+=13.7)for(let z=b.minZ+1.39;z<b.maxZ;z+=11.3){
 const hits=hitsAt(x,z);
 if(inside(x,z)){assert.equal(hits.length,0,`Gas channel closed at ${x},${z}`);open++;}
 else{
  assert.ok(hits.length>0,`Soil fails to block below-grade flame at ${x},${z}`);
  assert.ok(Math.abs(hits[0].point.y-(-2.755-.01*.14))<1e-7,'Depth is at visible grade, not the deep background');
  blocked++;
 }
}
assert.ok(open>80&&blocked>500,'Samples exercise both the opening and surrounding grade');
for(const[x,z]of [[0,0],[150,0],[325,0]])assert.equal(hitsAt(x,z).length,0,'Visible trench flame remains possible');
for(const[x,z]of [[0,96],[0,-100],[195,36],[195,-35],[333,0]])assert.ok(hitsAt(x,z).length>0,'Both banks and the outlet edge occlude exhaust');

const sightline=(eye,target)=>{
 const worldEye=site.localToWorld(new THREE.Vector3(...eye));
 const worldTarget=site.localToWorld(new THREE.Vector3(...target));
 const direction=worldTarget.clone().sub(worldEye);
 ray.set(worldEye,direction.clone().normalize());ray.far=direction.length();
 return ray.intersectObject(mesh,false);
};
for(const eye of [[-250,80,0],[0,80,300],[0,80,-300]]){
 assert.ok(sightline(eye,[0,-40,0]).length>0,
  'Oblique below-ground exhaust is hidden behind the near bank');
}
assert.equal(sightline([400,200,0],[0,-20,0]).length,0,
 'The depth collar must not close a view through the actual gas opening');

const fallbackSite=new THREE.Group(),fallback=createEnergiaGroundOcclusion({siteRoot:fallbackSite});
assert.equal(fallback.userData.energiaGroundOcclusion.contourSource,'procedural-fallback');
assert.ok(fallback.geometry.index.count>0);
mesh.geometry.dispose();mesh.material.dispose();fallback.geometry.dispose();fallback.material.dispose();
console.log('ENERGIA_GROUND_OCCLUSION_PASS '+JSON.stringify({open,blocked,triangles:mesh.userData.energiaGroundOcclusion.triangles}));
