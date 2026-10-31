import * as THREE from 'three';
import {buildUkssPad,UKSS_YAW,UKSS_TRENCH,normalizeUkssContour} from './ukss-pad.js?v=20261031-facilities-rails-lighting-v1';
import {createSurfacePalette} from './surface-materials.js';

export const UKSS_MODEL_VERSION='ukss-drive-model-v2';
const ASSET_URL=new URL('../assets/models/ukss/model-v2.glb',import.meta.url);
const MANIFEST_URL=new URL('../assets/models/ukss/manifest-v2.json',import.meta.url);
const MAX_WAIT_MS=20000;
const VIEWS=['overview','tower','trench','top'];
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);

function validateManifest(value){
  if(value?.version!==UKSS_MODEL_VERSION)throw new Error('Unsupported UKSS manifest version');
  if(typeof value.sourceFile!=='string'||!value.sourceFile.trim()||!/^[a-f\d]{64}$/i.test(value.sourceSha256||''))throw new Error('UKSS manifest is missing source provenance');
  const b=value.bounds;
  if(!vector(b?.min)||!vector(b?.max)||b.min.some((n,i)=>n>=b.max[i]))throw new Error('UKSS manifest has invalid local bounds');
  if(!value.sourceStats||typeof value.sourceStats!=='object'||Array.isArray(value.sourceStats))throw new Error('UKSS manifest is missing source statistics');
  if(!Number.isFinite(value.terrainCutout?.floorY)||value.terrainCutout.floorY>0)throw new Error('UKSS manifest has invalid trench floor height');
  const polygon=normalizeUkssContour(value.terrainCutout.polygon),camera={};
  for(const view of VIEWS){
    const c=value.camera?.[view];if(!c)continue;
    if(!vector(c.target)||!vector(c.eye)||Math.hypot(...c.target.map((n,i)=>n-c.eye[i]))<1e-5)throw new Error('Invalid UKSS camera: '+view);
    camera[view]={target:[...c.target],eye:[...c.eye]};
  }
  return {...value,bounds:{min:[...b.min],max:[...b.max]},terrainCutout:{polygon,floorY:value.terrainCutout.floorY},camera};
}

// Inspect the GLB before GLTFLoader can resolve an embedded URI. All geometry and
// images must be inside this binary; no URL in the asset may trigger a request.
function validateGlb(bytes){
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<20)throw new Error('UKSS asset is not a GLB');
  const view=new DataView(bytes);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw new Error('Invalid UKSS GLB header');
  let json=null;
  for(let offset=12;offset<bytes.byteLength;){
    if(offset+8>bytes.byteLength)throw new Error('Truncated UKSS GLB chunk');
    const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;
    if(offset+length>bytes.byteLength)throw new Error('Truncated UKSS GLB payload');
    if(type===0x4e4f534a){
      if(json)throw new Error('Duplicate UKSS GLB JSON chunk');
      json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,offset,length)).replace(/\0+$/,''));
    }
    offset+=length;
  }
  if(json?.asset?.version!=='2.0')throw new Error('Missing UKSS glTF 2.0 scene');
  function inspect(value){
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      if(key==='uri'&&typeof item==='string'&&!item.startsWith('data:'))throw new Error('UKSS GLB contains an external resource URI');
      if(item&&typeof item==='object')inspect(item);
    }
  }
  inspect(json);
}

