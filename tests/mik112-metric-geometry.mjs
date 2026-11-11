import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {buildMik112,MIK112,MIK112_HALL_ROCKET_MOUNT} from '../src/mik112.js';

const root=new THREE.Group();root.scale.setScalar(MIK112.scale);const exhibit=buildMik112(root,{year:2026});
assert.equal(MIK112.version,'3.1-photo-facades-20261111');
assert.equal(MIK112.units,'metres');assert.equal(MIK112.scale,.14);
assert.deepEqual(MIK112.dimensions,{length:240,width:190,high:{length:240,width:120,height:56,bays:3},low:{length:240,width:70,height:30,bays:2}});
assert.equal(exhibit.stats().features['hall-column'],undefined);
assert.equal(exhibit.stats().features['wall-attached-column'],26);
assert.equal(exhibit.stats().features['historical-internal-column'],26);
assert.equal(exhibit.stats().features['museum-assembly-cradle'],2);
assert.deepEqual(exhibit.stats().columnDisplay,{modern:'wall-attached only',historicalInternalColumns:26,modernDetachedColumns:0});
const historical=root.getObjectByName('МИК · историческая кровля');assert(historical);
const ruins=root.getObjectByName('МИК · раскрытые разрушенные пролёты');assert(ruins);
assert.equal(historical.parent,root);assert.equal(ruins.parent,root,'Reconstruction locates these direct children by name');
const facade=root.getObjectByName('МИК112 · фасад и пожарные лестницы');assert(facade);
const modern=root.getObjectByName('МИК112 · три открытых пролёта по фото');assert.equal(modern.parent,ruins);
assert.equal(historical.visible,false);assert.equal(ruins.visible,true);
exhibit.setYear(1988);assert.equal(historical.visible,true);assert.equal(ruins.visible,false);
exhibit.setYear(2026);

