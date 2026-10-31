import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {FACILITY_PORTS} from '../src/facility-ports.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';
import {RAIL_METRES} from '../src/rail-profile.js';
import {buildUkssConnections} from '../src/ukss-connections.js';

const sourceSha='2e51706e5267564fba9fd6d90262a2fb67f3d84ccfd7c3a002b23895fc704ebb';
const assetRoot=new URL('../assets/models/ukss/',import.meta.url);
const [manifest,bytes,catalog,detailPolicy]=await Promise.all([
 readFile(new URL('manifest-v2.json',assetRoot),'utf8').then(JSON.parse),
 readFile(new URL('model-v2.glb',assetRoot)),
 readFile(new URL('../data/catalog.json',import.meta.url),'utf8').then(JSON.parse),
 readFile(new URL('../scripts/ukss-detail-policy.json',import.meta.url),'utf8').then(JSON.parse)
]);
const near=(a,b,tolerance,message)=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const pointNear=(a,b,tolerance,message)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>near(v,b[i],tolerance,message+'['+i+']'));};
assert.equal(manifest.version,'ukss-drive-model-v2');
assert.equal(manifest.sourceFile,'ukss_scaled.max');
assert.equal(manifest.sourceSha256,sourceSha);
assert.equal(manifest.assetSha256,createHash('sha256').update(bytes).digest('hex'),'Manifest identifies the exact compressed binary');
assert.deepEqual(Object.fromEntries(Object.keys({originalNodeCount:0,recoveredNodeCount:0,sourceTriangles:0,sourceMaterials:0,removedFlatGroundTriangles:0,mockupTriangles:0,textures:0}).map(key=>[key,manifest.sourceStats[key]])),{
 originalNodeCount:7119,recoveredNodeCount:7119,sourceTriangles:265429,sourceMaterials:28,
 removedFlatGroundTriangles:37,mockupTriangles:30753,textures:0
});
const optimization=manifest.optimization;
assert.equal(optimization.profile,'macro');assert.equal(manifest.conversion.decimation,true);
assert.equal(detailPolicy.sourceSha256,sourceSha);
assert.equal(optimization.removedFineObjects,detailPolicy.removeFineSourceNodeIds.length);
assert.equal(optimization.lightCylinders,detailPolicy.lightCylinderSourceNodeIds.length);
assert.equal(new Set(detailPolicy.removeFineSourceNodeIds).size,detailPolicy.removeFineSourceNodeIds.length);
assert.deepEqual([...optimization.protectedStructureSourceIds].sort((a,b)=>a-b),[...detailPolicy.keepSourceGeometryNodeIds].sort((a,b)=>a-b));
assert.equal(optimization.protectedLatticeCount,63);assert.equal(optimization.protectedFrameCount,2);
assert.equal(new Set(optimization.protectedStructureSourceIds).size,65);
assert.ok(detailPolicy.removeFineSourceNodeIds.every(id=>!optimization.protectedStructureSourceIds.includes(id)),'Reviewed tiny-object removal must not delete the protected structural groups');
near(optimization.maximumSurfaceErrorLocal,detailPolicy.maximumSurfaceErrorLocal,1e-12,'Component simplification tolerance');
assert.ok(optimization.maximumSurfaceErrorLocal>0&&optimization.maximumSurfaceErrorLocal<=.04);
for(const key of ['removedFineTriangles','lightTrianglesRemoved','trianglesRemovedBySimplification'])assert.ok(Number.isInteger(optimization[key])&&optimization[key]>0);
const geometryRemoved=optimization.removedFineTriangles+optimization.lightTrianglesRemoved+optimization.trianglesRemovedBySimplification;
assert.equal(manifest.sourceStats.sourceTriangles-manifest.sourceStats.removedFlatGroundTriangles-geometryRemoved,manifest.sourceStats.retainedTriangles,'Every geometry reduction is accounted for separately from the removed background');
assert.equal(optimization.fullReference.triangles,manifest.sourceStats.sourceTriangles-37);
assert.ok(manifest.sourceStats.retainedTriangles<optimization.fullReference.triangles,'The museum profile reduces real geometry, independently of compression');
assert.ok(bytes.length<optimization.fullReference.bytes,'The adapted binary also improves download size');
near(manifest.normalization.scale,1,1e-12,'Recovered source coordinates remain physical metres');
assert.equal(manifest.normalization.unit,'metre');
near(manifest.normalization.outerMuseumScale,.14,1e-12,'One consistent world scale for metre-valued facilities and rockets');
near(manifest.normalization.outerMuseumYaw,-.56,1e-12,'Established site azimuth');
pointNear(manifest.normalization.origin,[-.00013896613381803036,-.000024069480787147768,-.0004993951451268686],1e-8,'Launch origin');
assert.equal(manifest.normalization.rotationY,0,'Y-up source already agrees with the local launch/trench axes');
const entry=catalog.sites.find(site=>site.id==='pad-250');
assert.equal(entry.model,manifest.version);assert.equal(entry.firstYear,1983);
assert.equal(entry.organisation.org,'ЦЭНКИ');assert.equal(entry.photoArchive.length,16);
assert.equal(entry.source3D.sha256,sourceSha);
assert.equal(entry.source3D.driveId,'1z16hlw1grFyH_MqVk9f4B8Nm48FjX4f7');
const port=FACILITY_PORTS['pad-250'];
near(port.scale,.14,1e-12,'Physical display scale');near(port.yaw,-.56,1e-12,'Existing site orientation');
pointNear(port.road,[-58.14922562912206,.2907461281456103,327.08939416381156],1e-10,'Road network socket expressed in metres');
pointNear(port.rail[0],[-26.167151533104928,2.25328249312848,329.99685544526767],1e-10,'Left network socket expressed in metres');
pointNear(port.rail[1],[26.167151533104928,2.25328249312848,329.99685544526767],1e-10,'Right network socket expressed in metres');
assert.deepEqual(manifest.connections.museumRailSockets,port.rail);
pointNear(manifest.connections.museumRoadSocket,port.road,1e-10,'Asset and shared road socket agree');

