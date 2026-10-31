import * as THREE from 'three';

export const TUA_MODEL_VERSION='tua-drive-model-v2';
const SOURCE_SHA='304c2317d335a4787d3748fb4e52ae8f537e48e04cf63057e4374f975b6a650e';
const ASSET_URL=new URL('../assets/models/tua/model-v2.glb',import.meta.url);
const MANIFEST_URL=new URL('../assets/models/tua/manifest-v2.json',import.meta.url);
const MAX_WAIT_MS=20000;
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);

function validateManifest(value){
 if(value?.version!==TUA_MODEL_VERSION)throw new Error('Unsupported TUA manifest version');
 if(value.sourceFile!=='Transporter_railroad_assambly.MAX'||value.sourceSha256!==SOURCE_SHA)throw new Error('TUA manifest source does not match the reviewed model');
 if(!vector(value.bounds?.min)||!vector(value.bounds?.max)||value.bounds.min.some((n,i)=>n>=value.bounds.max[i]))throw new Error('Invalid TUA bounds');
 if(!value.sourceStats||typeof value.sourceStats!=='object'||Array.isArray(value.sourceStats))throw new Error('Missing TUA source statistics');
 if(!Array.isArray(value.placements)||value.placements.length!==2||value.placements.some(p=>!vector(p?.position)||!Number.isFinite(p.rotationY)))throw new Error('Two explicit TUA placements are required');
 let camera=null;
 if(value.camera){
  if(!vector(value.camera.target)||!vector(value.camera.eye)||Math.hypot(...value.camera.target.map((n,i)=>n-value.camera.eye[i]))<1e-5)throw new Error('Invalid TUA camera');
  camera={target:[...value.camera.target],eye:[...value.camera.eye]};
 }
 return {...value,bounds:{min:[...value.bounds.min],max:[...value.bounds.max]},
  placements:value.placements.map(p=>({position:[...p.position],rotationY:p.rotationY})),camera};
}

function validateGlb(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<20)throw new Error('TUA asset is not a GLB');
 const view=new DataView(bytes);
 if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw new Error('Invalid TUA GLB header');
 let json=null;
 for(let offset=12;offset<bytes.byteLength;){
  if(offset+8>bytes.byteLength)throw new Error('Truncated TUA GLB chunk');
  const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;
  if(offset+length>bytes.byteLength)throw new Error('Truncated TUA GLB payload');
  if(type===0x4e4f534a){
   if(json)throw new Error('Duplicate TUA GLB JSON chunk');
   json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,offset,length)).replace(/\0+$/,''));
  }
  offset+=length;
 }
 if(json?.asset?.version!=='2.0')throw new Error('Missing TUA glTF 2.0 scene');
 const inspect=value=>{
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)){
   if(key==='uri'&&typeof item==='string'&&!item.startsWith('data:'))throw new Error('TUA GLB contains an external resource URI');
   if(item&&typeof item==='object')inspect(item);
  }
 };
 inspect(json);
}

function measureModel(root){
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),instance=new THREE.Matrix4(),point=new THREE.Vector3();
 const bounds=new THREE.Box3(),materials=new Set(),geometries=new Set(),textures=new Set();
 const stats={meshCount:0,instanceCount:0,vertexCount:0,triangleCount:0,drawCallsEstimate:0};
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry,positions=geometry?.attributes.position;
  if(!positions||positions.itemSize!==3||!mesh.matrixWorld.elements.every(Number.isFinite))throw new Error('Invalid TUA mesh geometry or transform');
  const count=mesh.isInstancedMesh?mesh.count:1;
  stats.meshCount++;stats.instanceCount+=count;stats.vertexCount+=positions.count*count;
  stats.triangleCount+=(geometry.index?.count??positions.count)/3*count;
  stats.drawCallsEstimate+=geometry.groups.length||1;geometries.add(geometry);
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(!material)throw new Error('TUA mesh has no material');materials.add(material);
   for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  }
  for(let j=0;j<count;j++){
   matrix.multiplyMatrices(inverse,mesh.matrixWorld);
   if(mesh.isInstancedMesh){mesh.getMatrixAt(j,instance);matrix.multiply(instance);}
   if(!matrix.elements.every(Number.isFinite))throw new Error('Invalid TUA instance transform');
   for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(matrix);
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))throw new Error('TUA mesh has non-finite vertices');
    bounds.expandByPoint(point);
   }
  }
 });
 if(!stats.meshCount||bounds.isEmpty()||bounds.getSize(point).length()<1e-5)throw new Error('TUA asset contains no visible geometry');
 return {bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(point).toArray()},
  stats:{...stats,geometryCount:geometries.size,materialCount:materials.size,textureCount:textures.size}};
}

