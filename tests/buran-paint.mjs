import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {Matrix4,Vector3} from 'three';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const manifest=JSON.parse(await readFile('assets/models/buran-paint.json','utf8'));
for(const [file,expected]of Object.entries(manifest.assets)){
 const bytes=await readFile('assets/models/'+file);assert.equal(bytes.length,expected.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256);
 const doc=await io.readBinary(bytes),root=doc.getRoot();let triangles=0,draws=0;
 for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){triangles+=p.getIndices().getCount()/3;draws++;}
 assert.equal(triangles,expected.triangles);assert.equal(draws,expected.primitives);
 if(file.startsWith('rockets')){
  assert.equal(triangles,78388,'Archive topology is retained for animated extraction');
  for(const name of ['Kil_B.gif','RNN.gif','RNV.gif']){
   const node=root.listNodes().find(n=>n.getMesh()?.listPrimitives().some(p=>p.getMaterial().getName()===name));
   const p=node.getMesh().listPrimitives().find(p=>p.getMaterial().getName()===name),position=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_0'),matrix=new Matrix4().fromArray(node.getWorldMatrix());let front=null,aft=null;
   for(let i=0;i<position.getCount();i++){const y=new Vector3(...position.getElement(i,[])).applyMatrix4(matrix).y,v={y,u:uv.getElement(i,[])[0]};if(!front||y>front.y)front=v;if(!aft||y<aft.y)aft=v;}
   assert(front.u<aft.u-.5,'Fin and rudder images run forward-to-aft');
  }
 }else{
  assert.equal(draws,43);assert(bytes.length<3.2*1024*1024);
  const names=root.listMaterials().map(m=>m.getName());
  for(const name of ['Buran wing USSR flag','Buran wing CCCP','Buran lower rudder TPS','Buran upper rudder TPS','Buran upper nose TPS','Buran cockpit surround TPS','Buran nose glazing'])assert(names.includes(name),name);
  for(const [name,side]of [['Buran wing USSR flag',-1],['Buran wing CCCP',1]]){
   let count=0;for(const node of root.listNodes())for(const p of node.getMesh()?.listPrimitives()||[])if(p.getMaterial().getName()===name){const matrix=new Matrix4().fromArray(node.getWorldMatrix()),a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++){const v=new Vector3(...a.getElement(i,[])).applyMatrix4(matrix);assert(v.z*side>5.8&&v.y>36,'Marking lies above the correct wing');count++;}}
   assert(count>3);
  }
 }
}
console.log('BURAN_PAINT_PASS');