function measureModel(root){
  root.updateWorldMatrix(true,true);
  const fromWorld=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),instance=new THREE.Matrix4(),vertex=new THREE.Vector3();
  const bounds=new THREE.Box3(),materials=new Set(),textures=new Set(),geometries=new Set();
  const stats={meshCount:0,instanceCount:0,vertexCount:0,triangleCount:0,drawCallsEstimate:0};
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometry=mesh.geometry,positions=geometry?.attributes.position;
    if(!positions||positions.itemSize!==3)throw new Error('UKSS mesh has no vertex positions');
    if(!mesh.matrixWorld.elements.every(Number.isFinite))throw new Error('UKSS mesh has an invalid transform');
    const count=mesh.isInstancedMesh?mesh.count:1;
    stats.meshCount++;stats.instanceCount+=count;stats.vertexCount+=positions.count*count;
    stats.triangleCount+=(geometry.index?.count??positions.count)/3*count;
    stats.drawCallsEstimate+=geometry.groups.length||1;geometries.add(geometry);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(!material)throw new Error('UKSS mesh has no material');
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
    for(let j=0;j<count;j++){
      matrix.multiplyMatrices(fromWorld,mesh.matrixWorld);
      if(mesh.isInstancedMesh){mesh.getMatrixAt(j,instance);matrix.multiply(instance);}
      if(!matrix.elements.every(Number.isFinite))throw new Error('UKSS instance has an invalid transform');
      for(let i=0;i<positions.count;i++){
        vertex.fromBufferAttribute(positions,i).applyMatrix4(matrix);
        if(!Number.isFinite(vertex.x)||!Number.isFinite(vertex.y)||!Number.isFinite(vertex.z))throw new Error('UKSS mesh has non-finite vertices');
        bounds.expandByPoint(vertex);
      }
    }
  });
  if(!stats.meshCount||bounds.isEmpty()||bounds.getSize(vertex).length()<1e-5)throw new Error('UKSS asset contains no visible geometry');
  return {bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(vertex).toArray()},
    stats:{...stats,geometryCount:geometries.size,materialCount:materials.size,textureCount:textures.size}};
}

function disposeModel(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root?.traverse(mesh=>{if(!mesh.isMesh)return;geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(!material)continue;materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  }});
  for(const texture of textures)texture.dispose();for(const material of materials)material.dispose();for(const geometry of geometries)geometry?.dispose();
}

function restoreSourceSurfaces(root,model){
  const roles={Lotok:'concrete',LPad:'concrete',BlastWalls:'concrete',Concrete_white:'concrete',Yellow_concrete:'concrete',
    Building_1:'concrete',Building_2:'concrete',Ferm_green:'paint',Ferm_black:'paint',Ferm_grey:'metal',Ferm_lightgrey:'metal',
    Ferm_white:'paint',Ferm_red:'paint',Shield:'rust',Rails:'metal',KrioTubes:'metal',BlastPad:'metal',Tower_2:'paint',Telega:'paint'};
  const originals=new Map();model.traverse(mesh=>{if(mesh.isMesh)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(roles[m.name])originals.set(m.name,m);});
  const colors=Object.fromEntries([...originals].map(([name,m])=>[name,m.color.clone()]));
  const usedRoles=Object.fromEntries([...originals.keys()].map(name=>[name,roles[name]]));
  const materials=createSurfacePalette(root,colors,usedRoles);
  for(const [name,original]of originals){materials[name].name=name;materials[name].userData={...original.userData,...materials[name].userData};}
  model.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>materials[m.name]||m):materials[mesh.material.name]||mesh.material;});
  root.userData.surfaceMaterials.source='Source material roles, model-space concrete grain and weathered metal';
  root.userData.surfaceMaterials.gasDuct={material:'Lotok',kind:'concrete',textured:true};
  root.userData.surfaceMaterials.textureCount=2;
}

// The optional source mockup is identified by its material tag, which survives
// merging by material. Structural meshes and the source geometry stay intact.
function createMockupControl(root){
  const tag='ukss-dimensional-mockup',materials=new Map(),meshes=new Map();
  const metadata={available:false,visible:false,meshCount:0,triangleCount:0};
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const tagged=new Set(list.flatMap((material,i)=>material?.userData?.museumComponent===tag?[i]:[]));
    if(!tagged.size)return;
    const geometry=mesh.geometry,total=geometry.index?.count??geometry.attributes.position.count;
    const start=Math.max(0,geometry.drawRange.start),end=Math.min(total,start+geometry.drawRange.count);
    const groups=Array.isArray(mesh.material)?geometry.groups:[{start:0,count:total,materialIndex:0}];
    let triangles=0;const used=new Set();
    for(const group of groups){
      const count=Math.max(0,Math.min(end,group.start+group.count)-Math.max(start,group.start));
      if(!count)continue;used.add(group.materialIndex);
      if(tagged.has(group.materialIndex))triangles+=count/3;
    }
    if(!triangles)return;
    metadata.meshCount++;metadata.triangleCount+=triangles*(mesh.isInstancedMesh?mesh.count:1);
    for(const i of tagged)if(!materials.has(list[i]))materials.set(list[i],list[i].visible);
    if([...used].every(i=>tagged.has(i))){meshes.set(mesh,mesh.visible);mesh.userData.museumComponent=tag;}
  });
  metadata.available=metadata.meshCount>0;
  function setVisible(value){
    const visible=metadata.available&&Boolean(value);
    for(const [mesh,initial] of meshes)mesh.visible=visible&&initial;
    for(const [material,initial] of materials)material.visible=visible&&initial;
    metadata.visible=visible;return visible;
  }
  setVisible(false);
  return {metadata,setVisible};
}

