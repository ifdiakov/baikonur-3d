import * as THREE from 'three';
import {buildAlrosaAircraft as buildAircraft,AIRCRAFT_SCALE,AIRCRAFT_APPEARANCE_VERSION} from './aircraft-livery.js?v=20261028-alrosa-orbit-v2';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;
const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
export const FLIGHT_DURATION=120,TOUCHDOWN_TIME=108;

// Attitude is independent of the descending flight path: positive angle of
// attack on final, a gentle flare, then the nose gear settles after the mains.
export function arrivalPose(path,seconds){
 const t=clamp(seconds,0,120),state=path.sample(t),horizontal=state.heading.clone().setY(0).normalize();
 const pathPitch=Math.atan2(state.heading.y,Math.hypot(state.heading.x,state.heading.z))*180/Math.PI;
 const approach=THREE.MathUtils.lerp(pathPitch,3.5,smooth(46,58,t));
 const pitchDeg=(approach+2.5*smooth(96,107,t))*(1-smooth(109,115,t)),pitch=pitchDeg*Math.PI/180;
 const airframeHeading=horizontal.multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
 // Rotate around the main-gear contact line, not through the runway surface.
 const gearLift=AIRCRAFT_SCALE*(2.72*(Math.cos(pitch)-1)+3*Math.sin(pitch))*smooth(96,108,t);
 const bodyPosition=state.position.clone();bodyPosition.y+=gearLift;
 const attitude=new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch,Math.atan2(state.heading.x,state.heading.z),0,'YXZ'));
 return {...state,pitchDeg,airframeHeading,bodyPosition,attitude};
}

