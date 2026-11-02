import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSiloPad,siloController,SILO_REFERENCE,SILO_VERSION} from '../src/silo-pad.js';
import {MUSEUM_METRE,MUSEUM_MAP_SCALE} from '../src/museum-scale.js';
assert.equal(SILO_REFERENCE.openHeight,8);assert.equal(SILO_REFERENCE.closeHeight,9);
assert.equal(MUSEUM_METRE,.14);assert.equal(MUSEUM_MAP_SCALE,3.4/1.45);
const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);root.scale.setScalar(.28);root.position.set(35,-2.72,19);
const features=buildSiloPad(root),silo=siloController(root),camera=new THREE.PerspectiveCamera(52,1.5,.1,80000),target=new THREE.Vector3();
const controls={target,update(){camera.lookAt(target);camera.updateMatrixWorld(true);}};let now=0;
function advance(seconds){for(let i=0;i<seconds*60;i++){now+=1000/60;silo.update(now,camera,target);}scene.updateMatrixWorld(true);}
silo.inspect('all',camera,controls);advance(1);assert.equal(silo.stats().state,'closed');assert.equal(silo.stats().steamVisible,false);
assert.equal(root.userData.archiveCutouts.length,1);assert.equal(root.userData.archiveCutouts[0].rx-.04,SILO_REFERENCE.openingRadius);
const shown=o=>{for(let n=o;n;n=n.parent)if(!n.visible)return false;return true;};
const ray=new THREE.Raycaster(root.localToWorld(new THREE.Vector3(0,20,0)),new THREE.Vector3(0,-1,0));
const closed=ray.intersectObject(root,true).filter(h=>h.object.isMesh&&shown(h.object));assert(closed.length);assert(closed[0].object.parent.parent.name.includes('шарнир'),'Closed lid occludes the rocket');
silo.inspect('close',camera,controls);advance(1);assert.equal(silo.stats().state,'opening');assert(silo.stats().lidAngleDeg>0&&silo.stats().lidAngleDeg<108);
advance(3);assert.equal(silo.stats().state,'open');assert.equal(silo.stats().steamParticles,36);assert.equal(silo.stats().lidAngleDeg,108);
assert(silo.stats().noseTipY<silo.stats().rimY,'Nose remains inside the shaft');
const opened=ray.intersectObject(root,true).filter(h=>h.object.isMesh&&shown(h.object));assert.equal(opened[0].object.userData.museumComponent,'silo-rocket-nose','The aperture reveals the nose through a real hole');
camera.position.copy(root.localToWorld(new THREE.Vector3(0,28,23)));advance(.5);assert.equal(silo.stats().state,'open','Remaining near the shaft preserves its open state');
silo.inspect('all',camera,controls);advance(1);assert.equal(silo.stats().state,'closing');advance(3);assert.equal(silo.stats().state,'closed');assert.equal(silo.stats().steamVisible,false);
silo.inspect('close',camera,controls);advance(4);scene.visible=false;advance(.2);assert.equal(silo.stats().progress,0);assert.equal(silo.stats().steamVisible,false);assert.equal(Math.abs(root.getObjectByName('ШПУ · шарнир крышки').rotation.x),0,'Hiding the layer resets the actual lid pose');scene.visible=true;
let draws=0,triangles=0;root.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.count||1);for(const v of o.geometry.attributes.position.array)assert(Number.isFinite(v));}});
assert(draws<60);assert(triangles<80000);

