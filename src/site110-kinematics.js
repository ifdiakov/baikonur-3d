import * as THREE from 'three';

export const SITE110_LAUNCH_RIG_VERSION='site110-launch-rig-20261111-v1';
const rigs=new WeakMap(),V=(...p)=>new THREE.Vector3(...p);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ease=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
const radians=degrees=>degrees*Math.PI/180;

// Four independent cantilevers are a visual interpretation of the 17G81
// arrangement. The existing model's side and elevations are not archival
// platform numbers. Fixed pylons, foundations and the right start never move.
export const SITE110_MOTION_PLAN=Object.freeze([
 {id:'left-platform-y18',kind:'platform',pivotPad:[-20,18,-9],angle:radians(82),interval:[-45,-39]},
 {id:'left-platform-y29',kind:'platform',pivotPad:[-20,29,-9],angle:radians(88),interval:[-36,-30]},
 {id:'left-platform-y40_5',kind:'platform',pivotPad:[-20,40.5,-9],angle:radians(84),interval:[-26,-20]},
 {id:'left-platform-y49_5',kind:'platform',pivotPad:[-20,49.5,-9],angle:radians(92),interval:[-18,-12]},
 {id:'left-walkway-y43',kind:'walkway',pivotPad:[-20,43,-9],angle:radians(95),interval:[-52.25,-47.25],timingAnchor:'documented alignment-release command; modeled interface is interpretive'},
 {id:'right-walkway-y50',kind:'walkway',pivotPad:[20,50,-9],angle:radians(-95),interval:[-31,-25]},
 {id:'late-feed-interface',kind:'late-connection',pivotPad:[23.65,34,-18],angle:radians(52),interval:[0,2.4],timingAnchor:'late drain withdrawal follows lift-off; this visible pipe is an interpretive interface'}
].map(part=>Object.freeze({...part,pivotPad:Object.freeze(part.pivotPad),interval:Object.freeze(part.interval),axisPad:Object.freeze([0,1,0]),interpretive:true})));

export function getSite110LaunchRig(root){return rigs.get(root)||null;}

// A small temporary carriage illustrates the documented linear guide and
// articulated head. It is distinct from the separate late drain interface.
// Only the launch reconstruction owns these three shared batches.
function makeCarriage(root,frameMatrix,materials){
 const group=new THREE.Group();group.name='110 · временный водородный механизм';
 group.userData={museumComponent:'site110-temporary-carriage',pickable:false,interpretivePlacement:true};
 group.matrixAutoUpdate=false;root.add(group);
 const boxGeometry=new THREE.BoxGeometry(1,1,1),rodGeometry=new THREE.CylinderGeometry(1,1,1,8);
 const steel=new THREE.InstancedMesh(boxGeometry,materials.steel,12);
 const links=new THREE.InstancedMesh(rodGeometry,materials.light,8);
 const head=new THREE.InstancedMesh(boxGeometry,materials.dark,1);
 for(const [mesh,name]of [[steel,'110 · направляющая и каретка'],[links,'110 · рычаги водородной каретки'],[head,'110 · разъём водородной каретки']]){
  mesh.name=name;mesh.userData={museumComponent:'site110-temporary-carriage-part',pickable:false};mesh.receiveShadow=true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);
 }
 const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=V(1,1,1),position=V(0,0,0),up=V(0,1,0),a=V(0,0,0),b=V(0,0,0);
 const box=(mesh,index,w,h,d,x,y,z)=>{q.identity();position.set(x,y,z);scale.set(w,h,d);mesh.setMatrixAt(index,matrix.compose(position,q,scale));};
 const rod=(index,from,to,r)=>{a.fromArray(from);b.fromArray(to).sub(a);const length=b.length();position.copy(a).addScaledVector(b,.5);q.setFromUnitVectors(up,b.multiplyScalar(1/length));scale.set(r,length,r);links.setMatrixAt(index,matrix.compose(position,q,scale));};
 let progress=0,stroke=0,lastProgress=NaN;const lastDelta=new THREE.Matrix4();
 function seek(value,platformDelta){
  if(value===lastProgress&&platformDelta.equals(lastDelta))return false;
  lastProgress=value;lastDelta.copy(platformDelta);
  progress=value;stroke=3.6*progress;
  group.matrix.multiplyMatrices(platformDelta,frameMatrix);group.matrixWorldNeedsUpdate=true;
  const z=-6.9,x=-9.9-stroke;let n=0;
  for(const side of [-1,1])box(steel,n++,7.2,.16,.18,-12.2,40.86,z+side*.65);
  for(let i=0;i<5;i++)box(steel,n++,.12,.12,1.65,-15.5+i*1.65,40.76,z);
  box(steel,n++,2.6,.22,1.65,x,41.13,z);
  for(const side of [-1,1])for(const end of [-1,1])box(steel,n++,.18,1.7,.18,x+end*.95,42,z+side*.6);
  const headX=x+5.5;let r=0;
  for(const side of [-1,1]){
   rod(r++,[x+.95,42.8,z+side*.6],[headX,43.25,z+side*.25],.095);
   rod(r++,[x-.95,41.42,z+side*.6],[headX,43.25,z+side*.25],.13);
  }
  for(const end of [-1,1])for(const side of [-1,1])rod(r++,[x+end*.95,40.98,z+side*.67-.10],[x+end*.95,40.98,z+side*.67+.10],.22);
  box(head,0,.55,.7,1,headX,43.25,z);
  for(const mesh of [steel,links,head]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();}
  return true;
 }
 function dispose(){
  group.removeFromParent();
  // InstancedMesh owns its matrix GPU buffers independently of the geometry.
  for(const mesh of [steel,links,head])mesh.dispose();
  boxGeometry.dispose();rodGeometry.dispose();
 }
 return {seek,dispose,stats:()=>({active:true,groupName:group.name,meshCount:3,instanceCount:21,progress,stroke,
  interval:[-42,-35],motion:'linear carriage withdrawal along its guide',platformBinding:'left-platform-y40_5',
  guideDirectionPad:[-1,0,0],source:'Barmin, book 2, section 6.2.3, figures 6.2.3–6.2.4',
  interpretation:'Carriage principle is documented; scale, placement, stroke and timing are illustrative. This is not the late drain connection.'})};
}

