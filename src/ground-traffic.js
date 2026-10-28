import * as THREE from 'three';
import {createLightField} from './light-field.js';
import {buildHighwayPath} from './traffic-paths.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
export const TRAIN_DURATION=420;
export function trainDistance(elapsed,length){
 const start=7,end=length-8,travel=end-start,ramp=8,t=clamp(elapsed,0,TRAIN_DURATION),speed=travel/(TRAIN_DURATION-ramp);
 return start+(t<ramp?speed*t*t/(2*ramp):t>TRAIN_DURATION-ramp?travel-speed*(TRAIN_DURATION-t)**2/(2*ramp):speed*(t-ramp/2));
}
export function highwayVehiclePose(path,elapsed,index){
 const direction=index<3?1:-1,speed=direction===1?16:14;
 const phase=(index%3)/3+(direction===1?.08:.22),s=((phase*path.length+direction*speed*elapsed)%path.length+path.length)%path.length;
 const at=path.sample(s,2),right=V(-at.tangent.z,0,at.tangent.x).normalize();
 const position=at.position.clone().addScaledVector(right,direction*path.width/4);position.y+=.015;
 return {position,direction,speed,distance:s,tangent:at.tangent.multiplyScalar(direction),laneOffset:direction*path.width/4,
  opacity:smooth(0,36,Math.min(s,path.length-s))};
}