function fallbackCutout(){return {polygon:null,floorY:Math.min(...UKSS_TRENCH.map(p=>p[3])),basis:'procedural-fallback-stations'};}

// Awaited before clickable registration and evening lighting. Parsing happens in
// an unattached group, so a timeout cannot later replace the working fallback.
export async function loadUkssExhibit(root,{timeoutMs=MAX_WAIT_MS}={}){
  const started=performance.now(),controller=new AbortController();
  const limit=Math.max(1,Math.min(MAX_WAIT_MS,Number.isFinite(timeoutMs)?timeoutMs:MAX_WAIT_MS));
  const assetUrl=new URL(ASSET_URL),manifestUrl=new URL(MANIFEST_URL);
  assetUrl.searchParams.set('v',UKSS_MODEL_VERSION);manifestUrl.searchParams.set('v',UKSS_MODEL_VERSION);
  const asset={model:ASSET_URL.pathname,manifest:MANIFEST_URL.pathname};
  root.rotation.y=UKSS_YAW;
  root.userData.ukssModel={version:UKSS_MODEL_VERSION,status:'loading',asset};
  let timer,model;
  try{
    if(typeof location!=='undefined'&&(assetUrl.origin!==location.origin||manifestUrl.origin!==location.origin))throw new Error('UKSS asset must be same-origin');
    const fetchAsset=async(url,binary)=>{
      const response=await fetch(url,{signal:controller.signal,mode:'same-origin',credentials:'same-origin',redirect:'error',cache:'no-cache'});
      if(!response.ok)throw new Error('UKSS '+(binary?'model':'manifest')+' HTTP '+response.status);
      return binary?response.arrayBuffer():response.json();
    };
    const pending=(async()=>{
      const [manifestData,bytes,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([
        fetchAsset(manifestUrl,false),fetchAsset(assetUrl,true),
        import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')
      ]);
      const manifest=validateManifest(manifestData);validateGlb(bytes);
      if(controller.signal.aborted)throw new Error('UKSS load was aborted');
      const manager=new THREE.LoadingManager();
      manager.setURLModifier(url=>{
        if(url.startsWith('data:'))return url;
        if(url.startsWith('blob:')&&new URL(url).origin===assetUrl.origin)return url;
        throw new Error('UKSS embedded resource must not request an external file');
      });
      const gltf=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,new URL('.',assetUrl).href);
      const holder=new THREE.Group();holder.name='УКСС · исходная 3D-модель';holder.add(gltf.scene);
      if(controller.signal.aborted){disposeModel(holder);throw new Error('UKSS load was aborted');}
      return {holder,manifest,bytes:bytes.byteLength};
    })();
    const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
      controller.abort();const error=new Error('UKSS loading exceeded '+limit+' ms');error.name='TimeoutError';reject(error);
    },limit);});
    const loaded=await Promise.race([pending,deadline]);model=loaded.holder;
    const measured=measureModel(model),manifest=loaded.manifest,mockup=createMockupControl(model);
    restoreSourceSurfaces(root,model);
    model.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.museumComponent=mesh.userData.museumComponent||'ukss-imported-model';}});
    root.name='Пл. 250 — УКСС «Энергия» / исходная 3D-модель';root.add(model);
    const metadata={version:manifest.version,status:'ready',site:'250',name:'Универсальный комплекс стенд-старт «Энергия»',
      asset,sourceFile:manifest.sourceFile,sourceSha256:manifest.sourceSha256,sourceStats:manifest.sourceStats,
      bounds:measured.bounds,manifestBounds:manifest.bounds,assetStats:{...measured.stats,bytes:loaded.bytes},
      terrainCutout:manifest.terrainCutout,camera:manifest.camera,connections:manifest.connections,optimization:manifest.optimization??null,rocketMount:manifest.rocketMount,
      mockup:mockup.metadata,loadMs:Math.round(performance.now()-started),
      positionBasis:'OSM facility anchor; source metric coordinates; common 0.14 world units per metre',
      localAxes:{up:'+Y',approach:'+Z',trench:'+X',gradeY:0},error:null};
    root.userData.ukssModel=metadata;
    root.userData.surfaceMaterials.materialCount=measured.stats.materialCount;
    return {metadata,terrainCutout:metadata.terrainCutout,setMockupVisible:mockup.setVisible,
      inspect:(view,camera,controls)=>frameUkssExhibit(root,camera,controls,view)};
  }catch(error){
    if(model){model.removeFromParent();disposeModel(model);}
    const fallback=buildUkssPad(root),measured=measureModel(root),terrainCutout=fallbackCutout();
    const metadata={...fallback.metadata,status:'fallback',requestedVersion:UKSS_MODEL_VERSION,asset,bounds:measured.bounds,
      assetStats:measured.stats,terrainCutout,mockup:{available:false,visible:false,meshCount:0,triangleCount:0},loadMs:Math.round(performance.now()-started),
      error:{name:error?.name||'Error',message:String(error?.message||error)}};
    root.userData.ukssModel=metadata;
    return {metadata,terrainCutout,setMockupVisible:()=>false,inspect:(view,camera,controls)=>frameUkssExhibit(root,camera,controls,view)};
  }finally{clearTimeout(timer);controller.abort();}
}