const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
const boxes=[];
root.updateWorldMatrix(true,true);
const inverse=root.matrixWorld.clone().invert(),instance=new THREE.Matrix4();
root.traverse(mesh=>{
 if(!mesh.isMesh)return;
 for(const attribute of Object.values(mesh.geometry.attributes))assert([...attribute.array].every(Number.isFinite));
 if(!mesh.isInstancedMesh)return;
 assert.equal(mesh.userData.featureInstances.reduce((sum,item)=>sum+item.count,0),mesh.count,'Feature provenance must account for actual instances');
 for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,instance);matrix.multiplyMatrices(inverse,mesh.matrixWorld).multiply(instance);
  assert(matrix.elements.every(Number.isFinite));matrix.decompose(position,rotation,scale);
  boxes.push({mesh,parent:mesh.parent,material:mesh.material,position:position.clone(),rotation:rotation.clone(),scale:scale.clone()});
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

// The current roof must be physically absent in the centres of all three
// high bays. Metadata or visibility flags without the correct geometry fail.
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
function roofProbes(){
 root.updateWorldMatrix(true,true);const meshes=[];root.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
 const probes=[];
 for(const x of [-75,-35,5])for(const z of [-80,0,80]){
  ray.set(root.localToWorld(new THREE.Vector3(x,85,z)),down);
  const hit=ray.intersectObjects(meshes,false)[0];assert(hit,'The open bay still has a floor');
  probes.push({x,z,y:root.worldToLocal(hit.point.clone()).y});
 }return probes;
}
const modernProbes=roofProbes();assert(modernProbes.every(p=>p.y<35),'No intact roofing across the modern high bays');
const childOf=(object,parent)=>{for(let o=object;o;o=o.parent)if(o===parent)return true;return false;};
const hash=array=>createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
function snapshot(){const result=[];root.traverse(o=>{if(o.isMesh&&!childOf(o,exhibit.transportersGroup))result.push({name:o.name,matrix:o.matrix.toArray(),geometry:hash(o.geometry.attributes.position.array),instances:o.isInstancedMesh?hash(o.instanceMatrix.array):null});});return result;}
const initialSnapshot=snapshot();
exhibit.setYear(1988);const historicalProbes=roofProbes();
assert(historicalProbes.every(p=>p.y>55&&p.y<60),'Every historical bay has its actual full-height roof');
exhibit.setYear(2026);assert.deepEqual(roofProbes(),modernProbes);assert.deepEqual(snapshot(),initialSnapshot,'Time changes do not modify shared geometry');

const partitions=boxes.filter(b=>childOf(b.parent,modern)&&near(b.scale.x,1.35)&&near(b.scale.z,236));
assert.equal(partitions.length,8);assert.deepEqual([...new Set(partitions.map(b=>Math.round(b.position.x)))].sort((a,b)=>a-b),[-55,-15]);
for(const x of [-55,-15])assert(partitions.some(b=>near(b.position.x,x)&&b.position.y+b.scale.y/2>49),'Both dividing walls have connected upper spandrels');
const runways=boxes.filter(b=>childOf(b.parent,modern)&&near(b.scale.x,.48)&&near(b.scale.y,2.35)&&near(b.scale.z,232));
assert.equal(runways.length,6,'Two real crane runway webs per high bay');

// Glass fills a real opening in the facade; an opaque concrete wall behind a
// decorative glass overlay would fail these exterior-to-interior rays.
const visible=[];root.traverseVisible(o=>{if(o.isMesh)visible.push(o);});
const facadeProbes=[];
for(const x of [-71,-19])for(const [height,material]of [[20,'museum / doorMetal'],[44,'museum / wall']]){
 ray.set(root.localToWorld(new THREE.Vector3(x,2.6+height,-145)),new THREE.Vector3(0,0,1).transformDirection(root.matrixWorld));
 const hit=ray.intersectObjects(visible,false)[0];assert(hit);assert.equal(hit.object.material.name,material);
 facadeProbes.push({x,height,material:hit.object.material.name});
}
for(const [x,height,material]of [[42.5,7,'museum / dark'],[42.5,22,'museum / wall'],[41.1,7,'museum / dark'],[42.5,8,'museum / dark']]){
 ray.set(root.localToWorld(new THREE.Vector3(x,2.6+height,145)),new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld));
 const hit=ray.intersectObjects(visible,false)[0];assert(hit);assert.equal(hit.object.material.name,material,'The working portal is clear of facade ribs below its solid upper wall');
 facadeProbes.push({x,height,material:hit.object.material.name});
}
const canopyProbes=[];
for(const x of [-71,-45,-19]){
 ray.set(root.localToWorld(new THREE.Vector3(x,38,-121.3)),new THREE.Vector3(0,1,0));
 const hit=ray.intersectObjects(visible,false)[0];assert(hit);assert.equal(hit.object.material.name,'museum / dark');
 const y=root.worldToLocal(hit.point.clone()).y;assert(y>40.75&&y<41.1,'Continuous canopy clears both full door apertures');canopyProbes.push({x,y});
}
const inward=new THREE.Vector3(1,0,0).transformDirection(root.matrixWorld),glazingProbes=[];
// Keep these sightlines clear of the retained service annex at z=-92.
for(const z of [-64.5,-52.5,7.5,67.5]){
 ray.set(root.localToWorld(new THREE.Vector3(-130,10.9,z)),inward);
 const hit=ray.intersectObjects(visible,false)[0];assert(hit);assert.equal(hit.object.material.name,'museum / glass');
 const point=root.worldToLocal(hit.point.clone());assert(Math.abs(point.x+94.26)<.03);glazingProbes.push(point.toArray());
}
const stairs=[];root.traverse(o=>{if(o.userData.museumComponent==='mik112-fire-stair')stairs.push(o);});assert.equal(stairs.length,2);
for(const stair of stairs){
 assert.equal(stair.parent,facade);
 const steps=boxes.filter(b=>childOf(b.parent,stair)&&near(b.scale.x,2.5)&&near(b.scale.y,.12));
 assert(steps.length>=100,'A fire stair contains actual individual treads');
 assert(steps.every(b=>Math.abs(b.rotation.x)+Math.abs(b.rotation.y)+Math.abs(b.rotation.z)<1e-5),'Stair treads stay horizontal');
 const heights=steps.map(b=>b.position.y).sort((a,b)=>a-b);
 assert(heights[0]<5&&heights.at(-1)>54,'Stairs connect ground approach and roof level');
 assert.equal(new Set(heights.map(y=>y.toFixed(3))).size,steps.length,'Treads do not occupy duplicate elevations');
}
const debrisGeometries=new Set();let debrisInstances=0;
modern.traverse(o=>{if(!o.isMesh)return;const n=o.userData.featureInstances?.find(f=>f.tag==='roof-debris')?.count||0;if(n){debrisInstances+=n;debrisGeometries.add(o.geometry);}});
assert(debrisInstances>=200);assert.equal(debrisGeometries.size,3,'Debris reuses three chipped meshes instead of one mesh per fragment');
assert([...debrisGeometries].every(g=>g.type==='BufferGeometry'&&g.attributes.position.count>8),'Debris has actual chipped polygons');
const cradles=[];root.traverse(o=>{if(o.isMesh&&o.userData.museumComponent==='museum-assembly-cradle')cradles.push(o);});
assert.equal(cradles.length,2);assert(cradles.every(o=>childOf(o,historical)),'Museum payload cradles are hidden with the historical roof in modern years');

let hallTriangles=0,hallDrawCalls=0,lights=0;
root.traverse(o=>{if(o.isLight)lights++;if(!o.isMesh||childOf(o,exhibit.transportersGroup))return;hallTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);hallDrawCalls+=Array.isArray(o.material)?o.geometry.groups.length||1:1;});
assert(hallTriangles<65000&&hallDrawCalls<=50,'Detailed hall stays inside its geometry and batch budget');assert.equal(lights,0);

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
console.log('MIK112_METRIC_GEOMETRY_PASS',JSON.stringify({version:MIK112.version,dimensions:MIK112.dimensions,historicalColumns:internalColumns.length,modernDetachedColumns:0,photoMaterials:photoMaterials.size,museumCradles:2,
 roofProbes:modernProbes.length,historicalRoofProbes:historicalProbes.length,glazingProbes:glazingProbes.length,facadeProbes,canopyProbes,fireStairs:stairs.length,debrisInstances,sharedDebrisGeometries:debrisGeometries.size,hallTriangles,hallDrawCalls,newLightSources:lights,mount}));
