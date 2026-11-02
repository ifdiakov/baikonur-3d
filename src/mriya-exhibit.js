import * as THREE from 'three';

export const MRIYA_VERSION='mriya-buran-reference-v2';
const installations=new WeakMap();
export const getMriyaInstallation=root=>installations.get(root);
const ASSETS={far:new URL('../assets/models/mriya-buran/far-v2.glb',import.meta.url).href,near:new URL('../assets/models/mriya-buran/near-v2.glb',import.meta.url).href};
const APRON_Y=1.75;

// The OBJ is in metres, +Y up, with the nose along -X. Airport aircraft face +Z.
function prepareModel(model){
 const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
 const aircraft=new THREE.Group(),orbiter=new THREE.Group();
 const frame=new THREE.Group();frame.rotation.y=Math.PI/2;
 model.position.set(-center.x,1.6-bounds.min.y,-center.z);frame.add(model);frame.updateWorldMatrix(true,true);
 const meshes=[];model.traverse(m=>{if(m.isMesh)meshes.push(m);});
 for(const mesh of meshes){
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const isBuran=materials.every(m=>m.name.startsWith('Buran'));
  (isBuran?orbiter:aircraft).attach(mesh);
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.museumComponent=isBuran?'mriya-buran-orbiter':'mriya-imported-model';
 }
 if(!orbiter.children.length)throw Error('Buran meshes missing from the carrier model');
 return {aircraft,orbiter,dimensions:bounds.getSize(new THREE.Vector3()).toArray()};
}

function parkedGear(){
 const group=new THREE.Group();group.name='Мрия · выпущенные шасси';
 const tyre=new THREE.MeshStandardMaterial({color:0x25282b,roughness:.9});
 const metal=new THREE.MeshStandardMaterial({color:0xb4bec2,metalness:.65,roughness:.35});
 const wheels=new THREE.InstancedMesh(new THREE.CylinderGeometry(.65,.65,.42,16),tyre,32);
 const hubs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.29,.29,.44,12),metal,32);
 wheels.name='Мрия · 32 колеса';wheels.userData.museumComponent='mriya-parked-wheels';
 const legs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.15,1,8),metal,16);
 const wheelMatrix=new THREE.Matrix4(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
 let wheel=0,leg=0;
 function axle(x,z,top){
  for(const dx of [-.48,.48]){wheelMatrix.compose(new THREE.Vector3(x+dx,.65,z),q,new THREE.Vector3(1,1,1));wheels.setMatrixAt(wheel,wheelMatrix);hubs.setMatrixAt(wheel++,wheelMatrix);}
  legs.setMatrixAt(leg++,new THREE.Matrix4().compose(new THREE.Vector3(x,(top+.65)/2,z),new THREE.Quaternion(),new THREE.Vector3(1,top-.65,1)));
 }
 for(const side of [-1,1]){
  for(let i=0;i<7;i++)axle(side*3.25,-12+i*1.8,4.4);
  axle(side*1.05,27,4.3);
 }
 group.add(wheels,hubs,legs);group.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
 group.userData.wheelBottom=0;return group;
}