// Keep the original .28 ray/geometry coverage above, then exercise the actual
// museum's .14 physical scale against the same H that visitors see in the UI.
const heightRoot=new THREE.Group();heightRoot.scale.setScalar(MUSEUM_METRE);heightRoot.position.set(95,-2.72,-30);scene.add(heightRoot);
buildSiloPad(heightRoot,{activation:'height'});const heightSilo=siloController(heightRoot);let heightTime=0;
const almost=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);
function heightView(height,{aimX=0,horizontalDistance}={}){
 heightRoot.updateWorldMatrix(true,false);target.copy(heightRoot.localToWorld(new THREE.Vector3(aimX,.8,0)));
 camera.position.copy(target);camera.position.y=height*MUSEUM_MAP_SCALE;
 // The lowest permitted museum view is 30 degrees above its target. At H=8
 // the .14 model is over 300 local units away, beyond the old detail cutoff.
 camera.position.x+=horizontalDistance??(camera.position.y-target.y)/Math.tan(Math.PI/6);controls.update();
}
function advanceHeight(seconds,{keepDetail=false}={}){
 for(let i=0;i<Math.ceil(seconds*60);i++){
  heightTime+=1000/60;heightSilo.update(heightTime,camera,target);
  const state=heightSilo.stats();
  if(keepDetail&&state.progress>0)assert.equal(state.detailVisible,true,'The actual moving/open lid stays visible throughout the animation');
 }
 return heightSilo.stats();
}
heightView(8.1);let heightState=advanceHeight(4);
assert.equal(heightState.state,'closed');assert.equal(heightState.open,false);almost(heightState.cameraHeight,8.1,'Camera height uses normalized map H');
heightView(8.5);assert.equal(advanceHeight(.25).state,'closed','H=8.5 preserves a previously closed shaft');
heightView(8);heightState=advanceHeight(.5,{keepDetail:true});
assert.equal(heightState.state,'opening','H=8 begins opening without requiring any closer zoom');assert.equal(heightState.open,true);
almost(heightState.cameraHeight,8,'The opening threshold reports the same H as the camera UI');
assert(heightState.cameraDistance>300,'The regression exercises the old distant proxy cutoff');
const physicalCentre=heightRoot.localToWorld(new THREE.Vector3(0,.8,0));
almost(heightState.cameraDistance,camera.position.distanceTo(physicalCentre)/MUSEUM_METRE,'Camera distance remains in local physical model units');
almost(Math.atan2(camera.position.y-target.y,Math.hypot(camera.position.x-target.x,camera.position.z-target.z))*180/Math.PI,30,'The camera uses the permitted 30-degree view');
heightView(8.5);heightState=advanceHeight(.25,{keepDetail:true});assert.equal(heightState.state,'opening','H=8.5 retains an opening request');
heightView(8);heightState=advanceHeight(4,{keepDetail:true});assert.equal(heightState.state,'open');assert.equal(heightState.steamParticles,36);
heightView(8.5);assert.equal(advanceHeight(.25,{keepDetail:true}).state,'open','H=8.5 preserves a previously open shaft');
heightView(9);assert.equal(advanceHeight(.25,{keepDetail:true}).state,'open','H=9 remains inside the hysteresis band');
heightView(9.01);heightState=advanceHeight(.5,{keepDetail:true});
assert.equal(heightState.state,'closing','Only H above 9 begins closing');assert.equal(heightState.open,false);assert(heightState.cameraDistance>300);
heightView(8.5);assert.equal(advanceHeight(.25,{keepDetail:true}).state,'closing','H=8.5 does not reverse an existing closing request');
heightState=advanceHeight(4,{keepDetail:true});assert.equal(heightState.state,'closed');assert.equal(heightState.steamVisible,false);
assert.equal(heightState.detailVisible,false,'A fully closed distant shaft can return to its lightweight proxy');

heightView(8,{aimX:12.1});assert.equal(advanceHeight(4).state,'closed','A target outside the 12-local-unit opening radius cannot activate the shaft');
heightView(8,{aimX:11.9});assert.equal(advanceHeight(.5,{keepDetail:true}).state,'opening');
heightView(8,{aimX:17.9});assert.equal(advanceHeight(.25,{keepDetail:true}).state,'opening','Target hysteresis retains the original 18-local-unit closing radius');
heightView(8,{aimX:18.1});assert.equal(advanceHeight(.25,{keepDetail:true}).state,'closing','Moving the target beyond 18 local units closes the shaft');
assert.equal(advanceHeight(4,{keepDetail:true}).state,'closed');
heightView(8,{horizontalDistance:1000});heightState=advanceHeight(4);
assert.equal(heightState.state,'closed','A distant low camera cannot open a shaft merely by aiming at it');assert.equal(heightState.open,false);

heightView(8);assert.equal(advanceHeight(1,{keepDetail:true}).state,'opening');
scene.visible=false;heightState=advanceHeight(.1);
assert.equal(heightState.visible,false);assert.equal(heightState.open,false);assert.equal(heightState.progress,0);assert.equal(heightState.steamVisible,false);
assert.equal(Math.abs(heightRoot.getObjectByName('ШПУ · шарнир крышки').rotation.x),0,'Hiding an ancestor resets the actual lid in the real museum scale');
scene.visible=true;heightView(8.1);assert.equal(advanceHeight(.25).state,'closed','Showing the layer above H=8 cannot resume a stale opening request');
heightSilo.inspect('all',camera,controls);heightState=advanceHeight(4);
assert(heightState.cameraHeight>SILO_REFERENCE.closeHeight,'The general preset remains above the closing threshold');assert.equal(heightState.state,'closed');
console.log('SILO_GEOMETRY_PASS',JSON.stringify({version:SILO_VERSION,draws,triangles,features:features.primitiveCount,openSeconds:SILO_REFERENCE.openSeconds,openHeight:8,closeHeight:9,physicalMetre:MUSEUM_METRE,viewAngle:30}));
