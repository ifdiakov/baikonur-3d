import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureOrbitSettings,releaseFollowCamera,museumMovementSpeed} from '../src/camera-navigation.js';

const bounds={minX:-1000,maxX:1000,minZ:-1000,maxZ:1000};let checks=0;
for(const altitude of [2,80,450])for(const offset of [[15,8,18],[0,-15,6],[0,25,0]])for(const x of [0,1400]){
 const camera=new THREE.PerspectiveCamera(52,1.6,.1,80000);
 const controls={target:new THREE.Vector3(x,altitude,50),minDistance:2.1,maxDistance:8000,minPolarAngle:0,maxPolarAngle:Math.PI/3,
  enablePan:true,enableZoom:true,enableRotate:true,screenSpacePanning:false,panSpeed:1,rotateSpeed:1,zoomSpeed:1,autoRotate:false,enableDamping:true,
  mouseButtons:{LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE},touches:{ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE},update(){camera.lookAt(this.target);}};
 const saved=captureOrbitSettings(controls),expected=JSON.parse(JSON.stringify(saved));
 // Changing follow mode must not mutate the saved input mappings by alias.
 controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.enablePan=false;controls.maxDistance=240;controls.maxPolarAngle=Math.PI-.06;
 camera.position.copy(controls.target).add(new THREE.Vector3(...offset));
 const result=releaseFollowCamera({camera,controls,savedControls:saved,bounds});
 assert.deepEqual(captureOrbitSettings(controls),expected);assert(controls.enableDamping);
 assert.equal(controls.target.y,-2.755);assert(result.distance>=24-1e-8);
 assert(controls.target.x>=bounds.minX&&controls.target.x<=bounds.maxX&&controls.target.z>=bounds.minZ&&controls.target.z<=bounds.maxZ);
 const delta=camera.position.clone().sub(controls.target),elevation=Math.asin(delta.y/delta.length());
 assert(elevation>=Math.PI/6-1e-8);assert(camera.position.toArray().every(Number.isFinite));
 if(altitude===450&&offset[0]===15)assert(museumMovementSpeed(result.distance)>400,'Free pan/keyboard speed follows the museum ground view, not the former small aircraft orbit');
 for(let i=0;i<4;i++){
  const old=camera.position.clone(),target=controls.target.clone();
  releaseFollowCamera({camera,controls,savedControls:captureOrbitSettings(controls),bounds});
  assert(camera.position.distanceTo(old)<1e-7&&controls.target.distanceTo(target)<1e-7,'Repeated releases do not drift or progressively lock the camera');
 }
 checks++;
}
console.log('CAMERA_NAVIGATION_PASS',JSON.stringify({checks,groundAnchor:true,restoredPanZoomOrbit:true}));
