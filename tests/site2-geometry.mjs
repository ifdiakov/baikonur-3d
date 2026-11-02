import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {buildLandingAircraft} from '../src/buran-landing-aircraft.js';

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

const {buildSite2Museum}=await import('../src/site2-museum.js');
const {prepareSite2Buran}=await import('../src/site2-exhibit.js');
const {SITE2_BURAN,SITE2_STAIR,SITE2_ACCESS}=await import('../src/site2-layout.js');
const {FACILITY_PORTS}=await import('../src/facility-ports.js');
const root=new THREE.Group(),built=buildSite2Museum(root);
const sourceFingerprint=()=>scene.children.map(o=>({geometry:o.geometry.uuid,matrix:o.matrix.toArray(),position:sha(Buffer.from(o.geometry.attributes.position.isInterleavedBufferAttribute?o.geometry.attributes.position.data.array.buffer:o.geometry.attributes.position.array.buffer)),material:o.material.uuid}));
const before=sourceFingerprint();const {model,source}=prepareSite2Buran(buildLandingAircraft({sourceBuran:scene}));root.add(model);root.updateMatrixWorld(true);
assert.deepEqual(sourceFingerprint(),before,'The parked exhibit must leave all shared source buffers and transforms unchanged');
assert.equal(source.retainedTriangles,33853);assert(model.children.length<50);
assert.deepEqual(V(0,0,1).cross(V(0,1,0)).toArray(),[-1,0,0]);
assert(SITE2_STAIR.bottom[0]<SITE2_STAIR.top[0]&&SITE2_STAIR.top[0]<0,'The tunnel must remain on physical starboard');
assert.equal(built.features['site2-covered-stair-step'],28);assert.equal(built.features['site2-carrier-wheel'],16);
assert.equal(root.userData.site2Model.outdoorExhibits.length,16);assert.equal(root.userData.site2Model.reference.photoCount,25);
assert.deepEqual(FACILITY_PORTS['pad-2'].road,SITE2_ACCESS.road);
const ray=new THREE.Raycaster();ray.set(V(SITE2_ACCESS.road[0],15,SITE2_ACCESS.road[2]),V(0,-1,0));
assert(ray.intersectObject(root,true).some(h=>Math.abs(h.point.y-.102)<.01),'The network gate must meet actual visible asphalt');
const bodyFrame=new THREE.Group();bodyFrame.position.set(SITE2_BURAN.position[0],0,SITE2_BURAN.position[2]);bodyFrame.rotation.y=SITE2_BURAN.yaw;bodyFrame.updateMatrixWorld(true);
function bodyRay(point,direction){return new THREE.Raycaster(bodyFrame.localToWorld(V(...point)),V(...direction).transformDirection(bodyFrame.matrixWorld)).intersectObject(model,true).map(h=>bodyFrame.worldToLocal(h.point.clone()).toArray());}
const hatch=bodyRay([-6,6.2,SITE2_STAIR.top[2]],[1,0,0]);assert(hatch.length);assert(Math.abs(hatch[0][0]-SITE2_STAIR.top[0])<.7,'Upper tunnel must meet the actual starboard shell');
const contacts=[];for(const z of [-8.8,6.4])for(const x of [-1.5,1.5]){const h=bodyRay([x,.5,z],[0,1,0]);assert(h.length);const supportTop=1.4+(z<0?.34:.52);assert(Math.abs(h[0][1]-supportTop)<.04,'Cradles touch the real underside without floating or deep penetration');contacts.push({x,z,bellyY:h[0][1],supportTop});}
let triangles=0;root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});assert(triangles<180000);assert(built.meshCount+model.children.length<110);
for(const b of root.userData.facilityLighting.boards){assert.equal(b.lamps.length,1);assert.equal(b.target[0],b.lamps[0].position[0]);assert.equal(b.target[2],b.lamps[0].position[2]);}
assert.equal(root.userData.facilityLighting.boards.length,10);
assert.doesNotThrow(()=>JSON.stringify(built));
console.log('SITE2_GEOMETRY_PASS',JSON.stringify({staticDraws:built.meshCount,sourceDraws:model.children.length,triangles,hatch:hatch[0],contacts,exhibits:root.userData.site2Model.outdoorExhibits.length}));
