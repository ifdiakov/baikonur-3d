import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {captureOrbitSettings,releaseFollowCamera,museumMovementSpeed,constrainFreeCamera,cameraPositionBounds,MUSEUM_CAMERA_MAX_HEIGHT,MUSEUM_CAMERA_MIN_Y,MUSEUM_CAMERA_MIN_HEIGHT} from '../src/camera-navigation.js';
import {MUSEUM_MAP_SCALE} from '../src/museum-scale.js';

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
const minHeight=-1.74,positionBounds=cameraPositionBounds(bounds);let boundedChecks=0;
const freeState=(target=[0,-2.755,0],offset=[700,800,900])=>{
 const camera=new THREE.PerspectiveCamera(52,1.6,.1,80000),controls={target:new THREE.Vector3(...target),
  minDistance:2.1,maxDistance:24000,minPolarAngle:0,maxPolarAngle:Math.PI/3,enableDamping:true,dampingFactor:.07,
  update(){assert.fail('A completed-frame constraint must not run OrbitControls.update a second time');}};
 camera.position.copy(controls.target).add(new THREE.Vector3(...offset));camera.lookAt(controls.target);
 return {camera,controls};
};
function checkBounds(state,maxHeight=MUSEUM_CAMERA_MAX_HEIGHT){
 const {camera,controls}=state,p=camera.position,t=controls.target,offset=p.clone().sub(t);
 assert([...p.toArray(),...t.toArray()].every(Number.isFinite));
 for(const [axis,key] of [['x','X'],['z','Z']]){
  assert(p[axis]>=positionBounds['min'+key]-1e-7&&p[axis]<=positionBounds['max'+key]+1e-7,`The eye ${axis} is bounded, not just its target`);
  assert(t[axis]>=bounds['min'+key]-1e-7&&t[axis]<=bounds['max'+key]+1e-7,`The target ${axis} stays within the museum`);
 }
 assert(p.y>=minHeight-1e-7&&p.y<=maxHeight+1e-7,'The final frame stays between the ground clearance and its altitude ceiling');
 assert(offset.length()>=controls.minDistance-1e-7&&offset.length()<=controls.maxDistance+1e-7);
 assert(Math.atan2(Math.hypot(offset.x,offset.z),offset.y)<=Math.PI/3+1e-8);
 boundedChecks++;
}
// The visible museum altitude display is H = world Y / MUSEUM_MAP_SCALE.
assert.equal(MUSEUM_CAMERA_MIN_HEIGHT,1,'The requested camera floor is H=1.0');
assert.equal(MUSEUM_CAMERA_MIN_Y,MUSEUM_MAP_SCALE,'H=1.0 converts to scene Y using the shared map scale');
{
 const low=freeState([0,-2.755,0],[0,1,1]);
 const bounded=constrainFreeCamera({...low,bounds,maxHeight:4000});
 assert.equal(bounded.minHeight,MUSEUM_CAMERA_MIN_Y);
 assert(Math.abs(low.camera.position.y/MUSEUM_MAP_SCALE-1)<1e-7,'Free camera stops at displayed altitude H=1.0');
 const eye=low.camera.position.clone(),pivot=low.controls.target.clone();
 assert.equal(constrainFreeCamera({...low,bounds,maxHeight:4000}).changed,false,'Floor remains stable across successive frames');
 assert(low.camera.position.distanceTo(eye)<1e-7&&low.controls.target.distanceTo(pivot)<1e-7,'Floor has no vertical jitter or anchor drift');
}
{
 const state=freeState(),oldPosition=state.camera.position.clone(),oldTarget=state.controls.target.clone();
 const result=constrainFreeCamera({...state,bounds,minHeight,maxHeight:4000});
 assert.equal(result.changed,false);assert(state.camera.position.equals(oldPosition)&&state.controls.target.equals(oldTarget),'A valid inspection pose is unchanged');
 checkBounds(state,4000);
}
// Every azimuth, both map corners and several zoom levels exercise the eye
// rectangle independently from the smaller target rectangle.
for(const target of [[0,-2.755,0],[-1000,-2.755,-1000],[1000,-2.755,1000],[60000,500,60000]])
 for(const radius of [2.1,6000,24000,70000])for(const phi of [.001,Math.PI/6,Math.PI/3])for(let degrees=0;degrees<360;degrees+=30){
  const yaw=degrees*Math.PI/180,offset=[Math.sin(yaw)*Math.sin(phi)*radius,Math.cos(phi)*radius,Math.cos(yaw)*Math.sin(phi)*radius];
  const state=freeState(target,offset),direction=new THREE.Vector3(...offset).normalize(),settings={...state.controls};
  constrainFreeCamera({...state,bounds,minHeight,maxHeight:12000});checkBounds(state,12000);
  assert(state.camera.position.clone().sub(state.controls.target).normalize().distanceTo(direction)<1e-7,'Bounded pan/zoom preserves the viewing direction');
  assert.equal(state.controls.enableDamping,settings.enableDamping);assert.equal(state.controls.dampingFactor,settings.dampingFactor);
  assert.equal(state.controls.maxDistance,settings.maxDistance);assert.equal(state.controls.maxPolarAngle,settings.maxPolarAngle);
  const p=state.camera.position.clone(),t=state.controls.target.clone();
  const repeated=constrainFreeCamera({...state,bounds,minHeight,maxHeight:12000});
  assert.equal(repeated.changed,false);assert(state.camera.position.distanceTo(p)<1e-7&&state.controls.target.distanceTo(t)<1e-7,'Repeated render frames do not drift');
 }
{
 const state=freeState([0,-5.6,0],[0,.1,.1]),groundTarget=state.controls.target.clone();
 constrainFreeCamera({...state,bounds,minHeight,maxHeight:4000});checkBounds(state,4000);
 assert(state.controls.target.equals(groundTarget),'Ground clearance can raise the eye without moving a valid ground anchor');
 const high=freeState([0,0,0],[0,100000,0]);
 constrainFreeCamera({...high,bounds,minHeight,maxHeight:100000});checkBounds(high);
 assert.equal(high.camera.position.y,MUSEUM_CAMERA_MAX_HEIGHT,'The absolute ceiling also bounds oversized viewport requests');
}
{
 const state=freeState([900,-2.755,900],[3600,3000,3600]),offset=state.camera.position.clone().sub(state.controls.target);
 const pan=delta=>{state.camera.position.add(delta);state.controls.target.add(delta);constrainFreeCamera({...state,bounds,minHeight,maxHeight:4000});checkBounds(state,4000);};
 for(let i=0;i<30;i++)pan(new THREE.Vector3(100,0,100));
 const edge=state.camera.position.clone();pan(new THREE.Vector3(-50,0,-50));
 assert.equal(state.camera.position.x,edge.x-50);assert.equal(state.camera.position.z,edge.z-50,'Reverse input leaves a boundary immediately');
 assert(state.camera.position.clone().sub(state.controls.target).distanceTo(offset)<1e-7,'Panning into a boundary keeps orbit radius and sensitivity');
}
{
 // Run the real controls through completed-frame constraints, including their
 // damping, rather than only testing the pure projection with mock controls.
 const element={style:{},addEventListener(){},removeEventListener(){}},camera=new THREE.PerspectiveCamera(52,1.6,.1,80000);
 camera.position.set(0,5000,8000);
 const previousDocument=globalThis.document;globalThis.document=element;
 const controls=new OrbitControls(camera,element);controls.target.set(900,-2.755,900);
 Object.assign(controls,{minDistance:2.1,maxDistance:24000,maxPolarAngle:Math.PI/3,enableDamping:true,autoRotate:true,autoRotateSpeed:8});
 const settings=captureOrbitSettings(controls);
 for(let i=0;i<240;i++){controls.update();constrainFreeCamera({camera,controls,bounds,minHeight,maxHeight:12000});checkBounds({camera,controls},12000);}
 assert.deepEqual(captureOrbitSettings(controls),settings);assert(controls.enableDamping);
 controls.autoRotate=false;
 for(let i=0;i<500;i++){controls.update();constrainFreeCamera({camera,controls,bounds,minHeight,maxHeight:12000});}
 const settled=camera.position.clone();
 for(let i=0;i<10;i++){controls.update();constrainFreeCamera({camera,controls,bounds,minHeight,maxHeight:12000});}
 assert(camera.position.distanceTo(settled)<1e-7,'OrbitControls settles without an oscillation at a constraint');
 controls.dispose();
 if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
}
console.log('CAMERA_NAVIGATION_PASS',JSON.stringify({checks,boundedChecks,groundAnchor:true,restoredPanZoomOrbit:true,boundedEyeAndTarget:true,dampedOrbit:true}));
