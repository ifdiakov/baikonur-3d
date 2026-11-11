import * as THREE from 'three';

export const SITE118_ASSET_VERSION='site118-drive-20261111-v1';
const controllers=new WeakMap();
const bounds={min:[-33.49562072753906,-13.230589866638184,-19.012693405151367],max:[34.66902160644531,9.403701782226562,19.012693405151367]};
const aboveGroundBounds={min:[-33.49562072753906,0,-19.012693405151367],max:[33.49562072753906,9.403701782226562,19.012693405151367]};
const corners=(min,max)=>[min[0],max[0]].flatMap(x=>[min[1],max[1]].flatMap(y=>[min[2],max[2]].map(z=>[x,y,z])));
export const SITE118_PROFILE=Object.freeze({
 version:SITE118_ASSET_VERSION,unit:'metre',scale:1,groundY:-2.755,sourceGroundY:0,
 bounds,aboveGroundBounds,
 views:{
  all:{target:[0,3,0],eye:[68,52,-82],framePoints:corners(aboveGroundBounds.min,aboveGroundBounds.max)},
  ground:{target:[-7,2,-11],eye:[42,44,-76],framePoints:corners(aboveGroundBounds.min,aboveGroundBounds.max)},
  top:{target:[0,0,0],eye:[0,115,.001],framePoints:corners(aboveGroundBounds.min,aboveGroundBounds.max)}
 }
});
const credit={author:'novusod',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourceUrl:'https://sketchfab.com/3d-models/sewage-facility-d71e815da4b84667b3fc3572de77f831'};
function release(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of [o.material].flat()){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
function validateGlb(bytes){
 const view=new DataView(bytes);
 if(bytes.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw Error('Неверный файл модели площадки 118');
 const length=view.getUint32(12,true);
 if(view.getUint32(16,true)!==0x4e4f534a||20+length>bytes.byteLength)throw Error('Повреждена структура модели площадки 118');
 const data=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
 const inspect=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='uri'&&typeof item==='string'&&!item.startsWith('data:'))throw Error('Внешние ресурсы модели площадки 118 запрещены');inspect(item);}};
 inspect(data);if(data.asset?.version!=='2.0')throw Error('Неизвестная версия 3D-модели площадки 118');
}

export async function loadSite118Source({consumer='site118'}={}){
 const base=new URL('../assets/models/site118/',import.meta.url),url=new URL('model-v1.glb',base),meta=new URL('manifest-v1.json',base);
 url.searchParams.set('v',SITE118_ASSET_VERSION);url.searchParams.set('consumer',consumer);meta.searchParams.set('v',SITE118_ASSET_VERSION);
 if(url.origin!==location.origin)throw Error('Модель площадки 118 должна загружаться с сайта музея');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);let scene=null;
 try{
  const get=async(resource,binary)=>{const r=await fetch(resource,{signal:controller.signal,credentials:'same-origin',mode:'same-origin',redirect:'error'});if(!r.ok)throw Error('Площадка 118: HTTP '+r.status);return binary?r.arrayBuffer():r.json();};
  const [bytes,manifest,{GLTFLoader}]=await Promise.all([get(url,true),get(meta,false),import('three/addons/loaders/GLTFLoader.js')]);
  if(manifest.version!==SITE118_ASSET_VERSION||manifest.normalization?.unit!=='metre'||manifest.normalization.scale!==1||manifest.normalization.modelGroundY!==0||bytes.byteLength!==manifest.asset?.bytes||bytes.byteLength>2200000)throw Error('Неверная версия или масштаб модели площадки 118');
  validateGlb(bytes);
  const digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==manifest.asset.sha256)throw Error('Контрольная сумма модели площадки 118 не совпадает');
  const manager=new THREE.LoadingManager();manager.setURLModifier(uri=>{if(uri.startsWith('data:')||(uri.startsWith('blob:')&&new URL(uri).origin===location.origin))return uri;throw Error('Внешний ресурс модели площадки 118 заблокирован');});
  ({scene}=await new GLTFLoader(manager).parseAsync(bytes,base.href));
  const box=new THREE.Box3().setFromObject(scene),actual={min:box.min.toArray(),max:box.max.toArray()};
  for(const side of ['min','max'])if(actual[side].some((v,i)=>!Number.isFinite(v)||Math.abs(v-manifest.bounds[side][i])>.002))throw Error('Габариты модели площадки 118 не прошли проверку');
  let meshes=0,triangles=0;scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  if(meshes!==manifest.asset.primitives||triangles!==manifest.asset.triangles)throw Error('Состав модели площадки 118 не прошёл проверку');
  return {scene,manifest};
 }catch(error){if(scene)release(scene);throw error;}finally{clearTimeout(timer);}
}

