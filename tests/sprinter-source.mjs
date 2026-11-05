import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {projectSprinterDecal} from '../src/sprinter-detail.js';
import {createSprinterVehicle,validateSprinterGlb,prepareSprinterSurface} from '../src/sprinter-source.js';
const binary=await readFile('assets/models/sprinter/model-v1.glb'),bytes=binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),manifest=JSON.parse(await readFile('assets/models/sprinter/manifest-v1.json'));
validateSprinterGlb(bytes);assert.equal(createHash('sha256').update(binary).digest('hex'),manifest.asset.sha256);assert.ok(binary.length<2000000);assert.ok(manifest.asset.triangles<300000);
const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,'');prepareSprinterSurface(scene);scene.updateMatrixWorld(true);
const bounds=new THREE.Box3().setFromObject(scene);assert.ok(Math.abs(bounds.min.y)<.001);assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).z-6.706)<.003);
for(const w of manifest.wheels){const part=scene.getObjectByName(w.name);assert.ok(part);const box=new THREE.Box3().setFromObject(part);assert.ok(Math.abs(box.min.y)<.002,'Tyre rests on ground');assert.ok(Math.abs(box.max.y-.70078)<.003);}
// Real body projection: labels follow bonnet/door surfaces rather than floating planes.
const panels=[];scene.traverse(o=>{if(o.isMesh&&o.material.name==='carpaint')panels.push(o);});
for(const spec of [
 {name:'hood',sample:(u,v)=>new THREE.Vector3((u-.5)*.66,4,3.12-v*.45),direction:new THREE.Vector3(0,-1,0)},
 {name:'rear',sample:(u,v)=>new THREE.Vector3(-.46-(u-.5)*.72,.99+v*.19,-5),direction:new THREE.Vector3(0,0,1)}
]){
 const g=projectSprinterDecal(panels,spec);assert(g.index.count>1500,spec.name+' has continuous panel coverage');
 const pos=g.getAttribute('position');for(const i of new Set(g.index.array)){const p=new THREE.Vector3().fromBufferAttribute(pos,i),ray=new THREE.Raycaster(p.clone().addScaledVector(spec.direction,-.02),spec.direction),hit=ray.intersectObjects(panels,false)[0];assert(hit);const gap=hit.distance-.02;assert(gap>.001&&gap<.012,spec.name+' paint stays within 12 mm of its body panel');}
 g.dispose();
}
let fail=true;const root=new THREE.Group(),fallbackMesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(fallbackMesh);root.scale.setScalar(.64);
const fallback={root,wheels:[new THREE.Group()],update(pose){root.position.copy(pose.position);}};
const vehicle=createSprinterVehicle(fallback,{loadSource:async()=>{if(fail)throw Error('Test network failure');return {scene,manifest};}});
assert.equal(await vehicle.loadDetail(),false);assert.equal(vehicle.sourceState.status,'error');assert.equal(fallbackMesh.visible,true);fail=false;
assert.equal(await vehicle.loadDetail(),true);assert.equal(fallbackMesh.visible,false);assert.equal(vehicle.wheels.length,4);
const pose={position:new THREE.Vector3(10,2,4),tangent:new THREE.Vector3(0,0,1),opacity:1,distance:0,direction:1};vehicle.update(pose,false);root.updateMatrixWorld(true);
const centers=vehicle.wheels.map(w=>w.getWorldPosition(new THREE.Vector3()));
pose.distance=.35039*.64*Math.PI/2;vehicle.update(pose,true);root.updateMatrixWorld(true);
vehicle.wheels.forEach((w,i)=>{assert.ok(w.getWorldPosition(new THREE.Vector3()).distanceTo(centers[i])<1e-6,'Pivots do not orbit');assert.ok(Math.abs(w.rotation.x-Math.PI/2)<1e-8,'Wheel rotation accounts for scene scale');});
assert.deepEqual(root.position.toArray(),[10,2,4]);pose.opacity=0;vehicle.update(pose,false);assert.equal(root.visible,false);
console.log('SPRINTER_SOURCE_PASS',JSON.stringify({bytes:binary.length,triangles:manifest.asset.triangles,wheels:vehicle.wheels.length,bounds:manifest.bounds.size}));
