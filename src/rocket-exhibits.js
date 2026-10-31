import * as THREE from 'three';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';

export const ROCKET_MODEL_VERSION='rocket-exhibits-v1';
export const ROCKET_MODELS=Object.freeze({
  soyuz:{title:'Союз',description:'Пилотируемая компоновка · ракета-экспонат',height:49.512},
  'energia-polyus':{title:'Энергия — Полюс',description:'Ракета-носитель и аппарат «Полюс»',height:58.770},
  'energia-buran':{title:'Энергия — Буран',description:'Орбитальный корабль на ракете-носителе',height:58.815},
  energia:{title:'Энергия',description:'Ракета-носитель без боковой полезной нагрузки',height:58.770},
  'energia-m':{title:'Энергия-М',description:'Двухблочная компоновка проекта',height:50.257}
});
export const TUA_ROCKET_CHOICES=['energia-polyus','energia-buran','energia','energia-m'];
const cache=new Map();

function validateBinary(bytes){
  const data=new DataView(bytes);
  if(bytes.byteLength<20||data.getUint32(0,true)!==0x46546c67||data.getUint32(4,true)!==2||data.getUint32(8,true)!==bytes.byteLength)throw new Error('Повреждён файл модели');
  let document;
  for(let offset=12;offset<bytes.byteLength;){
    if(offset+8>bytes.byteLength)throw new Error('Обрезан блок модели');
    const length=data.getUint32(offset,true),type=data.getUint32(offset+4,true);offset+=8;
    if(offset+length>bytes.byteLength)throw new Error('Обрезана геометрия модели');
    if(type===0x4e4f534a)document=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,offset,length)));
    offset+=length;
  }
  if(document?.asset?.version!=='2.0')throw new Error('Неизвестный формат модели');
  function inspect(value){
    if(!value||typeof value!=='object')return;
    for(const [key,item]of Object.entries(value)){
      if(key==='uri'&&typeof item==='string'&&!item.startsWith('data:'))throw new Error('В модели найдена внешняя ссылка');
      if(item&&typeof item==='object')inspect(item);
    }
  }
  inspect(document);
}

async function loadModel(id){
  if(!ROCKET_MODELS[id])throw new Error('Неизвестная ракета');
  if(cache.has(id))return cache.get(id);
  const pending=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{
      const url=new URL('../assets/models/rockets/'+id+'.glb',import.meta.url);url.searchParams.set('v',ROCKET_MODEL_VERSION);
      const manifestUrl=new URL('../assets/models/rockets/'+id+'.json',import.meta.url);manifestUrl.searchParams.set('v',ROCKET_MODEL_VERSION);
      if(url.origin!==location.origin)throw new Error('Модель должна загружаться с сайта музея');
      const fetchPart=async(url,binary)=>{
        const response=await fetch(url,{signal:controller.signal,mode:'same-origin',redirect:'error',credentials:'same-origin'});
        if(!response.ok)throw new Error('Модель недоступна: HTTP '+response.status);
        return binary?response.arrayBuffer():response.json();
      };
      const [bytes,manifest,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([
        fetchPart(url,true),fetchPart(manifestUrl,false),import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')
      ]);
      validateBinary(bytes);
      if(manifest.id!==id||manifest.version!==ROCKET_MODEL_VERSION||manifest.normalization?.unit!=='metre')throw new Error('Неверный масштаб модели');
      const manager=new THREE.LoadingManager();manager.setURLModifier(resource=>{
        if(resource.startsWith('data:')||(resource.startsWith('blob:')&&new URL(resource).origin===location.origin))return resource;
        throw new Error('Внешний ресурс модели заблокирован');
      });
      const gltf=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,new URL('.',url).href);
      const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());
      if(![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)||Math.abs(size.y-manifest.bounds.size[1])>.1)throw new Error('Размеры модели не прошли проверку');
      gltf.scene.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;object.userData.museumComponent='rocket-exhibit';}});
      return {scene:gltf.scene,manifest};
    }finally{clearTimeout(timer);}
  })();
  cache.set(id,pending);
  try{return await pending;}catch(error){cache.delete(id);throw error;}
}

