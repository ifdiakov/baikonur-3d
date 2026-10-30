import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {buildMik112,MIK112} from '../src/mik112.js';
import {frameTuaExhibit} from '../src/tua-exhibit.js';
import {adaptTuaRails,gaugeAt,resolveTuaRailProfile} from '../src/tua-rails.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';

const SOURCE_SHA='304c2317d335a4787d3748fb4e52ae8f537e48e04cf63057e4374f975b6a650e';
const RECOVERY_SHA='1105ff79202b2b42e86cc3150e41e2d4d01667d0b6ae25a72283aabea43c065a';
const assetRoot=new URL('../assets/models/tua/',import.meta.url);
const [manifest,bytes,policy]=await Promise.all([
 readFile(new URL('manifest-v1.json',assetRoot),'utf8').then(JSON.parse),
 readFile(new URL('model-v1.glb',assetRoot)),
 readFile(new URL('../scripts/tua-detail-policy.json',import.meta.url),'utf8').then(JSON.parse)
]);
const near=(actual,expected,tolerance,message)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} != ${expected}`);
const pointNear=(actual,expected,tolerance,message)=>{
 assert.equal(actual.length,expected.length,message+' dimensions');
 actual.forEach((v,i)=>near(v,expected[i],tolerance,`${message}[${i}]`));
};
const sorted=values=>[...values].sort((a,b)=>a-b);
const unique=(values,name)=>{assert.ok(values.every(Number.isInteger),name+' integer IDs');assert.equal(new Set(values).size,values.length,name+' unique IDs');};
assert.equal(manifest.version,'tua-drive-model-v1');
assert.equal(manifest.sourceFile,'Transporter_railroad_assambly.MAX');
assert.equal(manifest.sourceSha256,SOURCE_SHA);assert.equal(policy.sourceSha256,SOURCE_SHA);
assert.equal(manifest.recoverySha256,RECOVERY_SHA);assert.equal(policy.recoverySha256,RECOVERY_SHA);
assert.equal(manifest.assetSha256,createHash('sha256').update(bytes).digest('hex'),'Manifest identifies the exact final binary');
assert.equal(manifest.assetStats.bytes,bytes.length);
assert.deepEqual(manifest.sourceStats,{
 originalNodeCount:2786,recoveredNodeCount:2786,sourceTriangles:137269,sourceMaterials:20,
 selectedNodeCount:2364,selectedMeshCount:2351,selectedTriangles:93800,excludedAssemblyTriangles:43469,
 retainedSourceMeshCount:1431,retainedTriangles:47944,textures:0
});
assert.equal(policy.version,'tua-macro-v1');
const selected=new Set(policy.selection.vehicleSourceIDs),fine=new Set(policy.removeFineSplineSourceIDs);
const protectedIds=policy.runningGear.protectedSourceIDs,protectedSet=new Set(protectedIds);
for(const [name,values]of Object.entries({selected:policy.selection.vehicleSourceIDs,meshes:policy.selection.vehicleMeshSourceIDs,
 fine:policy.removeFineSplineSourceIDs,largerSplines:policy.preserveLargerSplineSourceIDs,protected:protectedIds}))unique(values,name);
assert.equal(selected.size,2364);assert.equal(policy.selection.vehicleMeshSourceIDs.length,2351);
assert.equal(fine.size,920);assert.equal(policy.preserveLargerSplineSourceIDs.length,46);assert.equal(protectedSet.size,320);
for(const id of [...fine,...protectedIds,...policy.preserveLargerSplineSourceIDs])assert.ok(selected.has(id),'Reviewed parts belong to the selected vehicle');
for(const id of [...protectedIds,...policy.preserveLargerSplineSourceIDs])assert.ok(!fine.has(id),'Macro removal must preserve running gear and coarser silhouette rails');
assert.deepEqual(policy.selection.excludedSubtrees.map(row=>row.rootSourceID).sort((a,b)=>a-b),[10355,11898,35293]);
const excludedCount=policy.selection.excludedSubtrees.reduce((sum,row)=>sum+row.sourceNodeCount,0);
assert.equal(excludedCount,422);assert.ok(policy.selection.excludedSubtrees.every(row=>!selected.has(row.rootSourceID)));
assert.equal(selected.size+excludedCount,2786,'The reviewed selection and excluded assemblies account for every source node');
assert.deepEqual(policy.selection.excludedSubtrees.map(row=>[row.sourceNodeCount,row.meshSourceNodeCount,row.nonEmptyMeshSourceNodeCount,row.triangles]),
 [[116,115,115,6358],[116,115,115,6358],[190,187,186,30753]]);
assert.equal(policy.selection.excludedSubtrees.reduce((sum,row)=>sum+row.triangles,0),43469);

const optimization=manifest.optimization,gear=manifest.runningGear;
assert.equal(optimization.profile,'macro');assert.equal(optimization.removedFineObjects,920);
assert.equal(optimization.removedFineTriangles,45856);assert.equal(optimization.decimatedTriangles,0);
assert.equal(optimization.maximumSurfaceErrorLocal,0,'The first display asset retains all selected source surfaces');
assert.equal(manifest.conversion.decimation,false);assert.equal(manifest.conversion.externalResources,false);
assert.equal(optimization.fullReference.triangles,93800);
assert.equal(93800-optimization.removedFineTriangles,manifest.assetStats.triangles);
assert.equal(optimization.protectedRunningGearCount,320);assert.equal(optimization.protectedRunningGearTriangles,10432);
assert.equal(gear.retainedPartCount,320);assert.equal(gear.retainedTriangleCount,10432);
assert.deepEqual(sorted(gear.retainedSourceIDs),sorted(protectedIds));
assert.deepEqual(Object.fromEntries(Object.entries(gear.roles).map(([role,ids])=>[role,ids.length])),{
 wheels:128,axles:64,bogieSideBeams:64,bogieCentralBlocks:32,bogieBalancers:32
});
assert.deepEqual(sorted(Object.values(gear.roles).flat()),sorted(protectedIds));
assert.equal(gear.retentionAudit.beforeVehicleWheels,128);assert.equal(gear.retentionAudit.afterVehicleWheels,128);
assert.equal(gear.retentionAudit.beforeVehicleAxles,64);assert.equal(gear.retentionAudit.afterVehicleAxles,64);
assert.deepEqual(gear.retentionAudit.missingProtectedIDs,[]);
assert.deepEqual(gear.retentionAudit.wheelMaterialTrianglesBefore,{LightBlackMetal:6144});
assert.deepEqual(gear.retentionAudit.wheelMaterialTrianglesAfter,{LightBlackMetal:6144});

// The longitudinal origin is the midpoint of the actual wheel axes, not the
// overall assembly bounds. The source grade is the top of its rail heads.
const normalization=manifest.normalization;
near(normalization.uniformScale,1.14,1e-12,'Single uniform source scale');
pointNear(normalization.physicalOrigin,[-.00146106630563736,-14.5,25.500000713507283],1e-10,'Physical source origin');
near(normalization.rawGlbToPhysicalRotationX,Math.PI/2,1e-12,'Undo source export axis conversion');
pointNear(normalization.rawGlbToLocalMatrixColumnMajor,[
 1.14,0,0,0,0,0,1.14,0,0,-1.14,0,0,.00166561558842659,16.53,-29.070000813398305,1
],1e-10,'Complete affine normalization');
assert.deepEqual(normalization.sourcePhysicalAxes,{up:'+Y',length:'+Z',width:'+X'});
near(normalization.outerMuseumScale,MIK112.scale,1e-12,'Existing MIK scale');
near(normalization.outerMuseumYaw,MIK112.yaw,1e-12,'Existing MIK orientation');
assert.deepEqual(manifest.placements.map(p=>p.position),[[-71,4.305,-183],[-19,4.305,-183]]);
manifest.placements.forEach(p=>near(p.rotationY,Math.PI,1e-12,'Authored vehicle orientation within its existing slot'));
near(gear.localWheelCentreGauge,1.8580424880240016,1e-12,'Measured wheel gauge');
pointNear(gear.localTrackCentreAxesX,[-11.4,11.4],1e-12,'Two track axes');
near(gear.sourceRailHeadY,-14.5,1e-12,'Source rail head reference');

// Check the file itself, including unreferenced glTF entries, before decoding.
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
let gltf=null,chunkCount=0;
for(let offset=12;offset<bytes.length;){
 assert.ok(offset+8<=bytes.length,'Complete GLB chunk header');
 const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
 assert.equal(length%4,0);assert.ok(offset+length<=bytes.length,'Complete GLB chunk payload');
 if(type===0x4e4f534a){assert.equal(gltf,null);gltf=JSON.parse(bytes.subarray(offset,offset+length).toString('utf8').replace(/\0+$/,''));}
 offset+=length;chunkCount++;
}
assert.equal(chunkCount,2);assert.equal(gltf.asset.version,'2.0');
assert.ok(gltf.extensionsUsed.includes('EXT_meshopt_compression'));
function inspectUris(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){
 if(key==='uri')assert.ok(typeof item==='string'&&item.startsWith('data:'),'The asset cannot request external resources');
 if(item&&typeof item==='object')inspectUris(item);
}}
inspectUris(gltf);assert.equal(gltf.images?.length??0,0);assert.equal(gltf.textures?.length??0,0);
assert.ok(bytes.length<1024*1024,'The selected static model remains compact enough for both museum instances');
const scene=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
 bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),assetRoot.href)).scene;
scene.updateWorldMatrix(true,true);
const bounds=new THREE.Box3(),materials=new Set(),materialTriangles={},trianglesData=[],sourceMeshes=[];
let triangleCount=0,vertexCount=0,draws=0;
scene.traverse(mesh=>{
 if(!mesh.isMesh)return;sourceMeshes.push(mesh);
 assert.ok(!mesh.isInstancedMesh,'The one static asset remains independently inspectable');
 assert.ok(mesh.matrixWorld.elements.every(Number.isFinite));
 const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
 assert.ok(position&&position.itemSize===3);assert.ok(index);assert.equal(index.count%3,0);
 for(const attribute of Object.values(geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value),'Finite decoded attributes');
 const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];assert.equal(list.length,1);
 const material=list[0],role=material.userData.sourceMaterialName;assert.equal(role,material.name);
 assert.equal(material.userData.museumComponent,'tua-transporter');materials.add(material);
 for(const value of Object.values(material))assert.ok(!value?.isTexture,'No implicit texture dependencies');
 const points=Array.from({length:position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld));
 for(const point of points){assert.ok(point.toArray().every(Number.isFinite));bounds.expandByPoint(point);}
 for(let i=0;i<index.count;i+=3){
  const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
  assert.ok(ids.every(n=>Number.isInteger(n)&&n>=0&&n<position.count),'Valid decoded triangle indices');
  trianglesData.push({points:ids.map(n=>points[n]),material:role});
 }
 triangleCount+=index.count/3;vertexCount+=position.count;draws+=geometry.groups.length||1;
 materialTriangles[role]=(materialTriangles[role]||0)+index.count/3;
});
assert.equal(triangleCount,47944);assert.equal(triangleCount,manifest.assetStats.triangles);
assert.equal(vertexCount,manifest.assetStats.vertices);assert.equal(draws,manifest.assetStats.primitives);
assert.equal(materials.size,manifest.assetStats.materials);assert.ok(draws<=20&&materials.size<=16);
assert.deepEqual(materialTriangles,manifest.assetStats.materialTriangles);
assert.equal(materialTriangles.Bordo,undefined,'The red payload is excluded by its source subtree');
assert.equal(materialTriangles.BordoLight,192,'Structural pins must survive payload removal');
assert.equal(materialTriangles.LocoGrey,104,'Shared source material names do not identify excluded assemblies');
assert.equal(materialTriangles.LocoRoof,672);
pointNear(bounds.min.toArray(),manifest.bounds.min,.002,'Measured minimum bounds');
pointNear(bounds.max.toArray(),manifest.bounds.max,.002,'Measured maximum bounds');
pointNear(bounds.min.toArray(),[-14.4193339495,-.1402147402,-35.4004204529],.003,'Independent source minimum bounds');
pointNear(bounds.max.toArray(),[14.4226662679,22.0255340691,34.3848268902],.003,'Independent source maximum bounds');

// Independently recover wheels from actual decoded triangles. This detects
// lost or incorrectly decomposed source shear even if a metadata audit claims
// that all IDs survived material batching. Each source wheel is a12-sided
// cylinder:24 wall triangles +24 cap triangles, with its axis along local X.
const bogieSourceZ=[0,3,6,9,12,15,18,21,30,33,36,39,42,45,48,51];
const axleZ=bogieSourceZ.flatMap(z=>[-1,1].map(side=>(z+side*.968352-25.500000713507283)*1.14));
const wheelX=[-12.329021244012,-10.470978755988,10.470978755988,12.329021244012];
const wheelY=(-14.12299537+14.5)*1.14,wheelRadius=.57,halfWheelThickness=.0456;
const wheelGroups=wheelX.flatMap(x=>axleZ.map(z=>({center:new THREE.Vector3(x,wheelY,z),triangles:[],bounds:new THREE.Box3()})));
const axles=[-11.4,11.4].flatMap(x=>axleZ.map(z=>({x,z,triangles:[]})));
const closest=(values,value)=>values.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,values[0]);
for(const triangle of trianglesData){
 const points=triangle.points,centre=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/3);
 if(Math.abs(centre.y-wheelY)>.58)continue;
 const x=closest(wheelX,centre.x),z=closest(axleZ,centre.z);
 const wheel=wheelGroups.find(w=>w.center.x===x&&w.center.z===z);
 if(points.every(p=>Math.abs(p.x-x)<=halfWheelThickness+.006&&Math.hypot(p.y-wheelY,p.z-z)<=wheelRadius+.006)){
  wheel.triangles.push(triangle);points.forEach(p=>wheel.bounds.expandByPoint(p));continue;
 }
 const track=closest([-11.4,11.4],centre.x),span=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));
 if(span>2.25&&span<2.3&&points.every(p=>Math.abs(p.x-track)<1.16&&Math.abs(p.y-wheelY)<.12&&Math.abs(p.z-z)<.105))
  axles.find(a=>a.x===track&&a.z===z).triangles.push(triangle);
}
for(const wheel of wheelGroups){
 assert.equal(wheel.triangles.length,48,'Complete source wheel at '+wheel.center.toArray());
 assert.ok(wheel.triangles.every(t=>t.material==='LightBlackMetal'));
 pointNear(wheel.bounds.getCenter(new THREE.Vector3()).toArray(),wheel.center.toArray(),.004,'Actual wheel centre');
 pointNear(wheel.bounds.getSize(new THREE.Vector3()).toArray(),[.0912,1.14,1.14],.006,'Actual wheel cylinder dimensions');
}
for(const axle of axles){assert.equal(axle.triangles.length,12,'Complete original axle at '+[axle.x,axle.z]);assert.ok(axle.triangles.every(t=>t.material==='LightBlackMetal'));}
assert.equal(wheelGroups.length,128);assert.equal(axles.length,64);
const actualWheels=new THREE.Box3();wheelGroups.forEach(w=>actualWheels.union(w.bounds));
pointNear(actualWheels.min.toArray(),gear.localWheelBounds.min,.004,'Actual wheel minimum bounds');
pointNear(actualWheels.max.toArray(),gear.localWheelBounds.max,.004,'Actual wheel maximum bounds');

// Install the real shared asset into the existing two placement containers,
// then inspect the rendered rails in the complete MIK coordinate system.
const root=new THREE.Group();root.position.set(137,-2.72,-93);root.rotation.y=MIK112.yaw;root.scale.setScalar(MIK112.scale);
const exhibit=buildMik112(root,{year:2026}),slots=[...exhibit.transporterRoots];
const oldRailChildren=[...exhibit.transporterRails.children],entries=exhibit.railEntries.map(p=>[...p]);
const siblings=root.children.filter(object=>object!==exhibit.transporterRails&&object!==exhibit.transportersGroup);
const siblingState=siblings.map(object=>({object,matrix:object.matrixWorld.clone()}));
const models=[scene,scene.clone(true)];
exhibit.replaceTransporters(models,manifest.placements,{...manifest,status:'ready',instanceCount:2});
assert.deepEqual(exhibit.transporterRoots,slots,'Existing selectable containers are retained');
const secondMeshes=[];models[1].traverse(object=>{if(object.isMesh)secondMeshes.push(object);});
assert.equal(secondMeshes.length,sourceMeshes.length);
sourceMeshes.forEach((mesh,i)=>{assert.strictEqual(mesh.geometry,secondMeshes[i].geometry);assert.strictEqual(mesh.material,secondMeshes[i].material);});
const profile=resolveTuaRailProfile(manifest),railReport=adaptTuaRails(exhibit,manifest);
root.updateWorldMatrix(true,true);
assert.equal(railReport.status,'ready');assert.equal(railReport.railCount,8);
assert.deepEqual(exhibit.railEntries,entries);assert.deepEqual(railReport.preservedRailEntries,entries);
assert.ok(oldRailChildren.every(child=>child.parent===null),'All old wide running rails are removed from the dedicated group');
for(const {object,matrix}of siblingState)assert.ok(object.matrixWorld.equals(matrix),'MIK, aprons and unrelated tracks keep their transforms');
assert.strictEqual(adaptTuaRails(exhibit,manifest),railReport,'Repeated adaptation is idempotent');
near(railReport.networkGauge,RAIL_PROFILE.gauge/MIK112.scale,1e-12,'Unchanged network gauge');
near(railReport.runningGauge,1.8580424880240016,1e-12,'Source running gauge');
near(railReport.railHeadY,4.305,1e-12,'Fixed rail head elevation');
const rails=[],sleepers=[];exhibit.transporterRails.traverse(object=>{
 if(object.userData.museumComponent==='transporter-running-rail')rails.push(object);
 if(object.userData.museumComponent==='rail-sleeper')sleepers.push(object);
});
assert.equal(rails.length,8);assert.equal(sleepers.length,1);assert.equal(sleepers[0].count,420);
const inverseRoot=root.matrixWorld.clone().invert();let checkedRailVertices=0;
for(const rail of rails){
 const position=rail.geometry.attributes.position,index=rail.geometry.index,sections=new Map();
 const matrix=inverseRoot.clone().multiply(rail.matrixWorld),railBounds=new THREE.Box3();
 assert.equal(index.count%3,0);
 for(const attribute of Object.values(rail.geometry.attributes))assert.ok([...attribute.array].every(Number.isFinite));
 for(let i=0;i<position.count;i++){
  const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix);railBounds.expandByPoint(p);checkedRailVertices++;
  const key=p.z.toFixed(5);if(!sections.has(key))sections.set(key,[]);sections.get(key).push(p);
 }
 near(railBounds.min.y,4.035,1e-5,'Rail bottom');near(railBounds.max.y,4.305,1e-5,'Rail top');
 near(railBounds.min.z,-258.5,1e-5,'Preserved network endpoint');near(railBounds.max.z,-5.5,1e-5,'Preserved far endpoint');
 const track=rail.userData.trackCenterX,side=rail.userData.railSide;
 for(const [key,points]of sections){
  const z=Number(key),min=Math.min(...points.map(p=>p.x)),max=Math.max(...points.map(p=>p.x));
  near(max-min,.18,2e-5,'Actual rail head width');
  near((min+max)/2,track+side*gaugeAt(z,profile)/2,2e-5,'Rendered rail follows the declared smooth gauge');
 }
 for(const z of [-258.5,-5.5]){
  const points=sections.get(z.toFixed(5));assert.ok(points);
  near((Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,track+side*RAIL_PROFILE.gauge/MIK112.scale/2,2e-5,'Actual fixed external rail end');
 }
}
for(const z of [-258.5,-238,-128,-5.5])near(gaugeAt(z,profile),RAIL_PROFILE.gauge/MIK112.scale,1e-12,'Full network gauge beyond transitions');
for(const z of [-218,-213.743921927,-183,-152.256078088,-148])near(gaugeAt(z,profile),1.8580424880240016,1e-12,'Straight narrow gauge covers every wheel');
for(const [start,end,direction]of [[-238,-218,-1],[-148,-128,1]]){
 let previous=gaugeAt(start,profile);
 for(let z=start+.1;z<end+.001;z+=.1){const next=gaugeAt(z,profile);assert.ok((next-previous)*direction>=-1e-10);assert.ok(Math.abs(next-previous)<.018);previous=next;}
 for(const z of [start,end])near((gaugeAt(z+.0001,profile)-gaugeAt(z-.0001,profile))/.0002,0,1e-5,'Flat gauge tangent at transition endpoint');
}
const instance=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
for(let i=0;i<sleepers[0].count;i++){
 sleepers[0].getMatrixAt(i,instance);assert.ok(instance.elements.every(Number.isFinite));instance.decompose(p,q,s);
 assert.ok(profile.trackCenters.some(x=>Math.abs(x-p.x)<1e-5));
 near(p.y+s.y/2,4.05,1e-5,'Sleeper supports the rail body');
 assert.ok(s.x>gaugeAt(p.z,profile)+.18&&s.x<6.6,'Sleepers cover the rail heads without a wide floating underlay');
}
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);let wheelHeadChecks=0;
const pairBounds=new THREE.Box3(),wheelMikBounds=new THREE.Box3();
for(const slot of slots){
 assert.deepEqual(slot.scale.toArray(),[1,1,1]);
 const localMatrix=inverseRoot.clone().multiply(slot.matrixWorld);
 pairBounds.union(bounds.clone().applyMatrix4(localMatrix));
 for(const wheel of wheelGroups){
  wheelMikBounds.union(wheel.bounds.clone().applyMatrix4(localMatrix));
  for(const x of [wheel.bounds.min.x,wheel.bounds.getCenter(new THREE.Vector3()).x,wheel.bounds.max.x]){
   const onRail=new THREE.Vector3(x,0,wheel.bounds.getCenter(new THREE.Vector3()).z).applyMatrix4(localMatrix);onRail.y=4.305;
   const world=root.localToWorld(onRail.clone());ray.set(world.clone().add(new THREE.Vector3(0,.5,0)),down);
   const hits=ray.intersectObjects(rails,false);
   assert.ok(hits.some(hit=>hit.point.distanceTo(world)<2e-5),'Actual decoded wheel width is fully supported by the rail head');wheelHeadChecks++;
  }
 }
}
pointNear(pairBounds.min.toArray(),[-85.4226662679,4.1647852598,-217.3848268902],.004,'Actual placed pair minimum');
pointNear(pairBounds.max.toArray(),[-4.5806660505,26.3305340691,-147.5995795471],.004,'Actual placed pair maximum');
assert.ok(-123-pairBounds.max.z>24,'The longer source vehicles remain clear of the MIK facade');
assert.ok(52-(bounds.max.x-bounds.min.x)>23,'The two assemblies retain a clear lateral gap');
pointNear([wheelMikBounds.min.z,wheelMikBounds.max.z],[-213.743921927,-152.256078088],.004,'Actual wheel corridor');
near(wheelMikBounds.min.y,4.1647852598,.004,'Preserve the source wheel flange depth below the rail head');
assert.ok(wheelMikBounds.min.z>-218+4.25&&wheelMikBounds.max.z<-148-4.25,'Gauge changes end safely outside all actual wheels');
for(const track of profile.trackCenters)for(const z of [-213,-183,-153])for(const side of [-1,1]){
 const world=root.localToWorld(new THREE.Vector3(track+side*profile.networkGauge/2,4.305,z));
 ray.set(world.clone().add(new THREE.Vector3(0,.5,0)),down);
 assert.equal(ray.intersectObjects(rails,false).length,0,'No obsolete wide rail remains beneath a transporter');
}
exhibit.setYear(1985);assert.equal(exhibit.transportersGroup.visible,false);
exhibit.setYear(1986);assert.equal(exhibit.transportersGroup.visible,true);
exhibit.setYear(2026);assert.equal(exhibit.transportersGroup.visible,true);

for(const aspect of [1600/1100,430/932]){
 const camera=new THREE.PerspectiveCamera(52,aspect,.01,80000);
 const controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
 frameTuaExhibit(root,{...manifest,status:'ready'},camera,controls);
 for(const x of [pairBounds.min.x,pairBounds.max.x])for(const y of [pairBounds.min.y,pairBounds.max.y])for(const z of [pairBounds.min.z,pairBounds.max.z]){
  const screen=root.localToWorld(new THREE.Vector3(x,y,z)).project(camera);
  assert.ok(Math.abs(screen.x)<.96&&Math.abs(screen.y)<.96&&screen.z>-1&&screen.z<1,'Both complete models fit the public camera, including portrait');
 }
}
console.log('TUA_SOURCE_MODEL_PASS',JSON.stringify({version:manifest.version,bytes:bytes.length,draws,materials:materials.size,
 vertices:vertexCount,triangles:triangleCount,wheels:wheelGroups.length,axles:axles.length,protectedParts:protectedIds.length,
 wheelTriangles:wheelGroups.reduce((sum,w)=>sum+w.triangles.length,0),wheelHeadChecks,checkedRailVertices,
 bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},pairBounds:{min:pairBounds.min.toArray(),max:pairBounds.max.toArray()}}));