// Manifest eye/target pairs are local to the launch origin. If a view is absent,
// use actual imported bounds; the whole-site camera is fitted to both FOV axes.
export function frameUkssExhibit(root,camera,controls,view='overview'){
  if(!VIEWS.includes(view))view='overview';
  const metadata=root.userData.ukssModel,explicit=metadata?.camera?.[view];
  const source=metadata?.bounds??measureModel(root).bounds;
  const bounds=new THREE.Box3(new THREE.Vector3(...source.min),new THREE.Vector3(...source.max));
  let target,eye;
  if(explicit){
    target=new THREE.Vector3(...explicit.target);eye=new THREE.Vector3(...explicit.eye);
    // Presets are authored in landscape; preserve their viewing angle while
    // widening the visible span on a portrait screen. Bounds-fit views do this below.
    const aspect=Number.isFinite(camera.aspect)&&camera.aspect>0?camera.aspect:1;
    if(aspect<1)eye.sub(target).multiplyScalar(1/aspect).add(target);
  }
  else{
    if(view==='trench'){
      const ring=metadata?.terrainCutout?.polygon??[...UKSS_TRENCH.map(p=>[p[0],p[1]]),...UKSS_TRENCH.toReversed().map(p=>[p[0],-p[1]])];
      bounds.makeEmpty();for(const [x,z] of ring){bounds.expandByPoint(new THREE.Vector3(x,metadata?.terrainCutout?.floorY??-32,z));bounds.expandByPoint(new THREE.Vector3(x,0,z));}
    }else if(view==='tower'){
      const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      bounds.min.y+=size.y*.35;
      bounds.min.x=center.x-size.x*.28;bounds.max.x=center.x+size.x*.28;
      bounds.min.z=center.z-size.z*.28;bounds.max.z=center.z+size.z*.28;
    }
    target=bounds.getCenter(new THREE.Vector3());
    const radius=bounds.getSize(new THREE.Vector3()).length()/2;
    const vertical=THREE.MathUtils.degToRad(camera.fov),horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect);
    const distance=Math.max(10,radius/Math.sin(Math.min(vertical,horizontal)/2)*1.16);
    const direction=view==='top'?new THREE.Vector3(0,1,.0001):view==='trench'?new THREE.Vector3(1,1.25,1.2):new THREE.Vector3(1,.96,-1.25);
    eye=target.clone().add(direction.normalize().multiplyScalar(distance));
  }
  root.updateWorldMatrix(true,false);
  controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));
  controls.update();camera.updateMatrixWorld(true);return view;
}