// Position and velocity share the same Hermite segments. The final segment
// runs exactly on the existing runway centreline and ends with zero velocity.
export function createArrivalPath(airfield){
 airfield.updateWorldMatrix(true,false);
 const runwayY=airfield.localToWorld(V(0,1.75,0)).y,clearance=3.18*AIRCRAFT_SCALE;
 const center=airfield.getWorldPosition(V(0,0,0)),axis=airfield.localToWorld(V(0,0,1)).sub(center).normalize();axis.y=0;axis.normalize();
 const dimensions=airfield.userData.airport||{threshold:1535,touchdown:1170};
 const threshold=airfield.localToWorld(V(0,1.75,dimensions.threshold)),touchdown=airfield.localToWorld(V(0,1.75,dimensions.touchdown));touchdown.y=runwayY+clearance;
 const near=(distance,y)=>touchdown.clone().addScaledVector(axis,distance).setY(y);
 const along=(speed,vertical=0)=>axis.clone().multiplyScalar(-speed).setY(vertical);
 const nodes=[
  {t:0,p:V(-1590,510,-1300),v:V(32,-.6,12)},
  {t:38,p:V(-280,420,-520),v:V(34,-3,37)},
  {t:72,p:near(650,runwayY+clearance+650*Math.tan(Math.PI/60)),v:along(23,-23*Math.tan(Math.PI/60))},
  {t:96,p:near(160,runwayY+clearance+160*Math.tan(Math.PI/60)),v:along(16,-16*Math.tan(Math.PI/60))},
  {t:108,p:touchdown,v:along(10,0)},
  {t:120,p:near(-60,touchdown.y),v:V(0,0,0)}
 ];
 function sample(seconds){
  const t=clamp(seconds,0,FLIGHT_DURATION);let i=0;while(i<nodes.length-2&&t>nodes[i+1].t)i++;
  const a=nodes[i],b=nodes[i+1],span=b.t-a.t,u=(t-a.t)/span,u2=u*u,u3=u2*u;
  const p=a.p.clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(a.v,(u3-2*u2+u)*span)
   .addScaledVector(b.p,-2*u3+3*u2).addScaledVector(b.v,(u3-u2)*span);
  const velocity=a.p.clone().multiplyScalar((6*u2-6*u)/span).addScaledVector(a.v,3*u2-4*u+1)
   .addScaledVector(b.p,(-6*u2+6*u)/span).addScaledVector(b.v,3*u2-2*u);
  if(t>=TOUCHDOWN_TIME)p.y=touchdown.y;
  const heading=velocity.lengthSq()>.001?velocity.clone().normalize():axis.clone().negate();
  return {position:p,velocity,heading,phase:t>=120?'parked':t>=108?'rollout':t>=96?'flare':t>=58?'approach':'overflight',
   gear:smooth(76,94,t),onGround:t>=108};
 }
 return {sample,axis,center,threshold,touchdown,runwayY,clearance,duration:FLIGHT_DURATION};
}


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
 function update(time,camera){visibleSamples=0;
  for(let lane=0;lane<2;lane++)for(let i=0;i<count;i++){
   const age=i/(count-1)*38,emitted=time-age,state=path.sample(Math.max(0,emitted)),p=state.position.clone();
   const enabled=emitted>=0&&emitted<78&&state.position.y>90;
   const right=new THREE.Vector3().crossVectors(state.heading,V(0,1,0)).normalize();
   p.addScaledVector(right,(lane?6:-6)*AIRCRAFT_SCALE).addScaledVector(state.heading,-4*AIRCRAFT_SCALE);p.y-=1.65*AIRCRAFT_SCALE;
   p.x+=Math.sin(emitted*.4+lane)*age*.055;p.y+=age*.07;
   const across=new THREE.Vector3().crossVectors(state.heading,camera.position.clone().sub(p).normalize()).normalize();
   const pixelWidth=camera.position.distanceTo(p)*Math.tan(camera.fov*Math.PI/360)/(globalThis.innerHeight||1000)*2.4;
   const width=Math.max(.42+age*.14,pixelWidth),opacity=enabled?.82*(1-age/38)*smooth(0,.3,age):0;
   if(opacity>.001)visibleSamples++;
   for(let side=0;side<2;side++){const n=(lane*count+i)*2+side,q=p.clone().addScaledVector(across,(side?1:-1)*width);positions.set(q.toArray(),n*3);alphas[n]=opacity;}
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.opacity.needsUpdate=true;mesh.visible=visibleSamples>0;
 }
 return {mesh,update,stats:()=>({visibleSamples,maxAge:38,emissionEnds:78})};
}

