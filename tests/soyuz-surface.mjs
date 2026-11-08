import assert from 'node:assert/strict';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {readFile} from 'node:fs/promises';
import {ROCKET_MODELS} from '../src/rocket-exhibits.js';
import {MODEL_CATALOG} from '../src/model-catalog.js';

// Independent reference: minimum outer radii in ten horizontal sections of
// the owner's recovered BDF (SHA 9928bc1c…042). Sample all 360 degrees, including
// both fairing halves. The old asset fails by 10–20 mm: decimation lets the
// green inner shell show through the painted exterior. Do not seal real
// openings (engine bells, lattice interstage) to satisfy a global watertight test.
const sections=[[35,1.467925],[36,1.467925],[37,1.467814],[38,1.397124],
 [39,1.307557],[40,1.300958],[40.5,1.301256],[41,1.301256],[41.5,1.231102],[42,1.224039]];
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const path=process.argv[2]||new URL('../assets/models/rockets/soyuz.glb',import.meta.url).pathname;
const doc=await io.read(path),meshes=[];
// Keep just the upper assembly in this CPU ray test, using decoded world
// coordinates and real triangles rather than bounding boxes or manifest counts.
for(const node of doc.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()||[]){
 const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),pos=p.getAttribute('POSITION'),ids=p.getIndices().getArray(),vertices=[],v=[];
 for(let i=0;i<ids.length;i+=3){
  const points=[ids[i],ids[i+1],ids[i+2]].map(id=>new THREE.Vector3().fromArray(pos.getElement(id,v)).applyMatrix4(matrix));
  if(Math.min(...points.map(v=>v.y))>42.7||Math.max(...points.map(v=>v.y))<34.6)continue;
  for(const point of points)vertices.push(...point.toArray());
 }
 if(!vertices.length)continue;
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 meshes.push(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
}
const ray=new THREE.Raycaster(),report=[];let samples=0;
for(const [y,referenceRadius] of sections){
 let minimum=Infinity;
 for(let i=0;i<180;i++){
  const angle=(i+.37)*2*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  ray.set(new THREE.Vector3(-.0212266445+5*c,y,.00017476+5*s),new THREE.Vector3(-c,0,-s));
  const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit,`Open fairing at y=${y}, angle=${angle}`);
  const radius=5-hit.distance;minimum=Math.min(minimum,radius);samples++;
  assert.ok(radius>=referenceRadius-.002,`Fairing skin recessed/exposed at y=${y}, angle=${angle}: ${radius} < ${referenceRadius} - 2 mm`);
 }
 report.push({y,minimum,referenceRadius});
}
if(!process.argv[2]){
 const manifest=JSON.parse(await readFile(new URL('../assets/models/rockets/soyuz.json',import.meta.url),'utf8'));
 assert.equal(manifest.modelRevision,'soyuz-surface-20261108-v1');
 assert.equal(ROCKET_MODELS.soyuz.assetVersion,manifest.modelRevision);
 assert.equal(MODEL_CATALOG.soyuz.assetRevision,manifest.modelRevision);
 assert.ok(manifest.assetStats.bytes<3*1024*1024,'Surface repair stays within a 3 MiB budget');
}
console.log(JSON.stringify({ok:true,samples,report}));
