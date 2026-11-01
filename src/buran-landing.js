import * as THREE from 'three';
import {buildLandingAircraft} from './buran-landing-aircraft.js?v=20261031-facilities-rails-lighting-v5';
import {createBuranLandingPath,BURAN_LANDING_TIMES,landingClock} from './buran-landing-path.js?v=20261031-facilities-rails-lighting-v5';
import {BURAN_LANDING_PARAMETERS as HISTORY,BURAN_LANDING_SOURCES as SOURCES,BURAN_LANDING_RECONSTRUCTION_NOTICE,BURAN_LANDING_DISCREPANCIES} from './buran-landing-history.js?v=20261031-facilities-rails-lighting-v5';
import {captureOrbitSettings,releaseFollowCamera,isCameraTextEntry} from './camera-navigation.js?v=20261101-museum-view-v1';

export const BURAN_LANDING_VERSION='buran-landing-event-v1';
const V=(x,y,z)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;

// Fit the actual 3D samples into an unobscured screen rectangle. The target is
// translated in the camera's right/up plane; the normal perspective projection
// and the airport/aircraft metre are unchanged. Every perspective half-plane
// supplies a lower bound on distance, so high descent points and both runway
// ends fit as well as the horizontal extent of the route.
export function fitBuranOverviewCamera({points,width,height,rect,fov=52,near=.1,padding=6}){
 if(!(width>0&&height>0&&rect.right>rect.left&&rect.bottom>rect.top&&points.length))throw new Error('Invalid Buran overview viewport');
 const vectors=points.map(p=>p.isVector3?p:V(...p)),centre=new THREE.Box3().setFromPoints(vectors).getCenter(V(0,0,0));
 const eyeAxis=V(0,1,.55).normalize(),right=V(1,0,0),up=V(0,0,0).crossVectors(eyeAxis,right);
 const tanV=Math.tan(fov*Math.PI/360),tanH=tanV*width/height;
 const left=2*rect.left/width-1,rightEdge=2*rect.right/width-1,bottom=1-2*rect.bottom/height,top=1-2*rect.top/height;
 let maxRight=-Infinity,minLeft=Infinity,maxTop=-Infinity,minBottom=Infinity,distance=80;
 for(const point of vectors)for(const dx of [-padding,padding])for(const dy of [-padding,padding])for(const dz of [-padding,padding]){
  const relative=point.clone().add(V(dx,dy,dz)).sub(centre),x=relative.dot(right),y=relative.dot(up),z=relative.dot(eyeAxis);
  distance=Math.max(distance,z+near+1);
  maxRight=Math.max(maxRight,x/tanH+rightEdge*z);minLeft=Math.min(minLeft,x/tanH+left*z);
  maxTop=Math.max(maxTop,y/tanV+top*z);minBottom=Math.min(minBottom,y/tanV+bottom*z);
 }
 distance=Math.max(distance,(maxRight-minLeft)/(rightEdge-left),(maxTop-minBottom)/(top-bottom))*1.025;
 // The midpoint of the feasible translation intervals centres the projected
 // envelope, including perspective depth; an axis-aligned world-box centre
 // alone leaves much of a portrait viewport unused.
 const target=centre.clone().addScaledVector(right,tanH*(maxRight+minLeft-(rightEdge+left)*distance)/2)
  .addScaledVector(up,tanV*(maxTop+minBottom-(top+bottom)*distance)/2);
 return {version:'buran-overview-fit-v1',position:target.clone().addScaledVector(eyeAxis,distance).toArray(),target:target.toArray(),
  distance,rect:{...rect},width,height,pointCount:vectors.length,padding};
}

