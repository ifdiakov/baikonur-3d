import * as THREE from 'three';
import {loadRocketSource} from './rocket-exhibits.js?v=20261102-site2-photo-v3';
import {createLossStructure,createHistoricalPayload,BURAN_LOSS_VERSION,BURAN_LOSS_DURATION,BURAN_LOSS_HISTORY,lossPhase} from './buran-loss-scene.js?v=20261110-v1';

export function createBuranLoss({root,model,camera,controls,onBeforeStart=()=>{},onStop=()=>{},loadSource=loadRocketSource}){
 if(!root||!model)throw new Error('МИК-112 ещё не готов');
 let active=false,playing=false,time=0,last=0,saved=null,structure=null,payload=null,dustTexture=null,loading=null,disposed=false,view='overview',generation=0;
 const panel=document.createElement('section');panel.id='buranLossPanel';panel.hidden=true;panel.setAttribute('aria-label','Гибель Бурана — историческая реконструкция');
 panel.innerHTML=`<header><div><span class="loss-eyebrow">МИК-112 · 12 МАЯ 2002</span><h2>Гибель Бурана</h2></div><button id="buranLossClose" type="button" aria-label="Закрыть реконструкцию">×</button></header>
 <div class="loss-phase"><b id="buranLossPhase"></b><span id="buranLossTime"></span></div>
 <p id="buranLossCaption"></p><label class="loss-scrubber">Ход реконструкции<input id="buranLossSeek" type="range" min="0" max="28" step="0.1" value="0" aria-label="Время анимации, секунды"></label>
 <div class="loss-buttons"><button id="buranLossPlay" type="button">Пауза</button><button id="buranLossRestart" type="button">Сначала</button><button id="buranLossOverview" type="button">Общий вид</button><button id="buranLossInside" type="button">Разрез</button><button id="buranLossTop" type="button">Сверху</button></div>
 <details><summary>Что подтверждено источником</summary><p>12 мая 2002 года обрушилась кровля трёх высоких пролётов МИК-112. Был утрачен летавший корабль «Буран» 1.01. Фотографии последствий на странице источника датированы 13 мая.</p><p>Это художественно-документальная реконструкция: последовательность движения отдельных ферм и длительность показаны условно. Причины аварии не моделируются. Вечерний свет — оформление музея, не время катастрофы.</p><a href="https://www.buran.ru/htm/foto7.htm" target="_blank" rel="noopener noreferrer">Фотоархив и материалы buran.ru ↗</a></details>`;
 document.body.append(panel);const $=id=>panel.querySelector('#'+id);
 function makeDust(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),image=ctx.createImageData(64,64);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5),i=(y*64+x)*4,w=Math.max(0,1-r);image.data[i]=image.data[i+1]=image.data[i+2]=255;image.data[i+3]=Math.round(w*w*(.82+.18*Math.sin(x*.63)*Math.cos(y*.47))*255);}ctx.putImageData(image,0,0);const t=new THREE.CanvasTexture(c);t.name='Собственная маска строительной пыли';return t;}
 function updateUI(){const phase=lossPhase(time);$('buranLossPhase').textContent=phase;$('buranLossTime').textContent=time.toFixed(1)+' / '+BURAN_LOSS_DURATION+' с';$('buranLossSeek').value=String(time);$('buranLossPlay').textContent=playing?'Пауза':time>=BURAN_LOSS_DURATION?'Повторить':'Продолжить';
  $('buranLossCaption').textContent=time<6?'Временное восстановление состояния до катастрофы. «Буран» показывается только внутри этой реконструкции.':time<14?'Кровля трёх высоких пролётов падает внутрь здания. Движение фрагментов — условная визуализация.':time<24?'Пыль постепенно оседает; под обломками остаются повреждённые корабль и макет ракеты.':'Катастрофа унесла жизни людей. Лётный «Буран» 1.01 был утрачен.';
  for(const [id,v]of [['buranLossOverview','overview'],['buranLossInside','inside'],['buranLossTop','top']])$(id).setAttribute('aria-pressed',String(view===v));
 }
 function apply(){structure?.seek(time);payload?.seek(time);updateUI();}
 function setView(next){if(!active)return false;view=['overview','inside','top'].includes(next)?next:'overview';structure.setCutaway(view==='inside');const target=new THREE.Vector3(-35,21,0),eye=view==='top'?new THREE.Vector3(-35,390,.01):view==='inside'?new THREE.Vector3(-185,240,-240):new THREE.Vector3(-300,245,-345);if(innerWidth<700)eye.sub(target).multiplyScalar(1.38).add(target);const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.target.copy(root.localToWorld(target));camera.position.copy(root.localToWorld(eye));controls.update();camera.updateMatrixWorld(true);controls.enableDamping=damping;updateUI();return true;}
 async function start(){
  if(disposed)throw new Error('Реконструкция закрыта');if(active){time=0;playing=true;last=performance.now();apply();return true;}if(loading)return loading;
  const token=++generation;loading=(async()=>{
   const pending=loadSource('energia-buran');window.__MUSEUM_STARTUP?.promote?.('rocket:energia-buran',120);const source=await pending;
   if(disposed||token!==generation)return false;
   onBeforeStart();
   const historyRoof=root.children.find(o=>o.name==='МИК · историческая кровля'),ruins=root.children.find(o=>o.name==='МИК · раскрытые разрушенные пролёты');
   if(!historyRoof||!ruins)throw new Error('Конструкция МИК-112 не найдена');
   saved={position:camera.position.clone(),target:controls.target.clone(),enabled:controls.enabled,damping:controls.enableDamping,min:controls.minDistance,max:controls.maxDistance,rootVisible:root.visible,groups:[historyRoof,ruins,model.transportersGroup].filter(Boolean).map(o=>({o,visible:o.visible}))};
   try{
    dustTexture=makeDust();structure=createLossStructure({dustTexture});payload=createHistoricalPayload(source.scene,model.rocketMounts().hall);
    root.add(structure.root,payload.root);saved.groups.forEach(({o})=>o.visible=false);root.visible=true;active=true;playing=true;time=0;last=performance.now();controls.enabled=true;controls.minDistance=4;panel.hidden=false;document.body.classList.add('buran-loss-active');setView('overview');apply();return true;
   }catch(error){stop();throw error;}
  })();try{return await loading;}finally{loading=null;}
 }
 function pause(){playing=false;updateUI();return time;}
 function resume(){if(!active)return false;if(time>=BURAN_LOSS_DURATION)time=0;playing=true;last=performance.now();apply();return true;}
 function seek(value){if(!active)return false;if(!Number.isFinite(value))throw new Error('Введите время числом');time=THREE.MathUtils.clamp(value,0,BURAN_LOSS_DURATION);playing=false;apply();return stats();}
 function update(now=performance.now()){if(!active||!playing)return;const dt=Math.min(.15,Math.max(0,(now-last)/1000));last=now;time=Math.min(BURAN_LOSS_DURATION,time+dt);if(time>=BURAN_LOSS_DURATION)playing=false;apply();}
 function stop({restoreCamera=true}={}){generation++;if(!active&&!saved)return false;playing=false;active=false;structure?.dispose();payload?.dispose();dustTexture?.dispose();structure=payload=dustTexture=null;
  if(saved){saved.groups.forEach(({o,visible})=>o.visible=visible);root.visible=saved.rootVisible;controls.enableDamping=false;if(restoreCamera){controls.target.copy(saved.target);camera.position.copy(saved.position);controls.update();camera.position.copy(saved.position);controls.target.copy(saved.target);camera.updateMatrixWorld(true);}controls.enableDamping=saved.damping;controls.enabled=saved.enabled;controls.minDistance=saved.min;controls.maxDistance=saved.max;}saved=null;panel.hidden=true;document.body.classList.remove('buran-loss-active');onStop();return true;
 }
 function stats(){return {version:BURAN_LOSS_VERSION,active,playing,time,duration:BURAN_LOSS_DURATION,view,history:BURAN_LOSS_HISTORY,structure:structure?.stats()||null,payload:payload?.stats()||null,temporaryOnly:true};}
 $('buranLossClose').onclick=()=>stop();$('buranLossPlay').onclick=()=>playing?pause():resume();$('buranLossRestart').onclick=()=>{seek(0);resume();};$('buranLossSeek').oninput=e=>seek(Number(e.target.value));
 for(const [id,v]of [['buranLossOverview','overview'],['buranLossInside','inside'],['buranLossTop','top']])$(id).onclick=()=>setView(v);
 const key=e=>{if(!active||e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.key==='Escape'){e.preventDefault();stop();}else if(e.code==='Space'){e.preventDefault();playing?pause():resume();}};document.addEventListener('keydown',key);
 function dispose(){stop();disposed=true;document.removeEventListener('keydown',key);panel.remove();}
 return {start,stop,pause,resume,seek,update,setView,isActive:()=>active,stats,dispose};
}