// Inspect actual GLB contents before parsing: all runtime geometry lives in one
// binary and compressed buffers use the decoder already shipped by the museum.
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').replace(/\0+$/,''));
assert.equal(gltf.asset.version,'2.0');
assert.ok(gltf.extensionsUsed?.includes('EXT_meshopt_compression'),'The real model must ship with meshopt compression');
function checkUris(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){
 if(key==='uri')assert.ok(typeof item==='string'&&item.startsWith('data:'),'No external geometry or image requests');
 if(item&&typeof item==='object')checkUris(item);
}}
checkUris(gltf);assert.equal(gltf.images?.length??0,0,'The source has material colors, not missing bitmap textures');
assert.ok(bytes.length<6*1024*1024,'A browser-ready asset must be substantially smaller than the 19 MB recovered GLB');
const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const scene=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(arrayBuffer,assetRoot.href)).scene;
scene.updateWorldMatrix(true,true);
const bounds=new THREE.Box3(),point=new THREE.Vector3(),materials=new Set(),trenchPoints=[],sourceRailPoints=[],sourceMeshes=[];
let meshes=0,triangles=0,vertices=0,mockupMeshes=0,mockupTriangles=0,lotokTriangles=0,railTriangles=0,draws=0;
scene.traverse(mesh=>{
 if(!mesh.isMesh)return;
 sourceMeshes.push(mesh);
 assert.equal(mesh.isInstancedMesh,undefined,'Offline batching keeps the source directly inspectable');
 meshes++;const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
 assert.ok(position&&position.itemSize===3);assert.ok(index,'Every compressed surface has explicit triangle indices');
 assert.equal(index.count%3,0);
 assert.ok(mesh.matrixWorld.elements.every(Number.isFinite),'Finite decoded node transform');
 for(const attribute of Object.values(geometry.attributes))for(const value of attribute.array)
  assert.ok(Number.isFinite(value),'Finite decoded geometry attributes');
 for(let i=0;i<index.count;i++)assert.ok(index.getX(i)>=0&&index.getX(i)<position.count,'Decoded indices reference valid vertices');
 const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];
 assert.equal(list.length,1,'Material batches retain one role per rendered mesh');
 const material=list[0];materials.add(material);draws+=geometry.groups.length||1;
 const count=index.count/3;triangles+=count;vertices+=position.count;
 const mockup=material.userData.museumComponent==='ukss-dimensional-mockup';
 if(mockup){mockupMeshes++;mockupTriangles+=count;assert.equal(material.name,'Bordo');}
 if(material.name==='Bordo')assert.ok(mockup,'The red dimensional mockup must stay independently selectable');
 if(material.name==='Lotok')lotokTriangles+=count;
 if(material.name==='Rails')railTriangles+=count;
 for(let i=0;i<position.count;i++){
  point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);
  if(['Lotok','LPad','BlastWalls','Shield'].includes(material.name)&&point.y<-.5)trenchPoints.push(point.clone());
  if(material.name==='Rails')sourceRailPoints.push(point.clone());
 }
});
assert.equal(triangles,manifest.sourceStats.retainedTriangles,'Decoded triangles match the complete geometry reduction accounting');
assert.equal(triangles,manifest.assetStats.triangles);
assert.equal(mockupTriangles,30753,'The protected source mockup retains its coordinated overlapping surfaces');
assert.equal(mockupTriangles,manifest.assetStats.mockupTriangles);
assert.equal(mockupTriangles,manifest.components.dimensionalMockup.triangleCount);
assert.ok(mockupMeshes>0&&mockupMeshes<=2);assert.equal(lotokTriangles,90,'All actual slopes remain after the source background is removed');
assert.equal(railTriangles,80,'The original connection rails are protected from simplification');
assert.equal(gltf.materials.length,28,'All authored material roles remain represented');
assert.ok(draws<=40&&materials.size<=28,'Thousands of source pieces must be batched for interactive use');
for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)assert.ok(Number.isInteger(primitive.material),'Every source surface has an intentional museum material');
pointNear(bounds.min.toArray(),manifest.bounds.min,.03,'Decoded minimum bounds');
pointNear(bounds.max.toArray(),manifest.bounds.max,.03,'Decoded maximum bounds');
near(bounds.max.y,215.151,.03,'The source mast is measured in metres without fitting it to an arbitrary scene height');
assert.ok(bounds.min.x<-526&&bounds.max.x>331&&bounds.min.z<-444&&bounds.max.z>274,'Real extended pipes and transport tracks must not be cropped to the old schematic footprint');

