import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {buildLandingAircraft,BURAN_LANDING_CONTACTS} from '../src/buran-landing-aircraft.js';

const V=(...xyz)=>new THREE.Vector3(...xyz),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b,tolerance=3e-6,message='physical coordinate')=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} vs ${b}`);
const vectorNear=(a,b,tolerance=3e-6,message='physical point')=>a.forEach((value,i)=>near(value,b[i],tolerance,message+' '+i));
const sourceUrl=new URL('../assets/models/rockets/energia-buran.glb',import.meta.url),bytes=await readFile(sourceUrl);
assert.equal(sha(bytes),'758d4ccf64bf6081138af28ed8531a0411ffae1ff90a3e3d3f5423f751501cdf','The corrected archive GLB is the input; extraction must preserve its geometry and paint');
await MeshoptDecoder.ready;
const document=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).readBinary(bytes);
const scene=new THREE.Group(),materials=new Map(),sourceTriangles=[];
const attributes={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',TEXCOORD_1:'uv1',COLOR_0:'color',TANGENT:'tangent'};
let first=true;
for(const node of document.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]){
  const geometry=new THREE.BufferGeometry();
  for(const [semantic,name]of Object.entries(attributes)){
    const accessor=primitive.getAttribute(semantic);if(!accessor)continue;
    const size=accessor.getElementSize(),data=new Float32Array(accessor.getCount()*size),item=[];
    for(let i=0;i<accessor.getCount();i++){accessor.getElement(i,item);for(let j=0;j<size;j++)data[i*size+j]=item[j];}
    if(name==='position'&&first){
      // GLTFLoader can retain interleaved meshopt accessors; test that runtime
      // path as well as the ordinary decoded attributes used by the other nodes.
      const interleaved=new Float32Array(accessor.getCount()*4);for(let i=0;i<accessor.getCount();i++){interleaved.set(data.subarray(i*3,i*3+3),i*4);interleaved[i*4+3]=123;}
      geometry.setAttribute(name,new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(interleaved,4),3,0));
    }else geometry.setAttribute(name,new THREE.BufferAttribute(data,size));
  }
  first=false;geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray().slice(),1));
  const originalMaterial=primitive.getMaterial();let material=materials.get(originalMaterial);
  if(!material){
    material=new THREE.MeshStandardMaterial({color:new THREE.Color().fromArray(originalMaterial.getBaseColorFactor()),roughness:originalMaterial.getRoughnessFactor(),metalness:originalMaterial.getMetallicFactor(),side:originalMaterial.getDoubleSided()?THREE.DoubleSide:THREE.FrontSide});
    material.name=originalMaterial.getName();material.map=new THREE.Texture();material.map.name='immutable authored texture '+material.name;materials.set(originalMaterial,material);
  }
  const mesh=new THREE.Mesh(geometry,material);mesh.name=node.getName();mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(node.getWorldMatrix());scene.add(mesh);
  const p=geometry.attributes.position,index=geometry.index,matrix=mesh.matrix;
  for(let at=0;at<index.count;at+=3){
    const triangle=[0,1,2].map(j=>V(p.getX(index.getX(at+j)),p.getY(index.getX(at+j)),p.getZ(index.getX(at+j))).applyMatrix4(matrix));
    sourceTriangles.push({material:material.name,points:triangle});
  }
}
// A real exhibit parent carries museum scale and placement. Those transforms must
// not leak into the independent metre-based flight aircraft.
const holder=new THREE.Group();holder.position.set(125,8,-44);holder.rotation.set(.2,.7,-.1);holder.scale.setScalar(.14);holder.add(scene);holder.updateMatrixWorld(true);
function fingerprint(root){
  const records=[];root.traverse(object=>{
    const record={name:object.name,position:object.position.toArray(),quaternion:object.quaternion.toArray(),scale:object.scale.toArray(),matrix:object.matrix.toArray(),world:object.matrixWorld.toArray(),needsUpdate:object.matrixWorldNeedsUpdate,visible:object.visible};
    if(object.isMesh){
      record.geometry={};for(const [name,a]of Object.entries(object.geometry.attributes)){const array=a.isInterleavedBufferAttribute?a.data.array:a.array;record.geometry[name]={hash:sha(Buffer.from(array.buffer,array.byteOffset,array.byteLength)),version:a.isInterleavedBufferAttribute?a.data.version:a.version};}
      const index=object.geometry.index;record.index=sha(Buffer.from(index.array.buffer,index.array.byteOffset,index.array.byteLength));
      record.material={uuid:object.material.uuid,color:object.material.color.toArray(),roughness:object.material.roughness,metalness:object.material.metalness,side:object.material.side,version:object.material.version,map:object.material.map.uuid,mapVersion:object.material.map.version,mapOffset:object.material.map.offset.toArray(),mapRepeat:object.material.map.repeat.toArray()};
    }
    records.push(record);
  });return sha(JSON.stringify(records));
}
const before=fingerprint(holder),sourceGeometries=new Set(scene.children.map(mesh=>mesh.geometry)),sourceBuffers=new Set();
for(const geometry of sourceGeometries)for(const attribute of Object.values(geometry.attributes))sourceBuffers.add((attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array).buffer);
const aircraft=buildLandingAircraft({sourceBuran:scene}),initial=aircraft.stats();
assert.equal(fingerprint(holder),before,'Extraction must not mutate source buffers, material state, hierarchy or transform bookkeeping');
assert.equal(initial.source.sourceTriangles,78388);assert.equal(initial.source.retainedTriangles,33853);
assert.equal(initial.source.separationStraddlers,174,'Actual attachment triangles spanning the separation gap are accounted for');
assert.ok(initial.source.retainedMaterials.includes('PaletteMaterial001')&&initial.source.retainedMaterials.includes('Soplo_ODU.jpg'),'Mixed source materials contribute real orbiter triangles');
const kept=sourceTriangles.filter(triangle=>triangle.points.every(p=>p.z<-4.45));
assert.equal(kept.length,33853);assert.equal(kept.filter(t=>t.material==='Soplo_ODU.jpg').length,244);
const expectedBounds=new THREE.Box3();for(const triangle of kept)for(const p of triangle.points)expectedBounds.expandByPoint(V(p.x,-p.z-7.6,p.y-18));
const sourceParts=[];aircraft.buran.updateMatrixWorld(true);aircraft.buran.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.sourceAircraftPart)sourceParts.push(mesh);});
const actualBounds=new THREE.Box3();let sourceVertices=0;
const triangleArea=points=>points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).length()*.5;
let actualSourceArea=0;const expectedSourceArea=kept.reduce((area,triangle)=>area+triangleArea(triangle.points),0);
for(const mesh of sourceParts){
  assert.ok(!sourceGeometries.has(mesh.geometry),'Independent flight surfaces own their geometry');
  for(const attribute of Object.values(mesh.geometry.attributes))assert.ok(!sourceBuffers.has(attribute.array.buffer),'No copied flight attribute aliases a source buffer');
  const position=mesh.geometry.attributes.position;
  for(let i=0;i<position.count;i++){
    const p=V().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);actualBounds.expandByPoint(p);sourceVertices++;
    assert.ok(p.y>-3.15001,'No retained flight vertex belongs to the rocket side of the separating plane');
  }
  for(let i=0;i<position.count;i+=3)actualSourceArea+=triangleArea([0,1,2].map(j=>V().fromBufferAttribute(position,i+j).applyMatrix4(mesh.matrixWorld)));
}
vectorNear(actualBounds.min.toArray(),expectedBounds.min.toArray(),5e-6,'Closed extracted source minimum');
vectorNear(actualBounds.max.toArray(),expectedBounds.max.toArray(),5e-6,'Closed extracted source maximum');
near(actualBounds.getSize(V()).x,23.918848037719727,5e-6,'Actual source wing span');
near(actualBounds.getSize(V()).z,36.3599739074707,5e-6,'Actual source flight length');
near(actualSourceArea,expectedSourceArea,.003,'Splitting the closed source doors and rudder conserves actual surface area');
assert.equal(initial.gearStruts,3);assert.equal(initial.gearWheels,6);assert.equal(initial.rudderLeaves,2);assert.equal(initial.parachuteCount,3);
vectorNear(aircraft.mainContact,[0,-5.2,-3],0);vectorNear(aircraft.noseContact,[0,-5.2,8.02],0);assert.equal(BURAN_LANDING_CONTACTS.mainTrack,7);
const allGear=[],doors=[],rudders=[],canopies=[],tireMeshes=[];
aircraft.buran.traverse(object=>{
  if(object.userData.gearId)allGear.push(object);
  if(object.userData.movingSurface?.includes('door'))doors.push(object);
  if(object.userData.movingSurface?.startsWith('rudder'))rudders.push(object);
  if(object.userData.parachuteCanopy)canopies.push(object);
  if(object.isMesh&&object.material.name==='шины')tireMeshes.push(object);
});
assert.equal(allGear.length,3);assert.ok(allGear.every(g=>!g.visible));assert.equal(canopies.length,3);assert.ok(canopies.every(c=>!c.parent.visible));
const rootPose={position:aircraft.buran.position.toArray(),quaternion:aircraft.buran.quaternion.toArray(),scale:aircraft.buran.scale.toArray()};
aircraft.update({gear:1,pitchDeg:11,chute:0,airbrake:0,time:12});aircraft.buran.updateMatrixWorld(true);
assert.deepEqual({position:aircraft.buran.position.toArray(),quaternion:aircraft.buran.quaternion.toArray(),scale:aircraft.buran.scale.toArray()},rootPose,'The controller is the sole owner of world attitude');
assert.ok(allGear.every(g=>g.visible));assert.ok(doors.every(g=>Math.abs(g.rotation.z)>1.4),'The source gear doors actually open');
let wheelContactProbes=0;
const caster=new THREE.Raycaster();
for(const leg of allGear)for(const wheel of leg.userData.wheels){
  const centre=V(...wheel.center).applyMatrix4(leg.matrixWorld);
  for(const offset of [-.35,0,.35]){
    caster.set(V(centre.x+offset*wheel.width,-7,centre.z),V(0,1,0));
    const hits=caster.intersectObjects(tireMeshes,false);assert.ok(hits.length,'Each real tire has an upward ray hit from the ground');
    near(hits[0].point.y,-5.2,2e-6,'Physical wheel contact plane');wheelContactProbes++;
  }
  if(leg.userData.gearId==='nose')near(centre.z,aircraft.noseContact[2],1e-8,'Nose gear aligns with the source door');
  else {near(centre.z,aircraft.mainContact[2],1e-8,'Both main axles share the contact station');near(Math.abs(leg.position.x),3.5,1e-8,'Seven-metre main gear track');}
}
for(const contact of aircraft.worldGearContacts()){
  near(contact.minimumY,-5.2,2e-6,'Actual vertex-derived level wheel contact');assert.equal(contact.visible,true);
  near(contact.lowestPoint[1],contact.minimumY,0);
}
aircraft.buran.rotation.x=-THREE.MathUtils.degToRad(11);aircraft.buran.scale.setScalar(.14);aircraft.buran.position.set(12,3,-7);aircraft.buran.updateMatrixWorld(true);
for(const contact of aircraft.worldGearContacts()){
  const leg=allGear.find(group=>group.userData.gearId===contact.id);let actual=Infinity;
  for(const mesh of tireMeshes.filter(m=>m.parent===leg))for(let i=0;i<mesh.geometry.attributes.position.count;i++)actual=Math.min(actual,V().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld).y);
  near(contact.minimumY,actual,1e-12,'World gear QA follows actual scaled/pitched tires');
}
aircraft.buran.position.set(0,0,0);aircraft.buran.quaternion.identity();aircraft.buran.scale.setScalar(1);
for(const extension of [.25,.5,.75]){
  aircraft.update({gear:extension,airbrake:0});aircraft.buran.updateMatrixWorld(true);
  for(const leg of allGear){
    const wheels=leg.userData.wheels,axle=wheels.reduce((point,wheel)=>point.add(V(...wheel.center)),V()).multiplyScalar(.5).applyMatrix4(leg.matrixWorld);
    assert.ok(axle.y>-5.2+wheels[0].radius,'During airborne retraction the actual wheel axle moves upwards into its well');
  }
}
aircraft.update({gear:0,airbrake:0});aircraft.buran.updateMatrixWorld(true);
const closedRudder=rudders.map(group=>new THREE.Box3().setFromObject(group));
const fixedFin=sourceParts.find(mesh=>mesh.userData.sourceMaterial==='Kil_B.gif'),fixedFinBefore=fixedFin.matrixWorld.toArray();
aircraft.update({gear:1,airbrake:1,chute:1,time:20});aircraft.buran.updateMatrixWorld(true);
for(let i=0;i<rudders.length;i++){
  const open=new THREE.Box3().setFromObject(rudders[i]);
  if(rudders[i].userData.movingSurface.endsWith('left'))assert.ok(open.min.x<closedRudder[i].min.x-.6,'Left source rudder leaf opens outwards');
  else assert.ok(open.max.x>closedRudder[i].max.x+.6,'Right source rudder leaf opens outwards');
}
assert.deepEqual(fixedFin.matrixWorld.toArray(),fixedFinBefore,'The fixed source fin remains fixed');
assert.ok(!sourceParts.some(mesh=>mesh.userData.sourceAircraftPart==='body'&&/^RN[VN]\.gif$/.test(mesh.userData.sourceMaterial)),'No original closed rudder skin remains underneath the animated leaves');
assert.ok(canopies.every(c=>c.parent.visible));assert.equal(aircraft.stats().deployedParachutes,3);
const parachuteBounds=canopies.map(canopy=>new THREE.Box3().setFromObject(canopy));
for(const bound of parachuteBounds){assert.ok(bound.max.z<-28,'Inflated brake canopies trail behind the tail');assert.ok(bound.min.y>-5.2,'Inflated canopies remain above the runway');assert.ok(bound.getSize(V()).x>6,'The full deployed canopy has real area');}
assert.ok(parachuteBounds[0].max.x<parachuteBounds[1].max.x&&parachuteBounds[1].max.x<parachuteBounds[2].max.x,'All three canopies are distinct in space');
const canopyGeometry=canopies[0].geometry,canopyPositions=canopyGeometry.attributes.position,canopyNormals=canopyGeometry.attributes.normal;
for(let i=0;i<canopyGeometry.index.count;i+=3){
  const indices=[0,1,2].map(j=>canopyGeometry.index.getX(i+j)),points=indices.map(j=>V().fromBufferAttribute(canopyPositions,j));
  const normal=points[1].sub(points[0]).cross(points[2].sub(points[0])).normalize();
  assert.ok(normal.dot(V().fromBufferAttribute(canopyNormals,indices[0]))>.96,'Actual canopy faces and fabric normals face the same side');
}
const midCanopy=canopies[1].position.clone().applyMatrix4(canopies[1].parent.matrixWorld);aircraft.update({time:21});aircraft.buran.updateMatrixWorld(true);
assert.ok(midCanopy.distanceTo(canopies[1].position.clone().applyMatrix4(canopies[1].parent.matrixWorld))>.01,'Deployed fabric has small live motion');

assert.equal(aircraft.stats().escort.count,0);assert.equal(aircraft.mig,undefined,'Removed LL22 is not built, even as a hidden model');
assert.ok(initial.budget.buran.draws<=80&&initial.budget.buran.triangles<41000,'Source detail and animations fit a bounded aircraft budget');
assert.equal(initial.budget.mig,undefined);
assert.equal(fingerprint(holder),before,'All gear/rudder/chute updates leave the shared source unchanged');
assert.equal(sha(await readFile(sourceUrl)),sha(bytes),'The source asset bytes remain unchanged');
aircraft.update({gear:0,chute:0,airbrake:0});assert.ok(allGear.every(g=>!g.visible));assert.ok(canopies.every(c=>!c.parent.visible),'Reset clears deployed landing equipment');
console.log('BURAN_LANDING_AIRCRAFT_PASS',JSON.stringify({sourceTriangles:initial.source.sourceTriangles,orbiterTriangles:initial.source.retainedTriangles,sourceVerticesChecked:sourceVertices,sourceBounds:initial.source.bounds.size,wheelContactProbes,sourceImmutable:true,gearStruts:3,wheels:6,rudderLeaves:2,parachutes:3,escort:initial.escort,budget:initial.budget}));
