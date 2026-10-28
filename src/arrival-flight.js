import * as THREE from 'three';
import {buildAlrosaAircraft as buildAircraft,AIRCRAFT_SCALE,AIRCRAFT_APPEARANCE_VERSION} from './aircraft-livery.js?v=20261028-alrosa-orbit-v2';

import {createFlightCircuit,flightPose,FLIGHT_DURATION,TOUCHDOWN_TIME,FLIGHT_CYCLE_DURATION,FLIGHT_LEG_DURATION,FLIGHT_CIRCUIT_VERSION} from './flight-circuit.js?v=20261028-museum4-v1';
export {FLIGHT_DURATION,TOUCHDOWN_TIME,FLIGHT_CYCLE_DURATION,FLIGHT_LEG_DURATION};
// krayniy-circuit-v4: automatic two-sortie circuit, including runway turnaround.
const V=(x,y,z)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
export const createArrivalPath=airfield=>createFlightCircuit(airfield,{aircraftScale:AIRCRAFT_SCALE});
export const arrivalPose=(path,seconds)=>flightPose(path,seconds,{aircraftScale:AIRCRAFT_SCALE});

function buildContrails(parent,path){
 const count=144,geometry=new THREE.BufferGeometry(),positions=new Float32Array(count*4*3),alphas=new Float32Array(count*4),uvs=new Float32Array(count*4*2),indices=[];
 for(let lane=0;lane<2;lane++)for(let i=0;i<count;i++){
  const k=(lane*count+i)*2;uvs.set([0,i/(count-1),1,i/(count-1)],k*2);
  if(i<count-1)indices.push(k,k+1,k+2,k+1,k+3,k+2);
 }
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('opacity',new THREE.BufferAttribute(alphas,1));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  vertexShader:`attribute float opacity;varying float alpha;varying vec2 vUv;
   #include <common>
   #include <logdepthbuf_pars_vertex>
   void main(){alpha=opacity;vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
   }`,
  fragmentShader:`varying float alpha;varying vec2 vUv;
   #include <common>
   #include <logdepthbuf_pars_fragment>
   void main(){
    #include <logdepthbuf_fragment>
    float soft=pow(max(0.,sin(vUv.x*3.14159)),1.8);gl_FragColor=vec4(.67,.71,.79,soft*alpha);
    #include <colorspace_fragment>
   }`});
 // The terrain overlays render at order 2 without writing depth. Airborne
 // translucent effects must follow those overlays, while still depth testing
 // against opaque buildings and the aircraft itself.
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Два рассеивающихся инверсионных следа';mesh.renderOrder=7;mesh.frustumCulled=false;mesh.userData.pickable=false;parent.add(mesh);
 let visibleSamples=0;
 function update(time,camera){visibleSamples=0;const lastVisible=[null,null];
  for(let lane=0;lane<2;lane++)for(let i=0;i<count;i++){
   const age=i/(count-1)*38,emitted=time-age,state=path.sample(Math.max(0,emitted)),p=state.position.clone();
   const enabled=emitted>=0&&state.visible&&!state.onGround&&state.position.y-path.runwayY>90;
   const right=new THREE.Vector3().crossVectors(state.heading,V(0,1,0)).normalize();
   p.addScaledVector(right,(lane?6:-6)*AIRCRAFT_SCALE).addScaledVector(state.heading,-4*AIRCRAFT_SCALE);p.y-=1.65*AIRCRAFT_SCALE;
   p.x+=Math.sin(emitted*.4+lane)*age*.055;p.y+=age*.07;
   // Collapse the strip at an invisible return boundary. Otherwise its last
   // translucent triangle could stretch from the west entry to the old exit.
   if(enabled)lastVisible[lane]=p.clone();else if(lastVisible[lane])p.copy(lastVisible[lane]);
   const across=new THREE.Vector3().crossVectors(state.heading,camera.position.clone().sub(p).normalize()).normalize();
   const pixelWidth=camera.position.distanceTo(p)*Math.tan(camera.fov*Math.PI/360)/(globalThis.innerHeight||1000)*2.4;
   const width=Math.max(.42+age*.14,pixelWidth),opacity=enabled?.82*(1-age/38)*smooth(0,.3,age):0;
   if(opacity>.001)visibleSamples++;
   for(let side=0;side<2;side++){const n=(lane*count+i)*2+side,q=p.clone().addScaledVector(across,(side?1:-1)*width);positions.set(q.toArray(),n*3);alphas[n]=opacity;}
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.opacity.needsUpdate=true;mesh.visible=visibleSamples>0;
 }
 return {mesh,update,stats:()=>({visibleSamples,maxAge:38,emissionAbove:90,cycleDuration:FLIGHT_CYCLE_DURATION})};
}

