import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Box3,Vector3,Raycaster} from 'three';
import {createZenitRocket,ZENIT_DIMENSIONS} from '../src/zenit-rocket.js';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const near=createZenitRocket({textures:false}),far=createZenitRocket({textures:false,detail:'far'});
const box=()=>new Box3().setFromObject(near.root),original=box();
assert.ok(Math.abs(original.min.y)<1e-6);assert.ok(Math.abs(original.max.y-ZENIT_DIMENSIONS.height)<.005);
assert.ok(near.stats().drawCalls<=20);assert.ok(near.stats().triangles<=105000);assert.ok(far.stats().triangles<near.stats().triangles*.3);
assert.equal(near.stages.length,4);assert.equal(near.stats().nozzles,4);
near.root.traverse(o=>{if(!o.isMesh)return;for(const name of ['position','normal','uv'])for(const n of o.geometry.attributes[name].array)assert.ok(Number.isFinite(n),'finite '+name);});
// A ray through each nozzle mouth travels into its throat: no painted end caps.
near.root.updateMatrixWorld(true);
for(const [x,,z] of near.root.userData.engineNozzles){const ray=new Raycaster(new Vector3(x,-.1,z),new Vector3(0,1,0));const hits=ray.intersectObject(near.root,true);assert.ok(hits.length);assert.ok(hits[0].distance>2.3,'RD-171 nozzle mouth must be open');}
// Sample the open lattice, away from the central second-stage engine bell.
let clear=0;for(let i=0;i<18;i++){const ray=new Raycaster(new Vector3(1.72,30.9+i*.08,5),new Vector3(0,0,-1));if(!ray.intersectObject(near.root,true).length)clear++;}assert.ok(clear>=5,'interstage must have see-through openings');
near.setExploded(1);assert.ok(box().max.y>original.max.y+17.9);near.setExploded(0);assert.deepEqual(box().min.toArray(),original.min.toArray());assert.deepEqual(box().max.toArray(),original.max.toArray());
const bytes=await readFile('assets/models/zenit-3sl/model-v1.glb'),manifest=JSON.parse(await readFile('assets/models/zenit-3sl/manifest-v1.json','utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);assert.equal(bytes.length,manifest.bytes);assert.ok(bytes.length<2_000_000);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),gltf=await io.binaryToJSON(bytes);
assert.equal(gltf.json.scenes.length,1);assert.ok(!gltf.json.cameras?.length);assert.ok(gltf.json.extensionsRequired.includes('EXT_meshopt_compression'));
for(const buffer of gltf.json.buffers)assert.ok(!buffer.uri);for(const image of gltf.json.images)assert.ok(image.bufferView!==undefined&&!image.uri);
const viewer=await readFile('workshop/zenit.html','utf8');assert.ok(viewer.includes('Морской старт'));
const main=await readFile('index.html','utf8');assert.ok(main.includes("case 'zenit-3sl':location.assign('./workshop/zenit.html')"));
console.log('ZENIT_GEOMETRY_OK',JSON.stringify({near:near.stats(),far:far.stats(),clearLatticeSamples:clear,assetBytes:bytes.length}));near.dispose();far.dispose();
