import * as THREE from 'three';
import {createLightField} from './light-field.js?v=20261031-road-markings-v1';
import {addSprinterDetail,SPRINTER_DETAIL_VERSION} from './sprinter-detail.js?v=20261105-sprinter-detail-v2';
export const SPRINTER_VERSION='sprinter-drive-v1';
export {SPRINTER_DETAIL_VERSION};
let templatePromise=null;
export function prepareSprinterSurface(scene){
 // Several source normals oppose the actual panel faces after simplification.
 // Rebuild on the existing indexed vertices: source seam duplicates retain
 // hard edges while broad panels regain continuous physical lighting.
 const done=new Set();scene.traverse(o=>{if(!o.isMesh||done.has(o.geometry))return;done.add(o.geometry);o.geometry.deleteAttribute('normal');o.geometry.computeVertexNormals();});
 return scene;
}
export function validateSprinterGlb(bytes){
 const v=new DataView(bytes);
 if(bytes.byteLength<20||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength)throw Error('Повреждён файл Sprinter');
 const length=v.getUint32(12,true);if(v.getUint32(16,true)!==0x4e4f534a||20+length>bytes.byteLength)throw Error('Неверная структура Sprinter');
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
 const inspect=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){if(k==='uri'&&typeof v==='string'&&!v.startsWith('data:'))throw Error('Внешний ресурс Sprinter');inspect(v);}};inspect(json);return json;
}
export async function loadSprinterSource(){
 if(!templatePromise)templatePromise=(async()=>{
  const base=new URL('../assets/models/sprinter/',import.meta.url),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const get=async(name,binary)=>{const url=new URL(name,base);url.searchParams.set('v',SPRINTER_VERSION);const r=await fetch(url,{signal:controller.signal,mode:'same-origin',credentials:'same-origin',redirect:'error'});if(!r.ok)throw Error('Sprinter: HTTP '+r.status);return binary?r.arrayBuffer():r.json();};
   const [bytes,manifest,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([get('model-v1.glb',true),get('manifest-v1.json',false),import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
   validateSprinterGlb(bytes);if(manifest.version!==SPRINTER_VERSION||manifest.asset.bytes!==bytes.byteLength||manifest.normalization?.unit!=='metre')throw Error('Неверная версия Sprinter');
   const manager=new THREE.LoadingManager();manager.setURLModifier(u=>{if(u.startsWith('data:')||(u.startsWith('blob:')&&new URL(u).origin===location.origin))return u;throw Error('Внешний ресурс Sprinter');});
   const {scene}=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,base.href),size=new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).toArray();
   if(size.some((n,i)=>!Number.isFinite(n)||Math.abs(n-manifest.bounds.size[i])>.015)||manifest.wheels.some(w=>!scene.getObjectByName(w.name)))throw Error('Не прошли проверку размеры или колёса Sprinter');
   prepareSprinterSurface(scene);await addSprinterDetail(scene);return {scene,manifest};
  }finally{clearTimeout(timer);}
 })().catch(error=>{templatePromise=null;throw error;});
 const source=await templatePromise,scene=source.scene.clone(true),materials=new Map();
 scene.traverse(o=>{if(!o.isMesh)return;const clone=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);o.userData.pickable=false;});
 return {scene,manifest:source.manifest};
}
export function createSprinterVehicle(fallback,{loadSource=loadSprinterSource}={}){
 const root=fallback.root;root.name='Mercedes-Benz Sprinter · RocketTrip';
 const state={version:SPRINTER_VERSION,detailVersion:SPRINTER_DETAIL_VERSION,status:'fallback',error:null},fallbackChildren=[...root.children];let detail=null,pending=null,lastState=null,lastNight=false;
 const api={...fallback,type:'sprinter',sourceState:state,wheelRadius:.35039,halfWidth:1.17,
  async loadDetail(){
   if(detail)return true;if(pending)return pending;state.status='loading';state.error=null;
   pending=(async()=>{try{
    const {scene,manifest}=await loadSource();
    // Rig pivots stay unscaled. Quantization transforms belong to mesh children.
    const wheels=manifest.wheels.map(w=>{const part=scene.getObjectByName(w.name);if(!part)throw Error('Отсутствует колесо '+w.name);const pivot=new THREE.Group();pivot.name=w.name+'-pivot';pivot.position.fromArray(w.center);part.parent.add(pivot);pivot.attach(part);return pivot;});
    const lights=createLightField(scene,[-1,1].flatMap(s=>[{x:s*.65,y:.93,z:3.24,height:0,color:0xffedc7,size:4},{x:s*.88,y:1.03,z:-3.17,height:0,color:0xff382a,size:2.8}]),{name:'Sprinter · фары и габариты',minPixels:3});
    const materials=new Map();scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!materials.has(m)){materials.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});}});
    detail={scene,manifest,wheels,lights,materials};fallbackChildren.forEach(o=>o.visible=false);root.add(scene);api.wheels=wheels;state.status='ready';state.triangles=manifest.asset.triangles;state.author=manifest.author;state.detail=scene.userData.sprinterDetail||null;
    if(lastState)api.update(lastState,lastNight);return true;
   }catch(error){state.status='error';state.error=String(error.message||error);return false;}finally{pending=null;}})();return pending;
  },
  update(pose,night){
   lastState=pose;lastNight=night;if(!detail){fallback.update(pose,night);return;}
   root.position.copy(pose.position);root.rotation.set(-Math.asin(THREE.MathUtils.clamp(pose.tangent.y,-1,1)),Math.atan2(pose.tangent.x,pose.tangent.z),0,'YXZ');root.visible=pose.opacity>.003;
   for(const [m,original]of detail.materials){m.opacity=original.opacity*pose.opacity;const transparent=original.transparent||pose.opacity<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.depthWrite=original.depthWrite&&pose.opacity>.95;}
   const metricScale=root.scale.x||1;for(const w of detail.wheels)w.rotation.x=pose.distance*pose.direction/(.35039*metricScale);
   for(const m of detail.materials.keys())if(m.userData.sprinterLens)m.emissiveIntensity=night?.45:.04;
   detail.lights.setStrength(pose.opacity*(night?1.3:.07));
  }
 };return api;
}
