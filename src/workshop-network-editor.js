import * as THREE from 'three';
import {RAIL_PROFILE} from './rail-profile.js';
import {NETWORK_VERSION,xyz,dist,visibleNetwork,createNetworkIndex,deleteBranch,validateRailEdits,pathLength} from './workshop-network-core.js';
import {createRailEditor,smoothRail} from './workshop-rail-editor.js';
import {validateRoadEdits} from './road-editor-core.js';

export function installNetworkEditor({scene,camera,controls,canvas,roadEditor,transport,terrainHeightAt,panel,initialRails,checkpoint,save,onUndo,onRedo}){
 const sourceRoads=transport.editableRoadPaths().map(r=>({...r,id:String(r.id),points:r.points.map(xyz)}));
 const sourceRails=transport.terrainPaths().rails.filter(r=>r.points?.length>1).map((r,i)=>({...r,id:'rail-source-'+(r.sourceWayId??i)+'-'+i,width:r.width||RAIL_PROFILE.ballastWidth,points:r.points.map(xyz)}));
 const rails=createRailEditor({scene,base:sourceRails});rails.replace(initialRails);
 let mode=null,kind='road',draft=[],selection=null,index=null,indexSignature='',down=null,sequence=0,busy=false;
 const ids=prefix=>prefix+'-'+Date.now().toString(36)+'-'+(++sequence).toString(36);
 const tools=document.createElement('section');tools.id='wsNetworkTools';tools.innerHTML=`<h3>Автодороги и железная дорога</h3><div class="network-tools"><button id="wsAddAD" data-network="road:draw">＋ Проложить АД</button><button id="wsDeleteAD" data-network="road:erase">− Удалить АД</button><button id="wsAddRail" data-network="rail:draw">＋ Проложить ЖД</button><button id="wsDeleteRail" data-network="rail:erase">− Удалить ЖД</button></div><p class="hint">Удаление — от развилки до следующей развилки или тупика. Перед удалением ветка подсвечивается. Основной ход сохраняется.</p>`;
 panel.querySelector('h2').after(tools);
 const dock=document.createElement('section');dock.id='networkEditorDock';dock.hidden=true;dock.setAttribute('aria-label','Редактор АД и ЖД');
 dock.innerHTML=`<header><b id="networkTitle"></b><button id="networkExit" aria-label="Выйти из редактирования">×</button></header><div id="networkOptions"><label id="networkWidthLabel">Ширина АД<input id="networkWidth" type="number" value="3" min="1.5" max="18" step=".1"></label><label id="networkSurfaceLabel">Покрытие<select id="networkSurface"><option value="asphalt">Асфальт</option><option value="ground">Грунт</option></select></label><span id="networkGauge" hidden>Колея 1520 мм · балласт, шпалы и рельсы</span><label><input id="networkSnap" type="checkbox" checked> Привязка к сети</label></div><p id="networkHelp"></p><p id="networkStatus" role="status" aria-live="polite"></p><div class="network-actions"><button id="networkFinish">Завершить</button><button id="networkDelete" disabled>Удалить выделенную ветку</button><button id="networkCancel">Сбросить выбор</button><button id="networkUndo">↶ Отменить</button><button id="networkRedo">↷ Повторить</button><button id="networkDone">Готово</button></div>`;
 document.body.append(dock);const $=id=>document.getElementById(id),tell=t=>$('networkStatus').textContent=t;
 const preview=new THREE.Group();preview.name='Мастерская · предпросмотр сети';preview.userData.workshopOnly=true;scene.add(preview);
 const lineMaterial=new THREE.LineBasicMaterial({color:0xffbf6a,depthTest:false,transparent:true,depthWrite:false}),eraseMaterial=new THREE.LineBasicMaterial({color:0xff6259,depthTest:false,transparent:true,depthWrite:false}),dotMaterial=new THREE.MeshBasicMaterial({color:0xffd18b,depthTest:false,transparent:true,depthWrite:false}),dotGeometry=new THREE.SphereGeometry(.32,8,6);
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
 function current(){return kind==='road'?roadEditor.snapshot():rails.snapshot();}
 function renderedEdits(){const s=current();if(kind==='road')s.added=s.added.map(r=>({...r,points:roadEditor.path(r.id)?.points??r.points}));return s;}
 function network(){const state=renderedEdits(),sig=kind+JSON.stringify(state);if(sig!==indexSignature){indexSignature=sig;index=createNetworkIndex(visibleNetwork(kind==='road'?sourceRoads:sourceRails,state,kind),{tolerance:kind==='road'?.18:.055,gradeTolerance:.4});}return index;}
 function clearPreview(){for(const c of [...preview.children]){preview.remove(c);if(c.geometry!==dotGeometry)c.geometry?.dispose();}}
 function paint(){
  clearPreview();const paths=mode==='erase'?selection?.sections.map(s=>s.points)||[]:draft.length?[draft]:[];
  for(const pts of paths){if(pts.length>1){const g=new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(p[0],p[1]+.18,p[2]))),line=new THREE.Line(g,mode==='erase'?eraseMaterial:lineMaterial);line.renderOrder=300;line.frustumCulled=false;preview.add(line);}
   for(const p of mode==='erase'?[pts[0],pts.at(-1)]:pts){const dot=new THREE.Mesh(dotGeometry,dotMaterial);dot.position.set(p[0],p[1]+.2,p[2]);const scale=Math.max(.5,Math.min(4,camera.position.distanceTo(dot.position)/140));dot.scale.setScalar(scale);dot.renderOrder=301;preview.add(dot);}}
  $('networkFinish').disabled=busy||draft.length<2;$('networkDelete').disabled=busy||!selection;
 }
 function setMode(value){
  if(busy)return false;
  const parts=value?.split(':');mode=parts?.[1]||null;kind=parts?.[0]||kind;draft=[];selection=null;indexSignature='';
  dock.hidden=!mode;document.body.classList.toggle('network-editing',!!mode);canvas.style.cursor=mode?'crosshair':'';
  roadEditor.setActive(false);for(const b of tools.querySelectorAll('[data-network]'))b.setAttribute('aria-pressed',String(b.dataset.network===value));
  if(mode){window.__BAIKONUR_QA?.arrival.stopFollowing();window.__BAIKONUR_QA?.traffic.stopFollowing();document.getElementById('info').style.display='none';
   $('networkTitle').textContent=(kind==='road'?'Автодорога':'Железная дорога')+' · '+(mode==='draw'?'проложить':'удалить ветку');
   $('networkWidthLabel').hidden=$('networkSurfaceLabel').hidden=kind==='rail'||mode==='erase';$('networkGauge').hidden=kind!=='rail';
   $('networkFinish').hidden=mode!=='draw';$('networkDelete').hidden=mode!=='erase';
   $('networkHelp').textContent=mode==='draw'?'Ставьте точки на земле. Enter — завершить, Backspace — убрать последнюю точку. Перетаскивание мышью двигает карту.':'Щёлкните по ветке. Красная линия показывает участок до развилок. Подтвердите удаление кнопкой; Esc отменяет выбор.';
   tell('Правки сохраняются в черновике этого браузера.');rails.attach();
  }paint();return !!mode;
 }
 function worldPoint(e){
  const b=canvas.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);camera.updateMatrixWorld();ray.setFromCamera(pointer,camera);
  plane.constant=-terrainHeightAt(controls.target.x,controls.target.z);if(!ray.ray.intersectPlane(plane,hit))return null;
  for(let i=0;i<6;i++){plane.constant=-terrainHeightAt(hit.x,hit.z);if(!ray.ray.intersectPlane(plane,hit))return null;}return hit.toArray();
 }
 function addPoint(p){
  if(draft.length>=150)throw Error('Не более 150 опорных точек.');
  let next=xyz(p);const near=$('networkSnap').checked?network().nearest(next,kind==='rail'?1.2:4):null;
  if(near)next=[...near.point];else next[1]=terrainHeightAt(next[0],next[2])+.05;
  if(draft.length&&dist(draft.at(-1),next)<.25)throw Error('Точка слишком близко к предыдущей.');draft.push(next);paint();tell(`Точек: ${draft.length}. ${near?'Привязано к существующему пути.':'Enter — завершить.'}`);return next;
 }
 function prepareDelete(p){selection=network().branch(p,kind==='rail'?2.5:6);paint();tell(selection?`Выделено: ${selection.sections.length} участк. · длина ${selection.length.toFixed(1)} ед. · до ${selection.ends.some(e=>e.junction)?'развилки':'конца пути'}. Основной ход не удаляется.`:'Путь не найден. Приблизьте карту и нажмите на нужную ветку.');return selection;}
 async function commit(action){if(busy)return;busy=true;paint();try{await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));action();indexSignature='';draft=[];selection=null;save();tell('Сохранено в черновике. Отмена и повтор доступны.');}catch(e){tell('Не сохранено: '+e.message);throw e;}finally{busy=false;paint();}}
 async function finish(){if(draft.length<2)throw Error('Нужно минимум две точки.');
  const state=current(),id=ids(kind==='road'?'net-ad':'net-rail');
  const points=kind==='rail'?smoothRail(draft,terrainHeightAt):draft.map(xyz);
  if(pathLength(points)<1)throw Error('Слишком короткий участок.');
  const width=kind==='rail'?RAIL_PROFILE.ballastWidth:Number($('networkWidth').value);
  state.added.push({id,width,...(kind==='road'?{surface:$('networkSurface').value}:{}),points});
  const valid=kind==='road'?validateRoadEdits(state):validateRailEdits(state);
  await commit(()=>{checkpoint();kind==='road'?roadEditor.replaceSnapshot(valid):rails.replace(valid);});return id;
 }
 async function remove(){if(!selection)throw Error('Выделите удаляемую ветку.');
  const next=deleteBranch(current(),selection,()=>ids(kind==='road'?'net-ad':'net-rail')),valid=kind==='road'?validateRoadEdits(next):validateRailEdits(next);
  await commit(()=>{checkpoint();kind==='road'?roadEditor.replaceSnapshot(valid):rails.replace(valid);});
 }
 const safe=fn=>(...a)=>{try{const r=fn(...a);if(r?.catch)r.catch(e=>tell(e.message));}catch(e){tell(e.message);}};
 tools.addEventListener('click',e=>{const b=e.target.closest('[data-network]');if(b)setMode(b.dataset.network);});
 $('networkFinish').onclick=safe(finish);$('networkDelete').onclick=safe(remove);$('networkCancel').onclick=()=>{draft=[];selection=null;paint();tell('Выбор сброшен.');};
 $('networkExit').onclick=$('networkDone').onclick=()=>setMode(null);
 $('networkUndo').onclick=safe(()=>{if(busy)return;if(draft.length){draft.pop();paint();return;}onUndo();indexSignature='';selection=null;paint();tell('Действие отменено.');});
 $('networkRedo').onclick=safe(()=>{if(busy)return;onRedo();indexSignature='';selection=null;paint();tell('Действие восстановлено.');});
 window.addEventListener('pointerdown',e=>{if(e.target===canvas)down=[e.clientX,e.clientY,e.button];},true);
 window.addEventListener('click',e=>{if(!mode||e.target!==canvas)return;e.preventDefault();e.stopImmediatePropagation();if(busy||!down||down[2]!==0||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;safe(()=>{const p=worldPoint(e);if(!p)throw Error('Нажмите на поверхность земли.');mode==='draw'?addPoint(p):prepareDelete(p);})();},true);
 window.addEventListener('keydown',e=>{if(!mode||e.target.closest?.('input,select,textarea'))return;
  if(e.key==='Escape'){e.preventDefault();if(draft.length||selection){draft=[];selection=null;paint();tell('Выбор сброшен.');}else setMode(null);}
  else if(e.key==='Enter'){e.preventDefault();safe(mode==='draw'?finish:remove)();}
  else if(e.key==='Backspace'&&draft.length){e.preventDefault();draft.pop();paint();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('networkRedo'):$('networkUndo')).click();}
 },true);
 const api={setMode,finish,remove,addPoint,prepareDelete,get active(){return !!mode;},get busy(){return busy;},attach:rails.attach,
  railSnapshot:rails.snapshot,restoreRails(value){rails.replace(value);indexSignature='';draft=[];selection=null;paint();},
  stats:()=>({version:NETWORK_VERSION,mode,kind,draftPoints:draft.length,selectedSections:selection?.sections.length||0,selectedLength:selection?.length||0,sourceRoads:sourceRoads.length,sourceRails:sourceRails.length,rail:rails.stats(),busy}),
  // Deterministic diagnostics share exactly the click-path code.
  paths:()=>network().roads.map(r=>({...r,stations:undefined})),selection:()=>selection};
 window.__MUSEUM_NETWORK_EDITOR=api;return api;
}