export function buildSite118Exhibit(root,{autoLoad=typeof window!=='undefined',loadSource=loadSite118Source}={}){
 if(controllers.has(root))throw Error('Модель площадки 118 уже установлена');
 root.userData.skipGenericSiteLights=true;
 const asset={version:SITE118_ASSET_VERSION,status:'pending',error:null,attempts:0,bytes:0,triangles:0,drawCalls:0};
 const data={version:SITE118_ASSET_VERSION,unit:'metre',asset,bounds:SITE118_PROFILE.bounds,aboveGroundBounds:SITE118_PROFILE.aboveGroundBounds,
  views:SITE118_PROFILE.views,ground:{sourceY:0,worldY:-2.755,ownGroundRemoved:true},sourceCredit:{...credit}};
 root.userData.site118Model=data;let pending=null;
 const changed=()=>root.dispatchEvent({type:'site118-exhibit-change'});
 function load(){
  if(asset.status==='ready')return Promise.resolve(true);if(pending)return pending;
  asset.status='loading';asset.error=null;asset.attempts++;changed();
  pending=(async()=>{
   let candidate=null;
   try{
    const loaded=await loadSource({consumer:'museum-site118'});candidate=loaded.scene;
    const manifest=loaded.manifest,added=[];
    candidate.name='Пл.118 · здания, ограда и оборудование из Google Drive';
    candidate.traverse(mesh=>{if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.museumComponent='site118-source-structure';mesh.userData.sourcePart??=mesh.name;added.push(mesh);});
    root.add(candidate);root.updateWorldMatrix(true,true);candidate=null;
    Object.assign(asset,{status:'ready',error:null,bytes:manifest.asset.bytes,triangles:manifest.asset.triangles,drawCalls:manifest.asset.primitives,sha256:manifest.asset.sha256,sourceSha256:manifest.sourceSha256});
    Object.assign(data,{manifest,retained:manifest.retained,contacts:manifest.contacts,groundNegativeProbes:manifest.groundNegativeProbes});
    const archive=root.userData.archiveModel;if(archive){archive.features.site118=data;archive.features.meshCount=added.length;const b=new THREE.Box3().setFromObject(root);archive.bounds=b.getSize(new THREE.Vector3()).toArray();archive.centre=b.getCenter(new THREE.Vector3()).toArray();}
    root.dispatchEvent({type:'museum-exhibit-loaded',removed:[],added});return true;
   }catch(error){if(candidate)release(candidate);asset.status='error';asset.error=error.name==='AbortError'?'Не удалось загрузить модель за 25 секунд':String(error.message||error);return false;}
   finally{changed();}
  })().finally(()=>{pending=null;});return pending;
 }
 const api={load,stats:()=>data,ready:Promise.resolve(false)};controllers.set(root,api);
 if(autoLoad){const startup=globalThis.window?.__MUSEUM_STARTUP;api.ready=startup?.defer?startup.defer(load,{key:'site118-source',priority:25}):load();}
 return {site118:data,meshCount:0};
}

export const site118Controller=root=>controllers.get(root)||null;
