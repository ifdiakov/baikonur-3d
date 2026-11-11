import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createEnergiaRocketExhaust,ENERGIA_NOZZLE_ANCHORS} from '../src/energia-rocket-exhaust.js';
import {sampleEnergiaEnginePlumes} from '../src/energia-polyus-launch.js';
import {createEnergiaBuranEffects,sampleEnergiaBuranEffects} from '../src/energia-buran-effects.js';

// Canvas is needed only to supply procedural texture pixels. All geometry,
// transforms, materials and ownership below use the real Three.js classes.
const canvasCalls=[];
globalThis.document={createElement(tag){
 assert.equal(tag,'canvas');
 const canvas={width:0,height:0};
 canvas.getContext=()=>({
  createRadialGradient(...args){
   canvasCalls.push(['gradient',...args]);
   return {addColorStop(...stop){canvasCalls.push(['stop',...stop]);}};
  },
  fillRect(...args){canvasCalls.push(['fill',...args]);},
  createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
  putImageData(){}
 });
 return canvas;
}};
const sha=value=>createHash('sha256').update(value).digest('hex');
const roundedJSON=value=>JSON.stringify(value,(_key,item)=>typeof item==='number'?Number(item.toFixed(9)):item);
function geometryDigest(group){
 const hash=createHash('sha256');
 for(const child of group.children)if(child.isMesh){
  hash.update(JSON.stringify(child.geometry.parameters));
  for(const attribute of Object.values(child.geometry.attributes)){
   hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
  }
  const index=child.geometry.index;
  if(index)hash.update(Buffer.from(index.array.buffer,index.array.byteOffset,index.array.byteLength));
 }
 return hash.digest('hex');
}
function appearanceDigest(group){
 return sha(JSON.stringify(group.children.filter(child=>child.isMesh).map(child=>{
  const material=child.material;
  return {tint:material.uniforms.uTint.value.getHexString(),blending:material.blending,
   depthTest:material.depthTest,depthWrite:material.depthWrite,side:material.side,
   transparent:material.transparent,toneMapped:material.toneMapped,renderOrder:child.renderOrder};
 })));
}
function poseDigest(group){
 return sha(roundedJSON(group.children.map(child=>({kind:child.type,name:child.name,
  position:child.position.toArray(),scale:child.scale.toArray(),visible:child.visible,
  renderOrder:child.renderOrder,power:child.material?.uniforms?.uPower?.value??null,
  time:child.material?.uniforms?.uTime?.value??null,opacity:child.material?.opacity??null,
  intensity:child.intensity??null,distance:child.distance??null}))));
}

const site=new THREE.Group(),rocket=new THREE.Group();site.add(rocket);
const modelGeometry=new THREE.BoxGeometry(3,60,3),modelMaterial=new THREE.MeshBasicMaterial();
const model=new THREE.Mesh(modelGeometry,modelMaterial);rocket.add(model);
let modelGeometryDisposed=false,modelMaterialDisposed=false;
modelGeometry.addEventListener('dispose',()=>{modelGeometryDisposed=true;});
modelMaterial.addEventListener('dispose',()=>{modelMaterialDisposed=true;});
const exhaust=createEnergiaRocketExhaust({rocket});
assert.equal(exhaust.root.children.filter(child=>child.isMesh).length,32);
assert.equal(exhaust.root.children.filter(child=>child.isSprite).length,8);
assert.equal(exhaust.root.children.filter(child=>child.isPointLight).length,1);
assert.deepEqual(canvasCalls,[['gradient',64,64,0,64,64,64],
 ['stop',0,'rgba(255,255,255,.98)'],['stop',.16,'rgba(255,255,255,.74)'],
 ['stop',.46,'rgba(255,255,255,.17)'],['stop',.79,'rgba(255,255,255,.02)'],
 ['stop',1,'rgba(255,255,255,0)'],['fill',0,0,128,128]]);

