import * as THREE from 'three';
export const TU204_VERSION='tu204-cpk-v1';
export const TU204_PARKING=Object.freeze({position:[-182,1.75,-80],yaw:-Math.PI/2,scale:1,stand:'3',length:40.19,wingspan:41.8,registration:'RA-64044',name:'Юрий Гагарин'});
export function installTu204Cpk(airport){
 const holder=new THREE.Group();holder.name='Ту-204-300 ЦПК · стоянка';holder.position.fromArray(TU204_PARKING.position);holder.rotation.y=TU204_PARKING.yaw;airport.add(holder);
 const state={version:TU204_VERSION,status:'loading',error:null,...TU204_PARKING,operator:'ЦПК имени Ю. А. Гагарина',modelId:'tu204',static:true,visible:true,drawCalls:0,triangles:0};airport.userData.airport.tu204=state;
 airport.userData.tu204Holder=holder;
 const ready=(async()=>{try{
  const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),url=new URL('../assets/models/tu204-cpk/model-v1.glb',import.meta.url).href;
  let model;for(let attempt=0;attempt<2;attempt++){try{const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Ту-204: HTTP '+response.status);model=(await loader.parseAsync(await response.arrayBuffer(),new URL('.',url).href)).scene;break;}catch(error){if(attempt)throw error;}}
  const bounds=new THREE.Box3().setFromObject(model);model.position.y=-bounds.min.y;
  model.traverse(mesh=>{if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.museumComponent='tu204-cpk';mesh.userData.modelId='tu204';state.drawCalls++;state.triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;if(mesh.material.map)mesh.material.map.anisotropy=4;});
  holder.add(model);state.status='ready';state.wheelBottom=TU204_PARKING.position[1];
  holder.updateMatrixWorld(true);const local=bounds.clone().translate(model.position).applyMatrix4(holder.matrix);state.localBounds={min:local.min.toArray(),max:local.max.toArray()};
  const chocks=new THREE.InstancedMesh(new THREE.BoxGeometry(.52,.22,.2),new THREE.MeshStandardMaterial({color:0xcda442,roughness:.85}),6);chocks.name='Ту-204 · колодки';let i=0;const m=new THREE.Matrix4();for(const [x,z,r]of [[0,14.8,.48],[-3.7,1.5,.63],[3.7,1.5,.63]])for(const s of [-1,1]){m.makeTranslation(x,.11,z+s*r);chocks.setMatrixAt(i++,m);}holder.add(chocks);return true;
 }catch(error){state.status='error';state.error=String(error.message||error);return false;}})();
 airport.userData.tu204Ready=ready;return {holder,ready,state};
}
