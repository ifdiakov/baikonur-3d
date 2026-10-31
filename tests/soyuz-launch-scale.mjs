import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from '../src/vendor/three-r160/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {MUSEUM_METRE} from '../src/museum-scale.js';
import {buildGagarinPad,GAGARIN_RIM_Y,GAGARIN_RAIL_PORT} from '../src/gagarin-pad.js';
import {buildSite31Pad,SITE31_PORTS} from '../src/site31-pad.js';
import {SITE31_PIT} from '../src/site31-trench-profile.js';
import {gagarinVoid} from '../src/terrain-voids.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';

// Decode the delivered source asset, not a cylinder with the expected size.
// CPU validation needs geometry only; browser QA covers the real image decode.
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.ProgressEvent=class{constructor(type,data){this.type=type;Object.assign(this,data);}};
const file=readFileSync(new URL('../assets/models/rockets/soyuz.glb',import.meta.url));
const source=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
const manifest=JSON.parse(readFileSync(new URL('../assets/models/rockets/soyuz.json',import.meta.url),'utf8'));
assert.equal(manifest.normalization.unit,'metre');
assert.equal(manifest.normalization.baseY,0);

const reports=[];
function getNonRocketMeshes(root,holder){const meshes=[];root.traverse(o=>{if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(p===holder)return;meshes.push(o);});return meshes;}
for(const [id,builder]of[['gagarin',buildGagarinPad],['site31',buildSite31Pad]]){
 const root=new THREE.Group();root.scale.setScalar(MUSEUM_METRE);const result=builder(root);
 const holder=result.rocket;
 assert.equal(holder.parent,root,'the metre-sized rocket is outside the legacy architecture scale');
 assert.equal(holder.children.length,0,'no old schematic rocket doubles the source asset');
 assert.equal(holder.visible,true,'requested exhibit is visible by default');
 assert.equal(result.rocketMount.axis,'y');assert.equal(result.rocketMount.baseY,0);
 assert.deepEqual(result.rocketMount.position,[0,0,0]);
 holder.add(source.scene.clone(true));root.updateMatrixWorld(true);
 const size=new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
 assert.ok(Math.abs(size.y-manifest.bounds.size[1]*MUSEUM_METRE)<.001,'source height stays the same on both starts');
 const scale=holder.getWorldScale(new THREE.Vector3());for(const axis of ['x','y','z'])assert.ok(Math.abs(scale[axis]-MUSEUM_METRE)<1e-10,'no fit-to-pad or nonuniform rocket scale');
 assert.ok(Math.abs(holder.rotation.y-Math.PI/4)<1e-10,'four boosters face the four support-arm diagonals');

 const meshes=getNonRocketMeshes(root,holder),ray=new THREE.Raycaster();
 // True openings through the table and concrete bearing annulus, including
 // below engine level. A filled concrete disk would fail all three rays.
 for(const [x,z]of[[0,0],[1.5,0],[0,1.5]]){
  ray.set(root.localToWorld(new THREE.Vector3(x,.05,z)),new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObjects(meshes,false);
  assert.ok(hits.length,`${id}: below-grade duct lining exists`);
  assert.ok(hits[0].point.y<-MUSEUM_METRE,`${id}: engine aperture is open below grade`);
 }

 if(id==='gagarin'){
  const metadata=root.userData.gagarinModel;
  assert.equal(GAGARIN_RIM_Y,0);assert.equal(metadata.terrainDatum.rimY,0);
  assert.equal(metadata.units,'metres');assert.equal(metadata.serviceHeightVerified,false);
  assert.ok(Math.abs(metadata.serviceHeightMetres-39.5)<1e-9);
  assert.ok(Math.abs(GAGARIN_RAIL_PORT[1]*MUSEUM_METRE-RAIL_PROFILE.headY)<1e-9,'external train socket height is unchanged');
  assert.equal(metadata.railTransition.networkGaugeWorld,RAIL_PROFILE.gauge,'network train gauge is not changed');
  assert.equal(gagarinVoid().rimY,0);
  const concrete=root.children.find(g=>g.userData.metricArchitecture==='gagarin');
  assert.ok(concrete);assert.deepEqual(concrete.scale.toArray(),[.5,.5,.5],'legacy architecture has one uniform metre conversion');
  const rails=concrete.children.find(m=>m.isInstancedMesh&&m.material.color.getHex()===0x3f4242);
  assert.ok(rails,'actual running-rail batch exists');
  const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),sample=[];
  for(let i=0;i<rails.count;i++){
   rails.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix).applyMatrix4(rails.matrixWorld);root.worldToLocal(p);
   if(Math.abs(p.z-25)<1e-6)sample.push(p.clone());
  }
  assert.equal(sample.length,2);sample.sort((a,b)=>a.x-b.x);
  assert.ok(Math.abs(sample[1].x-sample[0].x-1.52)<1e-5,'physical gauge near the start is 1.52m');
 }else{
  const metadata=root.userData.site31Model;
  assert.equal(metadata.units,'metres');assert.equal(metadata.railGauge,1.52);
  assert.deepEqual(root.userData.archiveCutouts,[SITE31_PIT],'the satellite-derived excavation is not rescaled');
  assert.deepEqual(metadata.railPort,SITE31_PORTS.rail);assert.deepEqual(metadata.roadPort,SITE31_PORTS.road);
  assert.deepEqual(metadata.rocketMount,result.rocketMount);
  const assembly=root.children.find(g=>g.name==='Пл.31 · стартовые агрегаты в метрах');
  assert.ok(assembly);for(const s of assembly.scale.toArray())assert.ok(Math.abs(s-2/3)<1e-10);
  // The smaller physical machinery still bears on the unchanged large bridge.
  // Check the two mast feet and all four support-arm pivots on actual geometry.
  const feet=[[-40/3,10/3],[40/3,10/3],...Array.from({length:4},(_,i)=>{const a=Math.PI/4+i*Math.PI/2;return[14*Math.cos(a),14*Math.sin(a)];})];
  for(const [x,z]of feet){
   ray.set(root.localToWorld(new THREE.Vector3(x,.3,z)),new THREE.Vector3(0,-1,0));
   const hits=ray.intersectObjects(meshes,false);
   assert.ok(hits.length&&hits[0].point.y>=-.01,`site31: bearing below foot ${x},${z} is at grade`);
  }
  const rails=root.children.find(o=>o.isInstancedMesh&&o.name==='Архив · rail');
  const m=new THREE.Matrix4(),p=new THREE.Vector3(),x=[];for(let i=0;i<rails.count;i++){rails.getMatrixAt(i,m);p.setFromMatrixPosition(m);if(Math.abs(p.z-108)<1e-8)x.push(p.x);}
  x.sort((a,b)=>a-b);assert.equal(x.length,2);assert.ok(Math.abs(x[1]-x[0]-1.52)<1e-5,'1.52m extends all the way to the external port');
 }
 let calls=0,triangles=0;for(const o of meshes){calls++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}
 assert.ok(calls<60,'start geometry remains batched');assert.ok(triangles<110000,'start detail budget excludes the separately optimized rocket');
 reports.push({id,rocketHeightWorld:size.y,metresToWorld:scale.toArray(),calls,triangles});
}
assert.ok(Math.abs(reports[0].rocketHeightWorld-reports[1].rocketHeightWorld)<1e-10);
console.log(JSON.stringify({ok:true,reports}));