// Goldens recorded from the actual addEffectSystem in main 7db5b3f before
// extraction, using Three 0.160.1. They cover vertex/index buffers, calibrated
// materials, all mesh/sprite/light poses and engine uniforms, not declarations.
assert.equal(geometryDigest(exhaust.root),'b775d5f6d68814fa945175427bd9b2c8d691441d93ce830f73b3f5aadba3a3a6');
assert.equal(appearanceDigest(exhaust.root),'ce42329ac67d63daf585eb634736f28903f3310003e1356ab259de5b1c4173a0');
const originalPoses=[
 [-90,'0e4c8f6ca082ca72d6aa20ce55bd758c4ea5febb5b6f4cecaa947e73117579f0'],
 [-9.4,'8ccc53c5917c27f42a9ff78962bf56082c6d641c3350865807975be54396bb91'],
 [-7.4,'65ea8f2fb0482332f54ed89df80c64aca54086d395674321b4f0d52d10503d52'],
 [-3.2,'d7175d8954c40cf1131ce035606810185ed9ed0ca5e19d570c99cd5f661700c4'],
 [-1.6,'e58c6b477bc2569e3351d75b8f6eea4caa82e606d11d1e5c1050322a0a11fd3c'],
 [0,'0b735f0ce8e7f80568583c6ba90b773c966db33c682a8d09ed89d0571059c07f'],
 [6,'32a3d165e15742ff567cb3a3667545971b435d8ac1b70d22419f98e16a91b79d'],
 [145,'c1719b6aacb7210342de6de7e285ac731bd6e0c9d840ae159255973481ecd925'],
 [146,'ff7b6a2c0d2fa9bcafef8552b6b2f18e315eb3cb8440c9d4d88e6b272b8d9066'],
 [468.4,'a24ec55562f09944d1f9329133986e8a5748f18dce0b3750e567d078d09b18dc'],
 [469.2,'68cfff403a39050812c5e9ff6ac813b447871f07f7f16f92989992535f5371fd']
];
for(const [time,expected]of originalPoses){
 const state=exhaust.seek({time,...sampleEnergiaEnginePlumes(time)});
 assert.equal(poseDigest(exhaust.root),expected,`UKSS exhaust must retain its original appearance at T${time}`);
 assert.ok(state.engineUpperFlameLimitY<=-.419999999,'No flicker moves a plume above its nozzle');
 assert.ok(state.engineHaloUpperLimitY<0,'The compact glow remains below the nozzle plane');
 assert.equal(state.engineFlameDepthTest,true);
 assert.equal(state.engineFlameDepthCompatible,true);
}

site.position.set(14,-2.72,-37);site.scale.setScalar(.14);site.rotation.y=.34;
rocket.position.set(-203.912076924,5.4,-136.696646256);
rocket.rotation.set(.12,2.611592653589793,.035);
const flying=exhaust.seek({time:3,core:1,boosters:1});
for(let index=0;index<ENERGIA_NOZZLE_ANCHORS.length;index++){
 const expected=rocket.localToWorld(new THREE.Vector3(...ENERGIA_NOZZLE_ANCHORS[index].position));
 assert.ok(expected.distanceTo(new THREE.Vector3(...flying.nozzleAnchorsWorld[index].worldPosition))<1e-10,
  'World anchors inherit the actual mount yaw, pitch, roll and metre scale');
}
rocket.clear();rocket.add(model);
exhaust.seek({time:3,core:1,boosters:1});
assert.equal(rocket.children.filter(child=>child===exhaust.root).length,1,'GLB reload reattaches one existing effect');
exhaust.hide();assert.equal(exhaust.stats().engineNozzleGlowVisible,0);
assert.equal(exhaust.stats().movingLightIntensity,0);
exhaust.dispose();exhaust.dispose();
assert.equal(exhaust.stats().disposed,true);assert.equal(exhaust.root.parent,null);
assert.equal(exhaust.stats().engineMeshCount,0);assert.equal(exhaust.stats().engineNozzleGlowVisible,0);
assert.equal(model.parent,rocket);assert.equal(modelGeometryDisposed,false);assert.equal(modelMaterialDisposed,false);
console.log('ENERGIA_EXHAUST_PARITY_PASS '+JSON.stringify({poses:originalPoses.length,meshes:32,glows:8}));

