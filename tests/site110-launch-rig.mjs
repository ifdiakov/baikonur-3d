import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {buildSite110,getSite110LaunchRig,SITE110_REFERENCE} from '../src/site110.js';

const root=new THREE.Group();root.position.set(21,-2.72,-19);root.rotation.y=.17;root.scale.setScalar(.14);
buildSite110(root);root.updateWorldMatrix(true,true);
const rig=getSite110LaunchRig(root);assert(rig);assert.equal(getSite110LaunchRig(new THREE.Group()),null);
assert.equal(rig.channels.length,3);assert.equal(rig.rocketAnchor.exhibitKey,'site110');
assert.equal(rig.rocketAnchor.rotation[1],-.53+Math.PI);
const original=[];root.traverse(mesh=>{if(mesh.isMesh)original.push(mesh);});
const hash=array=>createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const snapshots=new Map(original.map(mesh=>[mesh,{
 geometry:hash(mesh.geometry.attributes.position.array),matrix:mesh.matrix.toArray(),matrixAutoUpdate:mesh.matrixAutoUpdate,
 instances:mesh.isInstancedMesh?mesh.instanceMatrix.array.slice():null,
 box:mesh.boundingBox?.clone(),sphere:mesh.boundingSphere?.clone()
}]));
const movingIndices=new Map(original.filter(mesh=>mesh.isInstancedMesh).map(mesh=>[mesh,new Set((mesh.userData.archiveMotionInstances||[]).flatMap(part=>part.indices))]));
const movingDirect=new Set(original.filter(mesh=>mesh.userData.archiveMotionPart));
const matrix=new THREE.Matrix4(),vertex=new THREE.Vector3(),box=new THREE.Box3();
const meshes=()=>{const rows=[];root.traverse(mesh=>{if(mesh.isMesh)rows.push(mesh);});return rows;};
const geometryMetrics=()=>{const list=meshes();return {drawCalls:list.length,triangles:list.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1),0)};};
assert.deepEqual(geometryMetrics(),{drawCalls:36,triangles:246012},'Motion capture does not add copies or split static batches');

// Sample the actual channel floors, not just the exported emitter metadata.
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),centre=SITE110_REFERENCE.pads[0].centre;
for(const channel of rig.channels){
 const throat=new THREE.Vector3(...channel.throat),outlet=new THREE.Vector3(...channel.outlet);
 assert.equal(channel.width,12);assert.equal(throat.y,-23);assert.equal(outlet.y,0);
 assert(Math.abs(Math.hypot(throat.x-centre[0],throat.z-centre[1])-8)<1e-9);
 assert(Math.abs(Math.hypot(outlet.x-throat.x,outlet.z-throat.z)-126)<1e-9);
 for(const t of [.25,.6,.9]){
  const expected=throat.clone().lerp(outlet,t),origin=root.localToWorld(expected.clone().setY(100));
  ray.set(origin,down);const hit=ray.intersectObject(root,true).find(hit=>root.worldToLocal(hit.point.clone()).distanceTo(expected)<1e-4);
  assert(hit,'An exported channel follows the real sloping floor');
 }
}

function assertStaticAndBounds(){
 for(const mesh of original){
  const before=snapshots.get(mesh);
  assert.equal(hash(mesh.geometry.attributes.position.array),before.geometry,'Source geometry is not rebuilt or replaced');
  if(!mesh.isInstancedMesh){if(!movingDirect.has(mesh))assert.deepEqual(mesh.matrix.toArray(),before.matrix,'Uncaptured direct mesh stays fixed');continue;}
  const moved=movingIndices.get(mesh);
  for(let i=0;i<mesh.count;i++){
   if(!moved.has(i)){for(let k=0;k<16;k++)assert.equal(mesh.instanceMatrix.array[i*16+k],before.instances[i*16+k],'Every uncaptured instance stays bit-identical');continue;}
   mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));
   mesh.geometry.computeBoundingBox();box.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
   assert(mesh.boundingBox.clone().expandByScalar(1e-6).containsBox(box),'Moving instances remain inside their real culling bounds');
   const position=mesh.geometry.attributes.position;
   for(let v=0;v<position.count;v++){
    vertex.fromBufferAttribute(position,v).applyMatrix4(matrix);
    assert(vertex.distanceTo(mesh.boundingSphere.center)<=mesh.boundingSphere.radius+1e-4,'Culling sphere contains the actual moving vertices');
   }
  }
 }
}
function actualPartMatrices(id){
 const part=rig.stats().movingParts.find(part=>part.id===id);assert(part);
 return part.bindings.flatMap(binding=>{
  const mesh=root.getObjectByProperty('uuid',binding.meshUuid);
  return binding.indices.map(index=>{mesh.getMatrixAt(index,matrix);return matrix.toArray();});
 });
}
const partRest=new Map(rig.stats().movingParts.map(part=>[part.id,actualPartMatrices(part.id)]));
rig.seek(-90);assertStaticAndBounds();
for(const [id,matrices]of partRest)assert.deepEqual(actualPartMatrices(id),matrices);

