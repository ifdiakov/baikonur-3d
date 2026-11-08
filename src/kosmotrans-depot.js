import * as THREE from 'three';
import {MUSEUM_METRE} from './museum-scale.js';
export const DEPOT_VERSION='kosmotrans-depot-20261108-v1';
export const DEPOT_PLACEMENT=Object.freeze({map:Object.freeze([566.5,550]),yaw:0,footprintMetres:Object.freeze([157,293]),side:'west-of-main-ad',groundY:-2.69});
export function createKosmotransDepot({parent,clickable=[],index=-1,loadSource=loadDepotSource}={}){
 const root=new THREE.Group();root.name='ЖД депо «Космотранс»';root.position.set((DEPOT_PLACEMENT.map[0]-650)*3.4,DEPOT_PLACEMENT.groundY,(DEPOT_PLACEMENT.map[1]-522.5)*3.4);root.scale.setScalar(MUSEUM_METRE);root.userData.museumComponent='kosmotrans-depot';parent?.add(root);
 // This flat apron also protects the complete lazy-loaded model from DEM relief.
 const apron=new THREE.Mesh(new THREE.PlaneGeometry(157,293),new THREE.MeshStandardMaterial({color:0xa89b80,roughness:1}));apron.rotation.x=-Math.PI/2;apron.position.y=-.05;apron.receiveShadow=true;apron.name='Плоское основание двора';root.add(apron);
 const register=mesh=>{mesh.userData.idx=index;clickable.push(mesh);};register(apron);
 let pending=null,model=null;const state={version:DEPOT_VERSION,status:'idle',error:null,map:[...DEPOT_PLACEMENT.map],side:DEPOT_PLACEMENT.side,illustrative:true};
 async function load(){
  if(model)return true;if(pending)return pending;state.status='loading';state.error=null;
  pending=(async()=>{try{const source=await loadSource();model=source.scene;
   model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;register(o);}});root.add(model);state.status='ready';state.asset=source.manifest.asset;return true;
  }catch(error){state.status='error';state.error=String(error.message||error);return false;}finally{pending=null;}})();return pending;
 }
 function inspect(camera,controls,{mobile=false,wide=false}={}){
  root.updateWorldMatrix(true,false);
  controls.target.copy(root.localToWorld(new THREE.Vector3(0,mobile?-45:5,0)));
  camera.position.copy(root.localToWorld(new THREE.Vector3(...(wide?[430,600,610]:mobile?[400,540,650]:[260,300,390]))));controls.update();camera.updateMatrixWorld();
 }
 return {root,load,inspect,stats:()=>({...state,position:root.position.toArray(),scale:root.scale.x,instances:model?1:0,visible:root.visible})};
}
export async function loadDepotSource(){
 const base=new URL('../assets/models/kosmotrans-depot/',import.meta.url);
 const [{GLTFLoader},{MeshoptDecoder},response,manifestResponse]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs'),fetch(new URL('model.glb?v='+DEPOT_VERSION,base),{signal:AbortSignal.timeout(30000)}),fetch(new URL('manifest.json?v='+DEPOT_VERSION,base),{signal:AbortSignal.timeout(15000)})]);
 if(!response.ok||!manifestResponse.ok)throw Error('Не удалось загрузить депо');
 const [bytes,manifest]=await Promise.all([response.arrayBuffer(),manifestResponse.json()]);
 if(manifest.version!==DEPOT_VERSION||bytes.byteLength!==manifest.asset.bytes||bytes.byteLength>1500000)throw Error('Неверный файл депо');
 const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,base.href);
 const box=new THREE.Box3().setFromObject(scene),size=box.getSize(new THREE.Vector3()).toArray();
 if(size.some((n,i)=>Math.abs(n-manifest.bounds.size[i])>.03)||Math.abs(box.min.y)>.02)throw Error('Неверный масштаб или основание депо');
 return {scene,manifest};
}
