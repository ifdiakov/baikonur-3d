import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildMik112,MIK112,MIK112_HALL_ROCKET_MOUNT} from '../src/mik112.js';

const root=new THREE.Group();root.scale.setScalar(MIK112.scale);const exhibit=buildMik112(root,{year:2026});
assert.equal(MIK112.units,'metres');assert.equal(MIK112.scale,.14);
assert.deepEqual(MIK112.dimensions,{length:240,width:190,high:{length:240,width:120,height:56,bays:3},low:{length:240,width:70,height:30,bays:2}});
assert.equal(exhibit.stats().features['hall-column'],undefined);
assert.equal(exhibit.stats().features['wall-attached-column'],26);
assert.equal(exhibit.stats().features['historical-internal-column'],26);
assert.equal(exhibit.stats().features['museum-assembly-cradle'],2);
assert.deepEqual(exhibit.stats().columnDisplay,{modern:'wall-attached only',historicalInternalColumns:26,modernDetachedColumns:0});
const historical=root.getObjectByName('МИК · историческая кровля');assert(historical);
const ruins=root.getObjectByName('МИК · раскрытые разрушенные пролёты');assert(ruins);
assert.equal(historical.visible,false);assert.equal(ruins.visible,true);
exhibit.setYear(1988);assert.equal(historical.visible,true);assert.equal(ruins.visible,false);
exhibit.setYear(2026);

const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
const boxes=[];
root.traverse(mesh=>{
 if(!mesh.isMesh)return;
 for(const attribute of Object.values(mesh.geometry.attributes))assert([...attribute.array].every(Number.isFinite));
 if(!mesh.isInstancedMesh)return;
 for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));matrix.decompose(position,rotation,scale);
  boxes.push({parent:mesh.parent,material:mesh.material,position:position.clone(),rotation:rotation.clone(),scale:scale.clone()});
 }
});
const near=(a,b)=>Math.abs(a-b)<.001;
assert(boxes.some(b=>near(b.scale.x,190)&&near(b.scale.z,240)&&near(b.scale.y,.6)),'Measured 190 × 240 m floor');
assert(boxes.some(b=>near(b.scale.x,120)&&near(b.scale.y,56)&&near(b.scale.z,1.8)),'High envelope has its documented dimensions');
assert(boxes.some(b=>near(b.scale.x,70)&&near(b.scale.y,30)&&near(b.scale.z,1.6)),'Low envelope has its documented dimensions');
const internalColumns=boxes.filter(b=>near(b.scale.x,1)&&near(b.scale.y,52)&&near(b.scale.z,1)&&(near(b.position.x,-55)||near(b.position.x,-15)));
assert.equal(internalColumns.length,26);assert(internalColumns.every(b=>b.parent===historical),'Only the historical state contains freestanding internal columns');
const roof=boxes.filter(b=>b.parent===historical&&near(b.scale.x,39.4)&&near(b.scale.z,240));
assert.equal(roof.length,3);roof.forEach(b=>assert(near(b.position.y+b.scale.y/2,2.6+56)));

const photoMaterials=new Set(boxes.map(b=>b.material).filter(m=>m.userData.photoFinish));assert.equal(photoMaterials.size,4);
for(const material of photoMaterials){
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader);
 assert(shader.fragmentShader.includes('mik'));
 assert(shader.uniforms.museumWear.value<=.21,'Door/roof weathering stays restrained');
}
const mount=exhibit.rocketMounts().hall;assert.deepEqual(mount.position,MIK112_HALL_ROCKET_MOUNT.position);
assert.equal(mount.position[0],-35);assert.equal(mount.rotation[0],Math.PI/2);
// Published Buran span fits between the 40 m bay axes; its upward side clears
// the 56 m roof, leaving real space for the exhibit and its support cradles.
assert(mount.clearWidth>23.9);assert(mount.position[1]+18.65<2.6+52);
assert(mount.position[2]>-110&&mount.position[2]+58.815<110);
assert(exhibit.stats().noPolePolygons.length>=5);
console.log('MIK112_METRIC_GEOMETRY_PASS',JSON.stringify({version:MIK112.version,dimensions:MIK112.dimensions,historicalColumns:internalColumns.length,modernDetachedColumns:0,photoMaterials:photoMaterials.size,museumCradles:2,mount}));
