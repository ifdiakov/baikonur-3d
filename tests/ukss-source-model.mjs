import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {FACILITY_PORTS} from '../src/facility-ports.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';
import {buildUkssConnections} from '../src/ukss-connections.js';

const sourceSha='2e51706e5267564fba9fd6d90262a2fb67f3d84ccfd7c3a002b23895fc704ebb';
const assetRoot=new URL('../assets/models/ukss/',import.meta.url);
const [manifest,bytes,catalog,detailPolicy]=await Promise.all([
 readFile(new URL('manifest-v1.json',assetRoot),'utf8').then(JSON.parse),
 readFile(new URL('model-v1.glb',assetRoot)),
 readFile(new URL('../data/catalog.json',import.meta.url),'utf8').then(JSON.parse),
 readFile(new URL('../scripts/ukss-detail-policy.json',import.meta.url),'utf8').then(JSON.parse)
]);
const near=(a,b,tolerance,message)=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const pointNear=(a,b,tolerance,message)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>near(v,b[i],tolerance,message+'['+i+']'));};
assert.equal(manifest.version,'ukss-drive-model-v1');
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
near(manifest.normalization.scale,.687885342706393,1e-12,'Uniform source-to-museum scale');
pointNear(manifest.normalization.origin,[-.00013896613381803036,-.000024069480787147768,-.0004993951451268686],1e-8,'Launch origin');
assert.equal(manifest.normalization.rotationY,0,'Y-up source already agrees with the local launch/trench axes');
const entry=catalog.sites.find(site=>site.id==='pad-250');
assert.equal(entry.model,manifest.version);assert.equal(entry.firstYear,1983);
assert.equal(entry.organisation.org,'ЦЭНКИ');assert.equal(entry.photoArchive.length,16);
assert.equal(entry.source3D.sha256,sourceSha);
assert.equal(entry.source3D.driveId,'1z16hlw1grFyH_MqVk9f4B8Nm48FjX4f7');
const port=FACILITY_PORTS['pad-250'];
near(port.scale,.21,1e-12,'Existing display scale');near(port.yaw,-.56,1e-12,'Existing site orientation');
pointNear(port.road,[-40,.2,225],1e-12,'Road network socket');
assert.deepEqual(port.rail,[[-18,1.55,227],[18,1.55,227]],'Both established external rail sockets remain fixed');

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
near(bounds.max.y,148,.03,'The lightning mast preserves the established museum height');
assert.ok(bounds.min.x<-360&&bounds.max.x>227&&bounds.min.z<-305&&bounds.max.z>188,'Real extended pipes and transport tracks must not be cropped to the old schematic footprint');

// Independently measured vertices from the complete raw recovery (SHA256
// c07c0b6fc00691f4d1555296ba7f0389b0139306e56599df46e58c38c402776f),
// transformed by each ORIGINAL complete world matrix and the uniform museum
// normalization. These 6/16-triangle parts are below the simplification gate.
// Decomposing their affine scale-helper chains before baking used to displace
// vertices by up to 2.19 local units; matching overall bounds missed that bug.
const sourceTransformAnchors=[
 {id:6888,material:'Ferm_grey',point:[-12.884938347501215,18.975434828511652,5.830710992399108]},
 {id:6754,material:'Ferm_grey',point:[-12.884938347501215,16.872467137851128,5.830710992399108]},
 {id:7052,material:'Ferm_grey',point:[-19.76202467533682,18.874494773040038,12.258005926484994]},
 {id:6714,material:'Ferm_grey',point:[-19.76202467533682,16.771527082379514,12.258005926484994]},
 {id:18641,material:'Ferm_lightgrey',point:[-192.80408396024905,.6166384258425619,-106.79136906897666]},
 {id:23479,material:'Ferm_lightgrey',point:[-330.528178793586,.6166430646724219,-106.79092146096967]}
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
 assert.ok(distance<.012,`Source ${anchor.id} retains its exact affine placement within quantization tolerance: ${distance}`);
 return {sourceId:anchor.id,distance};
});

