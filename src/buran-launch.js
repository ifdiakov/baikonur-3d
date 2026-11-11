import * as THREE from 'three';
import {MUSEUM_METRE,MUSEUM_MAP_SCALE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {getSite110LaunchRig} from './site110.js?v=20261111-buran-launch-v1';
import {createEnergiaBuranEffects,sampleEnergiaBuranEffects} from './energia-buran-effects.js?v=20261111-buran-launch-v1';
import {BURAN_LAUNCH_VERSION,START,END,SOURCES,sampleBuranHistory} from './buran-launch-history.js?v=20261111-buran-launch-v1';

export {BURAN_LAUNCH_VERSION};
export const BURAN_LAUNCH_START=START;
export const BURAN_LAUNCH_END=END;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,t)=>{const x=clamp((t-a)/(b-a),0,1);return x*x*(3-2*x);};
const vec=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const Y=vec(0,1,0),X=vec(1,0,0);

// An illustrative initial ascent, not measured flight telemetry. Physical
// metres are preserved near the pad; distant height uses the museum's existing
// UKSS compression so the vehicle remains within the complete map scene.
export function sampleBuranAscent(time){
 const t=Math.max(0,Number.isFinite(time)?Math.min(time,END):0);
 const altitudeMetres=1.3*t*t+.018*t*t*t;
 const altitudeKm=altitudeMetres/1000;
 const visualHeight=altitudeKm<=1.12?altitudeMetres*MUSEUM_METRE:156.8+85*Math.log1p((altitudeKm-1.12)*.32);
 return {altitudeMetres,visualHeight,visualMetres:visualHeight/MUSEUM_METRE,
  downrangeMetres:visualHeight/MUSEUM_METRE*.24*smooth(12,75,t),pitchRadians:THREE.MathUtils.degToRad(17)*smooth(8,75,t),
  cameraHeight:visualHeight/MUSEUM_MAP_SCALE,interpretation:'illustrative-ascent-not-flight-telemetry'};
}