const channels=[
 {id:'north-east',throat:[-199.912076924,-23,-129.7684430257245],outlet:[-136.912076924,0,-20.649242148885236],width:12},
 {id:'west',throat:[-211.912076924,-23,-136.696646256],outlet:[-337.912076924,0,-136.696646256],width:12},
 {id:'south-east',throat:[-199.912076924,-23,-143.6248494862755],outlet:[-136.912076924,0,-252.74405036311478],width:12}
];
const camera=new THREE.PerspectiveCamera(45,1,.1,10000);
const fx=createEnergiaBuranEffects({root:site,rocket,camera,channels});
const idle=fx.seek(sampleEnergiaBuranEffects(-90));
assert.equal(idle.visibleSmokeInstances,0);assert.equal(idle.engine.engineNozzleGlowVisible,0);
const coreOnly=fx.seek(sampleEnergiaBuranEffects(-8));
assert.ok(coreOnly.engine.engineCorePower>0&&coreOnly.engine.engineCorePower<1);
assert.equal(coreOnly.engine.engineBoosterPower,0);assert.equal(coreOnly.engine.engineNozzleGlowVisible,4);
assert.ok(coreOnly.channels.every(channel=>channel.visibleEmitters>0));
const main=fx.seek(sampleEnergiaBuranEffects(-2));
assert.ok(main.engine.engineCorePower>.99&&main.engine.engineBoosterPower>.98);
assert.equal(main.engine.engineNozzleGlowVisible,8);
const lift=fx.seek(sampleEnergiaBuranEffects(3,{altitudeMetres:12}));
assert.equal(lift.engine.engineCorePower,1);assert.equal(lift.engine.engineBoosterPower,1);
const gasMeshes=fx.root.children.filter(child=>child.isMesh&&!child.isInstancedMesh);
assert.equal(gasMeshes.length,15);assert.equal(new Set(gasMeshes.map(mesh=>mesh.geometry)).size,1);
assert.equal(new Set(gasMeshes.map(mesh=>mesh.material)).size,1);
assert.ok(gasMeshes.every(mesh=>mesh.geometry.type==='CylinderGeometry'&&mesh.geometry.parameters.openEnded));
for(const [index,channel]of lift.channels.entries()){
 assert.equal(channel.emitterCount,5);assert.equal(channel.visibleEmitters,5);
 const expectedStart=site.localToWorld(new THREE.Vector3(...channels[index].throat));
 const expectedEnd=site.localToWorld(new THREE.Vector3(...channels[index].outlet));
 const expectedDirection=expectedEnd.clone().sub(expectedStart).normalize();
 assert.ok(expectedStart.distanceTo(new THREE.Vector3(...channel.worldThroat))<1e-10);
 assert.ok(expectedEnd.distanceTo(new THREE.Vector3(...channel.worldOutlet))<1e-10);
 let previousDistance=-Infinity;
 for(const emitter of channel.emitters){
  const direction=new THREE.Vector3(...emitter.worldDirection);
  assert.ok(direction.dot(expectedDirection)>.999999999,'Each actual mesh points down its own ramp');
  const local=site.worldToLocal(new THREE.Vector3(...emitter.worldPosition));
  const start=new THREE.Vector3(...channels[index].throat),end=new THREE.Vector3(...channels[index].outlet);
  const horizontal=end.clone().sub(start);horizontal.y=0;
  const along=local.clone().sub(start).dot(horizontal)/horizontal.lengthSq();
  const floor=start.y+(end.y-start.y)*along;
  assert.ok(along>0&&along<1&&along>previousDistance,'Gas emitters progress from the throat to the real outlet');
  previousDistance=along;
  const sideError=Math.abs((local.x-start.x)*horizontal.z-(local.z-start.z)*horizontal.x)/horizontal.length();
  assert.ok(sideError<channels[index].width/2,'The actual source stays within the channel');
  assert.ok(local.y>floor+.5&&local.y<floor+5,'The stream originates above the sloped concrete floor');
  assert.equal(emitter.depthTest,true);
 }
}
assert.equal(lift.engine.movingLightIntensity,165,'Site 110 attenuates its own moving light without changing the UKSS calibration');
assert.ok(lift.lightIntensities.every(value=>value>0&&value<=5.5),'Reflected ground light preserves the concrete channel edges');
const particleMeshes=fx.root.children.filter(child=>child.isInstancedMesh);
assert.equal(particleMeshes.length,1,'Smoke and water reuse a single instanced batch');
const particles=particleMeshes[0],alpha=particles.geometry.getAttribute('aSmokeDensity');
let particleDisposeEvents=0;
particles.addEventListener('dispose',()=>{particleDisposeEvents++;});
assert.ok(particles.count<=800);assert.equal(particles.geometry.type,'PlaneGeometry');
assert.equal(particles.material.depthTest,true);assert.equal(particles.material.depthWrite,false);
assert.ok(alpha.array.some(value=>value>0)&&alpha.array.every(value=>value>=0&&value<=1));
assert.ok(particles.instanceMatrix.array.every(Number.isFinite));
const particleState=()=>sha(Buffer.concat([Buffer.from(particles.instanceMatrix.array.buffer),Buffer.from(alpha.array.buffer)]));
const originalParticles=particleState();fx.seek(sampleEnergiaBuranEffects(-50));
assert.equal(fx.seek(sampleEnergiaBuranEffects(3,{altitudeMetres:12})).engine.movingLightIntensity,165,
 'Repeated seeks reset source light power before the Site 110 attenuation');