function disposeModels(roots){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 for(const root of roots)root?.traverse(mesh=>{if(mesh.isMesh){geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
  if(!material)continue;materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
 }}});
 for(const texture of textures)texture.dispose();for(const material of materials)material.dispose();for(const geometry of geometries)geometry?.dispose();
}

// The existing two machines remain intact while loading and parsing. The caller
// awaits this result before rebuilding clickable ownership and rail adaptation.
export async function loadTuaExhibit(root,exhibit,{timeoutMs=MAX_WAIT_MS}={}){
 if(exhibit?.transporterRoots?.length!==2||typeof exhibit.replaceTransporters!=='function')throw new Error('TUA loader requires two existing MIK placement containers');
 const started=performance.now(),previous={...exhibit.stats().tua},controller=new AbortController();
 const limit=Math.max(1,Math.min(MAX_WAIT_MS,Number.isFinite(timeoutMs)?timeoutMs:MAX_WAIT_MS));
 const assetUrl=new URL(ASSET_URL),manifestUrl=new URL(MANIFEST_URL);
 assetUrl.searchParams.set('v',TUA_MODEL_VERSION);manifestUrl.searchParams.set('v',TUA_MODEL_VERSION);
 const asset={model:ASSET_URL.pathname,manifest:MANIFEST_URL.pathname};
 exhibit.setTuaMetadata({version:TUA_MODEL_VERSION,status:'loading',displayedVersion:previous.version,instanceCount:2,asset,error:null});
 let timer,models=[];
 try{
  if(typeof location!=='undefined'&&(assetUrl.origin!==location.origin||manifestUrl.origin!==location.origin))throw new Error('TUA assets must be same-origin');
  const fetchAsset=async(url,binary)=>{
   const response=await fetch(url,{signal:controller.signal,mode:'same-origin',credentials:'same-origin',redirect:'error',cache:'no-cache'});
   if(!response.ok)throw new Error('TUA '+(binary?'model':'manifest')+' HTTP '+response.status);
   return binary?response.arrayBuffer():response.json();
  };
  const pending=(async()=>{
   const [manifestData,bytes,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([
    fetchAsset(manifestUrl,false),fetchAsset(assetUrl,true),import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')
   ]);
   const manifest=validateManifest(manifestData);validateGlb(bytes);
   if(controller.signal.aborted)throw new Error('TUA load was aborted');
   const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{
    if(url.startsWith('data:'))return url;
    if(url.startsWith('blob:')&&new URL(url).origin===assetUrl.origin)return url;
    throw new Error('TUA embedded resource must not request an external file');
   });
   const gltf=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,new URL('.',assetUrl).href);
   if(controller.signal.aborted){disposeModels([gltf.scene]);throw new Error('TUA load was aborted');}
   return {model:gltf.scene,manifest,bytes:bytes.byteLength};
  })();
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
   controller.abort();const error=new Error('TUA loading exceeded '+limit+' ms');error.name='TimeoutError';reject(error);
  },limit);});
  const loaded=await Promise.race([pending,deadline]);models=[loaded.model];
  const measured=measureModel(loaded.model),manifest=loaded.manifest;
  for(const edge of ['min','max'])for(let i=0;i<3;i++)if(Math.abs(measured.bounds[edge][i]-manifest.bounds[edge][i])>.03)throw new Error('TUA decoded bounds do not match the manifest');
  if(Number.isFinite(manifest.assetStats?.triangles)&&manifest.assetStats.triangles!==measured.stats.triangleCount)throw new Error('TUA decoded triangle count does not match the manifest');
  if(Number.isFinite(manifest.assetStats?.bytes)&&manifest.assetStats.bytes!==loaded.bytes)throw new Error('TUA binary size does not match the manifest');
  // Static Object3D cloning shares BufferGeometry and Material instances. One
  // download and one decoded geometry serve both separately placed machines.
  models.push(loaded.model.clone(true));
  models.forEach((model,i)=>{
   model.name='ТУА «Кузнечик» · исходная модель '+(i+1);
   model.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.museumComponent='tua-imported-model';}});
  });
  const resources=models.map(model=>{
   const geometry=new Set(),material=new Set();model.traverse(mesh=>{if(mesh.isMesh){geometry.add(mesh.geometry);for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.add(m);}});
   return {geometry,material};
  });
  const sharing={uniqueGeometryCount:new Set(resources.flatMap(r=>[...r.geometry])).size,
   sharedGeometryCount:[...resources[0].geometry].filter(value=>resources[1].geometry.has(value)).length,
   uniqueMaterialCount:new Set(resources.flatMap(r=>[...r.material])).size,
   sharedMaterialCount:[...resources[0].material].filter(value=>resources[1].material.has(value)).length};
  const metadata={version:manifest.version,status:'ready',asset,sourceFile:manifest.sourceFile,sourceSha256:manifest.sourceSha256,
   sourceStats:manifest.sourceStats,optimization:manifest.optimization??null,normalization:manifest.normalization??null,
   bounds:measured.bounds,manifestBounds:manifest.bounds,assetStats:{...measured.stats,bytes:loaded.bytes},
   instanceCount:2,totalTriangles:measured.stats.triangleCount*2,totalDrawCalls:measured.stats.drawCallsEstimate*2,sharing,
   placements:manifest.placements,camera:manifest.camera,runningGear:manifest.runningGear??null,railAdaptation:manifest.railAdaptation??null,
   loadMs:Math.round(performance.now()-started),error:null};
  const installed=exhibit.replaceTransporters(models,manifest.placements,metadata);models=[];
  return {metadata:installed,inspect:(camera,controls)=>frameTuaExhibit(root,exhibit.stats().tua,camera,controls)};
 }catch(error){
  disposeModels(models);
  const metadata=exhibit.setTuaMetadata({...previous,status:'fallback',requestedVersion:TUA_MODEL_VERSION,asset,
   loadMs:Math.round(performance.now()-started),error:{name:error?.name||'Error',message:String(error?.message||error)}});
  return {metadata,inspect:(camera,controls)=>frameTuaExhibit(root,exhibit.stats().tua,camera,controls)};
 }finally{clearTimeout(timer);controller.abort();}
}