export function createArrivalFlight({scene,camera,controls,canvas,airfield,container,onFollow}){
 const path=createArrivalPath(airfield),root=new THREE.Group();root.name='Крайний · непрерывный цикл полётов';root.userData.pickable=false;scene.add(root);
 const craft=buildAircraft(root),trail=buildContrails(scene,path);
 let elapsed=0,following=false,paused=false,lastNow=null,uiSecond=-1,lastTrail=-1,state=path.sample(0),forced=null;
 container.innerHTML='<div class="arrival-title"><span class="arrival-dot"></span><span>КРАЙНИЙ · ПОЛЁТ ПО КРУГУ</span><time id="arrivalClock" title="До следующего этапа">02:00</time></div><div class="arrival-bottom"><span id="arrivalPhase">Над космодромом</span><button id="arrivalFollow" type="button" aria-pressed="false">Следить</button><button id="arrivalReplay" type="button" aria-label="Начать цикл полёта заново" title="Начать цикл заново">↺</button></div><div class="arrival-hint">Мышь или палец — вращение · колесо — приближение</div>';
 const follow=container.querySelector('#arrivalFollow'),replay=container.querySelector('#arrivalReplay'),clock=container.querySelector('#arrivalClock'),label=container.querySelector('#arrivalPhase');
 const labels={overflight:'Над космодромом',approach:'Заход на посадку',flare:'Над полосой',rollout:'Пробег до 4/5 ВПП',hold:'Стоянка · 20 секунд','turn-back':'Разворот для руления','taxi-back':'Возвращение к началу ВПП','turn-takeoff':'Разворот перед взлётом',takeoff:'Разгон и взлёт',departure:'Пролёт через комплекс',away:'Возвращение через минуту'};
 const followTarget=new THREE.Vector3(),savedControls={};
 function stopFollowing(){if(following)Object.assign(controls,savedControls);following=false;document.body.classList.remove('following-arrival');follow.textContent='Следить';follow.title='Следить за самолётом';follow.setAttribute('aria-pressed','false');}
 function setFollowing(value){if(!value){stopFollowing();return;}if(following)return;
  for(const key of ['minDistance','maxDistance','minPolarAngle','maxPolarAngle','enablePan','mouseButtons','touches'])savedControls[key]=controls[key];
  Object.assign(controls,{minDistance:5,maxDistance:240,minPolarAngle:.06,maxPolarAngle:Math.PI-.06,enablePan:false,mouseButtons:{LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE},touches:{ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE}});
  following=true;followTarget.copy(craft.model.position);controls.target.copy(followTarget);camera.position.copy(followTarget).add(V(15,8,18).multiplyScalar(camera.aspect<.8?1.55:1));controls.update();
  document.body.classList.add('following-arrival');follow.textContent='Свободно';follow.title='Вращайте мышью или пальцем; колесо — приближение';follow.setAttribute('aria-pressed','true');onFollow?.();
 }
 follow.onclick=()=>setFollowing(!following);
 function restart(){elapsed=0;forced=null;lastNow=null;lastTrail=-1;uiSecond=-1;render(0);}
 replay.onclick=restart;
 // OrbitControls keeps rotation and zoom active while the moving target is followed.
 document.addEventListener('keydown',e=>{if(!e.target.matches('input,textarea,select')&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))stopFollowing();});
 document.addEventListener('visibilitychange',()=>{paused=document.hidden;lastNow=null;});
 const direction=V(0,0,1),rot=new THREE.Quaternion(),bankQ=new THREE.Quaternion(),lastTrailCamera=V(Infinity,Infinity,Infinity);
 function render(t){state=arrivalPose(path,t);root.visible=state.visible;craft.model.position.copy(state.bodyPosition);
  const ahead=path.sample(t+.2).heading,turn=new THREE.Vector3().crossVectors(state.heading,ahead).y;
  const banking=!state.onGround&&state.visible&&(state.segment!=='approach'||state.phaseTime<108);
  const bank=banking?clamp(-turn*12,-.32,.32):0;
  rot.copy(state.attitude);bankQ.setFromAxisAngle(direction,bank);craft.model.quaternion.copy(rot).multiply(bankQ);
  craft.updateGear(state.gear,state.segment==='approach'?state.phaseTime:null);craft.updateDetails(t);
  craft.strobes.root.visible=state.visible&&(t%1.2<.075||(t%1.2>.17&&t%1.2<.245));
  craft.beacon.root.visible=Math.sin(t*2*Math.PI/1.4)>.65;
  craft.landing.root.visible=state.visible&&state.gear>.85&&(state.segment!=='approach'||state.phaseTime>=72);
  if(following&&state.visible){const target=state.bodyPosition;camera.position.add(target.clone().sub(followTarget));controls.target.copy(target);followTarget.copy(target);controls.update();}
  if(Math.abs(t-lastTrail)>.1||lastTrail<0||lastTrailCamera.distanceToSquared(camera.position)>.01){trail.update(t,camera);lastTrail=t;lastTrailCamera.copy(camera.position);}
  const sec=Math.ceil(state.phaseRemaining),uiKey=state.leg+':'+state.segment+':'+sec;if(uiKey!==uiSecond){uiSecond=uiKey;clock.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');label.textContent=labels[state.phase]+(state.segment==='departure'?(state.direction==='northeast'?' · на северо-восток':' · на север'):'');container.dataset.leg=String(state.leg);container.dataset.phase=state.segment;}
 }
 function inspect(view='port'){
  stopFollowing();onFollow?.();
  const offsets={port:V(-50,36,10),starboard:V(50,36,10),front:V(0,45,70),rear:V(0,43,-65),top:V(0,75,.1)},axis=(offsets[view]||offsets.port).normalize();
  const halfV=THREE.MathUtils.degToRad(camera.fov/2),halfH=Math.atan(Math.tan(halfV)*camera.aspect),distance=22.5*AIRCRAFT_SCALE/Math.sin(Math.min(halfV,halfH))*1.1;
  const target=craft.model.position.clone().add(V(0,.7,0)),offset=axis.multiplyScalar(distance).applyQuaternion(craft.model.quaternion),damping=controls.enableDamping;
  controls.enableDamping=false;controls.update();controls.target.copy(target);camera.position.copy(target).add(offset);controls.update();controls.enableDamping=damping;camera.updateMatrixWorld(true);
 }
 render(0);
 return {path,stopFollowing,setFollowing,restart,inspect,setEvening(value){craft.setEvening(value);},seek(seconds){elapsed=Math.max(0,Number.isFinite(seconds)?seconds:0);forced=elapsed;render(elapsed);},resume(){forced=null;lastNow=null;},
  update(now){if(lastNow===null)lastNow=now;if(!paused&&forced===null)elapsed+=Math.max(0,(now-lastNow)/1000);lastNow=now;render(elapsed);},
  stats:()=>({appearanceVersion:AIRCRAFT_APPEARANCE_VERSION,appearance:craft.stats(),aircraft:craft.stats(),cameraOffset:camera.position.clone().sub(controls.target).toArray(),version:FLIGHT_CIRCUIT_VERSION,duration:FLIGHT_CYCLE_DURATION,arrivalDuration:FLIGHT_DURATION,cycleDuration:FLIGHT_CYCLE_DURATION,legDuration:FLIGHT_LEG_DURATION,elapsed:state.cycleTime,totalElapsed:elapsed,phase:state.phase,segment:state.segment,phaseTime:state.phaseTime,phaseRemaining:state.phaseRemaining,leg:state.leg,direction:state.direction,visible:state.visible,following,position:state.position.toArray(),velocity:state.velocity.toArray(),
   attitudeVersion:'positive-approach-v2',pitchDeg:state.pitchDeg,bodyPosition:craft.model.position.toArray(),
   renderedPitchDeg:Math.asin(V(0,0,1).applyQuaternion(craft.model.quaternion).y)*180/Math.PI,
   mainWheelBottom:craft.model.localToWorld(V(3,-2.72,-3)).y-.46*AIRCRAFT_SCALE,
   noseWheelBottom:craft.model.localToWorld(V(0,-2.72,12)).y-.46*AIRCRAFT_SCALE,
   gear:state.gear,onGround:state.onGround,runwayY:path.runwayY,touchdown:path.touchdown.toArray(),axis:path.axis.toArray(),stop:path.stop.toArray(),stopFraction:path.stopFraction,runwayProgress:state.runwayProgress,timeline:path.phases,
   strobeVisible:craft.strobes.root.visible,beaconVisible:craft.beacon.root.visible,trail:trail.stats()})};
}
