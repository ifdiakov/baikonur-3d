import * as THREE from 'three';
import {createRoadVehicles} from './road-vehicles.js?v=20261028-museum4-osm-live-v2';
import {buildRailVehicle,COACH_COUNT,COACH_OFFSETS,TRAIN_START_DISTANCE,TRAIN_CONSIST_LENGTH} from './rail-vehicles.js?v=20261028-museum4-osm-live-v2';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
export const TRAIN_DURATION=420;
export function trainDistance(elapsed,length){
 const start=TRAIN_START_DISTANCE,end=length-8,travel=end-start,ramp=8,t=clamp(elapsed,0,TRAIN_DURATION),speed=travel/(TRAIN_DURATION-ramp);
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

export function createGroundTraffic({layers,transport,camera,controls,canvas,button,onFollow}){
 const roadVehicles=createRoadVehicles({parent:layers.roads,roads:transport.roadPaths(),camera,controls});
 const highway=roadVehicles.highway,plan=transport.trainPath(),rail=plan.path;
 const cars=roadVehicles.cars,trainRoot=new THREE.Group();trainRoot.name='Поезд · площадка 1 → город';layers.rails.add(trainRoot);
 const engine=buildRailVehicle(trainRoot,{gauge:plan.gauge});
 const coaches=Array.from({length:COACH_COUNT},(_,index)=>buildRailVehicle(trainRoot,{wagon:true,gauge:plan.gauge,index,last:index===COACH_COUNT-1})),vehicles=[engine,...coaches];
 const vehicleDistances=new Map(),followTarget=V(),followDirection=V(),followSide=V();
 let elapsed=0,lastNow=null,forced=null,night=true,following=false,lastPhase='';
 const quaternion=new THREE.Quaternion();let engineDistance=TRAIN_START_DISTANCE;
 const orient=t=>quaternion.setFromEuler(new THREE.Euler(-Math.asin(clamp(t.y,-1,1)),Math.atan2(t.x,t.z),0,'YXZ'));
 function stopFollowing(){following=false;button?.setAttribute('aria-pressed','false');document.body.classList.remove('following-train');}
 function setFollowing(value){if(!value){stopFollowing();return;}layers.rails.visible=true;const toggle=document.querySelector('[data-layer="rails"]');if(toggle)toggle.checked=true;following=true;button?.setAttribute('aria-pressed','true');document.body.classList.add('following-train');onFollow?.();render(elapsed);}
 if(button){button.textContent='Мотовоз';button.title='Мотовоз и 4 вагона: пл. №1 → Тюратам → город';button.addEventListener('click',()=>setFollowing(!following));}
 canvas.addEventListener('pointerdown',stopFollowing,{passive:true});canvas.addEventListener('wheel',stopFollowing,{passive:true});
 document.addEventListener('keydown',e=>{if(!e.target.matches('input,textarea,select')&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))stopFollowing();});
 document.addEventListener('visibilitychange',()=>{lastNow=null;});
 function placeRailVehicle(vehicle,distance){
  vehicleDistances.set(vehicle,distance);
  const at=rail.sample(distance,vehicle.wheelbase/2);vehicle.root.position.copy(at.position);vehicle.root.quaternion.copy(orient(at.tangent));
  for(const bogie of vehicle.bogies){const pose=rail.sample(distance+bogie.offset,.35);bogie.root.position.copy(pose.position);bogie.root.quaternion.copy(orient(pose.tangent));}
  for(const axle of vehicle.axles){const pose=rail.sample(distance+axle.offset,.25);axle.root.position.copy(pose.position);axle.root.quaternion.copy(orient(pose.tangent));
   for(const w of axle.wheels)w.rotation.x=-distance/vehicle.wheelRadius;
  }
 }
 function render(t){
  roadVehicles.update(t);
  engineDistance=trainDistance(t,rail.length);placeRailVehicle(engine,engineDistance);coaches.forEach((coach,i)=>placeRailVehicle(coach,engineDistance-COACH_OFFSETS[i]));
  if(following&&!layers.rails.visible)stopFollowing();
  if(following)frameTrain();
  const phase=t>=TRAIN_DURATION?'arrived':'moving';if(lastPhase!==phase){lastPhase=phase;if(button)button.title=phase==='arrived'?'Мотовоз прибыл в станционный район Тюратам':'Мотовоз и 4 вагона: пл. №1 → Тюратам → город';}
 }
 function frameTrain(distanceScale=1){
  const centerDistance=engineDistance-COACH_OFFSETS.at(-1)/2,at=rail.sample(centerDistance,4);
  followTarget.copy(at.position).add(V(0,.8,0));followDirection.copy(at.tangent).setY(0).normalize();followSide.set(followDirection.z,0,-followDirection.x);
  const halfV=THREE.MathUtils.degToRad(camera.fov*.5),halfH=Math.atan(Math.tan(halfV)*camera.aspect);
  const distance=TRAIN_CONSIST_LENGTH*.54/Math.sin(Math.min(halfV,halfH))*distanceScale;
  controls.target.copy(followTarget);camera.position.copy(followTarget).addScaledVector(followSide,distance*.79).addScaledVector(followDirection,-distance*.17);camera.position.y+=distance*.59;controls.update();
 }
 function setEvening(value){night=!!value;roadVehicles.setEvening(night);for(const v of vehicles)v.setEvening(night);render(elapsed);}
 setEvening(true);
 return {setEvening,stopFollowing,setFollowing,focusTrain(distanceScale=1){stopFollowing();onFollow?.();frameTrain(distanceScale);},seek(t){elapsed=Math.max(0,t);forced=elapsed;render(elapsed);},resume(){forced=null;lastNow=null;},
  focusCars(index=null){stopFollowing();onFollow?.();layers.roads.visible=true;const toggle=document.querySelector('[data-layer="roads"]');if(toggle)toggle.checked=true;roadVehicles.focus(index);},
  focusHighway(){stopFollowing();onFollow?.();const at=highway.sample(highway.bridgeDistance);controls.target.copy(at.position);camera.position.copy(at.position).add(V(65,70,90));controls.update();},
  update(now){if(lastNow===null)lastNow=now;if(!document.hidden&&forced===null)elapsed+=(now-lastNow)/1000;lastNow=now;render(elapsed);},
  stats:()=>({version:'ground-traffic-v2',elapsed,night,cars:cars.length,highwayRoutes:highway.routeIds,highwayLength:highway.length,highwayJoinGap:highway.joinGap,bridgeDistance:highway.bridgeDistance,
   cityRoutes:roadVehicles.stats().routes.filter(r=>r.id.startsWith('highway-city-')),roadVehicles:roadVehicles.stats(),carStates:roadVehicles.stats().carStates,
   train:{from:plan.from,to:plan.to,duration:TRAIN_DURATION,distance:engineDistance,length:rail.length,phase:lastPhase,following,gauge:plan.gauge,
    version:'motovoz-four-coaches-v2',coachCount:coaches.length,consistLength:TRAIN_CONSIST_LENGTH,startDistance:TRAIN_START_DISTANCE,
    locomotive:engine.root.position.toArray(),wagon:coaches[0].root.position.toArray(),coaches:coaches.map((v,i)=>({number:i+1,position:v.root.position.toArray(),distance:vehicleDistances.get(v),offset:COACH_OFFSETS[i],tailLights:v.last,lights:v.lightCount,detailCounts:v.detailCounts})),joins:plan.joins,
    vehicleDetails:vehicles.map(v=>({kind:v.kind,meshes:v.root.children.filter(c=>c.isMesh).length,lightCount:v.lightCount,detailCounts:v.detailCounts})),
    wheelContacts:vehicles.flatMap(v=>v.axles.map(a=>({vehicle:v.root.name,distance:vehicleDistances.get(v)+a.offset,position:a.root.position.toArray(),railPosition:rail.position(vehicleDistances.get(v)+a.offset).toArray()}))),
    wheels:vehicles.flatMap(v=>v.axles.flatMap(a=>a.wheels.map(w=>({center:w.getWorldPosition(V()).toArray(),bottom:w.getWorldPosition(V()).y-v.wheelRadius}))))}})};
}
