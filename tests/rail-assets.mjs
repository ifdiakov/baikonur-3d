import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {RAIL_VEHICLE_PROFILES as profiles} from '../src/rail-vehicle-profiles.js';
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const reports=[];
for(const [id,folder]of [['m62','m62-kosmotrans'],['coach','soviet-coach']]){
 const bytes=await readFile(`assets/models/${folder}/model-v1.glb`),manifest=JSON.parse(await readFile(`assets/models/${folder}/manifest-v1.json`)),d=await io.readBinary(bytes),r=d.getRoot(),nodes=r.listNodes(),profile=profiles[id];
 assert.equal(bytes.length,manifest.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);assert(bytes.length<manifest.source.bytes*.35);assert.match(r.getAsset().copyright,/CC BY 4.0/);assert.deepEqual(profile,manifest.profile);
 const box=getBounds(r.listScenes()[0]);assert(Math.abs(box.max[2]-box.min[2]-profile.couplerHalf*2)<.003);assert(box.min[1]>-.035&&box.min[1]<0,'Only the wheel flange extends below the tread datum');
 assert(nodes.find(n=>n.getName()==='body'));for(const [i,z]of profile.bogies.entries())assert.equal(nodes.find(n=>n.getName()==='bogie-'+i).getTranslation()[2],z);
 for(const [i,z]of profile.axles.entries()){
  assert.equal(nodes.find(n=>n.getName()==='axle-'+i).getTranslation()[2],z);
  for(const side of [-1,1]){const w=nodes.find(n=>n.getName()===`wheel-${i}-${side}`);assert(w);assert.equal(w.getTranslation()[0],side*.76);assert.equal(w.getTranslation()[1],profile.wheelRadius);const bounds=getBounds(w);assert(bounds.min[1]<.001&&bounds.min[1]>-.035);assert(bounds.max[1]>profile.wheelRadius*1.9);}
 }
 assert(!nodes.some(n=>/pantogr/.test(n.getName())));if(id==='coach')assert(box.max[1]<4.15);
 let triangles=0;for(const mesh of r.listMeshes())for(const p of mesh.listPrimitives()){triangles+=p.getIndices().getCount()/3;for(const a of p.listAttributes())assert([...a.getArray()].every(Number.isFinite));if(p.getMaterial().getBaseColorTexture())assert.equal(p.getAttribute('TEXCOORD_0').getCount(),p.getAttribute('POSITION').getCount());}
 assert.equal(triangles,manifest.triangles);assert(r.listMaterials().some(m=>m.getName()==='glass'));if(id==='m62')assert(r.listMaterials().some(m=>m.getName()==='lens'));
 for(const side of [-1,1]){const svg=await readFile(`assets/models/${folder}/skin${side}.svg`,'utf8');assert(svg.includes(id==='m62'?'КОСМОТРАНС':'СССР'));assert(!svg.includes('РЖД'));}
 reports.push({id,bytes:bytes.length,triangles,axles:profile.axles.length,sourceBytes:manifest.source.bytes});
}
console.log('RAIL_ASSETS_PASS',JSON.stringify(reports));
