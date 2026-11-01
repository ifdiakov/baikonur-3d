import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {getBounds} from '@gltf-transform/functions';
import {modelsForObject,modelsForKnowledge,MODEL_CATALOG,resolveModelId} from '../src/model-catalog.js';
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
for(const [id,path,manifestPath]of [['mig25','assets/models/mig25/model-v1.glb','assets/models/mig25/manifest-v1.json'],['n1','assets/models/rockets/n1.glb','assets/models/rockets/n1.json']]){
 const bytes=await readFile(path),m=JSON.parse(await readFile(manifestPath,'utf8')),d=await io.readBinary(bytes),bounds=getBounds(d.getRoot().listScenes()[0]);assert.equal(createHash('sha256').update(bytes).digest('hex'),m.sha256);assert.match(m.source.license,/CC-BY-4.0/);assert(bytes.length<1_000_000);
 const primitives=d.getRoot().listMeshes().flatMap(m=>m.listPrimitives());assert.equal(primitives.reduce((n,p)=>n+p.getIndices().getCount()/3,0),id==='mig25'?25523:126920,'Retain every source triangle');assert(primitives.length<=(id==='mig25'?40:8));
 for(const a of d.getRoot().listAccessors())for(const n of a.getArray())assert(Number.isFinite(n));
 assert(Math.abs(bounds.min[1])<.002);if(id==='mig25'){assert(Math.abs(bounds.max[0]-bounds.min[0]-14.01)<.01);assert(d.getRoot().listTextures().length>=30);}else assert(Math.abs(bounds.max[1]-bounds.min[1]-105)<.01);
 assert.equal(MODEL_CATALOG[id].asset,path.replace('assets/models/',''));assert(MODEL_CATALOG[id].credit.includes('CC BY 4.0'));
 console.log('SOURCE_EXHIBIT_GEOMETRY_OK',id,{bytes:bytes.length,primitives:primitives.length,bounds});
}
assert(modelsForObject({id:'pad-251'}).includes('mig25'));assert(modelsForObject({id:'pad-110'}).includes('n1'));assert.equal(MODEL_CATALOG.mig.title,'МиГ-25 ЛЛ22');assert.equal(resolveModelId('mig25ru'),'mig25');assert.deepEqual(modelsForKnowledge('mig25ru'),['mig25']);
