import * as THREE from 'three';
export const PROTON_SOURCE_VERSION='proton-source-20261108-v1';
const templates=new Map();
async function template(part){
 if(!['rocket','gantry','pad'].includes(part))throw Error('Unknown Proton assembly');
 if(!templates.has(part))templates.set(part,(async()=>{
  const [{GLTFLoader},{MeshoptDecoder},response]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs'),fetch(new URL(`../assets/models/proton/${part}-v1.glb?v=${PROTON_SOURCE_VERSION}`,import.meta.url),{credentials:'same-origin',redirect:'error'})]);
  if(!response.ok)throw Error('Не удалось загрузить модель «Протона»');
  const manager=new THREE.LoadingManager();manager.setURLModifier(uri=>{if(uri.startsWith('data:')||uri.startsWith('blob:')&&new URL(uri).origin===location.origin)return uri;throw Error('External model resource');});
  return (await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(await response.arrayBuffer(),new URL('../assets/models/proton/',import.meta.url).href)).scene;
 })().catch(error=>{templates.delete(part);throw error;}));
 return templates.get(part);
}
export async function loadProtonPart(part,{isolated=false}={}){
 const root=(await template(part)).clone(true);root.rotation.y=Math.PI;
 if(isolated){const geometries=new Map(),materials=new Map(),textures=new Map();root.traverse(o=>{if(!o.isMesh)return;if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());o.geometry=geometries.get(o.geometry);const clone=m=>{if(!materials.has(m)){const next=m.clone();for(const [key,value]of Object.entries(next))if(value?.isTexture){if(!textures.has(value))textures.set(value,value.clone());next[key]=textures.get(value);}materials.set(m,next);}return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);});}
 root.traverse(o=>{if(o.isMesh)o.receiveShadow=true;});
 root.userData.protonSource={version:PROTON_SOURCE_VERSION,part};return root;
}