function standard(color,options={}){return new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.28,...options});}
function box(parent,w,h,d,x,y,z,material,name=''){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.name=name;parent.add(m);return m;}
function wheel(parent,x,z,radius=.155){
 const root=new THREE.Group();root.position.set(x,radius,z);parent.add(root);
 const tyre=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.09,12),standard(0x20252a));tyre.rotation.z=Math.PI/2;root.add(tyre);
 const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.53,radius*.53,.103,8),standard(0x8a9393));hub.rotation.z=Math.PI/2;root.add(hub);
 return root;
}
function buildCar(parent,index){
 const root=new THREE.Group();root.name='Трасса · автомобиль '+(index+1);root.userData.pickable=false;parent.add(root);
 const van=index===2||index===5,colors=[0xb8bdc1,0x985847,0xd5c8aa,0x627d96,0xc4baa9,0x688079];
 const paint=standard(colors[index]),dark=standard(0x252c32),glass=standard(0x21394b,{emissive:0x6b8c9b,emissiveIntensity:.12});
 box(root,.94,.33,van?2.5:2.25,0,.39,0,paint,'body');
 box(root,.83,van?.65:.36,van?1.67:1.15,0,van?.82:.72,van?-.19:-.1,paint,'cab');
 box(root,.76,.28,.025,0,van?.91:.74,van?.66:.49,glass,'windscreen');
 box(root,.76,.25,.025,0,van?.91:.74,van?-1.03:-.69,glass,'rear-window');
 for(const side of [-1,1])box(root,.025,.25,van?.53:.92,side*.425,van?.91:.74,van?.33:-.1,glass,'side-window');
 for(const z of [-.78,.78])for(const side of [-1,1])wheel(root,side*.46,z,.15);
 const front=van?1.26:1.135,back=-front;
 box(root,.88,.12,.12,0,.3,front,dark);box(root,.88,.12,.12,0,.3,back,dark);
 const field=createLightField(root,[-1,1].flatMap(sign=>[
  {x:sign*.32,y:.45,z:front+.04,height:0,color:0xffedc7,size:2.6},
  {x:sign*.34,y:.44,z:back-.04,height:0,color:0xff4233,size:1.7}]),{name:'Автомобиль · фары и габариты',minPixels:2.6});
 const beamMaterial=new THREE.MeshBasicMaterial({color:0xffd69b,transparent:true,opacity:.08,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
 const beam=new THREE.Mesh(new THREE.PlaneGeometry(1.8,4),beamMaterial);beam.rotation.x=-Math.PI/2;beam.position.set(0,.025,front+2);beam.renderOrder=5;root.add(beam);
 const solids=[];root.traverse(m=>{if(m.isMesh&&m!==beam){const mat=m.material;mat.transparent=true;solids.push(mat);}});
 return {root,field,beam,solids,glass,setVisible(opacity,night){root.visible=opacity>.005;for(const mat of solids)mat.opacity=opacity;field.setStrength(opacity*(night?1:.08));beam.visible=night;beamMaterial.opacity=.08*opacity;}};
}

function buildRailVehicle(parent,{wagon=false,gauge}){
 const root=new THREE.Group();root.name=wagon?'Служебный вагон':'Мотовоз';root.userData.pickable=false;parent.add(root);
 const paint=standard(wagon?0x526e71:0x566b4a),cream=standard(0xd3b979),dark=standard(0x2c3638),red=standard(0x9e493c);
 const glass=standard(0x263d49,{emissive:0xffce88,emissiveIntensity:.33});
 box(root,1.06,.22,wagon?3.65:2.96,0,.42,0,dark,'frame');
 if(wagon){
  box(root,1.05,.98,3.5,0,1.03,0,paint,'wagon-body');box(root,1.13,.14,3.62,0,1.59,0,cream,'wagon-roof');
  for(const side of [-1,1])for(let i=0;i<5;i++)box(root,.02,.37,.37,side*.535,1.15,-1.27+i*.62,glass,'lit-window');
  for(const end of [-1,1])box(root,.43,.75,.025,0,.93,end*1.76,cream,'end-door');
 }else{
  box(root,.89,.57,1.55,0,.83,.62,paint,'engine-hood');
  box(root,1.04,.94,1.05,0,1.03,-.65,cream,'driver-cab');box(root,1.14,.12,1.18,0,1.56,-.65,dark,'cab-roof');
  box(root,.78,.36,.025,0,1.19,-.11,glass,'front-cab-window');box(root,.78,.36,.025,0,1.19,-1.19,glass,'rear-cab-window');
  for(const side of [-1,1]){
   box(root,.022,.36,.72,side*.53,1.2,-.64,glass,'side-cab-window');
   for(let i=0;i<6;i++)box(root,.025,.32,.045,side*.45,.85,.16+i*.18,dark,'engine-louvre');
   for(const z of [.18,1.3])box(root,.035,.47,.035,side*.52,.89,z,cream,'handrail-post');
   box(root,.035,.035,1.15,side*.52,1.13,.74,cream,'handrail');
   box(root,.24,.08,.4,side*.5,.24,-1.06,red,'cab-step');
  }
  const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.48,7),dark);pipe.position.set(.12,1.34,.3);root.add(pipe);
 }
 for(const end of [-1,1]){const z=end*(wagon?1.88:1.56);box(root,.94,.14,.12,0,.44,z,red,'buffer-beam');box(root,.16,.11,.25,0,.44,z+end*.12,dark,'coupler');}
 const lights=createLightField(root,wagon?[{x:0,y:.72,z:-1.88,height:0,color:0xff3d35,size:1.5}]:[
  {x:0,y:1.43,z:-.07,height:0,color:0xffe1a4,size:4},{x:-.34,y:.62,z:1.57,height:0,color:0xffefd3,size:2},{x:.34,y:.62,z:1.57,height:0,color:0xffefd3,size:2}
 ],{name:wagon?'Вагон · хвостовой огонь':'Мотовоз · прожектор',minPixels:3});
 const axles=[];
 for(const offset of wagon?[-1.23,1.23]:[-1.02,1.02]){
  const axle=new THREE.Group();axle.name='Колёсная пара';parent.add(axle);
  const wheels=[wheel(axle,-gauge/2,0),wheel(axle,gauge/2,0)];
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,gauge,6),dark);shaft.rotation.z=Math.PI/2;shaft.position.y=.155;axle.add(shaft);
  axles.push({root:axle,offset,wheels});
 }
 return {root,axles,glass,lights,wheelRadius:.155,wheelbase:wagon?2.46:2.04};
}