const titles={manoeuvre:'Предпосадочный манёвр',escort:'Встреча с МиГ-25',final:'Заход на ВПП 24',flare:'Шасси и выравнивание',rollout:'Касание и пробег',parachutes:'Тормозные парашюты',stop:'Посадка завершена'};
const beforeFacts=[
 ['Два витка вокруг Земли','15 ноября 1988 года «Буран» возвращается из своего первого орбитального полёта. На борту нет экипажа.','chronology'],
 ['ВПП длиной 4,5 километра','Бетонная полоса «Юбилейного» — 4500 × 84 м. Посадочный комплекс строили для возвращения орбитального корабля.','pk'],
 ['Манёвр по данным «Вымпела»','Маршрут восстановлен по радиолокационным отметкам. Бортовая автоматика гасит избыток энергии и выводит корабль к полосе.','radar'],
 ['Почему «Юбилейный»','Название связано с 1977 годом — годом решения о создании комплекса и 60-летием Октябрьской революции.','pk'],
 ['Самолёт оптического наблюдения','МиГ-25 ЛЛ22 взлетел в 08:57. Пилот — Магомед Толбоев, оператор телекамеры — Сергей Жадовский.','escortPhoto'],
 ['Один самолёт в сопровождении','МиГ-25 №9210 был резервным. Ту-134БВ проверял посадочное оборудование до возвращения корабля.','eyewitness'],
 ['Встреча на высоте около 8,2 км','МиГ-25 сблизился с «Бураном» для телевизионного наблюдения. Полёт и посадку корабль выполнял самостоятельно.','flight'],
 ['Посадочная система «Вымпел»','Радиомаяки передавали навигационные измерения. Коррекцию траектории выполняли компьютеры на борту «Бурана».','landingSystem'],
 ['Ромбы на бетоне','Белые ромбы в 1000 м от обоих торцов отмечают расчётные точки касания орбитального корабля.','pk'],
 ['Крутая посадочная глиссада','К полосе «Буран» снижался значительно круче пассажирского самолёта. Перед землёй автоматика выполнила выравнивание.','flight'],
 ['Погода в день посадки','Низкая облачность и сильный ветер сопровождали возвращение. В реконструкции сохранён пасмурный свет.','flight']
];

function injectStyle(){
 if(document.getElementById('buranLandingStyle'))return;
 const style=document.createElement('style');style.id='buranLandingStyle';style.textContent=`
 body.buran-landing-active #arrivalPanel,body.buran-landing-active #timeDock,body.buran-landing-active #hero{display:none!important}
 body.following-buran #labelLayer{display:none!important}
 #buranLandingStart{display:block;width:100%;margin:12px 0 4px;padding:13px 16px;border:1px solid #d7a267;border-radius:9px;background:linear-gradient(135deg,#765038,#443c35);color:#fff1d8;font:700 13px Arial;letter-spacing:.07em;cursor:pointer}
 #buranLandingStart[hidden]{display:none!important}#buranLandingStart:hover{filter:brightness(1.15)}
 #buranLandingPanel{position:fixed;z-index:75;left:50%;bottom:18px;transform:translateX(-50%);width:min(620px,calc(100vw - 32px));box-sizing:border-box;padding:17px 20px 14px;border:1px solid #d0b28a66;border-radius:14px;background:linear-gradient(150deg,#132731f5,#182229f7);color:#eef0ed;box-shadow:0 10px 40px #0006;backdrop-filter:blur(16px);font-family:Arial,sans-serif;max-height:calc(100dvh - 100px);overflow:auto}
 #buranLandingPanel[hidden]{display:none!important}.buran-event-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;letter-spacing:.08em;color:#c6c5b9}.buran-event-date{color:#e7bc80;font-weight:700}.buran-event-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:9px 0 7px}.buran-event-head h2{font-size:19px;margin:0;font-weight:600}.buran-event-clock{font:500 18px monospace;color:#e9d0a8;white-space:nowrap}.buran-event-fact{min-height:66px;border-left:2px solid #c49966;padding-left:11px}.buran-event-fact h3{font-size:13px;margin:0 0 5px;color:#f1dfc4}.buran-event-fact p{font-size:12px;line-height:1.5;margin:0;color:#d2dce0}.buran-event-source{display:inline-block;margin-top:5px;font-size:10px;color:#b6c9cf;text-decoration:underline;text-underline-offset:3px}
 #buranLandingProgress{width:100%;accent-color:#dab27c;margin:11px 0 5px}.buran-event-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.buran-event-controls button,.buran-event-controls select{border:1px solid #95acb45c;border-radius:7px;padding:7px 9px;background:#2b424d;color:#eef1f2;font:600 11px Arial;cursor:pointer}.buran-event-controls button[aria-pressed=true]{border-color:#e0b77e;color:#f7dbb7;background:#614e3d}.buran-event-controls button:last-child{margin-left:auto}.buran-event-note{margin-top:9px;color:#b0bdc3;font-size:10px;line-height:1.5}.buran-event-note summary{cursor:pointer;display:list-item}.buran-event-note p{margin:8px 0}.buran-event-note a{color:#cadadf}.buran-event-note ul{padding-left:17px}.buran-event-note li{margin:6px 0}
 #buranCallsign{position:fixed;z-index:40;pointer-events:none;padding:4px 7px;border:1px solid #e6c18b88;border-radius:5px;background:#182c36c9;color:#f5e3c5;font:700 10px Arial;letter-spacing:.05em;transform:translate(-50%,-100%)}
 @media(max-width:650px){#buranLandingPanel{bottom:max(10px,env(safe-area-inset-bottom));width:calc(100vw - 20px);padding:13px 14px 11px}.buran-event-head h2{font-size:16px}.buran-event-clock{font-size:15px}.buran-event-top{font-size:9px}.buran-event-fact{min-height:76px}.buran-event-controls button,.buran-event-controls select{padding:8px}.buran-event-note{font-size:10px}}
 `;document.head.append(style);
}

