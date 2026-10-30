import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildHighwaySigns,ROAD_SIGN_VERSION} from '../src/road-signs.js';

const data=JSON.parse(await readFile('data/road-signs.json','utf8'));
const point=(x,z)=>new THREE.Vector3((x-650)*3.4,0,(z-522.5)*3.4);
const parent=new THREE.Group(),textures=[];
// Opposite source-way directions must not invert the geographical arrows.
const roads=['west','east'].map(direction=>{
 const s=data[direction],points=[point(s.x-80,s.y-18),point(s.x,s.y),point(s.x+80,s.y+18)];
 return {id:'r-south-'+direction,points:direction==='west'?points.reverse():points};
});
const signs=buildHighwaySigns({data,point,parent,roads,textureFactory:(spec,arrowSign)=>{
 const texture=new THREE.Texture();texture.userData={id:spec.id,arrowSign};textures.push(texture);return texture;
}});
parent.updateMatrixWorld(true);
assert.equal(textures.length,4);assert.equal(new Set(textures).size,4,'Each face needs an independent readable texture');
const report=signs.stats();assert.equal(report.version,ROAD_SIGN_VERSION);
assert.equal(report.signCount,2);assert.equal(report.faceCount,4);assert.equal(report.floodlightCount,8);
assert.equal(report.floodlightsPerFace,2);
assert.deepEqual(report.cities.map(c=>c.name),['АКТОБЕ','САМАРА','КЫЗЫЛОРДА','АЛМАТЫ']);
const raycaster=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);
let visibleFaces=0,aimedLights=0;
for(const sign of signs.signs){
 const faces=[],heads=[];
 sign.traverse(object=>{
  if(object.userData.component==='road-sign-face')faces.push(object);
  if(object.userData.component==='sign-floodlight')heads.push(object);
  if(object.isMesh)for(const attr of Object.values(object.geometry.attributes))
   for(const value of attr.array)assert(Number.isFinite(value),'Non-finite roadside sign geometry');
 });
 assert.equal(faces.length,2);assert.equal(heads.length,4);
 const arrowDirections=[];
 for(const face of faces){
  assert.equal(face.material.side,THREE.FrontSide,'The back must be a separate readable face');
  const quaternion=face.getWorldQuaternion(new THREE.Quaternion());
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(quaternion);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(quaternion);
  assert(right.dot(new THREE.Vector3().crossVectors(up,normal).normalize())>.99999,'Text is mirrored from its viewing side');
  const center=face.getWorldPosition(new THREE.Vector3());
  raycaster.set(center.clone().addScaledVector(normal,20),normal.clone().negate());
  const hit=raycaster.intersectObject(sign,true)[0];
  assert.strictEqual(hit.object,face,'A plate or support blocks a readable face');
  assert(Math.abs(hit.distance-20)<1e-5);visibleFaces++;
  arrowDirections.push(right.clone().multiplyScalar(face.userData.arrowSign));
  assert.equal(face.material.map.userData.arrowSign,face.userData.arrowSign);
  assert.equal(heads.filter(h=>h.userData.face===face.userData.face).length,2);
 }
 assert(arrowDirections[0].dot(arrowDirections[1])>.99999,'Both sides must point toward the same destination');
 assert(arrowDirections[0].x*(sign.userData.direction==='west'?-1:1)>0,'The geographical arrow points the wrong way');
 for(const head of heads){
  assert.equal(head.userData.bracket,true);
  const face=faces.find(f=>f.userData.face===head.userData.face);
  const source=head.getWorldPosition(new THREE.Vector3());
  const direction=new THREE.Vector3(0,0,1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  const expected=sign.localToWorld(new THREE.Vector3(...head.userData.targetLocal));
  raycaster.set(source,direction);const hit=raycaster.intersectObject(face,false)[0];
  assert(hit,'A projector misses its own inscription face');
  assert(hit.point.distanceTo(expected)<1e-5,'A projector does not aim at the lettering');
  assert(hit.uv.x>.1&&hit.uv.x<.9&&hit.uv.y>.15&&hit.uv.y<.85,'A projector is aimed at the frame');
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(face.getWorldQuaternion(new THREE.Quaternion()));
  assert(direction.dot(normal)<-.2,'A projector shines away from its sign face');aimedLights++;
 }
}
signs.setEvening(false);assert.equal(signs.stats().evening,false);
signs.setEvening(true);assert.equal(signs.stats().evening,true);
console.log('ROAD_SIGNS_GEOMETRY_PASS',JSON.stringify({visibleFaces,aimedLights,signs:report.signCount,
 independentTextures:textures.length,oppositeSourceDirections:true}));