export function installMriyaExhibit(root,fallback,cx,cz,{eventTarget=root}={}){
 const holder=new THREE.Group();holder.name='Ан-225 «Мрия» с «Бураном» · импортированная модель';holder.position.set(cx,APRON_Y,cz);root.add(holder);
 const movingAircraft=new THREE.Group(),movingOrbiter=new THREE.Group();holder.add(movingAircraft,movingOrbiter);
 const lod=new THREE.LOD(),orbiterLod=new THREE.LOD();movingAircraft.add(lod);movingOrbiter.add(orbiterLod);
 const gear=parkedGear();gear.visible=false;movingAircraft.add(gear);
 const state=root.userData.airport.mriya={version:MRIYA_VERSION,status:'loading',loaded:[],requested:[],errors:[],wheels:32,apronY:APRON_Y,modelScale:1,
  physicalUnits:'metres',physicalToAirportLocal:root.userData.airport.physicalToLocal??1,
  nearBytes:2176700,farBytes:1188432};
 let replaced=false;
 function attach(gltf,detail){
  const prepared=prepareModel(gltf.scene),model=prepared.aircraft;model.name='Мрия · '+detail;prepared.orbiter.name='Буран · '+detail;
  // LOD distances are world distances; the root uses the airport's common scale.
  const distance=detail==='near'?0:360*root.getWorldScale(new THREE.Vector3()).x;
  lod.addLevel(model,distance,.15);orbiterLod.addLevel(prepared.orbiter,distance,.15);
  const removed=[];
  if(!replaced){fallback.traverse(m=>{if(m.isMesh)removed.push(m);});fallback.removeFromParent();gear.visible=true;replaced=true;}
  const added=[];for(const part of [model,prepared.orbiter])part.traverse(m=>{if(m.isMesh)added.push(m);});
  eventTarget.dispatchEvent({type:'museum-exhibit-loaded',added,removed});
  state.loaded.push(detail);state.status=state.loaded.includes('near')&&state.loaded.includes('far')?'ready':'partial';
  state.dimensions=prepared.dimensions;state.orbiterMeshCount=prepared.orbiter.children.length;let draws=0,triangles=0;for(const part of [model,prepared.orbiter])part.traverse(m=>{if(m.isMesh){draws+=m.geometry.groups.length||1;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});state.drawCallsPerLevel=draws;state.triangles=triangles;state.paint='reference-white-red-mriya-thermal-buran';
  holder.updateWorldMatrix(true,true);
 }
 // Keep the existing silhouette until the first usable museum view is shown.
 // The close-up mesh is downloaded only when the visitor approaches this
 // exhibit or requests it explicitly; a THREE.LOD alone does not defer bytes.
 const pending=new Map();let loaderReady=null;
 function requestLevel(detail,{retry=false}={}){
  if(state.loaded.includes(detail))return Promise.resolve(true);
  const key='mriya-'+detail;
  if(pending.has(detail)&&!retry){globalThis.__MUSEUM_STARTUP?.promote?.(key,100);return pending.get(detail);}
  if(!state.requested.includes(detail))state.requested.push(detail);
  const job=async()=>{
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),25000);
   try{
    if(!loaderReady)loaderReady=Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')])
     .then(([{GLTFLoader},{MeshoptDecoder}])=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder));
    const loader=await loaderReady;
    const response=await fetch(ASSETS[detail],{signal:abort.signal});
    if(!response.ok)throw new Error('Мрия: HTTP '+response.status);
    const gltf=await loader.parseAsync(await response.arrayBuffer(),new URL('.',ASSETS[detail]).href);
    if(abort.signal.aborted)throw new Error('Загрузка модели заняла слишком много времени');
    attach(gltf,detail);return true;
   }catch(error){
    if(!replaced)state.status='fallback';
    state.errors.push({detail,message:String(error.message||error)});return false;
   }finally{clearTimeout(timer);}
  };
  const result=globalThis.__MUSEUM_STARTUP?.defer?globalThis.__MUSEUM_STARTUP.defer(job,{key,priority:detail==='near'?100:4}):job();
  pending.set(detail,result);return result;
 }
 const cameraPosition=new THREE.Vector3(),holderPosition=new THREE.Vector3(),worldScale=new THREE.Vector3();
 const controller={holder,state,ready:Promise.resolve(false),requestDetail:()=>requestLevel('near'),
  update(camera){
   if(!camera||pending.has('near')||!holder.visible)return;
   for(let ancestor=holder.parent;ancestor;ancestor=ancestor.parent)if(!ancestor.visible)return;
   camera.getWorldPosition(cameraPosition);holder.getWorldPosition(holderPosition);root.getWorldScale(worldScale);
   if(cameraPosition.distanceTo(holderPosition)<480*Math.abs(worldScale.x))requestLevel('near');
  },setPose({aircraftZ=0,lift=0,orbiterZ=0}={}){
  movingAircraft.position.z=aircraftZ;movingOrbiter.position.set(0,lift,orbiterZ);
  state.loadingPose={aircraftZ,lift,orbiterZ};holder.updateWorldMatrix(true,true);
 },bounds(){holder.updateWorldMatrix(true,true);return {aircraft:new THREE.Box3().setFromObject(movingAircraft),orbiter:new THREE.Box3().setFromObject(movingOrbiter)};}};
 installations.set(eventTarget,controller);controller.setPose({});
 if(typeof window!=='undefined'){
  const farReady=requestLevel('far');
  // The standalone archive has no museum queue or proximity controller.
  // Preserve its existing sequential loading of both detail levels.
  controller.ready=globalThis.__MUSEUM_STARTUP?.defer?farReady:farReady.then(()=>requestLevel('near'));
 }
 return controller;
}
