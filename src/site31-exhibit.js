import * as THREE from 'three';
import {buildSite31Pad,SITE31_PIT} from './site31-pad.js?v=20261103-soyuz-pits-v1';
import {registerFacilityBeacon,registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {loadSite31Source,SITE31_ASSET_VERSION} from './site31-source.js?v=20261103-soyuz-pits-v1';
export {validateSite31Glb,SITE31_ASSET_VERSION} from './site31-source.js?v=20261103-soyuz-pits-v1';
export const SITE31_VIEWS=Object.freeze({all:{target:[0,15,-30],eye:[-210,175,220]},structure:{target:[0,20,0],eye:[-48,37,62]},duct:{target:[-3,-6,-54],eye:[-150,125,-230]},connections:{target:[0,2,66],eye:[170,150,235]},top:{target:[0,0,-30],eye:[0,460,-29.99]}});
const controllers=new WeakMap();
export const site31Controller=root=>controllers.get(root);
const meshes=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
function release(root){
 const geometry=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(!o.isMesh)return;geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
 geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
// The imported 31/6 source provides tall trusses but only a few useful
// illuminated lens surfaces. Mount compact physical lamp panels on those
// actual mast locations, then feed their exact faces to the shared instanced
// floodlight system; do not spawn individual PointLights or SpotLights.
function finalLighting(root){
 const sourceMasts=[
  ['east',[60.97,97.41,13.22]],['west',[-73.63,103.23,-14.55]],
  ['service-right',[3.99,39.41,1.02]],['service-left',[-3.33,37,0]]
 ];
 for(const [id,position]of sourceMasts)registerFacilityBeacon(root,{id:'site31-source-'+id,position,kind:'source-tower'});
 const heads=new THREE.Group();
 heads.name='Пл.31 · реальные плафоны осветительных мачт';
 heads.userData.site31FloodlightHeads=true;
 const front=new THREE.Vector3(0,0,1),up=new THREE.Vector3(0,1,0);
 const palette=new THREE.MeshStandardMaterial({color:0xdce2dd,roughness:.64,metalness:.12,side:THREE.DoubleSide});
 const supports=new THREE.MeshStandardMaterial({color:0x74868b,roughness:.85,metalness:.27});
 const geometry=new THREE.PlaneGeometry(1,1);
 function panelBoard(id,x,y,z,{columns=4,rows=2,stepX=1.18,stepY=.78,sizeX=1.0,sizeY=.65,target}={}){
  const normal=new THREE.Vector3(-x,0,-z).normalize();
  if(normal.lengthSq()<.1)normal.set(0,0,1);
  const right=new THREE.Vector3().crossVectors(up,normal).normalize();
  const lamps=[],quat=new THREE.Quaternion().setFromUnitVectors(front,normal);
  const center=new THREE.Vector3(x,y,z);
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
   const p=center.clone().addScaledVector(right,(col-(columns-1)/2)*stepX);
   p.y+=(row-(rows-1)/2)*stepY;
   const panel=new THREE.Mesh(geometry,palette);
   panel.position.copy(p);
   panel.quaternion.copy(quat);
   panel.scale.set(sizeX,sizeY,1);
   panel.name='Пл.31 · плафон '+id+' '+(row*columns+col+1);
   panel.userData.site31LampPanel=id;
   heads.add(panel);
   lamps.push({position:p.toArray(),normal:normal.toArray(),size:[sizeX,sizeY]});
  }
  const frame=new THREE.Mesh(new THREE.BoxGeometry((columns-1)*stepX+sizeX+.24,.12,.18),supports);
  frame.position.copy(center).addScaledVector(normal,-.14);
  frame.quaternion.copy(quat);
  frame.name='Пл.31 · траверса '+id;
  heads.add(frame);
  registerFacilityFloodlights(root,{
   id:'site31-source-flood-'+id,target,beacon:[x,y+1,z],
   source:'Site 31 source mast with added physical illuminated panel faces',
   lamps
  });
 }
 // Three existing source floodlight towers: eight small heads per screen.
 for(const [id,x,y,z]of [
  ['a',84.6,67.24,-21.6],['b',-112.6,68.3,-84.9],['c',-97.7,68.37,84.2]
 ]){
  panelBoard(id,x,y-1,z,{target:[x*.55,0,z*.25+55]});
 }
 // Two mechanical service masts receive smaller work lights below the crown.
 for(const [id,x,y,z]of [
  ['service-right',3.99,39.41,1.02],['service-left',-3.33,37,0]
 ]){
  panelBoard(id,x,y-2.2,z,{columns:2,rows:2,stepX:.78,stepY:.66,
   sizeX:.66,sizeY:.5,target:[Math.sign(x)*27,0,29]});
 }
 root.add(heads);
 root.userData.site31AdditionalLighting={version:'site31-mast-light-heads-v1',
  sourceFloodTowers:3,serviceMasts:2,panels:32,boards:5,
  weatherproofFaces:true,geometryOwner:heads.name};
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
