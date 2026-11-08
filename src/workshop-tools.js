import * as THREE from 'three';
import {WORKSHOP_STORAGE,validateWorkshopState,mapToWorld,worldToMap} from './workshop-state.js';
import {validateRoadEdits} from './road-editor-core.js?v=20261103-road-editor-core-v4';
const copy=x=>JSON.parse(JSON.stringify(x));
export async function installWorkshopTools(d,{enabled=false}={}){
 const known=new Map(d.objects.map(o=>[o.record.id,o])),baselines=new Map(d.objects.map(o=>[o.record.id,{position:o.g.position.toArray(),yaw:o.g.rotation.y,scale:o.g.scale.x}]));
 let state={version:1,objects:{},roads:null},history=[],future=[];
 function applyObject(id,p){const o=known.get(id);o.g.position.fromArray(p.position);o.g.rotation.y=p.yaw;o.g.scale.setScalar(p.scale);o.g.updateMatrixWorld(true);const [x,y]=worldToMap(p.position);o.x=x;o.y=y;o.record.x=x;o.record.y=y;}
 function validate(s){const next=validateWorkshopState(s,new Set(known.keys()));if(next.roads)next.roads=validateRoadEdits(next.roads);return next;}
 function apply(s,{roads=true}={}){const next=validate(s);for(const [id,p]of baselines)applyObject(id,p);for(const [id,p]of Object.entries(next.objects))applyObject(id,p);if(roads&&next.roads&&enabled)d.roadEditor.replaceState(next.roads);state=next;}
 let loadError='';
 try{const r=await fetch('./data/workshop-state.json',{cache:'no-cache'});if(r.ok)apply(await r.json(),{roads:enabled});}catch(e){loadError='Опубликованные правки не загружены: '+e.message;}
 if(enabled){try{const saved=localStorage.getItem(WORKSHOP_STORAGE);if(saved)apply(JSON.parse(saved));}catch(e){loadError='Черновик не применён: '+e.message;}}
 const snapshot=()=>({...copy(state),roads:enabled?d.roadEditor.snapshot():state.roads});
 if(!enabled)return {snapshot,ready:true,enabled:false};
 const panel=document.createElement('details');panel.id='workshopTools';panel.open=true;
 panel.innerHTML=`<summary>МАСТЕРСКАЯ БАЙКОНУРА</summary><p>Черновики сохраняются только в этом браузере. Посетители их не видят.</p>
 <h3>Объекты и высоты</h3><label>Объект<select id="wsObject"></select></label><button id="wsFocus">Показать на карте</button>
 <div class="row"><label>X на карте<input id="wsX" type="number" step=".1"></label><label>Y на карте<input id="wsY" type="number" step=".1"></label></div>
 <div class="row"><label>Высота основания<input id="wsH" type="number" step=".1"></label><label>Поворот, градусы<input id="wsYaw" type="number" step="1"></label></div>
 <label>Масштаб модели<input id="wsScale" type="number" min=".005" max="20" step=".01"></label><p>Высота — единицы 3D-сцены, не метры над уровнем моря.</p>
 <button id="wsApply">Применить</button><button id="wsGround" class="secondary">Поставить на землю</button><button id="wsResetObject" class="secondary">Вернуть объект</button>
 <h3>Дороги и перекрёстки</h3><button id="wsDraw">Рисовать / удалять дорогу</button><button id="wsRoadList" class="secondary">Выбрать узлы дороги</button>
 <section id="wsRoadNodes" hidden><label>Дорога<select id="wsRoad"></select></label><label>Номер узла<input id="wsNode" type="number" min="0" step="1" value="0"></label><div class="row"><label>X узла<input id="wsRoadX" type="number" step=".1"></label><label>Y узла<input id="wsRoadY" type="number" step=".1"></label></div><label>Высота узла<input id="wsRoadH" type="number" step=".05"></label><label><input id="wsLinked" type="checkbox" checked> Передвигать совпадающие узлы перекрёстка</label><button id="wsMoveNode">Переместить узел</button></section>
 <h3>Сохранение и проверка</h3><button id="wsUndo" class="secondary">↶ Отменить</button><button id="wsRedo" class="secondary">↷ Повторить</button><button id="wsExport">Скачать проект</button><button id="wsImport" class="secondary">Загрузить проект</button><input id="wsFile" type="file" accept="application/json,.json" hidden>
 <p class="warning">Это редактор, не защищённая серверная админ-панель. Публикация — только через учётную запись GitHub. Токены здесь не вводятся.</p><a href="./museum.html" target="_blank" rel="noopener">Открыть музей</a><a href="https://github.com/ifdiakov/baikonur-3d/upload/main/data" target="_blank" rel="noopener" class="secondary">Передать файл в GitHub</a><p>Для публикации загрузите скачанный workshop-state.json в папку data. Проверяемая сборка подготовит посетительскую версию.</p><p id="wsStatus" role="status">${loadError?'Черновик требует проверки.':'Мастерская готова. Выберите объект.'}</p>`;
 document.body.append(panel);const $=id=>panel.querySelector('#'+id),status=text=>{$('wsStatus').textContent=text;};
 const select=$('wsObject');for(const o of d.objects){const option=document.createElement('option');option.value=o.record.id;option.textContent=o.record.name||o.name||o.record.id;select.append(option);}
 const read=id=>{const n=Number($(id).value);if(!Number.isFinite(n))throw Error('Введите числовое значение.');return n;};
 function sync(){const o=known.get(select.value);const p={position:o.g.position.toArray(),yaw:o.g.rotation.y,scale:o.g.scale.x};const [x,y,h]=worldToMap(p.position);for(const [id,n]of Object.entries({wsX:x,wsY:y,wsH:h,wsYaw:p.yaw*180/Math.PI,wsScale:p.scale}))$(id).value=+n.toFixed(5);}
 function persist(){try{localStorage.setItem(WORKSHOP_STORAGE,JSON.stringify(snapshot()));status('Черновик сохранён в этом браузере. Публичный музей не изменён.');}catch{status('Не хватило места для сохранения. Скачайте проект.');}}
 function checkpoint(){history.push(snapshot());if(history.length>40)history.shift();future=[];}
 function commit(fn){try{checkpoint();fn();persist();sync();}catch(e){if(history.length){apply(history.pop());}status(e.message);}}
 select.onchange=sync;sync();
 $('wsFocus').onclick=()=>window.__BAIKONUR_QA.openObject(select.value);
 $('wsApply').onclick=()=>commit(()=>{const id=select.value,p={position:mapToWorld(read('wsX'),read('wsY'),read('wsH')),yaw:read('wsYaw')*Math.PI/180,scale:read('wsScale')};validateWorkshopState({version:1,objects:{[id]:p}},new Set(known.keys()));state.objects[id]=p;applyObject(id,p);});
 $('wsGround').onclick=()=>{const x=(read('wsX')-650)*3.4,z=(read('wsY')-522.5)*3.4;$('wsH').value=d.museumTerrainHeightAt(x,z).toFixed(3);$('wsApply').click();};
 $('wsResetObject').onclick=()=>commit(()=>{delete state.objects[select.value];applyObject(select.value,baselines.get(select.value));});
 function undo(){if(!history.length)return;future.push(snapshot());apply(history.pop());persist();sync();}
 function redo(){if(!future.length)return;history.push(snapshot());apply(future.pop());persist();sync();}
 $('wsUndo').onclick=undo;$('wsRedo').onclick=redo;
 $('wsDraw').onclick=()=>{d.requestTransportDetail();d.roadEditor.setActive(!d.roadEditor.active);};
 let roadRows=[];
 function syncNode(){const r=roadRows.find(r=>r.id===$('wsRoad').value);if(!r)return;const i=Math.max(0,Math.min(r.points.length-1,Math.round(read('wsNode'))));$('wsNode').value=i;$('wsNode').max=r.points.length-1;const [x,y,h]=worldToMap(r.points[i]);$('wsRoadX').value=x.toFixed(4);$('wsRoadY').value=y.toFixed(4);$('wsRoadH').value=h.toFixed(4);}
 function loadRoads(){roadRows=d.roadEditor.listPaths();$('wsRoad').replaceChildren();for(const r of roadRows){const op=document.createElement('option');op.value=r.id;op.textContent=r.id+' · '+r.points.length+' узлов';$('wsRoad').append(op);}syncNode();}
 $('wsRoadList').onclick=()=>{$('wsRoadNodes').hidden=!$('wsRoadNodes').hidden;if(!$('wsRoadNodes').hidden)loadRoads();};
 $('wsRoad').onchange=()=>{$('wsNode').value=0;syncNode();};$('wsNode').onchange=syncNode;
 $('wsMoveNode').onclick=()=>commit(()=>{
  const r=roadRows.find(r=>r.id===$('wsRoad').value),index=Math.round(read('wsNode'));if(!r?.points[index])throw Error('Выберите узел.');
  const old=r.points[index],next=mapToWorld(read('wsRoadX'),read('wsRoadY'),read('wsRoadH')),edits=d.roadEditor.snapshot();
  const changes=[];for(const candidate of roadRows){if(candidate.id!==r.id&&!$('wsLinked').checked)continue;const j=candidate.id===r.id?index:candidate.points.findIndex(p=>Math.hypot(...p.map((v,k)=>v-old[k]))<.12);if(j<0)continue;changes.push([candidate,j]);}
  for(const [route,j]of changes){
   const own=edits.added.find(a=>a.id===route.id);if(own){own.points[j]=[...next];continue;}
   const a=Math.max(0,j-2),b=Math.min(route.points.length-1,j+2),pts=route.points.slice(a,b+1).map(p=>[...p]);if(pts.length<2)continue;
   edits.hidden.push({sourceId:route.id,width:Math.max(1,route.width),points:pts.map(p=>[...p])});pts[j-a]=[...next];
   edits.added.push({id:'ws-node-'+Date.now()+'-'+edits.added.length,width:Math.max(1.5,Math.min(18,route.width)),surface:route.surface==='ground'?'ground':'asphalt',points:pts});
  }
  d.roadEditor.replaceState(edits);state.roads=edits;loadRoads();
 });
 $('wsExport').onclick=()=>{const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='workshop-state.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Файл содержит объекты и дороги. Для публикации загрузите его в data/workshop-state.json на GitHub.');};
 $('wsImport').onclick=()=>$('wsFile').click();$('wsFile').onchange=async()=>{try{const f=$('wsFile').files[0];if(!f)return;if(f.size>4000000)throw Error('Файл больше 4 МБ.');const next=validate(JSON.parse(await f.text()));checkpoint();apply(next);persist();sync();}catch(e){status('Импорт отклонён: '+e.message);}finally{$('wsFile').value='';}};
 const api={enabled:true,ready:true,snapshot,select(id){if(!known.has(id))throw Error('Нет объекта');select.value=id;sync();},apply:next=>{const s=validate(next);checkpoint();apply(s);persist();sync();},undo,redo};window.__MUSEUM_WORKSHOP=api;if(loadError)status(loadError);return api;
}
