import * as THREE from 'three';
import {createLightField} from './light-field.js?v=20261031-road-markings-v1';

// Traffic assets are deliberately separate from the museum model catalogue.
export const ROAD_FLEET_VERSION='road-fleet-20261108-v1';
export const ROAD_FLEET=Object.freeze({
 'land-cruiser':{label:'Toyota Land Cruiser 300',paint:'black',halfWidth:1.05},
 'uaz-patriot':{label:'УАЗ Патриот',paint:'original',halfWidth:1.05},
 'uaz-bukhanka':{label:'УАЗ-452 «Буханка»',paint:'grey',halfWidth:1.05}
});
const templates=new Map(),ids=Object.keys(ROAD_FLEET);
export function roadFleetKind(index){return ids[index%ids.length];}

function checkManifest(manifest,id){
 if(manifest.version!==ROAD_FLEET_VERSION||manifest.id!==id||manifest.unit!=='metre'||manifest.forward!=='+Z'||manifest.paint!==ROAD_FLEET[id].paint)throw Error('Неверный манифест автомобиля: '+id);
 const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
 if(!vector(manifest.bounds?.size)||!manifest.bounds.size.every(n=>n>0)||!Number.isFinite(manifest.halfWidth)||manifest.halfWidth<=0)throw Error('Неверные размеры автомобиля');
 if(!Array.isArray(manifest.wheels)||manifest.wheels.length!==4||new Set(manifest.wheels.map(w=>w.name)).size!==4||manifest.wheels.some(w=>!w.name||!vector(w.center)||!(w.radius>0)))throw Error('Неверные колёса автомобиля');
 if(!Array.isArray(manifest.lights)||manifest.lights.length!==4||manifest.lights.some(l=>!vector(l.position)||!['head','tail'].includes(l.kind)))throw Error('Неверные огни автомобиля');
}

export function cloneRoadFleetSource(source,id){
 checkManifest(source.manifest,id);
 const scene=source.scene.clone(true),materials=new Map();
 scene.traverse(o=>{o.userData.pickable=false;if(!o.isMesh)return;
  const copy=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};
  o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);
 });
 // Every traffic instance shares immutable geometry/textures, but owns its
 // opacity and wheel transforms. No source-colour override touches Patriot.
 return {scene,manifest:source.manifest};
}

export async function loadRoadFleetSource(id){
 if(!ROAD_FLEET[id])throw Error('Неизвестный автомобиль: '+id);
 if(!templates.has(id))templates.set(id,(async()=>{
  const base=new URL('../assets/models/road-fleet/'+id+'/',import.meta.url);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const get=async(name,binary)=>{const u=new URL(name,base);u.searchParams.set('v',ROAD_FLEET_VERSION);
    const r=await fetch(u,{signal:controller.signal,mode:'same-origin',credentials:'same-origin',redirect:'error'});
    if(!r.ok)throw Error('Автомобиль '+id+': HTTP '+r.status);return binary?r.arrayBuffer():r.json();};
   const [bytes,manifest,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([get('model.glb',true),get('manifest.json',false),import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
   checkManifest(manifest,id);
   if(bytes.byteLength!==manifest.asset?.bytes)throw Error('Неполный файл автомобиля');
   const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{
    if(url.startsWith('data:')||(url.startsWith('blob:')&&new URL(url).origin===location.origin))return url;
    throw Error('Внешний ресурс автомобиля');
   });
   const {scene}=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,base.href);
   const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3()).toArray();
   if(size.some((n,i)=>!Number.isFinite(n)||Math.abs(n-manifest.bounds.size[i])>.02)||Math.abs(bounds.min.y)>.02)throw Error('Неверный масштаб или уровень колёс');
   for(const wheel of manifest.wheels)if(!scene.getObjectByName(wheel.name))throw Error('Нет колеса '+wheel.name);
   return {scene,manifest};
  }finally{clearTimeout(timer);}
 })().catch(error=>{templates.delete(id);throw error;}));
 return cloneRoadFleetSource(await templates.get(id),id);
}

export function createRoadFleetVehicle(parent,id,{loadSource=loadRoadFleetSource}={}){
 const spec=ROAD_FLEET[id];if(!spec)throw Error('Неизвестный автомобиль: '+id);
 const root=new THREE.Group();root.name=spec.label;root.visible=false;
 root.userData.pickable=false;root.userData.museumComponent='moving-road-vehicle';parent.add(root);
 const state={version:ROAD_FLEET_VERSION,id,paint:spec.paint,status:'idle',error:null};
 let detail=null,pending=null,lastPose=null,lastNight=false;
 const api={root,type:id,halfWidth:spec.halfWidth,wheels:[],sourceState:state,
  async loadDetail(){
   if(detail)return true;if(pending)return pending;
   state.status='loading';state.error=null;
   pending=(async()=>{try{
    await Promise.resolve();
    const {scene,manifest}=await loadSource(id);checkManifest(manifest,id);
    // Check all wheel nodes before modifying the loaded scene, so a failed
    // asset can be retried without leaving half-attached parts behind.
    const parts=manifest.wheels.map(w=>{const p=scene.getObjectByName(w.name);if(!p)throw Error('Нет колеса '+w.name);return p;});
    const wheels=manifest.wheels.map((w,i)=>{const pivot=new THREE.Group();pivot.name=w.name+'-pivot';pivot.position.fromArray(w.center);scene.add(pivot);scene.updateMatrixWorld(true);pivot.attach(parts[i]);return pivot;});
    const lights=createLightField(scene,manifest.lights.map(l=>({x:l.position[0],y:l.position[1],z:l.position[2],height:0,color:l.kind==='head'?0xffedc7:0xff382a,size:l.kind==='head'?4:2.8})),{name:spec.label+' · фары и габариты',minPixels:3,fog:true});
    const materials=new Map();scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!materials.has(m))materials.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});});
    detail={scene,manifest,wheels,lights,materials};root.add(scene);api.wheels=wheels;api.halfWidth=manifest.halfWidth;
    state.status='ready';state.triangles=manifest.asset.triangles;
    if(lastPose)api.update(lastPose,lastNight);return true;
   }catch(error){state.status='error';state.error=String(error.message||error);return false;}finally{pending=null;}})();return pending;
  },
  update(pose,night){
   lastPose=pose;lastNight=night;
   root.position.copy(pose.position);root.rotation.set(-Math.asin(THREE.MathUtils.clamp(pose.tangent.y,-1,1)),Math.atan2(pose.tangent.x,pose.tangent.z),0,'YXZ');
   root.visible=!!detail&&pose.opacity>.003;if(!detail)return;
   for(const [m,original]of detail.materials){m.opacity=original.opacity*pose.opacity;
    const transparent=original.transparent||pose.opacity<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}
    m.depthWrite=original.depthWrite&&pose.opacity>.95;
   }
   const scale=root.scale.x||1;
   detail.wheels.forEach((wheel,i)=>{wheel.rotation.x=pose.distance*pose.direction/(detail.manifest.wheels[i].radius*scale);});
   detail.lights.setStrength(pose.opacity*(night?1.3:.07));
  }
 };
 return api;
}