export function frameTuaExhibit(root,metadata,camera,controls){
 let target,eye;
 if(metadata?.status==='ready'&&metadata.camera){
  target=new THREE.Vector3(...metadata.camera.target);eye=new THREE.Vector3(...metadata.camera.eye);
  if(camera.aspect<1)eye.sub(target).multiplyScalar(1/camera.aspect).add(target);
 }else if(metadata?.status==='ready'&&metadata.bounds&&metadata.placements){
  const assetBounds=new THREE.Box3(new THREE.Vector3(...metadata.bounds.min),new THREE.Vector3(...metadata.bounds.max));
  const bounds=new THREE.Box3(),up=new THREE.Vector3(0,1,0);
  for(const pose of metadata.placements)bounds.union(assetBounds.clone().applyMatrix4(new THREE.Matrix4().compose(
   new THREE.Vector3(...pose.position),new THREE.Quaternion().setFromAxisAngle(up,pose.rotationY),new THREE.Vector3(1,1,1))));
  target=bounds.getCenter(new THREE.Vector3());
  const radius=bounds.getSize(new THREE.Vector3()).length()/2,vertical=THREE.MathUtils.degToRad(camera.fov);
  const horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect),distance=Math.max(20,radius/Math.sin(Math.min(vertical,horizontal)/2)*1.18);
  eye=target.clone().add(new THREE.Vector3(1,.75,-1.2).normalize().multiplyScalar(distance));
 }else{target=new THREE.Vector3(-45,18,-183);eye=target.clone().add(new THREE.Vector3(108,76,-133));}
 root.updateWorldMatrix(true,false);controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));
 controls.update();camera.updateMatrixWorld(true);return true;
}