// The hole follows the source inner boundary, not the much larger outer edge
// of its flat background. Independently check the decoded subgrade surfaces.
const ring=manifest.terrainCutout.polygon;
assert.equal(ring.length,17);assert.ok(ring.every(p=>p.length===2&&p.every(Number.isFinite)));
assert.ok(manifest.terrainCutout.floorY<-24&&manifest.terrainCutout.floorY>-25);
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
assert.ok(inside(0,0)&&inside(100,0)&&!inside(-100,0)&&!inside(0,100),'The cutout covers the launch pit and gas outlet, not the surrounding site');
for(const name of ['overview','tower','trench','top']){
 const camera=manifest.camera[name];assert.ok(camera,'Missing public view '+name);
 assert.ok([...camera.eye,...camera.target].every(Number.isFinite));
 assert.ok(camera.eye[1]>camera.target[1]&&Math.hypot(...camera.eye.map((v,i)=>v-camera.target[i]))>10,'A usable elevated view for '+name);
}

// Recover the four source rail ends from decoded vertices, independently of the
// manifest and adapter metadata. Their gauge is deliberately narrower than the
// existing museum network, so merely checking matching metadata is insufficient.
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
const connectionsRoot=new THREE.Group(),connection=buildUkssConnections(connectionsRoot,manifest.connections);
connectionsRoot.updateWorldMatrix(true,true);
assert.equal(connection.connected,true);assert.equal(connection.sourceGeometryStretched,false);
assert.equal(connection.railTracks.length,2);assert.equal(connection.road.sourcePlatformId,25196);
for(const track of connection.railTracks){assert.ok(track.sourceGap<1e-8);assert.ok(track.socketGap<1e-8);}
const adapterMeshes=[];connectionsRoot.traverse(object=>{if(object.isMesh)adapterMeshes.push(object);});
const railMeshes=adapterMeshes.filter(mesh=>mesh.name==='УКСС · непрерывный рельс');
assert.equal(railMeshes.length,4);
function extremeSection(mesh,axis,maximum){
 const attribute=mesh.geometry.attributes.position,points=[];
 for(let i=0;i<attribute.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld));
 const value=(maximum?Math.max:Math.min)(...points.map(p=>p[axis])),section=points.filter(p=>Math.abs(p[axis]-value)<.001);
 assert.ok(section.length>=2,'The actual ribbon has a complete end cross-section');
 return section.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/section.length);
}
const renderedSourceHeads=railMeshes.map(mesh=>extremeSection(mesh,'z',false)).sort((a,b)=>a.x-b.x);
const renderedNetworkHeads=railMeshes.map(mesh=>extremeSection(mesh,'z',true)).sort((a,b)=>a.x-b.x);
for(let i=0;i<4;i++)near(renderedSourceHeads[i].distanceTo(sourceHeads[i]),0,.02,'Actual adapter/source head join');
const networkHeads=port.rail.flatMap(socket=>[-1,1].map(side=>new THREE.Vector3(
 socket[0]+side*RAIL_PROFILE.gauge/(2*port.scale),socket[1]+RAIL_PROFILE.headRadius/port.scale,socket[2]
))).sort((a,b)=>a.x-b.x);
for(let i=0;i<4;i++)near(renderedNetworkHeads[i].distanceTo(networkHeads[i]),0,.0002,'Actual adapter/network head join');
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
console.log('UKSS_SOURCE_MODEL_PASS',JSON.stringify({version:manifest.version,bytes:bytes.length,meshes,draws,materials:materials.size,vertices,triangles,mockupTriangles,lotokTriangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},sourceTransformErrors,checkedSubgradeVertices:trenchPoints.length,adapterTriangles,railSourceJoins:renderedSourceHeads.map((p,i)=>p.distanceTo(sourceHeads[i])),roadPlatform:roadPlatform.toArray()}));
