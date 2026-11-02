// One network request/decoded template per type. Instances own their resources:
// disposing an inspection view cannot invalidate a cached template or the train.
const templates=new Map();
export async function loadRailAsset(id,{signal}={}){
 if(!templates.has(id))templates.set(id,(async()=>{
  const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
  const url=new URL('../assets/models/'+(id==='coach'?'soviet-coach':'m62-kosmotrans')+'/model-v1.glb',import.meta.url);
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Поезд: HTTP '+response.status);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await response.arrayBuffer(),new URL('.',url).href)).scene;
 })().catch(error=>{templates.delete(id);throw error;}));
 const template=await templates.get(id);signal?.throwIfAborted();
 const result=template.clone(true),geometries=new Map(),materials=new Map(),textures=new Map();
 result.traverse(o=>{if(!o.isMesh)return;if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());o.geometry=geometries.get(o.geometry);
  const clone=m=>{if(!materials.has(m)){const c=m.clone();for(const [key,t]of Object.entries(m))if(t?.isTexture){if(!textures.has(t)){const tt=t.clone();tt.anisotropy=4;tt.needsUpdate=true;textures.set(t,tt);}c[key]=textures.get(t);}materials.set(m,c);}return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);o.castShadow=true;o.receiveShadow=true;o.userData.pickable=false;
 });return result;
}
