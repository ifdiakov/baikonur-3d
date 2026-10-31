import * as THREE from 'three';

// A camera gesture is not a selection. In particular, the transparent part
// of Saturn's large hill must never act as a site-sized invisible button.
const BACKDROP=/^(murguduk-hill|terrain|ground|steppe|berm|internal-access-road|service-lane|antenna-service-access|northwest-gate-pavement|northwest-gate-shoulder|saturn-road.*)$/i;
export function isSceneSelectable(object){
 if(!object?.isMesh||!Number.isInteger(object.userData?.idx))return false;
 for(let node=object;node;node=node.parent){
  if(!node.visible||node.userData?.pickable===false||node.userData?.terrainSurface)return false;
  if(BACKDROP.test(node.userData?.museumComponent||'')||BACKDROP.test(node.name||''))return false;
 }
 const mats=Array.isArray(object.material)?object.material:[object.material];
 return mats.some(m=>m&&m.visible!==false&&m.opacity!==0);
}
export function installSceneSelection({element,camera,controls,getObjects,onSelect,blocked=()=>false,onNavigate=()=>{}}){
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),active=new Set();
 let down=null,permit=null;
 const state={version:'1.0-no-terrain-jump',selections:0,ignoredGestures:0,ignoredBackdrop:0,lastSelected:null};
 const reset=()=>{down=null;permit=null;active.clear();};
 function inside(e){const r=element.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;}
 function move(e){
  if(!down||e.pointerId!==down.id)return;
  down.distance=Math.max(down.distance,Math.hypot(e.clientX-down.x,e.clientY-down.y));
  if(down.distance>6){down.cancelled=true;onNavigate();}
 }
 element.addEventListener('pointerdown',e=>{
  active.add(e.pointerId);permit=null;
  if(active.size!==1||e.isPrimary===false||e.button!==0||blocked()){
   if(down)down.cancelled=true;
   else down={id:e.pointerId,cancelled:true,x:e.clientX,y:e.clientY,distance:0};
   return;
  }
  down={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0,cancelled:false};
 },true);
 window.addEventListener('pointermove',move,true);
 window.addEventListener('pointerup',e=>{
  move(e);active.delete(e.pointerId);
  if(!down||e.pointerId!==down.id)return;
  if(!down.cancelled&&active.size===0&&e.button===0&&inside(e)&&!blocked()){
   permit={x:e.clientX,y:e.clientY,at:performance.now()};
  }else{permit=null;state.ignoredGestures++;}
  down=null;
 },true);
 window.addEventListener('pointercancel',reset,true);
 window.addEventListener('blur',reset);
 element.addEventListener('wheel',()=>{if(down)down.cancelled=true;permit=null;onNavigate();},{capture:true,passive:true});
 window.addEventListener('keydown',e=>{
  if(e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){reset();onNavigate();}
 });
 function visible(object){for(let n=object;n;n=n.parent)if(!n.visible)return false;return true;}
 function hitsAt(x,y,physicalOnly=true){
  const r=element.getBoundingClientRect();if(!r.width||!r.height)return [];
  pointer.set((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2);
  camera.updateMatrixWorld(true);ray.setFromCamera(pointer,camera);
  const objects=getObjects().filter(physicalOnly?isSceneSelectable:visible);
  return ray.intersectObjects(objects,false);
 }
 const describe=h=>h?{index:h.object.userData.idx,component:h.object.userData.museumComponent||h.object.name,point:h.point.toArray()}:null;
 element.addEventListener('click',e=>{
  const p=permit;permit=null;
  if(!p||e.button!==0||blocked()||performance.now()-p.at>600||Math.hypot(e.clientX-p.x,e.clientY-p.y)>3)return;
  const hit=hitsAt(e.clientX,e.clientY)[0];
  if(!hit){state.ignoredBackdrop++;return;}
  state.selections++;state.lastSelected=hit.object.userData.idx;onSelect(state.lastSelected,hit.object);
 });
 function pointForSite(index){
  const r=element.getBoundingClientRect();
  for(const object of getObjects().filter(o=>o.userData.idx===index&&isSceneSelectable(o)).slice(0,100)){
   if(object.isInstancedMesh)continue;
   const p=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);
   if(p.z< -1||p.z>1)continue;
   const x=r.left+(p.x+1)*r.width/2,y=r.top+(1-p.y)*r.height/2;
   if(x<r.left+10||x>r.right-10||y<r.top+10||y>r.bottom-10||document.elementFromPoint(x,y)!==element)continue;
   if(hitsAt(x,y)[0]?.object.userData.idx===index)return {x,y};
  }
  return null;
 }
 return {snapshot:()=>({...state,camera:camera.position.toArray(),target:controls.target.toArray(),activePointers:active.size}),
  inspectAt:(x,y)=>({legacy:describe(hitsAt(x,y,false)[0]),physical:describe(hitsAt(x,y,true)[0])}),pointForSite};
}
