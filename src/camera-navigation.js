import * as THREE from 'three';

const ORBIT_SETTINGS=['minDistance','maxDistance','minPolarAngle','maxPolarAngle','enablePan','enableRotate','enableZoom','screenSpacePanning','panSpeed','rotateSpeed','zoomSpeed','autoRotate'];
export function captureOrbitSettings(controls){
 const saved={};for(const key of ORBIT_SETTINGS)saved[key]=controls[key];
 saved.mouseButtons={...controls.mouseButtons};saved.touches={...controls.touches};return saved;
}

// Follow mode orbits a small moving aircraft. Merely restoring its switches
// leaves that tiny orbit high above the ground: both pointer pan and keyboard
// speed then remain appropriate to the aircraft, not to the museum. Re-anchor
// the view to the ground, preserving its heading and height where possible.
export function releaseFollowCamera({camera,controls,savedControls,groundY=-2.755,bounds=null}){
 const before=camera.position.clone(),oldTarget=controls.target.clone(),oldDistance=before.distanceTo(oldTarget);
 const damping=controls.enableDamping;
 Object.assign(controls,savedControls);
 controls.mouseButtons={...savedControls.mouseButtons};controls.touches={...savedControls.touches};
 // Consume pending OrbitControls deltas once, then install an exact free pose.
 controls.enableDamping=false;controls.update();
 const toward=oldTarget.clone().sub(before),horizontal=Math.hypot(toward.x,toward.z);
 const direction=horizontal>1e-9?new THREE.Vector3(toward.x/horizontal,0,toward.z/horizontal):new THREE.Vector3(0,0,-1);
 const minPhi=Math.max(.03,Number.isFinite(controls.minPolarAngle)?controls.minPolarAngle:0);
 const maxPhi=Math.min(Math.PI/2-.12,Number.isFinite(controls.maxPolarAngle)?controls.maxPolarAngle:Math.PI/3);
 const phi=THREE.MathUtils.clamp(Math.atan2(horizontal,-toward.y),minPhi,maxPhi);
 const minimum=Math.max(24,Number.isFinite(controls.minDistance)?controls.minDistance:0);
 const maximum=Math.max(minimum,Number.isFinite(controls.maxDistance)?controls.maxDistance:1e6);
 const distance=THREE.MathUtils.clamp(Math.max(before.y-groundY,1)/Math.cos(phi),minimum,maximum);
 const target=before.clone().addScaledVector(direction,distance*Math.sin(phi));target.y=groundY;
 const position=target.clone().addScaledVector(direction,-distance*Math.sin(phi));position.y=groundY+distance*Math.cos(phi);
 if(bounds){
  const dx=THREE.MathUtils.clamp(target.x,bounds.minX,bounds.maxX)-target.x;
  const dz=THREE.MathUtils.clamp(target.z,bounds.minZ,bounds.maxZ)-target.z;
  target.x+=dx;target.z+=dz;position.x+=dx;position.z+=dz;
 }
 controls.target.copy(target);camera.position.copy(position);controls.update();controls.enableDamping=damping;camera.updateMatrixWorld(true);
 return {oldDistance,distance:camera.position.distanceTo(controls.target),target:controls.target.toArray(),groundY};
}

export function isCameraTextEntry(target){return Boolean(target?.closest?.('input,select,textarea,[contenteditable=""],[contenteditable="true"]'));}
export function museumMovementSpeed(distance,boosted=false){return Math.max(28,Math.min(900,distance*.6))*(boosted?3:1);}