export function createGroundTraffic({layers,transport,camera,controls,canvas,button,onFollow}){
 const highway=buildHighwayPath(transport.roadPaths()),plan=transport.trainPath(),rail=plan.path;
 const cars=Array.from({length:6},(_,i)=>buildCar(layers.roads,i)),trainRoot=new THREE.Group();trainRoot.name='Поезд · площадка 1 → город';layers.rails.add(trainRoot);
 const engine=buildRailVehicle(trainRoot,{gauge:plan.gauge}),wagon=buildRailVehicle(trainRoot,{wagon:true,gauge:plan.gauge});
 let elapsed=0,lastNow=null,forced=null,night=true,following=false,lastPhase='';
 const quaternion=new THREE.Quaternion(),carStates=[];let engineDistance=7;
 const orient=t=>quaternion.setFromEuler(new THREE.Euler(-Math.asin(clamp(t.y,-1,1)),Math.atan2(t.x,t.z),0,'YXZ'));
 function stopFollowing(){following=false;button.setAttribute('aria-pressed','false');document.body.classList.remove('following-train');}
 function setFollowing(value){if(!value){stopFollowing();return;}following=true;button.setAttribute('aria-pressed','true');document.body.classList.add('following-train');onFollow?.();render(elapsed);}
 button.textContent='Мотовоз';button.title='Следить за поездом: пл. №1 → Тюратам → город';button.addEventListener('click',()=>setFollowing(!following));
 canvas.addEventListener('pointerdown',stopFollowing,{passive:true});canvas.addEventListener('wheel',stopFollowing,{passive:true});
 document.addEventListener('keydown',e=>{if(!e.target.matches('input,textarea,select')&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))stopFollowing();});
 document.addEventListener('visibilitychange',()=>{lastNow=null;});
 function placeRailVehicle(vehicle,distance){
  const at=rail.sample(distance,vehicle.wheelbase/2);vehicle.root.position.copy(at.position);vehicle.root.quaternion.copy(orient(at.tangent));
  for(const axle of vehicle.axles){const pose=rail.sample(distance+axle.offset,.25);axle.root.position.copy(pose.position);axle.root.quaternion.copy(orient(pose.tangent));
   for(const w of axle.wheels)w.rotation.x=-distance/vehicle.wheelRadius;
  }
 }
 function render(t){
  cars.forEach((car,i)=>{const state=highwayVehiclePose(highway,t,i);carStates[i]=state;car.root.position.copy(state.position);car.root.quaternion.copy(orient(state.tangent));car.setVisible(state.opacity,night);});
  engineDistance=trainDistance(t,rail.length);placeRailVehicle(engine,engineDistance);placeRailVehicle(wagon,engineDistance-3.72);
  if(following&&!layers.rails.visible)stopFollowing();
  if(following){const target=engine.root.position.clone().add(V(0,.6,0));controls.target.copy(target);camera.position.copy(target).add(V(7.5,7.5,9.5));controls.update();}
  const phase=t>=TRAIN_DURATION?'arrived':'moving';if(lastPhase!==phase){lastPhase=phase;button.title=phase==='arrived'?'Мотовоз прибыл в станционный район Тюратам':'Следить за поездом: пл. №1 → Тюратам → город';}
 }
 function setEvening(value){night=!!value;for(const v of [engine,wagon]){v.glass.emissiveIntensity=night?.33:0;v.lights.setStrength(night?1:.08);}render(elapsed);}
 setEvening(true);
 return {setEvening,stopFollowing,setFollowing,seek(t){elapsed=Math.max(0,t);forced=elapsed;render(elapsed);},resume(){forced=null;lastNow=null;},
  focusHighway(){stopFollowing();onFollow?.();const at=highway.sample(highway.bridgeDistance);controls.target.copy(at.position);camera.position.copy(at.position).add(V(65,70,90));controls.update();},
  update(now){if(lastNow===null)lastNow=now;if(!document.hidden&&forced===null)elapsed+=(now-lastNow)/1000;lastNow=now;render(elapsed);},
  stats:()=>({version:'ground-traffic-v1',elapsed,night,cars:cars.length,highwayRoutes:highway.routeIds,highwayLength:highway.length,highwayJoinGap:highway.joinGap,bridgeDistance:highway.bridgeDistance,
   carStates:carStates.map((s,i)=>({index:i,position:cars[i].root.position.toArray(),direction:s.direction,speed:s.speed,distance:s.distance,laneOffset:s.laneOffset,opacity:s.opacity})),
   train:{from:plan.from,to:plan.to,duration:TRAIN_DURATION,distance:engineDistance,length:rail.length,phase:lastPhase,following,gauge:plan.gauge,
    locomotive:engine.root.position.toArray(),wagon:wagon.root.position.toArray(),joins:plan.joins,
    wheels:[engine,wagon].flatMap(v=>v.axles.flatMap(a=>a.wheels.map(w=>({center:w.getWorldPosition(V()).toArray(),bottom:w.getWorldPosition(V()).y-v.wheelRadius}))))}})};
}
