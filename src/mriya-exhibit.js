import * as THREE from 'three';

export const MRIYA_VERSION='mriya-buran-glb-v1';
const ASSETS={far:new URL('../assets/models/mriya-buran/far-v1.glb',import.meta.url).href,near:new URL('../assets/models/mriya-buran/near-v1.glb',import.meta.url).href};
const APRON_Y=1.75;

// The OBJ is in metres, +Y up, with the nose along -X. Airport aircraft face +Z.
function prepareModel(model){
 const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
 const pivot=new THREE.Group();pivot.rotation.y=Math.PI/2;
 model.position.set(-center.x,1.6-bounds.min.y,-center.z);pivot.add(model);
 model.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.userData.museumComponent='mriya-imported-model';}});
 pivot.userData.dimensions=bounds.getSize(new THREE.Vector3()).toArray();
 return pivot;
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

export function installMriyaExhibit(root,fallback,cx,cz){
 const holder=new THREE.Group();holder.name='Ан-225 «Мрия» с «Бураном» · импортированная модель';holder.position.set(cx,APRON_Y,cz);root.add(holder);
 const lod=new THREE.LOD();holder.add(lod);
 const gear=parkedGear();gear.visible=false;holder.add(gear);
 const state=root.userData.airport.mriya={version:MRIYA_VERSION,status:'loading',loaded:[],errors:[],wheels:32,apronY:APRON_Y,modelScale:1,nearBytes:1429676,farBytes:585748};
 let replaced=false;
 function attach(gltf,detail){
  const model=prepareModel(gltf.scene);model.name='Мрия · '+detail;
  // LOD distances are world distances; the root uses the airport's common scale.
  const distance=detail==='near'?0:360*root.getWorldScale(new THREE.Vector3()).x;
  lod.addLevel(model,distance,.15);
  const removed=[];
  if(!replaced){fallback.traverse(m=>{if(m.isMesh)removed.push(m);});fallback.removeFromParent();gear.visible=true;replaced=true;}
  const added=[];model.traverse(m=>{if(m.isMesh)added.push(m);});
  root.dispatchEvent({type:'museum-exhibit-loaded',added,removed});
  state.loaded.push(detail);state.status=state.loaded.includes('near')&&state.loaded.includes('far')?'ready':'partial';
  state.dimensions=model.userData.dimensions;state.drawCallsPerLevel=5;
  holder.updateWorldMatrix(true,true);
 }
 // Dynamic imports keep initial map construction synchronous and retain a fallback
 // if a model request fails. Both detail levels come from this same repository.
 if(typeof window!=='undefined'){
  (async()=>{
   const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('./vendor/meshopt_decoder-v1.mjs')]);
   const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
   for(const detail of ['far','near']){
    try{attach(await loader.loadAsync(ASSETS[detail]),detail);}catch(error){state.errors.push({detail,message:String(error.message||error)});}
   }
   if(!replaced)state.status='fallback';
  })().catch(error=>{state.status='fallback';state.errors.push({detail:'loader',message:String(error.message||error)});});
 }
 return holder;
}
