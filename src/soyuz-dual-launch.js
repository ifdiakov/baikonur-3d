import * as THREE from 'three';

/**
 * Two launch-site reconstructions sharing the museum's metric Soyuz exhibit.
 * The prelaunch times and flight trajectory are illustrative (not telemetry).
 * The four R-7 primary support arms release only as the rocket unloads at T=0.
 * No camera reposition is performed when the sequence starts.
 */
export const SOYUZ_DUAL_LAUNCH_VERSION='soyuz-dual-site-first-pass-v1';
export const SOYUZ_START=-75;
export const SOYUZ_END=70;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,t)=>{const q=clamp((t-a)/(b-a),0,1);return q*q*(3-2*q);};
export const SOYUZ_EVENTS=Object.freeze([
 {at:-75,title:'РАКЕТА НА СТАРТОВОМ СТОЛЕ',detail:'Ракета удерживается четырьмя опорами «тюльпана». Идёт проверка готовности наземного комплекса.'},
 {at:-58,title:'ОТВОД ОБСЛУЖИВАНИЯ',detail:'Площадки обслуживания отводятся от ракеты. Время операции условно сжато для музейного показа.'},
 {at:-35,title:'ПОДГОТОВКА К ОТРЫВУ',detail:'Обслуживающие конструкции отведены. Опоры «тюльпана» продолжают удерживать носитель.'},
 {at:-15,title:'ПРЕДСТАРТОВЫЕ ПРОЦЕССЫ',detail:'У основания ракеты заметны испарения и газовые потоки. Их объём визуализирован условно.'},
 {at:-5,title:'ЗАПУСК ДВИГАТЕЛЕЙ',detail:'Появляется факел двигателей, газоотводный лоток заполняется ярким потоком.'},
 {at:-2,title:'НАБОР ТЯГИ',detail:'Тяга возрастает. Четыре силовые опоры всё ещё удерживают ракету.'},
 {at:0,title:'ОТРЫВ · РАСКРЫТИЕ «ТЮЛЬПАНА»',detail:'При движении ракеты вверх нагрузка на четыре опоры уменьшается; противовесы раскрывают их наружу.'},
 {at:6,title:'ВЫХОД СО СТАРТОВОГО КОМПЛЕКСА',detail:'Ракета набирает высоту. Факел остаётся под двигателями, дым и пыль распространяются по земле.'},
 {at:28,title:'НАБОР ВЫСОТЫ',detail:'Показана иллюстративная траектория начального участка выведения. Скорости и высоты не являются телеметрией.'}
]);

