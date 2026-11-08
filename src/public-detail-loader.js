import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
export async function loadSiteAsset(url,signal){
 const response=await fetch(url,{signal});if(!response.ok)throw Error('Не удалось загрузить модель ('+response.status+').');
 const raw=await response.arrayBuffer();let bytes=raw;
 if(new Uint8Array(raw)[0]===31&&new Uint8Array(raw)[1]===139){
  if(typeof DecompressionStream==='undefined')throw Error('Браузеру недоступна распаковка модели. Откройте подробную сцену.');
  bytes=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 }
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const gltf=await new GLTFLoader().parseAsync(bytes,'');return {root:gltf.scene,decodedBytes:bytes.byteLength};
}
export function disposeSite(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const t of textures){t.dispose();t.source?.data?.close?.();}for(const m of materials)m.dispose();for(const g of geometries)g.dispose();root.removeFromParent();}