assert.equal(particleState(),originalParticles,'Backward seeking reconstructs the same particle matrices and density');
const independent=fx.seek({time:3,altitudeMetres:12,engine:{core:1,boosters:1},ground:{}});
assert.equal(independent.engine.engineNozzleGlowVisible,8);
assert.ok(independent.channels.every(channel=>channel.visibleEmitters===0));
assert.equal(independent.visibleSmokeInstances,0);assert.ok(independent.lightIntensities.every(value=>value===0));
rocket.position.y+=850;
const airborne=fx.seek(sampleEnergiaBuranEffects(75,{altitudeMetres:25000}));
assert.equal(airborne.engine.engineNozzleGlowVisible,8,'No 1987 engine cutoff leaks into the 1988 episode');
assert.ok(airborne.channels.every(channel=>channel.visibleEmitters===0));
assert.ok(airborne.visibleSmokeInstances>0&&airborne.visibleSmokeInstances<=144,'Only the moving plume remains high above the ground');
fx.hide();const hidden=fx.stats();
assert.equal(hidden.visible,false);assert.equal(hidden.visibleSmokeInstances,0);
assert.ok(hidden.channels.every(channel=>channel.visibleEmitters===0));
assert.ok(hidden.lightIntensities.every(value=>value===0));
fx.dispose();fx.dispose();const disposed=fx.stats();
assert.equal(particleDisposeEvents,1,'Owned instance matrix/colour GPU buffers receive exactly one dispose event');
assert.equal(disposed.disposed,true);assert.equal(disposed.visible,false);assert.equal(disposed.smokeInstances,0);
assert.ok(disposed.channels.every(channel=>channel.emitterCount===0&&channel.visibleEmitters===0));
assert.equal(disposed.engine.engineMeshCount,0);assert.equal(disposed.engine.engineFlameAttached,false);
assert.equal(model.parent,rocket);assert.equal(modelGeometryDisposed,false);assert.equal(modelMaterialDisposed,false);
console.log('ENERGIA_BURAN_CHANNEL_GEOMETRY_PASS '+JSON.stringify({channels:3,gasMeshes:15,smokeInstances:particles.count}));