rig.seek(-49);assert.notDeepEqual(actualPartMatrices('left-walkway-y43'),partRest.get('left-walkway-y43'));
assert.deepEqual(actualPartMatrices('left-platform-y18'),partRest.get('left-platform-y18'));
assert.deepEqual(actualPartMatrices('right-walkway-y50'),partRest.get('right-walkway-y50'));
assertStaticAndBounds();
rig.seek(-33);
assert.notDeepEqual(actualPartMatrices('left-platform-y29'),partRest.get('left-platform-y29'));
assert.deepEqual(actualPartMatrices('left-platform-y40_5'),partRest.get('left-platform-y40_5'));
const atMinus33=original.filter(mesh=>mesh.isInstancedMesh).map(mesh=>hash(mesh.instanceMatrix.array));
rig.seek(3);assertStaticAndBounds();rig.seek(-33);
assert.deepEqual(original.filter(mesh=>mesh.isInstancedMesh).map(mesh=>hash(mesh.instanceMatrix.array)),atMinus33,'Seeking is absolute and reversible, without accumulated rotations');

// The late connection stays attached through ignition, then its endpoint
// swings away while the real fixed-pipe bend remains the rotation centre.
rig.seek(0);assert.deepEqual(actualPartMatrices('late-feed-interface'),partRest.get('late-feed-interface'));
rig.seek(1);assert.notDeepEqual(actualPartMatrices('late-feed-interface'),partRest.get('late-feed-interface'));
const late=rig.stats().movingParts.find(part=>part.id==='late-feed-interface'),pivot=new THREE.Vector3(...late.pivotSite);
const binding=late.bindings[0],pipe=root.getObjectByProperty('uuid',binding.meshUuid);pipe.getMatrixAt(binding.indices[0],matrix);
const endpoints=[new THREE.Vector3(0,-.5,0).applyMatrix4(matrix),new THREE.Vector3(0,.5,0).applyMatrix4(matrix)];
assert(Math.min(...endpoints.map(point=>point.distanceTo(pivot)))<2e-5,'The fixed pipe base does not travel with the released tip');
assertStaticAndBounds();

// The separate hydrogen filling carriage translates on the same guide;
// its guide and parent platform have not yet moved during this interval.
function carriagePose(){
 const group=root.getObjectByName('110 · временный водородный механизм');assert(group);
 const deck=[],rails=[],p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
 group.traverse(mesh=>{if(!mesh.isInstancedMesh||mesh.geometry.type!=='BoxGeometry')return;for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);matrix.decompose(p,q,s);
  if(Math.abs(s.x-2.6)<.001&&Math.abs(s.y-.22)<.001)deck.push(p.clone());
  if(Math.abs(s.x-7.2)<.001&&Math.abs(s.y-.16)<.001)rails.push(matrix.toArray());
 }});assert.equal(deck.length,1);assert.equal(rails.length,2);return {deck:deck[0],rails};
}
rig.seek(-42);const carriageBefore=carriagePose();rig.seek(-35);const carriageAfter=carriagePose();
assert.deepEqual(carriageBefore.rails,carriageAfter.rails);assert(Math.abs(carriageAfter.deck.x-carriageBefore.deck.x+3.6)<1e-5);
assert.equal(carriageAfter.deck.y,carriageBefore.deck.y);assert.equal(carriageAfter.deck.z,carriageBefore.deck.z);
rig.seek(20);const versions=meshes().filter(mesh=>mesh.isInstancedMesh).map(mesh=>mesh.instanceMatrix.version);
rig.seek(30);assert.deepEqual(meshes().filter(mesh=>mesh.isInstancedMesh).map(mesh=>mesh.instanceMatrix.version),versions,'Settled mechanisms do not upload unchanged matrices each frame');
assertStaticAndBounds();const activeMetrics=geometryMetrics();assert.deepEqual(activeMetrics,{drawCalls:39,triangles:246424});

const temporary=root.getObjectByName('110 · временный водородный механизм'),ownedGeometries=new Set();let disposed=0,disposedInstances=0;
temporary.traverse(mesh=>{if(mesh.isMesh)ownedGeometries.add(mesh.geometry);if(mesh.isInstancedMesh)mesh.addEventListener('dispose',()=>disposedInstances++);});
ownedGeometries.forEach(geometry=>geometry.addEventListener('dispose',()=>disposed++));
rig.reset();assert.equal(disposed,ownedGeometries.size);assert.equal(disposedInstances,3,'Every temporary InstancedMesh releases its own GPU instance buffers');assert.equal(root.getObjectByName('110 · временный водородный механизм'),undefined);
assert.deepEqual(meshes(),original,'Reset removes temporary geometry and retains every original mesh object');
for(const mesh of original){
 const before=snapshots.get(mesh);assert.deepEqual(mesh.matrix.toArray(),before.matrix);assert.equal(mesh.matrixAutoUpdate,before.matrixAutoUpdate);
 if(mesh.isInstancedMesh){assert.deepEqual(mesh.instanceMatrix.array,before.instances);assert.deepEqual(mesh.boundingBox,before.box);assert.deepEqual(mesh.boundingSphere,before.sphere);}
}
assert.deepEqual(geometryMetrics(),{drawCalls:36,triangles:246012});assert.equal(rig.stats().active,false);
assert.doesNotThrow(()=>JSON.stringify(root.userData));assert.throws(()=>rig.seek(NaN));
console.log('SITE110_LAUNCH_RIG_PASS',JSON.stringify({baseline:geometryMetrics(),active:activeMetrics,channels:rig.channels.length,
 movingParts:rig.movingParts.length,capturedInstances:[...movingIndices.values()].reduce((sum,indices)=>sum+indices.size,0),capturedDirectMeshes:movingDirect.size,
 exactReset:true,staticInstancesUnchanged:true,deterministicSeek:true,boundsChecked:true,temporaryGeometriesDisposed:disposed,temporaryInstancedMeshesDisposed:disposedInstances}));
