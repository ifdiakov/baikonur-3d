import * as THREE from 'three';
import {MODEL_CATALOG,resolveModelId} from './model-catalog.js?v=20261101-r16-exhibit-v1';
// Ignore hidden light pools and proxy geometry when framing a real exhibit.
export function inspectionBounds(root){
 root.updateWorldMatrix(true,true);const bounds=new THREE.Box3(),part=new THREE.Box3(),point=new THREE.Vector3();
 root.traverseVisible(o=>{if(!o.isMesh)return;if(root.userData.inspectionPrecise&&!o.isInstancedMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)bounds.expandByPoint(point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));return;}if(o.isInstancedMesh){if(!o.boundingBox)o.computeBoundingBox();part.copy(o.boundingBox);}else{if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();part.copy(o.geometry.boundingBox);}bounds.union(part.applyMatrix4(o.matrixWorld));});return bounds;
}
export function disposeInspectionModel(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
}
async function gltf(path,signal){
 const url=new URL('../assets/models/'+path,import.meta.url);url.searchParams.set('v','20261101-source-exhibits-v2');
 const [{GLTFLoader},{MeshoptDecoder},response]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs'),fetch(url,{signal,credentials:'same-origin',redirect:'error'})]);
 if(!response.ok)throw new Error('Файл модели недоступен');const bytes=await response.arrayBuffer();
 const manager=new THREE.LoadingManager();manager.setURLModifier(uri=>{if(uri.startsWith('data:')||uri.startsWith('blob:')&&new URL(uri).origin===location.origin)return uri;throw new Error('Внешний ресурс модели');});
 return (await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,new URL('.',url).href)).scene;
}
export async function createInspectionModel(id,{signal}={}){
 id=resolveModelId(id);const spec=MODEL_CATALOG[id];if(!spec)throw new Error('Модель не найдена');let root,setExploded=null,setVehicleVisible=null,setGear=null,initialGear=1,update=null;const owned=[];
 if(spec.asset){root=await gltf(spec.asset,signal);root.rotation.y=spec.yaw||0;if(id==='n1'||id==='mig25')root.userData.inspectionPrecise=true;}
 else if(id.startsWith('zenit-')){const {createZenitRocket}=await import('./zenit-rocket.js?v=20261101-source-exhibits-v2');const model=createZenitRocket({variant:id==='zenit-land'?'land':'sea'});root=model.root;setExploded=model.setExploded;}
 else if(id==='aircraft'){
  const {buildAlrosaAircraft}=await import('./aircraft-livery.js?v=20261028-museum4-osm-live-v2');root=new THREE.Group();const aircraft=buildAlrosaAircraft(root);aircraft.model.scale.setScalar(1);aircraft.setEvening(true);aircraft.setGear(1);update=time=>aircraft.updateDetails(time/1000);
 }else if(id==='train'||id==='coach'){
  const {buildRailVehicle}=await import('./rail-vehicles.js?v=20261031-facilities-rails-lighting-v1');root=new THREE.Group();const vehicle=buildRailVehicle(root,{wagon:id==='coach',gauge:1.52,last:id==='coach'});vehicle.setEvening(false);for(const part of [...vehicle.axles,...vehicle.bogies])part.root.position.z=part.offset;
 }else if(id==='proton'){
  const {createProtonRocket}=await import('./proton-rocket.js?v=20261101-source-exhibits-v2');const rocket=createProtonRocket();root=rocket.root;setExploded=rocket.setExploded;
 }else if(id==='buran'){
  const [{buildLandingAircraft},source]=await Promise.all([import('./buran-landing-aircraft.js?v=20261101-without-ll22-v1'),gltf('rockets/energia-buran.glb',signal)]);const actors=buildLandingAircraft({sourceBuran:source});actors.update({gear:1,airbrake:0});root=actors.buran;owned.push(source);
 }else if(id==='silo'){
  const {buildSiloPad,siloController}=await import('./silo-pad.js?v=20261031-facilities-rails-lighting-v1');root=new THREE.Group();buildSiloPad(root);const controller=siloController(root);update=(time,camera,target)=>controller.update(time,camera,target);
 }else if(id==='proton-pad'){
  const {buildProtonPosition,protonPositionController}=await import('./proton-launch.js?v=20261101-proton-launch-v1');root=new THREE.Group();buildProtonPosition(root);setVehicleVisible=protonPositionController(root).setRocketVisible;
 }else if(id==='site45'){
  const {buildSite45}=await import('./site45.js?v=20261101-source-exhibits-v2');root=new THREE.Group();buildSite45(root);
 }
 if(!root)throw new Error('Не удалось собрать модель');root.updateMatrixWorld(true);
 const bounds=inspectionBounds(root),size=bounds.getSize(new THREE.Vector3());if(bounds.isEmpty()||![...size.toArray()].every(Number.isFinite)){disposeInspectionModel(root);throw new Error('В модели нет геометрии');}
 return {root,spec,size:id.startsWith('zenit-')?new THREE.Vector3(4.24,id==='zenit-land'?58.7:59.6,4.24):size,setExploded,setGear,setVehicleVisible,initialGear,update,dispose:()=>{disposeInspectionModel(root);for(const extra of owned)disposeInspectionModel(extra);}};
}