export function createArrivalFlight({scene,camera,controls,canvas,airfield,container,onFollow}){
 const path=createArrivalPath(airfield),root=new THREE.Group();root.name='Прибытие · Крайний';root.userData.pickable=false;scene.add(root);
 const craft=buildAircraft(root),trail=buildContrails(scene,path);
 let elapsed=0,following=false,paused=false,lastNow=null,uiSecond=-1,lastTrail=-1,state=path.sample(0),forced=null;
 container.innerHTML='<div class="arrival-title"><span class="arrival-dot"></span><span>КРАЙНИЙ · ПРИБЫТИЕ</span><time id="arrivalClock">02:00</time></div><div class="arrival-bottom"><span id="arrivalPhase">Над космодромом</span><button id="arrivalFollow" type="button" aria-pressed="false">Следить</button><button id="arrivalReplay" type="button" aria-label="Повторить двухминутный заход самолёта" title="Повторить заход">↺</button></div><div class="arrival-hint">Мышь или палец — вращение · колесо — приближение</div>';
 const follow=container.querySelector('#arrivalFollow'),replay=container.querySelector('#arrivalReplay'),clock=container.querySelector('#arrivalClock'),label=container.querySelector('#arrivalPhase');
 const labels={overflight:'Над космодромом',approach:'Заход на посадку',flare:'Над полосой',rollout:'Пробег по ВПП',parked:'Посадка завершена'};
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
 function render(t){state=arrivalPose(path,t);craft.model.position.copy(state.bodyPosition);
  const ahead=path.sample(Math.min(120,t+.2)).heading,turn=new THREE.Vector3().crossVectors(state.heading,ahead).y;
  const bank=t<96?clamp(-turn*12,-.32,.32):0;
  rot.copy(state.attitude);bankQ.setFromAxisAngle(direction,bank);craft.model.quaternion.copy(rot).multiply(bankQ);
  craft.updateGear(state.gear,t);craft.updateDetails(t);
  craft.strobes.root.visible=t<120&&(t%1.2<.075||(t%1.2>.17&&t%1.2<.245));
  craft.beacon.root.visible=Math.sin(t*2*Math.PI/1.4)>.65;
  craft.landing.root.visible=t>=72&&t<119;
  if(following){const target=state.bodyPosition;camera.position.add(target.clone().sub(followTarget));controls.target.copy(target);followTarget.copy(target);controls.update();}
  if(Math.abs(t-lastTrail)>.1||lastTrail<0||lastTrailCamera.distanceToSquared(camera.position)>.01){trail.update(t,camera);lastTrail=t;lastTrailCamera.copy(camera.position);}
  const sec=Math.ceil(120-t);if(sec!==uiSecond){uiSecond=sec;clock.textContent=t>=120?'✓':String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');label.textContent=labels[state.phase];}
 }
 function inspect(view='port'){
  stopFollowing();onFollow?.();
  const offsets={port:V(-50,36,10),starboard:V(50,36,10),front:V(0,45,70),rear:V(0,43,-65),top:V(0,75,.1)},axis=(offsets[view]||offsets.port).normalize();
  const halfV=THREE.MathUtils.degToRad(camera.fov/2),halfH=Math.atan(Math.tan(halfV)*camera.aspect),distance=22.5*AIRCRAFT_SCALE/Math.sin(Math.min(halfV,halfH))*1.1;
  const target=craft.model.position.clone().add(V(0,.7,0)),offset=axis.multiplyScalar(distance).applyQuaternion(craft.model.quaternion),damping=controls.enableDamping;
  controls.enableDamping=false;controls.update();controls.target.copy(target);camera.position.copy(target).add(offset);controls.update();controls.enableDamping=damping;camera.updateMatrixWorld(true);
 }
 render(0);
 return {path,stopFollowing,setFollowing,restart,inspect,setEvening(value){craft.setEvening(value);},seek(seconds){elapsed=clamp(seconds,0,120);forced=elapsed;render(elapsed);},resume(){forced=null;lastNow=null;},
  update(now){if(lastNow===null)lastNow=now;if(!paused&&forced===null)elapsed=Math.min(120,elapsed+(now-lastNow)/1000);lastNow=now;render(elapsed);},
  stats:()=>({appearanceVersion:AIRCRAFT_APPEARANCE_VERSION,appearance:craft.stats(),aircraft:craft.stats(),cameraOffset:camera.position.clone().sub(controls.target).toArray(),version:'krayniy-alrosa-orbit-v2',duration:120,elapsed,phase:state.phase,following,position:state.position.toArray(),velocity:state.velocity.toArray(),
   attitudeVersion:'positive-approach-v2',pitchDeg:state.pitchDeg,bodyPosition:craft.model.position.toArray(),
   renderedPitchDeg:Math.asin(V(0,0,1).applyQuaternion(craft.model.quaternion).y)*180/Math.PI,
   mainWheelBottom:craft.model.localToWorld(V(3,-2.72,-3)).y-.46*AIRCRAFT_SCALE,
   noseWheelBottom:craft.model.localToWorld(V(0,-2.72,12)).y-.46*AIRCRAFT_SCALE,
   gear:state.gear,onGround:state.onGround,runwayY:path.runwayY,touchdown:path.touchdown.toArray(),axis:path.axis.toArray(),
   strobeVisible:craft.strobes.root.visible,beaconVisible:craft.beacon.root.visible,trail:trail.stats()})};
}
