import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {buildProtonPosition,protonPositionController} from '../src/proton-launch.js';
import {MODEL_CATALOG,modelsForObject} from '../src/model-catalog.js';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const manifest=JSON.parse(await readFile('assets/models/proton/manifest.json')),models={};let total=0;
for(const part of ['rocket','gantry','pad']){
 const meta=manifest.assets[part],bytes=await readFile('assets/models/proton/'+meta.path);total+=bytes.length;
 assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);assert.equal(bytes.length,meta.bytes);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert(json.buffers.every(b=>!b.uri));assert(json.images.every(i=>!i.uri));assert(!json.cameras?.length);assert(!json.animations?.length);
 const d=await io.readBinary(bytes),group=new THREE.Group();let triangles=0;
 for(const n of d.getRoot().listNodes())for(const p of n.getMesh()?.listPrimitives()||[]){
  const pos=p.getAttribute('POSITION');assert([...pos.getArray()].every(Number.isFinite));triangles+=p.getIndices().getCount()/3;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos.getArray(),3,pos.getNormalized()));g.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(),1));const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.applyMatrix4(new THREE.Matrix4().fromArray(n.getWorldMatrix()));group.add(mesh);
 }
 assert.equal(triangles,meta.triangles);assert(triangles<meta.sourceTriangles*.5);assert(meta.primitives<=10);
 group.rotation.y=Math.PI;group.updateMatrixWorld(true);models[part]=group;
 if(part==='rocket'){
  assert.deepEqual(d.getRoot().listNodes().filter(n=>n.getExtras().inspectionStage!==undefined).map(n=>n.getExtras().inspectionStage).sort(),[0,1,2]);
  const decal=d.getRoot().listTextures().find(t=>t.getName()==='proton_decal');assert(decal);assert.deepEqual(decal.getSize(),[1024,2048]);
  const main=d.getRoot().listMaterials().find(m=>m.getName()==='rocket main_rocket');assert.equal(main.getBaseColorTexture(),decal,'Lettering uses the original texture, not a low-resolution atlas');
  const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3());assert(Math.abs(size.y-58.2)<.01);assert(size.x>7&&size.x<8);assert(Math.abs(box.min.y)<.01);
 }
}
assert(total<3500000);assert.equal(MODEL_CATALOG.proton.assetRevision,manifest.version);
for(const id of ['pad-81','pad-200'])assert.deepEqual(modelsForObject({id}),['proton-pad','proton']);
// The concrete apron sits above grade; both actual gas outlets remain below it.
const pad=models.pad;pad.position.y=1.2;pad.updateMatrixWorld(true);
const ray=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0)).intersectObject(pad,true)[0];
for(const x of [-50,50])assert(ray(x,30).point.y>0&&ray(x,30).point.y<.2);
for(const x of [-20,20])assert(ray(x,0).point.y<-3,'Both source flame ducts remain recessed');
// Preserve visibility choices across an in-flight load and restore the far LOD.
const parent=new THREE.Group(),root=new THREE.Group();parent.add(root);let loads=0,release;const gate=new Promise(r=>release=r),events=[];
parent.addEventListener('museum-exhibit-loaded',e=>events.push(e));
buildProtonPosition(root,{sourceLoader:async part=>{loads++;await gate;const copy=models[part].clone(true);copy.name='source-'+part;return copy;}});const c=protonPositionController(root),camera=new THREE.PerspectiveCamera();
camera.position.set(10000,0,0);c.update(1,camera);assert.equal(loads,0);
camera.position.set(30,20,30);c.update(2,camera);assert.equal(loads,3);assert.equal(c.source().status,'loading');c.setRocketVisible(false);release();assert(await c.loadSource());assert.equal(c.rocketVisible(),false);assert.equal(c.rocket.visible,false);assert.equal(root.getObjectByName('source-rocket').visible,false);
assert.equal(c.source().detail,true);assert.equal(events.length,1);assert(events[0].removed.length&&events[0].added.length);
camera.position.set(10000,0,0);c.update(100,camera);assert.equal(c.source().detail,false);assert.equal(c.rocket.visible,false);c.setRocketVisible(true);assert.equal(c.rocket.visible,true);
camera.position.set(20,20,20);c.update(200,camera);assert.equal(c.source().detail,true);assert.equal(c.rocket.visible,false);assert.equal(loads,3,'Switching LOD does not reload assets');
const failed=new THREE.Group();let fail=true;buildProtonPosition(failed,{sourceLoader:async part=>{if(fail)throw Error('offline');return models[part].clone(true);}});const retry=protonPositionController(failed);assert.equal(await retry.loadSource(),false);assert.equal(retry.source().status,'error');assert(retry.rocket.visible);fail=false;assert(await retry.loadSource());assert.equal(retry.source().status,'ready');
console.log('PROTON_SOURCE_OK',JSON.stringify({bytes:total,assets:3,sourceDecal:true,openDucts:2,lazyLoad:true,asyncVisibility:true,retry:true,lod:true}));