export function createBuranLaunch({siteRoot,camera,controls,getEntry,onBeforeStart=()=>{},onStart=()=>null,onStop=()=>{}}){
 if(!siteRoot||!camera||!controls||typeof getEntry!=='function')throw new Error('Старт площадки 110 ещё не готов');
 const rig=getSite110LaunchRig(siteRoot);
 if(!rig||rig.channels.length!==3)throw new Error('Три газоотвода площадки 110 ещё не готовы');
 const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';
 stylesheet.href=new URL('./buran-launch.css?v=20261111-buran-launch-v1',import.meta.url);document.head.append(stylesheet);
 const panel=document.createElement('section');panel.id='buranLaunchPanel';panel.hidden=true;
 panel.setAttribute('aria-label','Старт «Энергии — Бурана» 15 ноября 1988 года');
 panel.innerHTML=`<header><div><span class="buran-launch-eyebrow">15 НОЯБРЯ 1988 · ПЛОЩАДКА 110</span><h2>Энергия — Буран</h2></div><button id="buranLaunchClose" type="button" aria-label="Закрыть реконструкцию">×</button></header>
 <div class="buran-launch-phase"><strong id="buranLaunchPhase"></strong><output id="buranLaunchTime"></output></div>
 <p id="buranLaunchCaption"></p>
 <div class="buran-launch-systems"><span>РД-0120 <b id="buranLaunchCore">Ожидание</b></span><span>РД-170 <b id="buranLaunchBoosters">Ожидание</b></span><span>Газоотводы <b id="buranLaunchDucts">3</b></span></div>
 <label class="buran-launch-scrubber">Последний отсчёт и взлёт<input id="buranLaunchSeek" type="range" min="${START}" max="${END}" value="${START}" step="0.05" aria-label="Время относительно отрыва ракеты, секунды"></label>
 <div class="buran-launch-buttons"><button id="buranLaunchPlay" type="button">Пауза</button><button id="buranLaunchRestart" type="button">Сначала</button><button id="buranLaunchOverview" type="button" data-buran-launch-view="overview">Старт</button><button id="buranLaunchTrenches" type="button" data-buran-launch-view="trenches">Три газоотвода</button><button id="buranLaunchFollow" type="button" data-buran-launch-view="follow">За ракетой</button></div>
 <div class="buran-launch-footer"><label>Темп <select id="buranLaunchRate" aria-label="Темп реконструкции"><option value="auto">Отсчёт ×6 · взлёт ×1</option><option value="1">×1</option><option value="4">×4</option></select></label><span id="buranLaunchCameraHint">Камера сохраняет выбранный ракурс</span></div>
 <details><summary>Источники реконструкции</summary><p>Запуски двигателей и контакт подъёма привязаны к циклограмме 15 ноября 1988 года. Большая башня обслуживания отведена до заправки; в финальном отсчёте отходят площадки мачты. Последняя дренажная связь освобождает ракету после начала подъёма.</p><p>Углы и промежуточная длительность движения площадок, потоки газа и начальная траектория показаны приблизительно. Вечернее освещение сохраняет оформление музея. Эпизод заканчивается до отделения боковых блоков.</p><nav id="buranLaunchSources" aria-label="Исторические источники"></nav></details>`;
 document.body.append(panel);const $=id=>panel.querySelector('#'+id);
 for(const source of Object.values(SOURCES)){const a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=source.title+' ↗';$('buranLaunchSources').append(a);}
 let active=false,playing=false,time=START,last=null,saved=null,sceneRestore=null,effects=null,disposed=false;
 let view='follow',detached=false,detachedAt=null,rate='auto',lastSample=null,restored=null,lastUIKey='',framing=null;
 const followTarget=vec(),initialTarget=vec(),initialEye=vec();

 function copyCamera(eye,target){
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
  camera.position.copy(eye);controls.target.copy(target);controls.update();
  camera.position.copy(eye);controls.target.copy(target);camera.updateMatrixWorld(true);controls.enableDamping=damping;
 }
 function capture(){
  const rocket=getEntry()?.holder;if(!rocket)throw new Error('Модель «Энергии — Бурана» не найдена');
  return {rocket,position:rocket.position.clone(),quaternion:rocket.quaternion.clone(),scale:rocket.scale.clone(),visible:rocket.visible,
   eye:camera.position.clone(),target:controls.target.clone(),focus:document.activeElement,
   controls:{enabled:controls.enabled,enableDamping:controls.enableDamping,enablePan:controls.enablePan,enableRotate:controls.enableRotate,enableZoom:controls.enableZoom,
    screenSpacePanning:controls.screenSpacePanning,minDistance:controls.minDistance,maxDistance:controls.maxDistance,minPolarAngle:controls.minPolarAngle,maxPolarAngle:controls.maxPolarAngle,
    mouseButtons:{...controls.mouseButtons},touches:{...controls.touches}}};
 }
 function rocketPosition(ascent){
  const shift=vec(0,0,-ascent.downrangeMetres).applyAxisAngle(Y,rig.frame.padYaw);
  return saved.position.clone().add(shift).add(vec(0,ascent.visualMetres,0));
 }
 function rocketTarget(){saved.rocket.updateWorldMatrix(true,false);return saved.rocket.localToWorld(vec(0,29,0));}
 function updateCamera(sample){
  if(view!=='follow')return;
  if(sample.ascent.cameraHeight<100){detached=false;detachedAt=null;}
  if(detached)return;
  const desired=initialTarget.clone().lerp(rocketTarget(),smooth(0,8,sample.time));
  const delta=desired.clone().sub(followTarget);camera.position.add(delta);controls.target.add(delta);followTarget.copy(desired);
  if(sample.ascent.cameraHeight>=100){detached=true;detachedAt=sample.time;}
  camera.updateMatrixWorld(true);
 }
 function updateUI(sample){
  const uiKey=[time.toFixed(1),playing,view,detached].join('|');if(uiKey===lastUIKey)return;lastUIKey=uiKey;
  $('buranLaunchPhase').textContent=sample.history.title;
  $('buranLaunchCaption').textContent=sample.history.caption;
  $('buranLaunchTime').textContent='T'+(time<0?'−':'+')+Math.abs(time).toFixed(1).padStart(4,'0')+' с';
  $('buranLaunchSeek').value=String(time);
  $('buranLaunchPlay').textContent=playing?'Пауза':time>=END?'Повторить':'Продолжить';
  $('buranLaunchPlay').setAttribute('aria-pressed',String(playing));
  $('buranLaunchCore').textContent=sample.effects.engine.core>.01?'Работа':'Ожидание';
  $('buranLaunchBoosters').textContent=sample.effects.engine.boosters>.01?'Работа':'Ожидание';
  $('buranLaunchDucts').textContent=sample.effects.ground.gas>.01?'3 · газ и пар':sample.effects.ground.water>.01?'3 · вода':'3 · готовность';
  $('buranLaunchCameraHint').textContent=detached?'Свободная камера · ракета продолжает полёт':view==='follow'?'Камера следует за ракетой':'Свободный обзор старта';
  for(const b of panel.querySelectorAll('[data-buran-launch-view]'))b.setAttribute('aria-pressed',String(b.dataset.buranLaunchView===view));
 }
 function apply(){
  if(!active||!saved)return null;
  const ascent=sampleBuranAscent(time),history=sampleBuranHistory(time),fx=sampleEnergiaBuranEffects(time,{altitudeMetres:ascent.altitudeMetres});
  rig.seek(time);
  saved.rocket.position.copy(rocketPosition(ascent));
  // The installed holder includes the half-turn used by the source model.
  // Positive local pitch therefore points its nose along this downrange axis.
  saved.rocket.quaternion.copy(saved.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(X,ascent.pitchRadians));
  saved.rocket.scale.copy(saved.scale);saved.rocket.visible=true;saved.rocket.updateWorldMatrix(true,true);
  // Rocket pose is committed first; moving nozzle flames share its transform.
  // The three ground streams remain attached to the actual concrete channels.
  effects.seek(fx);lastSample={time,history,ascent,effects:fx};updateCamera(lastSample);updateUI(lastSample);return lastSample;
 }
 function start(){
  if(disposed)throw new Error('Реконструкция закрыта');
  if(active){seek(START);playing=true;last=performance.now();updateUI(lastSample);return true;}
  const entry=getEntry();if(entry?.status!=='ready'||entry.modelId!=='energia-buran')throw new Error('Дождитесь загрузки «Энергии — Бурана»');
  onBeforeStart();saved=capture();initialEye.copy(saved.eye);initialTarget.copy(saved.target);followTarget.copy(saved.target);
  try{
   sceneRestore=onStart();effects=createEnergiaBuranEffects({root:siteRoot,rocket:saved.rocket,camera,channels:rig.channels});
   Object.assign(controls,{enabled:true,enablePan:false,enableRotate:true,enableZoom:true,minDistance:.1,maxDistance:200000,minPolarAngle:.001,maxPolarAngle:Math.PI*.499});
   controls.mouseButtons={...controls.mouseButtons,LEFT:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.ROTATE};
   controls.touches={...controls.touches,ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};
   copyCamera(saved.eye,saved.target);active=true;playing=true;time=START;last=performance.now();view='follow';detached=false;detachedAt=null;
   panel.hidden=false;document.body.classList.add('buran-launch-active');apply();return true;
  }catch(error){stop();throw error;}
 }
 function stop({restoreCamera=true,releaseCamera=restoreCamera}={}){
  if(!saved&&!active)return false;
  active=false;playing=false;last=null;effects?.hide();effects?.dispose();effects=null;rig.reset();
  const previous=saved;
  if(previous){
   previous.rocket.position.copy(previous.position);previous.rocket.quaternion.copy(previous.quaternion);previous.rocket.scale.copy(previous.scale);previous.rocket.visible=previous.visible;
   previous.rocket.updateWorldMatrix(true,true);
  }
  sceneRestore?.();sceneRestore=null;
  if(previous){Object.assign(controls,previous.controls);controls.mouseButtons={...previous.controls.mouseButtons};controls.touches={...previous.controls.touches};
   if(releaseCamera)copyCamera(previous.eye,previous.target);
   restored={position:previous.rocket.position.toArray(),quaternion:previous.rocket.quaternion.toArray(),visible:previous.rocket.visible,cameraRestored:Boolean(releaseCamera)};
  }
  saved=null;panel.hidden=true;document.body.classList.remove('buran-launch-active');onStop();
  return true;
 }
 function seek(next){if(!active)return false;time=clamp(Number.isFinite(Number(next))?Number(next):START,START,END);last=performance.now();apply();return time;}
 function pause(){playing=false;last=null;if(lastSample)updateUI(lastSample);return true;}
 function resume(){if(!active)return false;if(time>=END)seek(START);playing=true;last=performance.now();updateUI(lastSample);return true;}
 function frameTrenches(){
  // Fit the real three outlets and their nearby vapour into the usable screen
  // above the controls. A portrait viewport needs a wider camera distance,
  // rather than the same desktop offset with one mouth hidden by the panel.
  const small=innerWidth<700,panelBox=panel.getBoundingClientRect();
  const maxHeight=parseFloat(getComputedStyle(panel).maxHeight)||innerHeight*(small?.43:.48);
  const top=small?72:66,bottom=Math.max(top+80,Math.min(panelBox.top,innerHeight-maxHeight-(small?8:18))-16);
  const rect={left:small?18:Math.min(350,innerWidth*.24),right:innerWidth-22,top,bottom};
  const focus=siteRoot.localToWorld(vec(...rig.frame.padOrigin).add(vec(0,18,0)));
  const points=rig.channels.flatMap(channel=>{
   const outlet=vec(...channel.outlet),direction=outlet.clone().sub(vec(...channel.throat)).setY(0).normalize();
   const side=vec(-direction.z,0,direction.x).multiplyScalar(channel.width*.65);
   return [outlet.clone().add(side),outlet.clone().sub(side),outlet.clone().addScaledVector(direction,55).add(vec(0,20,0))];
  });
  points.push(vec(...rig.frame.padOrigin),vec(...rig.frame.padOrigin).add(vec(0,74,0)));
  points.forEach(p=>siteRoot.localToWorld(p));
  const direction=vec(.7,2.2,1).applyAxisAngle(Y,rig.frame.padYaw).transformDirection(siteRoot.matrixWorld);
  const probe=camera.clone(),ndcX=(rect.left+rect.right)/innerWidth-1,ndcY=1-(rect.top+rect.bottom)/innerHeight;
  let distance=360*siteRoot.getWorldScale(vec()).y,eye,target,projected=[];
  for(let attempt=0;attempt<26;attempt++){
   probe.position.copy(focus).addScaledVector(direction,distance);probe.lookAt(focus);probe.updateMatrixWorld(true);
   const halfHeight=distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom;
   const shift=vec(1,0,0).applyQuaternion(probe.quaternion).multiplyScalar(-ndcX*halfHeight*camera.aspect)
    .addScaledVector(vec(0,1,0).applyQuaternion(probe.quaternion),-ndcY*halfHeight);
   eye=probe.position.clone().add(shift);target=focus.clone().add(shift);probe.position.copy(eye);probe.lookAt(target);probe.updateMatrixWorld(true);
   projected=points.map(point=>{const p=point.clone().project(probe);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2,z:p.z};});
   if(projected.every(p=>p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom&&p.z>-1&&p.z<1))break;
   distance*=1.12;
  }
  copyCamera(eye,target);framing={view:'trenches',rect,distance,points:projected};
 }
 function setView(next){
  if(!active||!['overview','trenches','follow'].includes(next))return false;
  view=next;detached=false;detachedAt=null;framing=null;
  if(view==='follow'){
   const direction=camera.position.clone().sub(controls.target);if(direction.lengthSq()<.01)direction.set(26,18,30);
   direction.setLength(clamp(direction.length(),15,90));
   const target=initialTarget.clone().lerp(rocketTarget(),smooth(0,8,time));copyCamera(target.clone().add(direction),target);
   followTarget.copy(target);
  }else if(view==='trenches')frameTrenches();
  else{
   const origin=vec(...rig.frame.padOrigin),target=origin.clone().add(vec(0,23,0));
   const eyeOffset=vec(145,110,170);
   if(innerWidth<700)eyeOffset.multiplyScalar(1.18);
   eyeOffset.applyAxisAngle(Y,rig.frame.padYaw);
   copyCamera(siteRoot.localToWorld(target.clone().add(eyeOffset)),siteRoot.localToWorld(target));
  }
  updateUI(lastSample);return true;
 }
 function setManualCamera(){if(!active)return false;view='manual';detached=true;detachedAt=time;updateUI(lastSample);return true;}
 function update(now){
  if(!active||!Number.isFinite(now))return;
  if(document.hidden){last=null;return;}
  if(!playing){last=now;return;}
  if(last===null){last=now;return;}
  let dt=Math.max(0,(now-last)/1000);last=now;
  // Do not jump across engine ignition at the accelerated countdown rate.
  if(rate==='auto'&&time<-16){const remaining=(-16-time)/6;if(dt<=remaining)time+=dt*6;else{dt-=remaining;time=-16+dt;}}
  else time+=dt*(rate==='auto'?1:Number(rate));
  if(time>=END){time=END;playing=false;}apply();
 }
 function stats(){
  const rocket=getEntry()?.holder;rocket?.updateWorldMatrix(true,false);
  return {version:BURAN_LAUNCH_VERSION,active,playing,time,phase:lastSample?.history.phase||'idle',view,rate,
   altitudeMetres:lastSample?.ascent.altitudeMetres||0,ascent:lastSample?.ascent||sampleBuranAscent(START),
   rocket:rocket?{position:rocket.position.toArray(),quaternion:rocket.quaternion.toArray(),scale:rocket.scale.toArray(),worldPosition:rocket.getWorldPosition(vec()).toArray(),basePosition:saved?.position.toArray()||restored?.position||null,visible:rocket.visible,sourceModel:getEntry().modelId}:null,
   camera:{following:active&&view==='follow'&&!detached,detached,detachedAt,target:controls.target.toArray(),position:camera.position.toArray(),initialPosition:initialEye.toArray(),initialTarget:saved?.target.toArray()||initialTarget.toArray()},
   effects:effects?.stats()||null,rig:rig.stats(),restored,framing,sourceCount:Object.keys(SOURCES).length,
   assumptions:['platform-angle-and-unrecorded-motion-intervals','illustrative-initial-ascent','museum-evening-light']};
 }
 $('buranLaunchClose').onclick=()=>stop();$('buranLaunchPlay').onclick=()=>playing?pause():resume();
 $('buranLaunchRestart').onclick=()=>{seek(START);resume();};$('buranLaunchSeek').oninput=e=>seek(Number(e.target.value));
 $('buranLaunchRate').onchange=e=>{rate=e.target.value;last=performance.now();};
 for(const b of panel.querySelectorAll('[data-buran-launch-view]'))b.onclick=()=>setView(b.dataset.buranLaunchView);
 const keydown=event=>{if(!active||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.key==='Escape'){event.preventDefault();stop();return;}
  if(/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||event.target?.isContentEditable)return;
  if(event.code==='Space'&&event.target?.tagName!=='BUTTON'){event.preventDefault();playing?pause():resume();}};
 const visibilityChanged=()=>{last=null;};document.addEventListener('visibilitychange',visibilityChanged);
 const resize=()=>{if(active&&view==='trenches')frameTrenches();};window.addEventListener('resize',resize);
 window.addEventListener('keydown',keydown);
 return {start,stop,seek,pause,resume,setView,setManualCamera,update,stats,isActive:()=>active,
  dispose(){if(disposed)return;stop();disposed=true;panel.remove();stylesheet.remove();window.removeEventListener('keydown',keydown);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibilityChanged);}};
}