// Independently measured vertices from the complete raw recovery (SHA256
// c07c0b6fc00691f4d1555296ba7f0389b0139306e56599df46e58c38c402776f),
// transformed by each ORIGINAL complete world matrix and translated to the
// launch origin, in physical metres (without the previous display shrink). These 6/16-triangle parts are below the simplification gate.
// Decomposing their affine scale-helper chains before baking used to displace
// vertices by up to 2.19 local units; matching overall bounds missed that bug.
const sourceTransformAnchors=[
 {id:6888,material:'Ferm_grey',point:[-18.73122967965438,27.58517103134563,8.476283226880447]},
 {id:6754,material:'Ferm_grey',point:[-18.73122967965438,24.52802246297131,8.476283226880447]},
 {id:7052,material:'Ferm_grey',point:[-28.72866079336096,27.43843137982975,17.81983880955728]},
 {id:6714,material:'Ferm_grey',point:[-28.72866079336096,24.38128281145544,17.81983880955728]},
 {id:18641,material:'Ferm_lightgrey',point:[-280.2852045105179,0.8964261738976446,-155.2458853808693]},
 {id:23479,material:'Ferm_lightgrey',point:[-480.4989411362757,0.8964329175067492,-155.2452346793945]}
];
const sourceTransformErrors=sourceTransformAnchors.map(anchor=>{
 const expected=new THREE.Vector3(...anchor.point);let distance=Infinity;
 for(const mesh of sourceMeshes){
  if(mesh.material.name!==anchor.material)continue;
  const position=mesh.geometry.attributes.position;
  for(let i=0;i<position.count;i++){
   point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);distance=Math.min(distance,point.distanceTo(expected));
  }
 }
 assert.ok(distance<.018,`Source ${anchor.id} retains its exact affine placement within quantization tolerance: ${distance}`);
 return {sourceId:anchor.id,distance};
});

