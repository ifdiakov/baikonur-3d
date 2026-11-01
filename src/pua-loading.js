import * as THREE from 'three';
import {getPuaInstallation,PUA_SPEC} from './pua-100.js?v=20261101-pua-v1';

export const PUA_PHASES=[
 [0,'Подготовка к подъёму','«Буран» на транспортной опоре. Траверса опускается к точкам крепления.'],
 [7,'Подъём корабля','Траверса движется по двум направляющим; грузовые связи удерживают корабль.'],
 [30,'Освобождение проезда','Транспортная опора выходит из зоны погрузки.'],
 [38,'Подвод «Мрии»','Тягач подводит самолёт под поднятый корабль. Портал остаётся перед крылом.'],
 [66,'Установка на самолёт','Корабль плавно опускается на транспортные крепления Ан-225.'],
 [86,'Освобождение траверсы','После установки грузовые связи отсоединяются, траверса поднимается.'],
 [96,'Вывод из агрегата','«Мрия» с «Бураном» откатывается на свободный участок перрона.'],
 [110,'Погрузка завершена','Можно повторить сцену или вернуться к макету.']
];
const smooth=(t,a,b)=>{const u=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
export function samplePuaLoading(seconds){
 const time=THREE.MathUtils.clamp(Number(seconds)||0,0,PUA_SPEC.duration);
 const lift=time<7?PUA_SPEC.lowLift:time<30?THREE.MathUtils.lerp(PUA_SPEC.lowLift,PUA_SPEC.highLift,smooth(time,7,30)):time<66?PUA_SPEC.highLift:THREE.MathUtils.lerp(PUA_SPEC.highLift,0,smooth(time,66,86));
 const aircraftZ=time<38?-72:time<96?THREE.MathUtils.lerp(-72,0,smooth(time,38,66)):-55*smooth(time,96,110);
 const frameLift=time<7?THREE.MathUtils.lerp(10,PUA_SPEC.lowLift,smooth(time,0,7)):time<86?lift:10*smooth(time,86,96);
 return {time,phase:PUA_PHASES.findLastIndex(p=>time>=p[0]),lift,frameLift,aircraftZ,orbiterZ:time>=96?aircraftZ:0,
  dollyX:-38*smooth(time,30,38),dollyVisible:true,tugVisible:time>=38,linksVisible:time>=7&&time<86};
}
export function createPuaLoading({airfield,camera,controls,onStart=()=>{}}){
 const installation=getPuaInstallation(airfield);if(!installation)throw Error('PUA-100 installation not found');
 const {root,aircraft}=installation;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./pua-loading.css?v=20261101-pua-v1',import.meta.url);document.head.append(style);
 const panel=document.createElement('section');panel.id='puaLoadingPanel';panel.hidden=true;panel.setAttribute('aria-label','Погрузка Бурана на Мрию');
 panel.innerHTML=`<div class="pua-heading"><div><span class="pua-overline">ЮБИЛЕЙНЫЙ · 1989</span><h2>ПУА-100</h2></div><button type="button" id="puaClose" aria-label="Завершить просмотр погрузки">×</button></div><div class="pua-phase-line"><span id="puaStep">01 / 07</span><h3 id="puaPhase"></h3></div><p id="puaCaption"></p><label class="pua-timeline"><span class="pua-time"><span>Ход погрузки</span><output id="puaTime">0:00 / 1:50</output></span><input id="puaSeek" type="range" min="0" max="110" step="0.1" value="0" aria-label="Ход погрузки в секундах"></label><div class="pua-playback"><button type="button" id="puaPlay">Пауза</button><button type="button" id="puaRestart">Сначала</button><label>Скорость <select id="puaSpeed" aria-label="Скорость погрузки"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div><div class="pua-views" role="group" aria-label="Ракурсы погрузки"><button data-pua-view="all">Общий вид</button><button data-pua-view="side">Сбоку</button><button data-pua-view="rigging">Траверса</button></div><p class="pua-note">Музейная реконструкция по архивным фото. Размеры агрегата оценены по пропорциям; движения и время условны.</p><a class="pua-source" href="https://www.buran.ru/htm/memory55.htm" target="_blank" rel="noopener noreferrer">А. Вовнянко · воспоминания конструктора ↗</a>`;
 document.body.append(panel);
 const $=id=>panel.querySelector('#'+id);
 let active=false,paused=false,elapsed=0,lastNow=null,speed=1,restoreScene=null,previousCamera=null,lastPhase=-1,viewId='all',current=samplePuaLoading(0);
 const clock=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
 function render(){
  current=samplePuaLoading(elapsed);installation.pose(current);aircraft.setPose(current);
  if(current.phase!==lastPhase){lastPhase=current.phase;const [,heading,caption]=PUA_PHASES[current.phase];$('puaPhase').textContent=heading;$('puaCaption').textContent=caption;$('puaStep').textContent=String(Math.min(7,current.phase+1)).padStart(2,'0')+' / 07';}
  $('puaSeek').value=elapsed;$('puaTime').textContent=clock(elapsed)+' / 1:50';$('puaPlay').textContent=elapsed>=110?'Повторить':paused?'Продолжить':'Пауза';
 }
 function view(id='all'){
  viewId=id;
  const frames={all:{min:[-48,0,-116],max:[48,48,54],axis:[1,.66,-1.2]},side:{min:[-46,0,-43],max:[46,48,54],axis:[1,.2,0]},rigging:{min:[-15,8,-15],max:[15,36,31],axis:[1,.4,-.7]}};
  if(id==='all')frames.all.min[2]=Math.min(-14,current.aircraftZ-42);
  const f=frames[id]||frames.all,mobile=innerWidth<=700;
  const box=new THREE.Box3(new THREE.Vector3(...f.min),new THREE.Vector3(...f.max)),center=box.getCenter(new THREE.Vector3());
  const axis=new THREE.Vector3(...f.axis).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),axis).normalize(),up=new THREE.Vector3().crossVectors(axis,right).normalize();
  const panelBox=panel.getBoundingClientRect(),fractionX=mobile?.92:Math.max(.4,(innerWidth-panelBox.width-48)/innerWidth),fractionY=mobile?Math.max(.35,(innerHeight-panelBox.height-40)/innerHeight):.9;
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),aspect=innerWidth/innerHeight;
  let distance=1;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
   const p=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,p.dot(axis)+Math.max(Math.abs(p.dot(right))/(tan*aspect*fractionX),Math.abs(p.dot(up))/(tan*fractionY)));
  }
  distance*=1.08;
  const shift=mobile?up.clone().multiplyScalar(-distance*tan*(1-fractionY)):right.clone().multiplyScalar(distance*tan*aspect*(1-fractionX));
  const target=center.add(shift),eye=target.clone().addScaledVector(axis,distance);
  controls.enableDamping=false;controls.update();controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));controls.enabled=true;controls.update();controls.enableDamping=previousCamera?.damping??true;camera.updateMatrixWorld(true);
  for(const button of panel.querySelectorAll('[data-pua-view]'))button.setAttribute('aria-pressed',String(button.dataset.puaView===id));
 }
 function start(){
  if(!['partial','ready'].includes(aircraft.state.status))return false;
  if(!active){restoreScene=onStart()||null;previousCamera={position:camera.position.clone(),target:controls.target.clone(),enabled:controls.enabled,damping:controls.enableDamping,mouse:{...controls.mouseButtons},touches:{...controls.touches},maxPolar:controls.maxPolarAngle};controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};controls.maxPolarAngle=Math.PI*.49;active=true;panel.hidden=false;document.body.classList.add('pua-loading-active');}
  elapsed=0;paused=false;lastNow=null;lastPhase=-1;render();view();return true;
 }
 function stop({releaseCamera=true}={}){
  if(!active)return;active=false;paused=false;lastNow=null;panel.hidden=true;document.body.classList.remove('pua-loading-active');installation.reset();
  if(releaseCamera&&previousCamera){controls.enableDamping=false;controls.update();camera.position.copy(previousCamera.position);controls.target.copy(previousCamera.target);controls.update();controls.enabled=previousCamera.enabled;controls.enableDamping=previousCamera.damping;}
  if(previousCamera){controls.mouseButtons={...previousCamera.mouse};controls.touches={...previousCamera.touches};controls.maxPolarAngle=previousCamera.maxPolar;}
  restoreScene?.();restoreScene=null;previousCamera=null;
 }
 const pause=()=>{paused=true;lastNow=null;render();},play=()=>{if(elapsed>=110)elapsed=0;paused=false;lastNow=null;render();};
 function seek(seconds){if(!active&&!start())return false;elapsed=THREE.MathUtils.clamp(Number(seconds)||0,0,110);pause();return true;}
 $('puaClose').onclick=()=>stop();$('puaPlay').onclick=()=>paused?play():pause();$('puaRestart').onclick=start;$('puaSeek').oninput=e=>seek(e.target.value);$('puaSpeed').onchange=e=>{speed=Number(e.target.value);lastNow=null;};
 for(const button of panel.querySelectorAll('[data-pua-view]'))button.onclick=()=>view(button.dataset.puaView);
 window.addEventListener('resize',()=>{if(active)view(viewId);});style.addEventListener('load',()=>{if(active)view(viewId);});
 document.addEventListener('keydown',e=>{if(!active||document.querySelector('#modelInspector[open]')||/input|select|textarea/i.test(e.target.tagName))return;if(e.key==='Escape'){e.preventDefault();stop();}if(e.code==='Space'){e.preventDefault();paused?play():pause();}});
 return {start,stop,pause,play,seek,view,isActive:()=>active,stats:()=>({active,paused,elapsed,speed,phase:current.phase,pose:{...current},model:{...installation.state},aircraftPose:{...aircraft.state.loadingPose},ready:['partial','ready'].includes(aircraft.state.status)}),
  update(now){const button=document.getElementById('puaLoadingStart');if(button){const ready=['partial','ready'].includes(aircraft.state.status);button.disabled=!ready;button.textContent=ready?'ПОГРУЗКА БУРАНА · ПУА-100':aircraft.state.status==='fallback'?'МОДЕЛЬ НЕДОСТУПНА':'ЗАГРУЗКА МОДЕЛИ…';}
   if(!active)return;if(lastNow!==null&&!paused&&!document.hidden)elapsed=Math.min(110,elapsed+Math.max(0,(now-lastNow)/1000)*speed);lastNow=now;if(elapsed>=110)paused=true;render();}
 };
}
