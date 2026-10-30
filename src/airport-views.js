import * as THREE from 'three';

export const KRAYNIY_TERMINAL_VIEWS=Object.freeze([
 ['all','Весь аэродром'],['airside','Аэровокзал'],['landside','Вход'],['top','Сверху']
]);
const validVector=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);

// All presets are expressed in the airport's own coordinates, so the real
// runway yaw, its museum scale and its source position remain authoritative.
export function krayniyViewPose(airport,view='airside',{aspect=1,fov=52,minElevation=Math.PI/6}={}){
 const terminal=airport?.terminal;
 if(airport?.key!=='krayniy'||!terminal?.camera)return null;
 if(!KRAYNIY_TERMINAL_VIEWS.some(([key])=>key===view))view='airside';
 let target,eye;
 if(view==='all'){
  const halfLength=airport.length/2+(airport.approachLength||0);
  const west=Math.min(terminal.center[0]-95,airport.apron[0]-115),east=airport.width/2+90;
  target=new THREE.Vector3((west+east)/2,0,0);
  const radius=Math.hypot(east-west,halfLength*2,terminal.tower?.height||40)/2;
  const vertical=THREE.MathUtils.degToRad(fov),horizontal=2*Math.atan(Math.tan(vertical/2)*Math.max(.1,aspect));
  const distance=radius/Math.sin(Math.min(vertical,horizontal)/2)*1.08;
  eye=target.clone().add(new THREE.Vector3(1,1.1,1.25).normalize().multiplyScalar(distance));
 }else{
  const preset=terminal.camera[view];
  if(!validVector(preset?.target)||!validVector(preset?.eye))return null;
  target=new THREE.Vector3(...preset.target);eye=new THREE.Vector3(...preset.eye);
  const offset=eye.clone().sub(target);
  // Preserve the facade side while meeting the museum's 30-degree camera rule.
  offset.y=Math.max(offset.y,Math.hypot(offset.x,offset.z)*Math.tan(minElevation));
  if(aspect<1)offset.multiplyScalar(1/Math.max(.1,aspect));
  eye.copy(target).add(offset);
 }
 return {view,target:target.toArray(),eye:eye.toArray()};
}

export function frameKrayniyTerminal(root,camera,controls,view='airside'){
 const minElevation=Math.max(Math.PI/6,Math.PI/2-(controls.maxPolarAngle??Math.PI/3));
 const pose=krayniyViewPose(root?.userData.airport,view,{aspect:camera.aspect,fov:camera.fov,minElevation});
 if(!pose)return null;
 root.updateWorldMatrix(true,false);
 const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
 controls.target.copy(root.localToWorld(new THREE.Vector3(...pose.target)));
 camera.position.copy(root.localToWorld(new THREE.Vector3(...pose.eye)));
 controls.update();camera.updateMatrixWorld(true);controls.enableDamping=damping;
 return pose.view;
}