// The hole follows the source inner boundary, not the much larger outer edge
// of its flat background. Independently check the decoded subgrade surfaces.
const ring=manifest.terrainCutout.polygon;
assert.equal(ring.length,17);assert.ok(ring.every(p=>p.length===2&&p.every(Number.isFinite)));
assert.ok(manifest.terrainCutout.floorY<-35.25&&manifest.terrainCutout.floorY>-35.4);
near(manifest.terrainCutout.floorY,bounds.min.y,.04,'Cutout reaches the deepest source trench geometry');
function inside(x,z){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[j],b=ring[i];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
function boundaryDistance(x,z){let d=Infinity;for(let i=0;i<ring.length;i++){
 const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1];
 const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
 d=Math.min(d,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
}return d;}
assert.ok(trenchPoints.length>100,'The real below-grade surfaces were decoded');
for(const p of trenchPoints)assert.ok(inside(p.x,p.z)||boundaryDistance(p.x,p.z)<.05,'The terrain mask must not cover actual trench surfaces');
assert.ok(inside(0,0)&&inside(150,0)&&!inside(-150,0)&&!inside(0,150),'The cutout covers the launch pit and gas outlet, not the surrounding site');
for(const name of ['overview','tower','trench','top']){
 const camera=manifest.camera[name];assert.ok(camera,'Missing public view '+name);
 assert.ok([...camera.eye,...camera.target].every(Number.isFinite));
 assert.ok(camera.eye[1]>camera.target[1]&&Math.hypot(...camera.eye.map((v,i)=>v-camera.target[i]))>10,'A usable elevated view for '+name);
}

// Recover the four forward source rail ends before any runtime adaptation.
// The archived binary keeps its authored gauge; the following separate checks
// exercise the actual live adaptation and its joins to the common profile.
const sourceEndZ=Math.max(...sourceRailPoints.map(p=>p.z));
const endVertices=sourceRailPoints.filter(p=>Math.abs(p.z-sourceEndZ)<.02).sort((a,b)=>a.x-b.x);
const clusters=[];
for(const p of endVertices){let cluster=clusters.at(-1);if(!cluster||p.x-cluster.at(-1).x>.2)clusters.push(cluster=[]);cluster.push(p);}
assert.equal(clusters.length,4,'The imported approach contains four distinct rail heads');
const sourceHeads=clusters.map(points=>new THREE.Vector3((points[0].x+points.at(-1).x)/2,Math.max(...points.map(p=>p.y)),sourceEndZ));
for(let i=0;i<2;i++){
 const centre=sourceHeads[i*2].clone().add(sourceHeads[i*2+1]).multiplyScalar(.5);
 pointNear(centre.toArray(),manifest.connections.railSourceEndpoints[i],.02,'Manifest endpoint matches actual source rail heads');
 near(sourceHeads[i*2+1].x-sourceHeads[i*2].x,manifest.connections.railSourceGauge,.02,'Actual source gauge');
}
const decodedTrackCentres=[0,1].map(i=>sourceHeads[i*2].clone().add(sourceHeads[i*2+1]).multiplyScalar(.5));
near(decodedTrackCentres[1].x-decodedTrackCentres[0].x,19.997275352478028,.025,'Twenty-metre twin-track spacing independently confirms the metric source scale');
near(sourceHeads[1].x-sourceHeads[0].x,1.650303,.02,'The original binary retains its authored forward gauge');

function bufferHash(geometry){
 const hash=createHash('sha256');
 for(const [name,attribute] of Object.entries(geometry.attributes)){
  hash.update(name+':'+attribute.itemSize+':'+attribute.normalized+':'+attribute.array.constructor.name);
  hash.update(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
 }
 if(geometry.index)hash.update(new Uint8Array(geometry.index.array.buffer,geometry.index.array.byteOffset,geometry.index.array.byteLength));
 return hash.digest('hex');
}
const nonRailBefore=sourceMeshes.filter(mesh=>mesh.material.name!=='Rails').map(mesh=>({mesh,geometry:mesh.geometry,hash:bufferHash(mesh.geometry),matrix:[...mesh.matrixWorld.elements],material:mesh.material}));
const sourceRailMeshes=sourceMeshes.filter(mesh=>mesh.material.name==='Rails');
const railBefore=sourceRailMeshes.map(mesh=>({mesh,geometry:mesh.geometry,hash:bufferHash(mesh.geometry),index:[...mesh.geometry.index.array]}));
function railMembers(meshes){
 const result=[];
 for(const mesh of meshes){
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index,parents=Array.from({length:p.count},(_,i)=>i),find=i=>parents[i]===i?i:(parents[i]=find(parents[i]));
  for(let i=0;i<index.count;i+=3){const a=find(index.getX(i));for(let j=1;j<3;j++)parents[find(index.getX(i+j))]=a;}
  const components=new Map();
  for(let i=0;i<p.count;i++){const key=find(i);if(!components.has(key))components.set(key,[]);components.get(key).push(i);}
  for(const indices of components.values()){
   const points=indices.map(i=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld));
   const bounds=new THREE.Box3().setFromPoints(points);
   result.push({key:mesh.uuid+':'+Math.min(...indices),mesh,indices,points,bounds,centerX:(bounds.min.x+bounds.max.x)/2});
  }
 }
 return result;
}
const originalMembers=railMembers(sourceRailMeshes);
assert.equal(originalMembers.length,8,'The actual Rails batch contains four rear and four forward members');
assert(originalMembers.every(member=>member.indices.length===8),'Each protected member is a connected box');
const forwardOriginal=originalMembers.filter(member=>Math.abs(member.bounds.max.z-sourceEndZ)<.02).sort((a,b)=>a.centerX-b.centerX);
const rearOriginal=originalMembers.filter(member=>member.bounds.min.z<-400).sort((a,b)=>a.centerX-b.centerX);
assert.equal(forwardOriginal.length,4);assert.equal(rearOriginal.length,4);
near(rearOriginal[1].centerX-rearOriginal[0].centerX,1.019811,.001,'The distinct rear corridor is identified independently');
near(RAIL_METRES.gauge,1.52,1e-12,'Requested common gauge');near(RAIL_METRES.headWidth,.20,1e-12,'Requested rail-head width');near(RAIL_METRES.railHeight,.27,1e-12,'Common rail profile height');

// Attach the decoded model, exactly as production does. An empty adapter root
// would miss changes to the quantized source attribute and its rear corridor.
const connectionsRoot=new THREE.Group();connectionsRoot.add(scene);
const connection=buildUkssConnections(connectionsRoot,manifest.connections);
connectionsRoot.updateWorldMatrix(true,true);
assert.equal(connection.connected,true);assert.equal(connection.version,'ukss-source-connections-v3');
assert.equal(connection.sourceGeometryStretched,true,'Only the explicitly tagged running rails are adapted at runtime');
assert.equal(connection.sourceStructuresStretched,false);
assert.equal(connection.railAdaptation.version,'uniform-metric-rail-v1');assert.equal(connection.railAdaptation.railMembers,8);
assert.equal(connection.railAdaptation.railMeshes,1);assert.equal(connection.railAdaptation.vertices,64);
assert.equal(connection.railAdaptation.trackCenters.length,4);assert.equal(connection.railAdaptation.headEndpoints.length,2);
for(const before of nonRailBefore){
 assert.equal(before.mesh.geometry,before.geometry,'Architecture keeps its original geometry object');
 assert.equal(bufferHash(before.mesh.geometry),before.hash,'All non-Rails source buffers are byte-for-byte unchanged');
 assert.deepEqual(before.mesh.matrixWorld.elements,before.matrix,'No source structure is moved or stretched');assert.equal(before.mesh.material,before.material);
}
for(const before of railBefore){
 assert.notEqual(before.mesh.geometry,before.geometry,'Runtime adaptation owns a cloned rail geometry');
 assert.equal(bufferHash(before.geometry),before.hash,'The retained decoded source buffer remains unchanged');
 assert.deepEqual([...before.mesh.geometry.index.array],before.index,'Rail triangle topology is preserved');
 assert(before.mesh.geometry.attributes.position.array instanceof Float32Array,'Metre-valued rail coordinates cannot be re-quantized into a normalized integer attribute');
 assert.equal(before.mesh.geometry.attributes.position.normalized,false);
}
const adaptedMembers=railMembers(sourceRailMeshes),adaptedByKey=new Map(adaptedMembers.map(member=>[member.key,member]));
assert.equal(adaptedMembers.length,8);
const memberRay=new THREE.Raycaster(),sourceProfileProbes=[];
for(const before of originalMembers){
 const after=adaptedByKey.get(before.key);assert(after);assert.deepEqual(after.indices,before.indices);
 near(after.bounds.max.x-after.bounds.min.x,.20,5e-6,'Actual adapted source head width');
 near(after.bounds.max.y-after.bounds.min.y,.27,1e-6,'Actual adapted source rail height');
 near(after.bounds.max.y,before.bounds.max.y,1e-6,'Every individual source rail keeps its contact elevation');
 near(after.bounds.min.z,before.bounds.min.z,3e-5,'Source rail near extent is unchanged');near(after.bounds.max.z,before.bounds.max.z,3e-5,'Source rail far extent is unchanged');
 for(const t of [.1,.5,.9])for(const offset of [-.095,0,.095]){
  const z=THREE.MathUtils.lerp(after.bounds.min.z,after.bounds.max.z,t),origin=new THREE.Vector3(after.centerX+offset,after.bounds.max.y+1,z);
  memberRay.set(origin,new THREE.Vector3(0,-1,0));memberRay.near=0;memberRay.far=2;
  const hit=memberRay.intersectObjects(sourceRailMeshes,false)[0];assert(hit,'A source rail head supports its full20cm width');
  near(hit.point.y,before.bounds.max.y,2e-6,'Actual adapted top triangle retains source height');sourceProfileProbes.push(hit.point.toArray());
 }
 for(const side of [-1,1]){
  memberRay.set(new THREE.Vector3(after.centerX+side*.11,after.bounds.max.y+1,(after.bounds.min.z+after.bounds.max.z)/2),new THREE.Vector3(0,-1,0));
  assert.equal(memberRay.intersectObjects(sourceRailMeshes,false).length,0,'The source head does not grow beyond20cm');
 }
}
for(const originalGroup of [rearOriginal,forwardOriginal])for(let i=0;i<4;i+=2){
 const [left,right]=originalGroup.slice(i,i+2),a=adaptedByKey.get(left.key),b=adaptedByKey.get(right.key);
 near(b.centerX-a.centerX,1.52,5e-6,'Each actual source track has the common gauge');
 near((a.centerX+b.centerX)/2,(left.centerX+right.centerX)/2,3e-6,'The separate rear/forward track axes remain where the source placed them');
}
const adaptedForward=forwardOriginal.map(member=>adaptedByKey.get(member.key)).sort((a,b)=>a.centerX-b.centerX);
const adaptedHeads=adaptedForward.map(member=>new THREE.Vector3(member.centerX,member.bounds.max.y,member.bounds.max.z));
assert.equal(connection.railTracks.length,2);assert.equal(connection.road.sourcePlatformId,25196);
for(const [i,track] of connection.railTracks.entries()){
 assert.ok(track.sourceGap<1e-8);assert.ok(track.socketGap<1e-8);assert.deepEqual(track.sourceManifestEndpoint,manifest.connections.railSourceEndpoints[i]);
 const decoded=adaptedHeads[i*2].clone().add(adaptedHeads[i*2+1]).multiplyScalar(.5);
 pointNear(track.sourceEndpoint,decoded.toArray(),3e-5,'Adapter starts at the actual decoded running surface');
 near(track.sourceQuantizationGap,new THREE.Vector3(...track.sourceManifestEndpoint).distanceTo(decoded),3e-5,'Manifest quantization is accounted for separately from physical joins');
}
const adapterGroup=connectionsRoot.getObjectByName('УКСС · стыки с дорогами музея');assert(adapterGroup);
const adapterMeshes=[];adapterGroup.traverse(object=>{if(object.isMesh)adapterMeshes.push(object);});
const railMeshes=adapterMeshes.filter(mesh=>mesh.name==='УКСС · непрерывный рельс');
assert.equal(railMeshes.length,4);
function extremeSection(mesh,axis,maximum){
 const attribute=mesh.geometry.attributes.position,points=[];
 for(let i=0;i<attribute.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld));
 const value=(maximum?Math.max:Math.min)(...points.map(p=>p[axis])),all=points.filter(p=>Math.abs(p[axis]-value)<.001),top=Math.max(...all.map(p=>p.y)),section=all.filter(p=>Math.abs(p.y-top)<1e-5);
 assert.ok(section.length>=2,'The actual ribbon has a complete end cross-section');
 const bounds=new THREE.Box3().setFromPoints(section);return new THREE.Vector3((bounds.min.x+bounds.max.x)/2,top,(bounds.min.z+bounds.max.z)/2);
}
const renderedSourceHeads=railMeshes.map(mesh=>extremeSection(mesh,'z',false)).sort((a,b)=>a.x-b.x);
const renderedNetworkHeads=railMeshes.map(mesh=>extremeSection(mesh,'z',true)).sort((a,b)=>a.x-b.x);
for(let i=0;i<4;i++)near(renderedSourceHeads[i].distanceTo(adaptedHeads[i]),0,3e-5,'Actual adapter/adapted-source head join');
const networkHeads=port.rail.flatMap(socket=>[-1,1].map(side=>new THREE.Vector3(
 socket[0]+side*RAIL_PROFILE.gauge/(2*port.scale),socket[1],socket[2]
))).sort((a,b)=>a.x-b.x);
for(let i=0;i<4;i++)near(renderedNetworkHeads[i].distanceTo(networkHeads[i]),0,.0002,'Actual adapter/network head join');
const seamRay=new THREE.Raycaster(),seamProbes=[];
for(let i=0;i<4;i++){
 const sourceHead=adaptedHeads[i],networkHead=networkHeads[i];
 for(const offset of [-.095,0,.095]){
  for(const dz of [-.003,0,.003]){
   seamRay.set(sourceHead.clone().add(new THREE.Vector3(offset,.8,dz)),new THREE.Vector3(0,-1,0));seamRay.near=0;seamRay.far=1.2;
   const hit=seamRay.intersectObjects([...sourceRailMeshes,...railMeshes],false)[0];assert(hit,'No gap across the complete source-to-adapter running head');
   near(hit.point.y,sourceHead.y,3e-5,'Physical source seam has no quantization step');seamProbes.push(hit.point.toArray());
  }
  for(const dz of [-.003,0]){
   seamRay.set(networkHead.clone().add(new THREE.Vector3(offset,.8,dz)),new THREE.Vector3(0,-1,0));
   const hit=seamRay.intersectObjects(railMeshes,false)[0];assert(hit,'Adapter top reaches the declared network head over its full width');
   near(hit.point.y,networkHead.y,3e-5,'Physical adapter top meets the network socket');seamProbes.push(hit.point.toArray());
  }
 }
}
let sideWallProbes=0;
for(const mesh of railMeshes){
 const sourceHead=extremeSection(mesh,'z',false),networkHead=extremeSection(mesh,'z',true),attribute=mesh.geometry.attributes.position;
 for(const [head,sign] of [[sourceHead,1],[networkHead,-1]]){
  const section=[];for(let i=0;i<attribute.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld);if(Math.abs(p.z-head.z)<.001)section.push(p);
  }
  const box=new THREE.Box3().setFromPoints(section);near(box.max.x-box.min.x,.20,5e-6,'Adapter end has the same20cm head width');near(box.max.y-box.min.y,.27,2e-6,'Adapter end has the full27cm rail height');
  for(const side of [-1,1]){
   // Sample immediately inside the end plane: farther along the curved
   // piece, a world-X cross-section is oblique to its true rail width.
   seamRay.set(head.clone().add(new THREE.Vector3(side*.15,-.13,sign*.00001)),new THREE.Vector3(-side,0,0));seamRay.near=0;seamRay.far=.1;
   const hit=seamRay.intersectObject(mesh,false)[0];assert(hit,'The27cm profile has actual rendered side-wall triangles');near(Math.abs(hit.point.x-head.x),.10,3e-5,'Actual adapter side wall is at the shared head width');sideWallProbes++;
  }
 }
}
const road=adapterMeshes.find(mesh=>mesh.name==='УКСС · подъезд к площадке');assert.ok(road);
// Recover boundary edges from triangle adjacency. The two full-width terminal
// edges are longer than the finely sampled side segments; this avoids assuming
// that a curved road's greatest X coordinate is its actual end.
const roadIndex=road.geometry.index,roadPosition=road.geometry.attributes.position,roadEdges=new Map();
for(let i=0;i<roadIndex.count;i+=3)for(let j=0;j<3;j++){
 const a=roadIndex.getX(i+j),b=roadIndex.getX(i+(j+1)%3),key=[a,b].sort((x,y)=>x-y).join(':');
 const old=roadEdges.get(key);roadEdges.set(key,{a,b,count:(old?.count??0)+1});
}
const roadBoundary=[...roadEdges.values()].filter(edge=>edge.count===1).map(edge=>{
 const a=new THREE.Vector3().fromBufferAttribute(roadPosition,edge.a).applyMatrix4(road.matrixWorld);
 const b=new THREE.Vector3().fromBufferAttribute(roadPosition,edge.b).applyMatrix4(road.matrixWorld);
 return {length:a.distanceTo(b),midpoint:a.clone().add(b).multiplyScalar(.5)};
}).sort((a,b)=>b.length-a.length);
near(roadBoundary[0].length,roadBoundary[1].length,1e-4,'The road has two full-width terminal edges');
assert.ok(roadBoundary[1].length>roadBoundary[2].length*1.1);
const roadSocket=new THREE.Vector3(...port.road);
const roadEnds=roadBoundary.slice(0,2).map(edge=>edge.midpoint).sort((a,b)=>a.distanceTo(roadSocket)-b.distanceTo(roadSocket));
const [roadNetwork,roadPlatform]=roadEnds;
pointNear(roadNetwork.toArray(),port.road,1e-5,'Actual road surface reaches the fixed network socket');
const ray=new THREE.Raycaster(roadPlatform.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),0,2);
const platformHits=ray.intersectObjects(sourceMeshes,false);
assert.ok(platformHits.some(hit=>Math.abs(hit.point.y-roadPlatform.y)<.03),'The actual road surface meets the decoded source concrete platform');

