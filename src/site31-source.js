import * as THREE from 'three';
export const SITE31_ASSET_VERSION='site31-drive-v1';
function release(root){
 const geometry=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(!o.isMesh)return;geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
 geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
export function validateSite31Glb(bytes){
 const v=new DataView(bytes);if(bytes.byteLength<20||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength)throw Error('Неверный файл площадки 31');
 const size=v.getUint32(12,true);if(v.getUint32(16,true)!==0x4e4f534a||20+size>bytes.byteLength)throw Error('Повреждена структура площадки 31');
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,size)));
 const inspect=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){if(k==='uri'&&typeof v==='string'&&!v.startsWith('data:'))throw Error('Внешние ресурсы в модели площадки 31');inspect(v);}};inspect(json);
 if(json.asset?.version!=='2.0')throw Error('Неизвестная версия модели площадки 31');return json;
}
export async function loadSite31Source({consumer='site31'}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
   const base=new URL('../assets/models/site31/',import.meta.url),url=new URL('model-v1.glb',base),meta=new URL('manifest-v1.json',base);url.searchParams.set('v',SITE31_ASSET_VERSION);url.searchParams.set('consumer',consumer);meta.searchParams.set('v',SITE31_ASSET_VERSION);
   if(url.origin!==location.origin)throw Error('Модель должна загружаться с сайта музея');
   const part=async(u,binary)=>{const r=await fetch(u,{signal:controller.signal,mode:'same-origin',credentials:'same-origin',redirect:'error'});if(!r.ok)throw Error('Площадка 31: HTTP '+r.status);return binary?r.arrayBuffer():r.json();};
   const [bytes,manifest,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([part(url,true),part(meta,false),import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
   validateSite31Glb(bytes);
   if(manifest.version!==SITE31_ASSET_VERSION||manifest.normalization?.unit!=='metre'||manifest.normalization.scale!==1||manifest.asset.bytes!==bytes.byteLength)throw Error('Неверная версия или масштаб площадки 31');
   const manager=new THREE.LoadingManager();manager.setURLModifier(u=>{if(u.startsWith('data:')||(u.startsWith('blob:')&&new URL(u).origin===location.origin))return u;throw Error('Внешний ресурс модели заблокирован');});
   const gltf=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,base.href);
   const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()).toArray();
   if(size.some((n,i)=>!Number.isFinite(n)||Math.abs(n-manifest.bounds.size[i])>.04)){release(gltf.scene);throw Error('Размеры площадки 31 не прошли проверку');}
   return {scene:gltf.scene,manifest};
  }finally{clearTimeout(timer);}
 }
