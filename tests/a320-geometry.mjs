import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import * as THREE from 'three';
import {A320_PROFILE,a320Support} from '../src/a320-profile.js';
const manifest=JSON.parse(await readFile('assets/models/a320-alrosa/manifest-v1.json','utf8')),bytes=await readFile('assets/models/a320-alrosa/model-v1.glb'),source=await readFile('scripts/source-models/a320/source.glb');
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(bytes),manifest.sha256);assert.equal(hash(source),manifest.source.sha256);assert.equal(bytes.length,manifest.profile.assetBytes);assert(bytes.length<source.length*.3);
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),doc=await io.readBinary(bytes),original=await io.readBinary(source),root=doc.getRoot();
const count=d=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
assert.equal(count(doc),count(original));assert.equal(count(doc),8554);assert.match(root.getAsset().copyright,/Dave Love.*CC BY 4.0/);
const bounds=getBounds(root.listScenes()[0]);assert(Math.abs(bounds.max[2]-bounds.min[2]-37.57)<.002);
for(const name of ['gear-left','gear-right','gear-nose','fan-left','fan-right'])assert(root.listNodes().some(n=>n.getName()===name));
const supportPoints={main:[],nose:[]};let primitiveCount=0;
for(const n of root.listNodes()){
 if(!n.getMesh())continue;
 for(const p of n.getMesh().listPrimitives()){
  primitiveCount++;const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0');
  if(uv)assert.equal(uv.getCount(),pos.getCount(),'Every vertex has exactly one UV pair');assert.equal(normal.getCount(),pos.getCount());
  assert([...pos.getArray(),...normal.getArray(),...(uv?.getArray()||[])].every(Number.isFinite));
  const mat=p.getMaterial();for(const info of [mat.getBaseColorTextureInfo(),mat.getMetallicRoughnessTextureInfo(),mat.getEmissiveTextureInfo()].filter(Boolean))assert(p.getAttribute('TEXCOORD_'+info.getTexCoord()),'Material references an existing UV set');
  if(n.getName()==='tyre'){
   const group=n.listParents().find(parent=>parent.propertyType==='Node'),bucket=group.getName()==='gear-nose'?'nose':'main',v=[];
   for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);supportPoints[bucket].push(new THREE.Vector3(...v).applyMatrix4(new THREE.Matrix4().fromArray(n.getWorldMatrix())));}
  }
 }
}
assert.equal(primitiveCount,20);
for(const nose of [false,true])for(let pitch=0;pitch<=.15;pitch+=.005){const actual=Math.min(...supportPoints[nose?'nose':'main'].map(p=>p.y*Math.cos(pitch)+p.z*Math.sin(pitch)));assert(Math.abs(actual-a320Support(pitch,nose))<.001,'Flight contact profile matches the decoded source tyres');}
assert.equal(A320_PROFILE.cabinWindows,82);
console.log('A320_GEOMETRY_PASS',JSON.stringify({sourceBytes:source.length,bytes:bytes.length,triangles:count(doc),primitives:primitiveCount,length:bounds.max[2]-bounds.min[2],contactTolerance:.001}));