// Inspect every rendered adapter triangle, including sleeper instances. A
// curved connection must never bridge over the exposed launch pit by accident.
function crosses(a,b,c,d){
 const orient=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
 return orient(a,b,c)*orient(a,b,d)<-1e-8&&orient(c,d,a)*orient(c,d,b)<-1e-8;
}
const boundary=ring.map(([x,z])=>new THREE.Vector3(x,0,z));
const instance=new THREE.Matrix4();let adapterTriangles=0;
for(const mesh of adapterMeshes){
 const geometry=mesh.geometry,attribute=geometry.attributes.position,index=geometry.index,count=mesh.isInstancedMesh?mesh.count:1;
 for(let n=0;n<count;n++){
  const matrix=mesh.matrixWorld.clone();if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);matrix.multiply(instance);}
  assert.ok(matrix.elements.every(Number.isFinite),'Finite connection instance');
  for(let i=0;i<(index?.count??attribute.count);i+=3){
   const triangle=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(attribute,index?index.getX(i+j):i+j).applyMatrix4(matrix));
   adapterTriangles++;
   for(const p of triangle)assert.ok(p.toArray().every(Number.isFinite)&&!inside(p.x,p.z),'The actual adapter vertices stay outside the trench');
   const centre=triangle.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/3);
   assert.ok(!inside(centre.x,centre.z),'No connection triangle covers the trench interior');
   for(let e=0;e<3;e++)for(let b=0;b<boundary.length;b++)
    assert.ok(!crosses(triangle[e],triangle[(e+1)%3],boundary[b],boundary[(b+1)%boundary.length]),'No connection edge crosses the trench boundary');
  }
 }
}
assert.ok(adapterTriangles>100,'Actual connecting surfaces and sleepers were inspected');
console.log('UKSS_SOURCE_MODEL_PASS',JSON.stringify({version:manifest.version,bytes:bytes.length,meshes,draws,materials:materials.size,vertices,triangles,mockupTriangles,lotokTriangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},sourceTransformErrors,checkedSubgradeVertices:trenchPoints.length,adapterTriangles,sourceRailMembers:adaptedMembers.length,sourceProfileProbes:sourceProfileProbes.length,seamProbes:seamProbes.length,sideWallProbes,railSourceJoins:renderedSourceHeads.map((p,i)=>p.distanceTo(adaptedHeads[i])),railNetworkJoins:renderedNetworkHeads.map((p,i)=>p.distanceTo(networkHeads[i])),sourceQuantizationGaps:connection.railTracks.map(track=>track.sourceQuantizationGap),roadPlatform:roadPlatform.toArray()}));