export function createSite110LaunchRig({root,padOrigin,padYaw,channels,rocketAnchor,tableAnchor,motions,materials}){
 if(rigs.has(root))throw new Error('Site 110 launch rig already exists');
 const frameMatrix=new THREE.Matrix4().compose(V(...padOrigin),new THREE.Quaternion().setFromAxisAngle(V(0,1,0),padYaw),V(1,1,1));
 const frameInverse=frameMatrix.clone().invert(),identity=new THREE.Matrix4(),delta=new THREE.Matrix4(),rotation=new THREE.Matrix4();
 const states=SITE110_MOTION_PLAN.map(definition=>({definition,handle:motions(definition.id),progress:0,delta:new THREE.Matrix4()}));
 const frame=Object.freeze({space:'site110-root-local-metres',padOrigin:[...padOrigin],padYaw,matrix:frameMatrix.toArray()});
 const interpretation={
  structure:'The fixed mast and four separately pivoting platforms follow the documented 17G81 principle. Existing model heights, chosen side, hinge positions and angles are visual interpretations, not surveyed geometry.',
  timing:'T0 is lift-off contact. Alignment release at T−52.25 is documented. Other platform intervals and the 2.4-second late interface travel are illustrative.',
  carriage:'A separate temporary linear carriage illustrates the hydrogen-filling mechanism. It is not identified as the late hydrogen-drain interface.',
  stationary:'Both pylon trunks and foundations, the upper fifth console, all consoles of the other pylon and the entire right start remain unchanged.',
  sources:['https://rvsn.ruzhany.info/0_2023/barmin_02_02.html','https://rvsn.ruzhany.info/0_2023/barmin_02_06.html','https://www.buran.ru/htm/25-3.htm','https://www.buran.ru/htm/cikmain.htm']
 };
 let active=false,time=-90,carriage=null;
 const movingParts=SITE110_MOTION_PLAN.map(part=>({...part,pivotPad:[...part.pivotPad],axisPad:[...part.axisPad],interval:[...part.interval]}));
 function stats(){return {version:SITE110_LAUNCH_RIG_VERSION,active,time,frame,rocketAnchor,tableAnchor,channels,
  movingParts:states.map(({definition,handle,progress})=>({...definition,...handle.stats(),progress,pivotSite:V(...definition.pivotPad).applyMatrix4(frameMatrix).toArray()})),
  temporaryLinkage:carriage?.stats()||{active:false,groupName:'110 · временный водородный механизм',meshCount:0,instanceCount:0},
  interpretation,staticBatchingPreserved:true,largeServiceTowerMotion:false};}
 function seek(value){
  if(!Number.isFinite(value))throw new Error('Site 110 launch time must be finite');
  time=clamp(value,-90,75);active=true;let changed=false;
  for(const state of states){
   const part=state.definition,p=part.pivotPad,progress=ease(...part.interval,time);
   if(progress===state.progress)continue;
   state.progress=progress;changed=true;
   if(state.progress===0)state.delta.identity();
   else{
    rotation.makeRotationY(part.angle*state.progress);
    delta.makeTranslation(...p).multiply(rotation).multiply(new THREE.Matrix4().makeTranslation(-p[0],-p[1],-p[2]));
    state.delta.multiplyMatrices(frameMatrix,delta).multiply(frameInverse);
   }
   state.handle.setDelta(state.delta);
  }
  if(!carriage)carriage=makeCarriage(root,frameMatrix,materials);
  const platform=states.find(state=>state.definition.id==='left-platform-y40_5');
  changed=carriage.seek(ease(-42,-35,time),platform?.delta||identity)||changed;
  if(changed)root.updateWorldMatrix(true,true);return stats();
 }
 function reset(){
  for(const state of states){state.handle.reset();state.progress=0;state.delta.identity();}
  carriage?.dispose();carriage=null;active=false;time=-90;root.updateWorldMatrix(true,true);return stats();
 }
 const rig={version:SITE110_LAUNCH_RIG_VERSION,frame,rocketAnchor,tableAnchor,channels,movingParts,seek,reset,stats,dispose:reset};
 rigs.set(root,rig);return rig;
}
