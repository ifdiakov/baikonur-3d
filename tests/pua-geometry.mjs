import assert from 'node:assert/strict';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {buildPua100,PUA_SPEC} from '../src/pua-100.js';
import {samplePuaLoading} from '../src/pua-loading.js';
const root=new THREE.Group(),model=buildPua100(root),matrix=new THREE.Matrix4();
assert.equal(model.state.guideColumns,2);assert.equal(model.state.workCages,8);assert.equal(model.state.hoistRopes,8);
assert(model.state.primitiveCount>2000);assert(model.state.drawCalls<45,'Static detail must be batched');
for(let t=0;t<=110;t+=.25){
 const p=samplePuaLoading(t);model.pose(p);root.updateWorldMatrix(true,true);
 assert(Object.values(p).filter(v=>typeof v==='number').every(Number.isFinite));
 if(t>=38&&t<=66){assert.equal(p.lift,7);assert(p.aircraftZ<=0);assert.equal(p.dollyX,-38);}
 if(t>=96){assert.equal(p.lift,0);assert.equal(p.orbiterZ,p.aircraftZ);assert(!p.linksVisible);}
 for(const mesh of [root.getObjectByName('ПУА · восемь ветвей полиспаста'),root.getObjectByName('ПУА · грузовые связи')])for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));assert(matrix.determinant()>0);
 }
}
for(const time of [7,30,38,66,86,96]){
 const a=samplePuaLoading(time-1e-4),b=samplePuaLoading(time+1e-4);for(const key of ['lift','aircraftZ','orbiterZ','frameLift','dollyX'])assert(Math.abs(a[key]-b[key])<.001,`Pose discontinuity ${key} at ${time}`);
}
// Check the actual near and far source vertices: all wing geometry stays aft
// of the portal throughout forward approach, not merely a reported span value.
await MeshoptDecoder.ready;
for(const level of ['far','near']){
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read(`assets/models/mriya-buran/${level}-v2.glb`);
 const all=getBounds(doc.getRoot().listScenes()[0]),centerX=(all.min[0]+all.max[0])/2;
 const wings=doc.getRoot().listNodes().filter(n=>n.getMesh()?.listPrimitives().some(p=>p.getMaterial()?.getName().startsWith('Mriya wing-')));
 assert.equal(wings.length,2);
 // Clip wing triangles to each column's X strip. A whole-wing bounding box
 // would incorrectly use the root leading edge instead of the local sweep.
 const clip=(polygon,x,sign)=>{const out=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],ia=sign*(a[0]-x)>=0,ib=sign*(b[0]-x)>=0;if(ia)out.push(a);if(ia!==ib){const t=(x-a[0])/(b[0]-a[0]);out.push([x,a[1]+(b[1]-a[1])*t]);}}return out;};
 for(const n of wings)for(const primitive of n.getMesh().listPrimitives()){
  const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),count=indices?.getCount()??positions.getCount(),transform=new THREE.Matrix4().fromArray(n.getWorldMatrix()),v=[];
  for(let i=0;i<count;i+=3){const triangle=[];for(let j=0;j<3;j++){positions.getElement(indices?indices.getScalar(i+j):i+j,v);const p=new THREE.Vector3(...v).applyMatrix4(transform);triangle.push([p.z,centerX-p.x]);}
   for(const side of [-1,1]){const center=side*PUA_SPEC.columnX,clipped=clip(clip(triangle,center-1.7,1),center+1.7,-1);for(const p of clipped)assert(p[1]<PUA_SPEC.columnZ-2,'Swept wing collides with guide column');}
  }
 }
 const orbiter=doc.getRoot().listNodes().filter(n=>n.getMesh()?.listPrimitives().every(p=>p.getMaterial()?.getName().startsWith('Buran')));assert(orbiter.length>=8);
 const bmin=Math.min(...orbiter.map(n=>getBounds(n).min[1]))-all.min[1]+1.6;
 assert(Math.abs(bmin-PUA_SPEC.orbiterBottom)<.06);
 assert(Math.abs(bmin+PUA_SPEC.lowLift-2.9)<.06,'Transporter support height');
}
console.log('PUA_GEOMETRY_PASS',JSON.stringify({primitives:model.state.primitiveCount,drawCalls:model.state.drawCalls,sampledPoses:441,sourceLevels:2}));