function meshes(root){const result=[];root?.traverse(m=>{if(m.isMesh)result.push(m);});return result;}

export function createRocketExhibits({onChange=()=>{}}={}){
  const entries=new Map();
  function snapshot(entry){
    entry.holder.updateWorldMatrix(true,false);
    let effectiveVisible=true;for(let object=entry.holder;object;object=object.parent)if(!object.visible){effectiveVisible=false;break;}
    return {key:entry.key,siteId:entry.siteId,modelId:entry.modelId,status:entry.status,visible:entry.holder.visible,
      effectiveVisible,
      position:entry.holder.position.toArray(),quaternion:entry.holder.quaternion.toArray(),
      metresToWorld:entry.holder.getWorldScale(new THREE.Vector3()).toArray(),commonMetre:MUSEUM_METRE,
      bounds:entry.manifest?.bounds,assetStats:entry.manifest?.assetStats,error:entry.error};
  }
  function add(key,{parent,position=[0,0,0],rotation=[0,0,0],quaternion,holder,modelId,siteId}){
    if(entries.has(key))throw new Error('Повторная опора экспоната: '+key);
    const group=holder||new THREE.Group();group.name='Ракета-экспонат · '+key;
    if(!holder)parent.add(group);
    group.position.fromArray(position);group.rotation.set(...rotation);if(quaternion)group.quaternion.fromArray(quaternion);
    group.scale.setScalar(1);group.visible=true;
    const entry={key,siteId,holder:group,modelId:null,status:'empty',error:null,generation:0,manifest:null,pending:Promise.resolve()};
    entries.set(key,entry);if(modelId)setModel(key,modelId);return entry;
  }
  function setModel(key,id){
    const entry=entries.get(key);if(!entry||!ROCKET_MODELS[id])return Promise.resolve(false);
    const generation=++entry.generation;entry.modelId=id;entry.status='loading';entry.error=null;
    entry.holder.userData.rocketExhibit={key,modelId:id,status:'loading'};onChange({key,entry:snapshot(entry),added:[],removed:[]});
    entry.pending=(async()=>{
      try{
        const loaded=await loadModel(id);if(generation!==entry.generation)return false;
        const removed=meshes(entry.holder);entry.holder.clear();
        // Clones share immutable GPU geometry, images and materials; only pose
        // and visibility belong to a particular exhibit placement.
        const instance=loaded.scene.clone(true);entry.holder.add(instance);entry.status='ready';entry.manifest=loaded.manifest;
        entry.holder.userData.rocketExhibit={key,modelId:id,status:'ready',unit:'metre'};
        const added=meshes(instance);for(const mesh of added)mesh.userData.rocketExhibitKey=key;
        onChange({key,entry:snapshot(entry),added,removed});return true;
      }catch(error){
        if(generation!==entry.generation)return false;
        entry.status='error';entry.error=error.name==='AbortError'?'Загрузка заняла слишком много времени':error.message;
        entry.holder.userData.rocketExhibit={key,modelId:id,status:'error'};onChange({key,entry:snapshot(entry),added:[],removed:[]});return false;
      }
    })();
    return entry.pending;
  }
  function setVisible(key,value){const entry=entries.get(key);if(!entry)return false;entry.holder.visible=Boolean(value);return entry.holder.visible;}
  return {add,setModel,setVisible,get:key=>entries.get(key),whenReady:()=>Promise.all([...entries.values()].map(e=>e.pending)),
    stats:()=>({version:ROCKET_MODEL_VERSION,commonMetre:MUSEUM_METRE,loadedAssetCount:cache.size,placements:[...entries.values()].map(snapshot)})};
}