export function sampleSoyuzLaunch(time){
 const t=clamp(Number(time)||0,SOYUZ_START,SOYUZ_END);
 const flight=Math.max(0,t);
 const altitudeMetres=t<=0?0:flight<=15?1.1*flight*flight:247.5+36*(flight-15)+1.8*(flight-15)*(flight-15);
 let phase=0;for(let i=1;i<SOYUZ_EVENTS.length;i++)if(t>=SOYUZ_EVENTS[i].at)phase=i;
 return Object.freeze({
  time:t,phase,event:SOYUZ_EVENTS[phase],
  altitudeMetres,enginePower:smooth(-5,-1,t),
  supportOpen:smooth(.1,2.8,t),
  serviceRetraction:smooth(-58,-36,t),
  umbilicalRelease:smooth(-8,-1,t),
  venting:smooth(-45,-8,t)*(1-smooth(4,18,t)),
  smoke:t<0?0:smooth(0,5,t)*(1-smooth(48,80,t)),
  airborne:t>0
 });
}
const clockString=t=>t<0?'T−'+Math.abs(t).toFixed(1)+' с':'T+'+t.toFixed(1)+' с';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function cylinderBetween(parent,a,b,r,material,segments=8){
 const start=V(...a),end=V(...b),vector=end.clone().sub(start);
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,vector.length(),segments),material);
 mesh.position.copy(start).add(end).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(V(0,1,0),vector.normalize());
 mesh.castShadow=true;mesh.userData.pickable=false;parent.add(mesh);return mesh;
}
function createKinematics(holder,siteId){
 const group=new THREE.Group();group.name='Союз · подвижные механизмы · музейная схема';
 holder.parent.add(group);group.position.copy(holder.position);
 const green=new THREE.MeshStandardMaterial({color:0x244d36,metalness:.55,roughness:.65});
 const light=new THREE.MeshStandardMaterial({color:0x77918b,metalness:.6,roughness:.5});
 const yellow=new THREE.MeshStandardMaterial({color:0xc9ae57,metalness:.45,roughness:.6});
 const armRoots=[],umbilicals=[],service=[];
 // Coordinates in metres. Separate four assemblies rotate about tangential
 // hinge axes; the tabletop itself and the surrounding site stay intact.
 const radius=siteId==='pad-1'?15.5:14.2,tipY=siteId==='pad-1'?12.4:12.6,baseY=siteId==='pad-1'?2.0:1.6;
 for(let i=0;i<4;i++){
  const angle=i*Math.PI/2+Math.PI/4,c=Math.cos(angle),s=Math.sin(angle),tangent=V(-s,0,c);
  const pivot=new THREE.Group();pivot.position.set(c*radius,baseY,s*radius);group.add(pivot);
  const x=c*(3.2-radius),z=s*(3.2-radius),y=tipY-baseY;
  const tangentOffset=(n)=>[-s*n,0,c*n];
  for(const side of [-1,1]){
   const off=tangentOffset(side*.52);
   cylinderBetween(pivot,[off[0],.0,off[2]],[x+off[0]*.4,y,z+off[2]*.4],.28,green);
  }
  for(let k=1;k<=5;k++){
   const a=k/6,b=1-a,offset=1.15*(1-a);
   cylinderBetween(pivot,[x*a-s*offset,y*a,z*a+c*offset],[x*(a+.12)+s*offset*.8,y*(a+.12),z*(a+.12)-c*offset*.8],.095,light,6);
  }
  const head=new THREE.Mesh(new THREE.BoxGeometry(1.5,.85,1.7),green);
  head.position.set(x,y,z);head.rotation.y=-angle;pivot.add(head);
  const weight=new THREE.Mesh(new THREE.CylinderGeometry(.85,.85,2.5,12),yellow);
  weight.rotation.x=Math.PI/2;weight.position.set(-c*2.2,1,-s*2.2);pivot.add(weight);
  armRoots.push({pivot,axis:tangent});
 }
 // Umbilical proxies are distinct from the four load-carrying arms.
 for(const side of [-1,1]){
  const pivot=new THREE.Group();pivot.position.set(side*8,1.5,6);group.add(pivot);
  cylinderBetween(pivot,[0,0,0],[-side*6,11,-4],.16,green);
  cylinderBetween(pivot,[-side*6,11,-4],[-side*7.4,13.2,-4],.13,light);
  umbilicals.push({pivot,side});
  const servicePivot=new THREE.Group();servicePivot.position.set(side*13,1.3,12);group.add(servicePivot);
  cylinderBetween(servicePivot,[0,0,0],[-side*3.2,19,-3],.22,green);
  cylinderBetween(servicePivot,[0,9,0],[-side*3.2,19,-3],.11,light);
  service.push({pivot:servicePivot,side});
 }
 group.userData.pickable=false;
 return {group,armRoots,umbilicals,service};
}
function createExhaust(holder){
 const local=new THREE.Group();local.name='Союз · факел двигателя';
 holder.parent.add(local);local.position.copy(holder.position);local.userData.pickable=false;
 const white=new THREE.MeshBasicMaterial({color:0xfff8e4,transparent:true,opacity:.76,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
 const blue=new THREE.MeshBasicMaterial({color:0xdbeaf7,transparent:true,opacity:.46,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
 const orange=new THREE.MeshBasicMaterial({color:0xffa85e,transparent:true,opacity:.24,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
 const flames=[];
 for(const [x,z,r] of [[0,0,1.06],[-2.55,-2.55,.63],[2.55,-2.55,.63],[-2.55,2.55,.63],[2.55,2.55,.63]]){
  const layers=[];
  for(const [mat,mult,rad] of [[orange,1.4,1.65],[blue,1,1.1],[white,.66,.67]]){
   // Flame is confined strictly BELOW its nozzle: it never obscures the rocket.
   const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r*rad*.45,r*rad*1.25,1,14,1,true),mat);
   mesh.position.set(x,-1,z);mesh.visible=false;mesh.userData.pickable=false;local.add(mesh);
   layers.push({mesh,mult});
  }
  flames.push(layers);
 }
 const light=new THREE.PointLight(0xffe3b4,0,65,2);light.position.set(0,-3,0);local.add(light);
 const ground=new THREE.Group();ground.name='Союз · пар и газоотвод';
 holder.parent.add(ground);ground.position.copy(holder.position);ground.userData.pickable=false;
 const sphere=new THREE.IcosahedronGeometry(1,1);
 const gray=new THREE.MeshBasicMaterial({color:0xb3aa9b,transparent:true,opacity:.27,depthWrite:false,side:THREE.DoubleSide});
 const mistMat=new THREE.MeshBasicMaterial({color:0xe0e8e6,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
 const smoke=new THREE.InstancedMesh(sphere,gray,120),mist=new THREE.InstancedMesh(sphere,mistMat,68);
 for(const mesh of [smoke,mist]){
  mesh.frustumCulled=false;mesh.userData.pickable=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);ground.add(mesh);
 }
 const mtx=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=V(),p=V();
 function puff(mesh,i,x,y,z,r){
  if(r<=0.001){scale.setScalar(.00001);p.set(0,-10000,0);}
  else{scale.set(r*1.35,r*.56,r*1.35);p.set(x,y,z);}
  mtx.compose(p,q,scale);mesh.setMatrixAt(i,mtx);
 }
 function render(sample){
  const power=sample.enginePower,shake=.91+.09*Math.sin(sample.time*11);
  local.position.copy(holder.position);
  for(const layers of flames)for(const {mesh,mult} of layers){
   mesh.visible=power>.002;
   if(!mesh.visible)continue;
   const length=(7+power*6)*mult*shake;
   mesh.scale.set(1,length,1);
   mesh.position.y=-.45-length/2;
  }
  light.intensity=power*6.5;local.visible=power>.002;
  const t=sample.time;
  for(let i=0;i<120;i++){
   const age=t-i*.37,live=age>=0&&age<44,life=live?1-smooth(26,44,age):0;
   const radius=life*(1.5+age*.48)*sample.smoke*(.75+.32*Math.sin(i*4.85));
   const x=Math.sin(i*2.39996)*Math.min(18,3+age*.55)+(Math.sin(age*.7+i)*.85);
   const z=-4-age*1.85+Math.cos(i*2.17)*Math.min(12,3+age*.45);
   puff(smoke,i,x,-.1+radius*.25,z,radius);
  }
  for(let i=0;i<68;i++){
   const age=t+45-i*.72,live=age>=0&&age<32,fade=live?(1-smooth(19,32,age)):0;
   const radius=fade*sample.venting*(.7+age*.17)*(1+.22*Math.sin(i*1.71));
   const sign=i%2?1:-1;
   puff(mist,i,sign*(1.5+age*.21+Math.sin(i*4)*.9),
      1.2+Math.min(6,age*.24)+Math.sin(age+i)*.45,
      (i%4-1.5)*1.4-age*.38,radius);
  }
  smoke.instanceMatrix.needsUpdate=true;mist.instanceMatrix.needsUpdate=true;
  gray.opacity=.28*sample.smoke;mistMat.opacity=.18*sample.venting;
  ground.visible=sample.venting>.001||sample.smoke>.001;
 }
 return {local,ground,render};
}
function cleanup(root){
 if(!root)return;
 const geos=new Set(),mats=new Set();
 root.traverse(o=>{if(o.isMesh){if(o.geometry)geos.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat)mats.add(mat);}});
 root.parent?.remove(root);geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
}
function ensurePanel(){
 let panel=document.getElementById('soyuzLaunchPanel');
 if(panel)return panel;
 panel=document.createElement('section');panel.id='soyuzLaunchPanel';panel.className='soyuz-launch-panel';
 panel.hidden=true;panel.setAttribute('aria-label','Цифровая реконструкция запуска Союза');
 panel.innerHTML=
  '<div class="soyuz-launch-head"><div><span class="soyuz-launch-eyebrow">ЦИФРОВАЯ РЕКОНСТРУКЦИЯ</span><strong id="soyuzTitle">СОЮЗ · СТАРТ</strong></div><button id="soyuzClose" aria-label="Завершить реконструкцию" type="button">×</button></div>'+
  '<div class="soyuz-launch-telemetry"><strong id="soyuzClock">T−75.0 с</strong><span id="soyuzAltitude">ВЫСОТА · 0 м</span></div>'+
  '<div class="soyuz-launch-stage" id="soyuzStage">РАКЕТА НА СТАРТОВОМ СТОЛЕ</div>'+
  '<p class="soyuz-launch-detail" id="soyuzDetail"></p>'+
  '<input id="soyuzSeek" aria-label="Перейти к моменту реконструкции" type="range" min="-75" max="70" step="0.25" value="-75">'+
  '<div class="soyuz-launch-actions"><button id="soyuzPlay" type="button">ПАУЗА</button><button id="soyuzRestart" type="button">СНАЧАЛА</button>'+
  '<label>СКОРОСТЬ <select id="soyuzSpeed" aria-label="Скорость реконструкции"><option value="1">×1</option><option value="3">×3</option><option value="6" selected>×6</option></select></label></div>'+
  '<div class="soyuz-launch-actions"><button id="soyuzFollow" type="button" aria-pressed="true">СЛЕДИТЬ ЗА РАКЕТОЙ</button><button id="soyuzFree" type="button" aria-pressed="false">СВОБОДНАЯ КАМЕРА</button></div>'+
  '<small class="soyuz-launch-note">Музейная реконструкция: циклограмма и ранняя траектория показаны условно. Камерой можно управлять в любой момент.</small>';
 document.body.append(panel);return panel;
}
export function createSoyuzDualLaunch({camera,controls,padRoots,getEntry,onStart=()=>null,onStop=()=>{}}){
 const panel=ensurePanel(),byId=id=>panel.querySelector('#'+id);
 let active=false,paused=false,siteId=null,time=SOYUZ_START,speed=6,lastNow=null;
 let original=null,saved=null,restoreScene=null,kinematics=null,effects=null,entry=null;
 let hidden=[],follow=true,lastFollowPosition=null;
 function apply(){
  if(!active||!entry)return;
  const sample=sampleSoyuzLaunch(time);
  entry.holder.position.copy(original.position);
  entry.holder.position.y+=sample.altitudeMetres;
  entry.holder.visible=true;
  const root=kinematics?.group;
  if(root){
   for(const arm of kinematics.armRoots)arm.pivot.quaternion.setFromAxisAngle(arm.axis,-sample.supportOpen*.62);
   for(const mast of kinematics.umbilicals)mast.pivot.rotation.y=mast.side*sample.umbilicalRelease*.75;
   for(const mast of kinematics.service)mast.pivot.rotation.y=mast.side*sample.serviceRetraction*1.12;
  }
  effects?.render(sample);
  if(follow){
   entry.holder.updateWorldMatrix(true,false);
   const rocket=entry.holder.getWorldPosition(V());
   if(lastFollowPosition&&sample.airborne){
    const shift=rocket.clone().sub(lastFollowPosition);
    camera.position.add(shift);controls.target.add(shift);
   }
   lastFollowPosition=rocket;
  }
  byId('soyuzClock').textContent=clockString(time);
  byId('soyuzAltitude').textContent='ВЫСОТА · '+(sample.altitudeMetres>=1000?(sample.altitudeMetres/1000).toFixed(1)+' км':Math.round(sample.altitudeMetres)+' м');
  byId('soyuzStage').textContent=sample.event.title;
  byId('soyuzDetail').textContent=sample.event.detail;
  byId('soyuzSeek').value=String(time);
  byId('soyuzPlay').textContent=time>=SOYUZ_END?'ПОВТОРИТЬ':paused?'ПРОДОЛЖИТЬ':'ПАУЗА';
  byId('soyuzFollow').setAttribute('aria-pressed',String(follow));
  byId('soyuzFree').setAttribute('aria-pressed',String(!follow));
 }
 function stop({releaseCamera=false}={}){
  if(!active)return false;
  active=false;paused=false;lastNow=null;panel.hidden=true;
  document.body.classList.remove('soyuz-launch-active');
  for(const pair of hidden)pair[0].visible=pair[1];hidden=[];
  if(entry&&original){entry.holder.position.copy(original.position);entry.holder.rotation.copy(original.rotation);entry.holder.visible=original.visible;}
  cleanup(kinematics?.group);cleanup(effects?.local);cleanup(effects?.ground);
  kinematics=null;effects=null;
  restoreScene?.();restoreScene=null;
  if(saved){
   controls.enabled=saved.enabled;controls.enablePan=saved.pan;
   controls.minDistance=saved.minDistance;controls.maxDistance=saved.maxDistance;
   controls.enableDamping=false;controls.update();
   if(releaseCamera){camera.position.copy(saved.position);controls.target.copy(saved.target);controls.update();}
   controls.enableDamping=saved.damping;
  }
  siteId=null;entry=null;saved=null;original=null;lastFollowPosition=null;onStop();
  return true;
 }
 function start(id){
  if(!padRoots[id])return false;
  const source=getEntry(id);
  if(source?.status!=='ready'||!source.holder.children.length)return false;
  if(active)stop({releaseCamera:false});
  siteId=id;entry=source;original={position:entry.holder.position.clone(),rotation:entry.holder.rotation.clone(),visible:entry.holder.visible};
  saved={position:camera.position.clone(),target:controls.target.clone(),enabled:controls.enabled,pan:controls.enablePan,
   damping:controls.enableDamping,minDistance:controls.minDistance,maxDistance:controls.maxDistance};
  restoreScene=onStart(id)||null;
  // The scene is live during timeline playback; the user camera does not jump.
  active=true;paused=false;time=SOYUZ_START;speed=6;lastNow=null;follow=true;lastFollowPosition=null;
  panel.hidden=false;document.body.classList.add('soyuz-launch-active');
  byId('soyuzTitle').textContent=id==='pad-1'?'СОЮЗ · ГАГАРИНСКИЙ СТАРТ':'СОЮЗ · ПЛОЩАДКА №31';
  byId('soyuzSpeed').value='6';
  entry.holder.visible=true;
  kinematics=createKinematics(entry.holder,id);
  effects=createExhaust(entry.holder);
  const markers=id==='pad-1'
   ?new Set(['tulip-arm','tulip-inner-bracing','tulip-gripper','yellow-counterweight'])
   :new Set(['tulip-support-main','tulip-cross-brace','support-arm-gripper','support-arm-actuator','tulip-counterweight']);
  padRoots[id].traverse(object=>{
   if(markers.has(object.userData?.museumComponent)){hidden.push([object,object.visible]);object.visible=false;}
  });
  controls.enabled=true;
  controls.enableDamping=false;controls.update();
  camera.position.copy(saved.position);controls.target.copy(saved.target);controls.update();
  controls.enableDamping=saved.damping;
  apply();return true;
 }
 function pause(){if(!active)return false;paused=true;lastNow=null;apply();return true;}
 function play(){
  if(!active)return false;
  if(time>=SOYUZ_END){time=SOYUZ_START;speed=6;byId('soyuzSpeed').value='6';lastFollowPosition=null;}
  paused=false;lastNow=null;apply();return true;
 }
 function seek(value){
  if(!active)return false;
  time=clamp(Number(value)||0,SOYUZ_START,SOYUZ_END);pause();lastFollowPosition=null;return true;
 }
 function update(now){
  if(!active)return;
  if(lastNow===null){lastNow=now;return;}
  const delta=clamp((now-lastNow)/1000,0,.08);lastNow=now;
  if(paused||time>=SOYUZ_END)return;
  time=Math.min(SOYUZ_END,time+delta*speed);
  if(time>=0&&time-delta*speed<0&&speed===6){speed=1;byId('soyuzSpeed').value='1';}
  if(time===SOYUZ_END)paused=true;
  apply();
 }
 byId('soyuzClose').onclick=()=>stop();
 byId('soyuzPlay').onclick=()=>time>=SOYUZ_END?play():paused?play():pause();
 byId('soyuzRestart').onclick=()=>{if(active)start(siteId);};
 byId('soyuzSeek').oninput=e=>seek(e.target.value);
 byId('soyuzSpeed').onchange=e=>{speed=Number(e.target.value)||1;lastNow=null;};
 byId('soyuzFollow').onclick=()=>{follow=true;lastFollowPosition=entry?.holder.getWorldPosition(V())||null;apply();};
 byId('soyuzFree').onclick=()=>{follow=false;lastFollowPosition=null;apply();};
 document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'&&!/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName||'')){e.preventDefault();stop();}});
 document.addEventListener('visibilitychange',()=>{lastNow=null;});
 return {start,stop,pause,play,seek,update,isActive:()=>active,stats:()=>({version:SOYUZ_DUAL_LAUNCH_VERSION,active,paused,siteId,time,speed,follow,sourceReady:entry?.status==='ready',sample:sampleSoyuzLaunch(time),staticArmsHidden:hidden.length})};
}
