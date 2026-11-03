import * as THREE from 'three';
import {buildSite31Pad,SITE31_PIT} from './site31-pad.js?v=20261103-soyuz-pits-v1';
import {registerFacilityBeacon,registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {loadSite31Source,SITE31_ASSET_VERSION} from './site31-source.js?v=20261103-soyuz-pits-v1';
export {validateSite31Glb,SITE31_ASSET_VERSION} from './site31-source.js?v=20261103-soyuz-pits-v1';
export const SITE31_VIEWS=Object.freeze({all:{target:[0,15,-10],eye:[-160,135,180]},structure:{target:[0,20,0],eye:[-48,37,62]},duct:{target:[-3,-6,-54],eye:[-150,125,-230]},connections:{target:[0,2,66],eye:[170,150,235]},top:{target:[0,0,-60],eye:[0,360,-59.99]}});
const controllers=new WeakMap();
export const site31Controller=root=>controllers.get(root);
const meshes=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
function release(root){
 const geometry=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(!o.isMesh)return;geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
 geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
function finalLighting(root){
 // Source towers are grounded separately, without scaling their lattice.
 for(const [id,position]of [['east',[60.97,97.41,13.22]],['west',[-73.63,103.23,-14.55]],['service-right',[3.99,39.41,1.02]],['service-left',[-3.33,37,0]]])registerFacilityBeacon(root,{id:'site31-source-'+id,position,kind:'source-tower'});
 for(const [id,x,y,z]of [['a',84.6,67.24,-21.6],['b',-112.6,68.3,-84.9],['c',-97.7,68.37,84.2]]){
  const normal=new THREE.Vector3(-x,0,-z).normalize().toArray();
  registerFacilityFloodlights(root,{id:'site31-source-flood-'+id,target:[0,0,0],beacon:[x,y,z],source:'Drive model light tower',lamps:[{position:[x,y-1,z],normal,size:[.6,.6]}]});
 }
}
export function buildSite31Exhibit(root,{autoLoad=typeof window!=='undefined',loadSource=null}={}){
 const fallback=new THREE.Group();fallback.name='Пл.31 · резервная модель';root.add(fallback);
 const result=buildSite31Pad(fallback),state={version:SITE31_ASSET_VERSION,status:'pending',error:null,bytes:0,triangles:0,drawCalls:0};
 // One stable owner for cutout/lighting/rocket mount. Swapping the visual child
 // must not detach the registered terrain void, source rocket, or selection.
 fallback.traverse(o=>{delete o.userData.facilityLighting;delete o.userData.archiveCutouts;});
 root.userData.site31Model={...result.site31,asset:state,views:SITE31_VIEWS};root.userData.archiveCutouts=[SITE31_PIT];finalLighting(root);
 let current=fallback,pending=null;
 const changed=()=>root.dispatchEvent({type:'site31-exhibit-change'});
 const readSource=loadSource||loadSite31Source;
 async function load(){
  if(state.status==='ready')return true;if(pending)return pending;
  state.status='loading';state.error=null;changed();
  pending=(async()=>{let candidate=null;try{
   const {scene,manifest}=await readSource();
   scene.name='Пл.31 · новая модель из Google Drive';scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData.museumComponent='site31-source-structure';}});
   candidate=new THREE.Group();candidate.name='Пл.31 · исходная 3D-модель и подключённые подъезды';
   const built=buildSite31Pad(candidate,{sourceStructure:scene});
   candidate.traverse(o=>{delete o.userData.archiveCutouts;delete o.userData.facilityLighting;});
   const removed=meshes(current);root.remove(current);root.add(candidate);root.updateWorldMatrix(true,true);
   const added=meshes(candidate);root.dispatchEvent({type:'museum-exhibit-loaded',removed,added});release(current);current=candidate;candidate=null;
   Object.assign(state,{status:'ready',error:null,bytes:manifest.asset.bytes,triangles:manifest.asset.triangles,drawCalls:manifest.asset.primitives,sourceSha256:manifest.sourceSha256});
   Object.assign(root.userData.site31Model,{...built.site31,version:SITE31_ASSET_VERSION,asset:state,views:SITE31_VIEWS,
    status:'Конструкции стартового комплекса — предоставленная 3D-модель. Котлован повторяет форму Гагаринского старта с увеличением на 20%; боковые дороги убраны. Глубина 28,8 м — музейная реконструкция.',
    sources:[...built.site31.sources,manifest.sourceUrl],sourceCredit:{author:manifest.author,url:manifest.sourceUrl,license:manifest.license,licenseUrl:manifest.licenseUrl},sourceStructureBounds:manifest.bounds});
   const archive=root.userData.archiveModel;if(archive){archive.features.site31=root.userData.site31Model;archive.features.meshCount=added.length;const b=new THREE.Box3().setFromObject(root);archive.bounds=b.getSize(new THREE.Vector3()).toArray();archive.centre=b.getCenter(new THREE.Vector3()).toArray();}
   return true;
  }catch(e){if(candidate)release(candidate);state.status='error';state.error=e.name==='AbortError'?'Не удалось загрузить модель за 25 секунд':e.message;return false;}finally{pending=null;changed();}})();return pending;
 }
 const api={load,stats:()=>root.userData.site31Model,ready:Promise.resolve(false)};controllers.set(root,api);
 if(autoLoad){const startup=globalThis.window?.__MUSEUM_STARTUP;api.ready=startup?.defer?startup.defer(load,{key:'site31-structure',priority:25}):load();}
 return {...result,site31:root.userData.site31Model};
}