export function createBuranLanding({scene,camera,controls,airfield,getSourceBuran,getNavigationBounds,onStart,onStop}){
 injectStyle();
 const panel=document.createElement('section');panel.id='buranLandingPanel';panel.hidden=true;panel.setAttribute('aria-label','Посадка Бурана 15 ноября 1988 года');
 panel.innerHTML=`<div class="buran-event-top"><span class="buran-event-date">15 НОЯБРЯ 1988 · ЮБИЛЕЙНЫЙ</span><span>АРХИВНАЯ РЕКОНСТРУКЦИЯ</span></div>
 <div class="buran-event-head"><h2 id="buranLandingPhase"></h2><time id="buranLandingClock" class="buran-event-clock" aria-live="off"></time></div>
 <div class="buran-event-fact" role="status" aria-live="polite" aria-atomic="true"><h3 id="buranFactTitle"></h3><p id="buranFactText"></p></div><a id="buranFactSource" class="buran-event-source" target="_blank" rel="noopener noreferrer">Источник в архиве ↗</a>
 <input id="buranLandingProgress" type="range" min="0" max="${BURAN_LANDING_TIMES.end}" step="0.1" value="0" aria-label="Время посадки Бурана">
 <div class="buran-event-controls"><button id="buranLandingPause" type="button">Пауза</button><select id="buranLandingSpeed" aria-label="Скорость воспроизведения"><option value="1">×1</option><option value="3" selected>×3</option><option value="6">×6</option></select><button id="buranLandingFollow" type="button" aria-pressed="true">Корабль</button><button id="buranLandingOverview" type="button">Весь манёвр</button><button id="buranLandingReplay" type="button" aria-label="Повторить посадку">↺</button><button id="buranLandingClose" type="button">Закрыть</button></div>
 <details class="buran-event-note"><summary>Московское время · масштаб макета · источники</summary><p id="buranReconstructionNotice"></p><div id="buranSources"></div></details>`;
 document.body.append(panel);
 const $=id=>panel.querySelector('#'+id),callSign=document.createElement('span');callSign.id='buranCallsign';callSign.hidden=true;callSign.textContent='БУРАН · 1.01';document.body.append(callSign);
 $('buranReconstructionNotice').textContent=BURAN_LANDING_RECONSTRUCTION_NOTICE;
 const sourceList=document.createElement('ul');
 for(const id of ['pk','radar','chronology','eyewitness','algorithms']){const li=document.createElement('li'),a=document.createElement('a');a.href=SOURCES[id].url;a.textContent=SOURCES[id].title;a.target='_blank';a.rel='noopener noreferrer';li.append(a);sourceList.append(li);}
 $('buranSources').append(sourceList);
 const precision=document.createElement('p');precision.textContent='Касание — 09:24:42, остановка — 09:25:24. Дальний маршрут вписан в макет; ВПП, корабль и пробег сохраняют единый масштаб. Точка касания, позы и траектория сопровождения восстановлены. Разные редакции архива расходятся в длине пробега, боковом отклонении и времени выпуска парашютов.';$('buranSources').append(precision);
 let actors=null,path=null,active=false,following=false,paused=false,elapsed=0,speed=3,lastNow=null,savedControls=null,lastTarget=V(0,0,0),restoreScene=null,guide=null,mode='craft',state=null,lastFact='',lastRelease=null;
 let overviewControls=null,overviewFit=null;const labelPoint=V(0,0,0);
 const modelRoot=new THREE.Group();modelRoot.name='15.11.1988 · посадка «Бурана»';modelRoot.visible=false;modelRoot.userData.pickable=false;scene.add(modelRoot);
 function ensureModels(){
  if(actors)return;
  const sourceBuran=getSourceBuran();if(!sourceBuran)throw new Error('Модель «Бурана» ещё загружается. Попробуйте ещё раз.');
  actors=buildLandingAircraft({sourceBuran});path=createBuranLandingPath({airfield,bounds:getNavigationBounds?.()});
  for(const model of [actors.buran,actors.mig]){model.scale.setScalar(path.metre);model.traverse(o=>{o.userData.pickable=false;});modelRoot.add(model);}
  const geometry=new THREE.BufferGeometry().setFromPoints(path.points),material=new THREE.LineBasicMaterial({color:0x075b68,transparent:true,opacity:.95,depthWrite:false,depthTest:false,fog:false,toneMapped:false});
  guide=new THREE.Line(geometry,material);guide.name='Восстановленная предпосадочная траектория';guide.userData.pickable=false;guide.visible=false;guide.renderOrder=40;modelRoot.add(guide);
 }
 function pose(model,position,heading,pitch,bank=0){
  model.quaternion.setFromAxisAngle(V(0,1,0),Math.atan2(heading.x,heading.z));
  model.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-pitch*Math.PI/180)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0,0,1),bank*Math.PI/180));
  model.position.copy(position);
 }
 function factFor(s){
  if(s.elapsed>=BURAN_LANDING_TIMES.stop+9)return ['Самолёт сопровождения завершает работу','После виража над кораблём МиГ-25 уходит на аэродром Крайний. По архивному описанию, он приземлился там в 09:35.','flight'];
  if(s.elapsed>=BURAN_LANDING_TIMES.stop)return ['42 секунды пробега','09:25:24 — корабль остановился. В циклограмме указан пробег 1620 м. Первый орбитальный полёт завершён.','chronology'];
  if(s.elapsed>=BURAN_LANDING_TIMES.noseWheel)return ['Носовое колесо на полосе','«Буран» завершает пробег на трёх стойках. Бортовая автоматика удерживает направление и управляет торможением.','flightText'];
  if(s.elapsed>=BURAN_LANDING_TIMES.parachutes)return ['Три тормозных купола','Парашютная система раскрылась с задержкой: мягкое касание не сразу дало необходимое обжатие основных стоек.','flightText'];
  if(s.onGround)return ['09:24:42 · касание','Автоматическая посадка без экипажа. После касания основных колёс нос остаётся приподнят; начинается пробег.','report'];
  if(s.phase==='flare')return ['Выравнивание над полосой','Шасси выпущены, снижение плавно прекращается. Затем полосу касаются основные колёса; носовая стойка опускается позже.','flight'];
  if(s.elapsed>path.joinTime-2&&s.elapsed<path.joinTime+24)return beforeFacts[6];
  return beforeFacts[Math.floor(s.elapsed/27)%beforeFacts.length];
 }
 function render(){
  if(!actors||!active)return;state=path.sample(elapsed);
  pose(actors.buran,state.position,state.heading,state.pitchDeg,state.bankDeg);
  const contact=V(...actors.mainContact).multiplyScalar(path.metre).applyQuaternion(actors.buran.quaternion);actors.buran.position.sub(contact);
  pose(actors.mig,state.mig.position,state.mig.heading,state.mig.pitchDeg,state.mig.bankDeg);actors.mig.visible=state.mig.visible;
  actors.update({gear:state.gear,pitchDeg:state.pitchDeg,chute:state.chute,airbrake:state.airbrake,time:elapsed});
  if(state.gear>.999){
   const mains=actors.worldGearContacts().filter(contact=>contact.id.startsWith('main-'));
   const tyreBottom=Math.min(...mains.map(contact=>contact.minimumY));
   actors.buran.position.y+=state.position.y-tyreBottom;
  }
  if(following){camera.position.add(actors.buran.position.clone().sub(lastTarget));controls.target.copy(actors.buran.position);lastTarget.copy(actors.buran.position);controls.update();}
  modelRoot.updateWorldMatrix(true,true);camera.updateMatrixWorld(true);
  syncOverlay();
  const clock=landingClock(elapsed);$('buranLandingClock').textContent=clock+' МСК';$('buranLandingClock').dateTime='1988-11-15T'+clock+'+03:00';
  $('buranLandingPhase').textContent=titles[state.phase];$('buranLandingProgress').value=String(elapsed);$('buranLandingProgress').setAttribute('aria-valuetext',clock+', '+titles[state.phase]);
  const fact=factFor(state),key=fact.join('|');if(key!==lastFact){lastFact=key;$('buranFactTitle').textContent=fact[0];$('buranFactText').textContent=fact[1];$('buranFactSource').href=SOURCES[fact[2]].url;}
  panel.dataset.phase=state.phase;panel.dataset.clock=clock;panel.dataset.playing=String(!paused);
 }
 function syncOverlay(){
  if(!active||!actors){callSign.hidden=true;return;}
  if(mode==='overview'&&overviewControls){
   const rect=overviewRectangle();
   if(!overviewFit||overviewFit.width!==innerWidth||overviewFit.height!==innerHeight||
    Object.keys(rect).some(key=>Math.abs(rect[key]-overviewFit.rect[key])>.25))applyOverviewFit(rect);
  }
  camera.updateMatrixWorld(true);actors.buran.getWorldPosition(labelPoint);labelPoint.project(camera);
  callSign.hidden=labelPoint.z<=-1||labelPoint.z>=1||Math.abs(labelPoint.x)>1||Math.abs(labelPoint.y)>1;
  if(!callSign.hidden){callSign.style.left=(labelPoint.x*.5+.5)*innerWidth+'px';callSign.style.top=(-labelPoint.y*.5+.5)*innerHeight-16+'px';}
 }
 function leaveOverview({releaseCamera=false}={}){
  if(!overviewControls)return;
  if(releaseCamera)lastRelease=releaseFollowCamera({camera,controls,savedControls:overviewControls,bounds:getNavigationBounds?.()});
  else Object.assign(controls,overviewControls);
  overviewControls=null;guide.visible=false;
 }
 function setFollowing(value,{releaseCamera=true}={}){
  if(!active)return;
  if(value===following){
   if(!value&&mode==='overview'){leaveOverview({releaseCamera});mode='free';}
   return;
  }
  if(!value){
   if(savedControls){if(releaseCamera)lastRelease=releaseFollowCamera({camera,controls,savedControls,bounds:getNavigationBounds?.()});else Object.assign(controls,savedControls);}
   following=false;document.body.classList.remove('following-buran');$('buranLandingFollow').setAttribute('aria-pressed','false');$('buranLandingFollow').textContent='Корабль';mode='free';return;
  }
  leaveOverview();savedControls=captureOrbitSettings(controls);following=true;mode='craft';guide.visible=false;
  Object.assign(controls,{minDistance:6,maxDistance:240,minPolarAngle:.06,maxPolarAngle:Math.PI/3,enablePan:false,mouseButtons:{LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE},touches:{ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE}});
  lastTarget.copy(actors.buran.position);controls.target.copy(lastTarget);
  const forward=state?.heading||path.northEnd.clone().negate(),right=new THREE.Vector3().crossVectors(V(0,1,0),forward),offset=right.multiplyScalar(20).addScaledVector(forward,-32).add(V(0,27,0));
  camera.position.copy(lastTarget).add(offset.multiplyScalar(camera.aspect<.8?1.45:1));controls.update();
  document.body.classList.add('following-buran');$('buranLandingFollow').setAttribute('aria-pressed','true');$('buranLandingFollow').textContent='Свободно';
 }
 function runwayPoints(){
  const spec=airfield.userData.airport;
  return [-1,1].flatMap(end=>[-1,1].map(side=>airfield.localToWorld(V(side*spec.width/2,spec.runwayY,end*spec.length/2))));
 }
 function overviewRectangle(){
  const panelRect=panel.getBoundingClientRect(),ui=document.getElementById('ui')?.getBoundingClientRect();
  let left=18,right=innerWidth-18,top=18,bottom=Math.min(innerHeight-18,panelRect.top-18);
  if(ui?.width>0&&ui.height>0){
   if(ui.width>innerWidth*.65)top=Math.max(top,ui.bottom+18);
   else if(ui.left<innerWidth/2)left=Math.max(left,ui.right+18);
   else right=Math.min(right,ui.left-18);
  }
  // Leave room for the short callsign above either end of the path. The panel's
  // expanded source list can cover most of a short screen; retain a finite
  // camera in that reading state, then fit the normal layout when it closes.
  left+=32;right-=32;top+=24;
  if(right-left<96){left=18;right=innerWidth-18;}
  if(bottom-top<96){top=18;bottom=Math.max(114,panelRect.top-18);}
  return {left,right,top,bottom};
 }
 function applyOverviewFit(rect=overviewRectangle()){
  overviewFit=fitBuranOverviewCamera({points:[...path.points,...runwayPoints()],width:innerWidth,height:innerHeight,rect,fov:camera.fov,near:camera.near});
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
  controls.maxDistance=Math.max(overviewControls.maxDistance,overviewFit.distance*1.12);
  controls.target.fromArray(overviewFit.target);camera.position.fromArray(overviewFit.position);controls.update();controls.enableDamping=damping;
 }
 function overview(){
  if(!active)return;if(following)setFollowing(false,{releaseCamera:false});
  overviewControls??=captureOrbitSettings(controls);mode='overview';guide.visible=true;applyOverviewFit();render();
 }
 function start(){
  try{ensureModels();}catch(error){console.error('BURAN_LANDING_START',error);return false;}
  if(active){elapsed=0;paused=false;lastNow=null;$('buranLandingPause').textContent='Пауза';render();if(!following)setFollowing(true);return true;}
  restoreScene=onStart?.()||null;active=true;elapsed=0;paused=false;lastNow=null;lastFact='';modelRoot.visible=true;panel.hidden=false;document.body.classList.add('buran-landing-active');
  $('buranLandingPause').textContent='Пауза';render();setFollowing(true);return true;
 }
 function stop({releaseCamera=true}={}){
  if(!active)return;setFollowing(false,{releaseCamera});active=false;lastNow=null;modelRoot.visible=false;panel.hidden=true;callSign.hidden=true;document.body.classList.remove('buran-landing-active','following-buran');
  restoreScene?.();restoreScene=null;onStop?.();
 }
 $('buranLandingPause').onclick=()=>{if(elapsed>=BURAN_LANDING_TIMES.end){start();return;}paused=!paused;lastNow=null;$('buranLandingPause').textContent=paused?'Продолжить':'Пауза';};
 $('buranLandingSpeed').onchange=e=>{speed=Number(e.target.value);};
 $('buranLandingFollow').onclick=()=>{setFollowing(!following);render();};
 $('buranLandingOverview').onclick=overview;$('buranLandingReplay').onclick=start;$('buranLandingClose').onclick=()=>stop();
 $('buranLandingProgress').oninput=e=>{elapsed=Number(e.target.value);lastNow=null;render();};
 document.addEventListener('keydown',e=>{
  if(!active||isCameraTextEntry(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;
  const key=e.key.toLowerCase();if(key==='escape'){stop();return;}
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key))setFollowing(false);
 });
 // End the event before a different map action runs, so its camera pose and
 // history/light choice cannot be overwritten by a delayed follow update.
 const leaveForOtherAction=e=>{if(active&&e.target.closest('button,a,input,select,summary')&&!e.target.closest('#buranLandingPanel,#buranLandingStart,#modelInspector'))stop({releaseCamera:false});};
 document.addEventListener('pointerdown',leaveForOtherAction,{capture:true});
 document.addEventListener('click',leaveForOtherAction,{capture:true});
 document.addEventListener('visibilitychange',()=>{lastNow=null;});
 return {start,stop,setFollowing,overview,syncOverlay,isOverviewActive:()=>active&&mode==='overview',
  overviewState(){
   if(!guide||!path)return null;
   const attribute=guide.geometry.getAttribute('position');guide.updateWorldMatrix(true,false);
   return {active:active&&mode==='overview',fit:overviewFit,guide:{visible:modelRoot.visible&&guide.visible,color:'#'+guide.material.color.getHexString(),opacity:guide.material.opacity,
    depthTest:guide.material.depthTest,fog:guide.material.fog,renderOrder:guide.renderOrder},
    points:Array.from({length:attribute.count},(_,i)=>V(0,0,0).fromBufferAttribute(attribute,i).applyMatrix4(guide.matrixWorld).toArray()),runwayPoints:runwayPoints().map(p=>p.toArray())};
  },
  seek(seconds){if(!active&&!start())return;elapsed=clamp(Number(seconds)||0,0,BURAN_LANDING_TIMES.end);paused=true;lastNow=null;$('buranLandingPause').textContent='Продолжить';render();},
  play(){paused=false;lastNow=null;$('buranLandingPause').textContent='Пауза';},pause(){paused=true;lastNow=null;$('buranLandingPause').textContent='Продолжить';},
  update(now){if(!active)return;if(lastNow!==null&&!paused&&!document.hidden)elapsed=Math.min(BURAN_LANDING_TIMES.end,elapsed+Math.max(0,(now-lastNow)/1000)*speed);lastNow=now;if(elapsed>=BURAN_LANDING_TIMES.end){paused=true;$('buranLandingPause').textContent='Сначала';}render();},
  stats(){
   const wheel=p=>actors?.buran.localToWorld(V(...p)).toArray();
   return {version:BURAN_LANDING_VERSION,active,following,paused,mode,elapsed,speed,lastRelease,clock:landingClock(elapsed),phase:state?.phase,
    path:path?.stats(),aircraft:actors?.stats(),times:BURAN_LANDING_TIMES,
    position:actors?.buran.position.toArray(),mainWheel:actors?wheel(actors.mainContact):null,noseWheel:actors?wheel(actors.noseContact):null,actualGearContacts:actors?.worldGearContacts(),
    state:state?{position:state.position.toArray(),heading:state.heading.toArray(),sourcePose:state.sourcePose,pitchDeg:state.pitchDeg,bankDeg:state.bankDeg,gear:state.gear,chute:state.chute,onGround:state.onGround}:null,
    escort:state?{count:1,visible:actors.mig.visible,position:actors.mig.position.toArray(),type:HISTORY.escort.type,crew:[HISTORY.escort.pilot,HISTORY.escort.cameraOperator]}:null,
    sources:SOURCES,sourceDiscrepancies:BURAN_LANDING_DISCREPANCIES.length,notice:BURAN_LANDING_RECONSTRUCTION_NOTICE};
  }
 };
}
