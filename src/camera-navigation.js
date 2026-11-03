import * as THREE from 'three';
import {MUSEUM_MAP_SCALE} from './museum-scale.js';

const ORBIT_SETTINGS=['minDistance','maxDistance','minPolarAngle','maxPolarAngle','enablePan','enableRotate','enableZoom','screenSpacePanning','panSpeed','rotateSpeed','zoomSpeed','autoRotate'];
export function captureOrbitSettings(controls){
 const saved={};for(const key of ORBIT_SETTINGS)saved[key]=controls[key];
 saved.mouseButtons={...controls.mouseButtons};saved.touches={...controls.touches};return saved;
}

// World units, independent of the schematic/model scales. The camera has a
// finite viewing apron around the interactive map so the desktop and narrow
// portrait overview fits can still see the complete cosmodrome.
export const MUSEUM_CAMERA_PADDING=4000;
// Height H is the museum HUD's normalized camera altitude (camera.y / MUSEUM_MAP_SCALE).
// Free navigation must never dip below H=1; local terrain clearance may raise it further.
export const MUSEUM_CAMERA_MIN_HEIGHT=1;
export const MUSEUM_CAMERA_MIN_Y=MUSEUM_CAMERA_MIN_HEIGHT*MUSEUM_MAP_SCALE;
export const MUSEUM_CAMERA_MAX_HEIGHT=18000;
export function cameraPositionBounds(bounds){
 const values=['minX','maxX','minZ','maxZ'];
 if(!bounds||!values.every(key=>Number.isFinite(bounds[key]))||bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)throw new TypeError('Finite museum navigation bounds are required');
 return {minX:bounds.minX-MUSEUM_CAMERA_PADDING,maxX:bounds.maxX+MUSEUM_CAMERA_PADDING,
  minZ:bounds.minZ-MUSEUM_CAMERA_PADDING,maxZ:bounds.maxZ+MUSEUM_CAMERA_PADDING};
}

/** Constrain a completed free-camera frame, after OrbitControls.update().
 * Keep the orbit direction and translate eye/target together where possible;
 * reduce its radius only when the entire orbit cannot fit. Do not update the
 * controls again or consume their pending damping/pointer deltas. Scripted
 * aircraft follows and the historical landing overview opt out at the caller. */
export function constrainFreeCamera({camera,controls,bounds,minHeight=MUSEUM_CAMERA_MIN_Y,maxHeight=MUSEUM_CAMERA_MAX_HEIGHT}){
 const positionBounds=cameraPositionBounds(bounds),upper=Math.min(MUSEUM_CAMERA_MAX_HEIGHT,maxHeight);
 if(!Number.isFinite(minHeight)||!Number.isFinite(upper)||upper<minHeight)throw new TypeError('A finite camera height interval is required');
 const oldPosition=camera.position.clone(),oldTarget=controls.target.clone(),offset=oldPosition.clone().sub(oldTarget);
 if(![...oldPosition.toArray(),...oldTarget.toArray()].every(Number.isFinite))throw new TypeError('A finite museum camera pose is required');
 const distance=offset.length(),horizontal=Math.hypot(offset.x,offset.z);
 const maxPhi=THREE.MathUtils.clamp(Number.isFinite(controls.maxPolarAngle)?controls.maxPolarAngle:Math.PI/3,0,Math.PI/3);
 const minPhi=THREE.MathUtils.clamp(Number.isFinite(controls.minPolarAngle)?controls.minPolarAngle:0,0,maxPhi);
 const phi=THREE.MathUtils.clamp(distance>1e-9?Math.atan2(horizontal,offset.y):0,minPhi,maxPhi);
 const direction=new THREE.Vector3(horizontal>1e-9?offset.x/horizontal:0,0,horizontal>1e-9?offset.z/horizontal:1)
  .multiplyScalar(Math.sin(phi));direction.y=Math.cos(phi);
 const target=oldTarget.clone(),axisRadius=(axis)=>{
  const d=direction[axis];
  return Math.abs(d)<1e-12?Infinity:d>0?(positionBounds['max'+axis.toUpperCase()]-bounds['min'+axis.toUpperCase()])/d
   :(bounds['max'+axis.toUpperCase()]-positionBounds['min'+axis.toUpperCase()])/-d;
 };
 // Project the target into the intersection of its own bounds and the
 // translated eye bounds. Unlike independent XYZ clamps this preserves the
 // viewing angle, ground anchor and pan/zoom sensitivity at an outer edge.
 const availableRadius=Math.max(0,Math.min(Number.isFinite(controls.maxDistance)?Math.max(0,controls.maxDistance):Infinity,axisRadius('x'),axisRadius('z')));
 const minimumRadius=Math.min(availableRadius,Math.max(0,Number.isFinite(controls.minDistance)?controls.minDistance:0));
 target.y=THREE.MathUtils.clamp(target.y,minHeight-availableRadius*direction.y,upper-minimumRadius*direction.y);
 const lo=Math.max(minimumRadius,(minHeight-target.y)/direction.y,0),hi=Math.min(availableRadius,(upper-target.y)/direction.y);
 const radius=THREE.MathUtils.clamp(distance,lo,Math.max(lo,hi));offset.copy(direction).multiplyScalar(radius);
 for(const axis of ['x','z']){
  const key=axis.toUpperCase(),low=Math.max(bounds['min'+key],positionBounds['min'+key]-offset[axis]);
  const high=Math.min(bounds['max'+key],positionBounds['max'+key]-offset[axis]);
  target[axis]=THREE.MathUtils.clamp(target[axis],low,Math.max(low,high));
 }
 const position=target.clone().add(offset),changed=position.distanceToSquared(oldPosition)>1e-16||target.distanceToSquared(oldTarget)>1e-16;
 if(changed){controls.target.copy(target);camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld(true);}
 return {changed,positionBounds,minHeight,maxHeight:upper,distance:radius};
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
