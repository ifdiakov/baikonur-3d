import * as THREE from 'three';
import {ROAD_EDITOR_VERSION,ROAD_EDITOR_STORAGE,ROAD_EDITOR_LIMITS,validateRoadEdits,nearestRoadSegment,roadSection} from './road-editor-core.js?v=20261103-road-editor-v1';

// Edit just the museum display. All original OSM coordinates/topology stay intact.
// A small alpha texture clips existing batched road pavement and paint without
// replacing each source way with thousands of individual draw calls.
export function createRoadEditor({root,camera,canvas,groundMeshes,roadMeshes,roads,button,onActiveChange}){
 const base=roads.filter(r=>r?.points?.length>1).map(r=>({
  id:String(r.id),width:Math.max(1,Number(r.width)||2),
  points:r.points.map(p=>Array.isArray(p)?[...p]:[p.x,p.y,p.z])
 }));
 const state={version:ROAD_EDITOR_VERSION,added:[],hidden:[]};
 let active=false,mode='draw',draft=[],history=[],future=[],nextId=1,clearPending=false;
 let routes=base,mouseDown=null;
 const editingGroup=new THREE.Group();editingGroup.name='Автодороги · редактор RocketTrip';root.add(editingGroup);
 const previewGroup=new THREE.Group();previewGroup.name='Точки строящейся автодороги';editingGroup.add(previewGroup);
 const asphalt=new THREE.MeshStandardMaterial({color:0x969d9d,roughness:.93,metalness:0,side:THREE.DoubleSide});
 const dirt=new THREE.MeshStandardMaterial({color:0xada087,roughness:1,metalness:0,side:THREE.DoubleSide});
 const shoulder=new THREE.MeshStandardMaterial({color:0xc0b6a3,roughness:1,side:THREE.DoubleSide});
 const white=new THREE.MeshBasicMaterial({color:0xe9e7d9,depthWrite:false,side:THREE.DoubleSide});
 const draftMaterial=new THREE.LineBasicMaterial({color:0xffbd80,depthTest:false});
 const draftPointMaterial=new THREE.MeshBasicMaterial({color:0xffbd80,depthTest:false});
 const draftPointGeometry=new THREE.SphereGeometry(.8,8,6);
 const maskCanvas=document.createElement('canvas');maskCanvas.width=maskCanvas.height=2048;
 const maskContext=maskCanvas.getContext('2d',{alpha:true});
 const mask=new THREE.CanvasTexture(maskCanvas);mask.generateMipmaps=false;mask.minFilter=THREE.LinearFilter;mask.magFilter=THREE.LinearFilter;
 const maskBounds={value:new THREE.Vector4(0,0,1,1)},maskEnabled={value:0};
 const targets=new Set(['OSM · единые обочины','OSM · единое дорожное полотно','OSM · асфальт трассы',
   'OSM · грунтовые проезды','OSM · разметка','Трасса · двойная жёлтая','Трасса · белые кромки']);
 for(const mesh of roadMeshes){
  if(!mesh.isMesh||!targets.has(mesh.name))continue;
  const material=mesh.material;
  if(material.userData.roadEditorMaskApplied)continue;
  material.userData.roadEditorMaskApplied=true;
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
   previous?.(shader);
   shader.uniforms.roadEditorMask={value:mask};
   shader.uniforms.roadEditorBounds=maskBounds;
   shader.uniforms.roadEditorEnabled=maskEnabled;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nvarying vec2 vRoadEditWorld;');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvRoadEditWorld = (modelMatrix * vec4(position,1.0)).xz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
    '#include <common>\nvarying vec2 vRoadEditWorld;\nuniform sampler2D roadEditorMask;\nuniform vec4 roadEditorBounds;\nuniform float roadEditorEnabled;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
    '#include <clipping_planes_fragment>\nif(roadEditorEnabled > 0.5) {\n vec2 uv=(vRoadEditWorld-roadEditorBounds.xy)/roadEditorBounds.zw;\n if(all(greaterThanEqual(uv,vec2(0.0))) && all(lessThanEqual(uv,vec2(1.0))) && texture2D(roadEditorMask,uv).r > 0.48) discard;\n}');
  };
  material.customProgramCacheKey=()=>String(material.type)+'-rockettrip-road-editor-mask-v1';
  material.needsUpdate=true;
 }
 const panel=document.createElement('section');panel.id='roadEditorPanel';panel.hidden=true;
 panel.setAttribute('aria-label','Редактор автомобильных дорог');
 panel.innerHTML='<div class="road-editor-heading"><b>АВТОДОРОГИ</b><button type="button" data-action="close" aria-label="Закрыть редактор">×</button></div>'
  +'<div class="road-editor-modes"><button type="button" data-mode="draw">ПРОЛОЖИТЬ</button><button type="button" data-mode="erase">УДАЛИТЬ</button></div>'
  +'<div class="road-editor-fields"><label>Ширина полотна<input id="roadEditorWidth" type="number" min="1.5" max="18" step=".5" value="4.5"></label>'
  +'<label>Покрытие<select id="roadEditorSurface"><option value="asphalt">Асфальт</option><option value="ground">Грунт</option></select></label>'
  +'<label>Удаляемый участок<input id="roadEditorEraseSpan" type="number" min="6" max="300" step="5" value="30"></label></div>'
  +'<p id="roadEditorHelp" class="road-editor-help"></p>'
  +'<div id="roadEditorCount" class="road-editor-count"></div>'
  +'<div class="road-editor-actions"><button type="button" data-action="finish">Завершить дорогу</button><button type="button" data-action="cancel">Сбросить точки</button>'
  +'<button type="button" data-action="undo">↶ Отменить</button><button type="button" data-action="redo">↷ Повторить</button>'
  +'<button type="button" data-action="export">Экспорт JSON</button><button type="button" data-action="import">Импорт JSON</button>'
  +'<button type="button" data-action="clear">Очистить правки</button></div>'
  +'<input id="roadEditorImport" type="file" accept=".json,application/json" hidden>'
  +'<p class="road-editor-hint">Изменения сохраняются только в этом браузере. Экспортируйте JSON, чтобы перенести дороги в общий макет. Исходник OpenStreetMap не изменяется.</p>'
  +'<p id="roadEditorStatus" role="status" aria-live="polite"></p>';
 document.body.append(panel);
 const status=panel.querySelector('#roadEditorStatus');
 const hint=panel.querySelector('#roadEditorHelp');
 const buttons={finish:panel.querySelector('[data-action="finish"]'),cancel:panel.querySelector('[data-action="cancel"]'),
  undo:panel.querySelector('[data-action="undo"]'),redo:panel.querySelector('[data-action="redo"]'),clear:panel.querySelector('[data-action="clear"]')};
 const clone=()=>({version:ROAD_EDITOR_VERSION,added:state.added.map(r=>({...r,points:r.points.map(p=>[...p])})),
  hidden:state.hidden.map(r=>({...r,points:r.points.map(p=>[...p])}))});
 function persist(){
  try{localStorage.setItem(ROAD_EDITOR_STORAGE,JSON.stringify(clone()));return true;}
  catch{status.textContent='Браузер не смог сохранить правки. Экспортируйте JSON.';return false;}
 }
 function checkpoint(){history.push(clone());if(history.length>40)history.shift();future=[];clearPending=false;}
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
 function surfaceAt(x,z){
  const sample=new THREE.Raycaster(new THREE.Vector3(x,2500,z),new THREE.Vector3(0,-1,0),0,5000);
  const hit=sample.intersectObjects(groundMeshes,false)[0];
  return hit?.point.y??-2.72;
 }
 function screenPoint(x,y){
  const rect=canvas.getBoundingClientRect();
  pointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
  camera.updateMatrixWorld();ray.setFromCamera(pointer,camera);
  return ray.intersectObjects(groundMeshes,false)[0]?.point??null;
 }
 const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 function sampled(r){
  const p=r.points.map(v=>new THREE.Vector3(...v)),out=[p[0].clone()];
  // Preserve intentional corner vertices. Only insert samples to follow terrain.
  for(let i=1;i<p.length;i++){
   const a=p[i-1],b=p[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2.2));
   for(let k=1;k<=n;k++)out.push(a.clone().lerp(b,k/n));
  }
  out.forEach(v=>{v.y=Math.max(v.y,surfaceAt(v.x,v.z)+.04);});
  return out;
 }
 function roadStrip(points,width,lift=0){
  const xyz=[];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],p=points[Math.max(0,i-2)],q=points[Math.min(points.length-1,i+1)];
   const d1=b.clone().sub(p).setY(0).normalize(),d2=q.clone().sub(a).setY(0).normalize();
   const n1=new THREE.Vector3(-d1.z,0,d1.x).multiplyScalar(width/2),n2=new THREE.Vector3(-d2.z,0,d2.x).multiplyScalar(width/2);
   const c=[a.clone().sub(n1),a.clone().add(n1),b.clone().sub(n2),b.clone().add(n2)];
   c.forEach(v=>v.y+=lift);
   for(const j of [0,2,1,1,2,3])xyz.push(...c[j].toArray());
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
 }
 function renderPath(record){
  const points=sampled(record),road=new THREE.Group();road.name='Новая дорога · '+record.id;
  const edge=new THREE.Mesh(roadStrip(points,record.width+.72,.005),shoulder);
  edge.name='Обочина · '+record.id;edge.receiveShadow=true;road.add(edge);
  const surface=new THREE.Mesh(roadStrip(points,record.width,.032),record.surface==='ground'?dirt:asphalt);
  surface.name='Покрытие · '+record.id;surface.receiveShadow=true;road.add(surface);
  if(record.surface==='asphalt'&&record.width>=5){
   const dashes=[];
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);
    if(dist<.01||Math.floor(i/3)%2)continue;
    const center=a.clone().lerp(b,.5);
    const normal=new THREE.Vector3(-dz/dist,0,dx/dist).multiplyScalar(.045);
    const v=[a.clone().sub(normal),a.clone().add(normal),b.clone().sub(normal),b.clone().add(normal)];
    v.forEach(p=>p.y+=.055);for(const j of [0,2,1,1,2,3])dashes.push(...v[j].toArray());
   }
   if(dashes.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(dashes,3));g.computeVertexNormals();
    const m=new THREE.Mesh(g,white);m.name='Разметка · '+record.id;road.add(m);}
  }
  road.userData.roadEditorId=record.id;return road;
 }
 function applyMask(){
  maskContext.clearRect(0,0,maskCanvas.width,maskCanvas.height);
  if(!state.hidden.length){maskEnabled.value=0;mask.needsUpdate=true;return;}
  const all=state.hidden.flatMap(r=>r.points),spread=12;
  const minX=Math.min(...all.map(p=>p[0]))-spread,maxX=Math.max(...all.map(p=>p[0]))+spread;
  const minZ=Math.min(...all.map(p=>p[2]))-spread,maxZ=Math.max(...all.map(p=>p[2]))+spread;
  const centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2;
  const sizeX=Math.max(32,maxX-minX),sizeZ=Math.max(32,maxZ-minZ);
  const left=centerX-sizeX/2,top=centerZ+sizeZ/2;
  const sx=maskCanvas.width/sizeX,sz=maskCanvas.height/sizeZ;
  maskContext.setTransform(sx,0,0,-sz,-left*sx,top*sz);
  maskContext.lineCap='round';maskContext.lineJoin='round';maskContext.strokeStyle='#ffffff';
  for(const r of state.hidden){
   maskContext.beginPath();maskContext.moveTo(r.points[0][0],r.points[0][2]);
   for(const p of r.points.slice(1))maskContext.lineTo(p[0],p[2]);
   maskContext.lineWidth=r.width+.85;maskContext.stroke();
  }
  maskContext.setTransform(1,0,0,1,0,0);
  maskBounds.value.set(left,top-sizeZ,sizeX,sizeZ);maskEnabled.value=1;mask.needsUpdate=true;
 }
 function renderDraft(){
  for(const child of [...previewGroup.children]){previewGroup.remove(child);if(child.geometry!==draftPointGeometry)child.geometry.dispose();}
  if(!draft.length)return;
  const vertices=draft.map(p=>new THREE.Vector3(p[0],p[1]+.2,p[2]));
  if(vertices.length>1){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),draftMaterial);
   line.renderOrder=60;line.frustumCulled=false;previewGroup.add(line);}
  for(const p of vertices){
   const dot=new THREE.Mesh(draftPointGeometry,draftPointMaterial);dot.position.copy(p);dot.renderOrder=61;previewGroup.add(dot);
  }
 }
 function render(){
  for(const child of [...editingGroup.children]){
   if(child===previewGroup)continue;
   editingGroup.remove(child);child.traverse(o=>{if(o.geometry)o.geometry.dispose();});
  }
  const added=state.added.map(r=>({id:r.id,width:r.width,points:sampled(r).map(p=>p.toArray())}));
  routes=[...base,...added];
  for(const record of state.added)editingGroup.add(renderPath(record));
  applyMask();renderDraft();
  panel.querySelector('#roadEditorCount').textContent='Добавлено: '+state.added.length+' · Скрыто участков: '+state.hidden.length+' · Точек: '+draft.length;
  buttons.undo.disabled=!history.length;buttons.redo.disabled=!future.length;
  buttons.finish.disabled=draft.length<2;buttons.cancel.disabled=!draft.length;
  panel.querySelector('#roadEditorEraseSpan').disabled=mode!=='erase';
  panel.querySelector('#roadEditorWidth').disabled=mode!=='draw';
  panel.querySelector('#roadEditorSurface').disabled=mode!=='draw';
  if(button)button.setAttribute('aria-pressed',String(active));
  persist();
 }
 function setMode(value){
  if(!['draw','erase'].includes(value))return;
  mode=value;draft=[];clearPending=false;
  for(const b of panel.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  hint.textContent=mode==='draw'
   ?'Кликайте по карте, ставя точки дороги. Начало и конец притягиваются к соседней дороге. «Завершить» создаёт полотно. Перетаскивание перемещает карту.'
   :'Кликните по существующей дороге: удалится только выбранный участок. Новая дорога удаляется целиком. Укажите длину участка в поле.';
  status.textContent='';render();
 }
 function setActive(value){
  active=!!value;panel.hidden=!active;button?.setAttribute('aria-pressed',String(active));
  canvas.style.cursor=active?'crosshair':'';
  if(!active){draft=[];renderDraft();}
  onActiveChange?.(active);
 }
 function number(selector,lo,hi){return Math.min(hi,Math.max(lo,Number(panel.querySelector(selector).value)||lo));}
 function finish(){
  if(draft.length<2||state.added.length>=ROAD_EDITOR_LIMITS.roads){status.textContent='Нужно минимум две точки, максимум '+ROAD_EDITOR_LIMITS.roads+' дорог.';return;}
  if(draft.reduce((n,p,i)=>n+(i?horizontal(draft[i-1],p):0),0)<2){status.textContent='Слишком короткая дорога.';return;}
  checkpoint();state.added.push({id:'road-'+nextId++,width:number('#roadEditorWidth',1.5,18),
   surface:panel.querySelector('#roadEditorSurface').value,points:draft.map(p=>[...p])});
  draft=[];render();status.textContent='Дорога добавлена. Для следующей начните ставить точки.';
 }
 function undo(){
  if(draft.length){draft.pop();renderDraft();buttons.finish.disabled=draft.length<2;buttons.cancel.disabled=!draft.length;return;}
  if(!history.length)return;future.push(clone());Object.assign(state,history.pop());render();status.textContent='Действие отменено.';
 }
 function redo(){
  if(!future.length)return;history.push(clone());Object.assign(state,future.pop());render();status.textContent='Действие восстановлено.';
 }
 function clear(){
  if(!state.added.length&&!state.hidden.length)return;
  if(!clearPending){clearPending=true;status.textContent='Нажмите «Очистить правки» ещё раз для подтверждения.';return;}
  checkpoint();state.added=[];state.hidden=[];draft=[];render();status.textContent='Все собственные правки очищены. Исходные дороги на месте.';
 }
 function pointAt(e){
  const hit=screenPoint(e.clientX,e.clientY);
  if(!hit)return null;
  const near=nearestRoadSegment(routes,hit.toArray(),{maxDistance:5});
  if(mode==='draw'&&near){
   const p=[...near.point];p[1]=Math.max(p[1],surfaceAt(p[0],p[2])+.04);return p;
  }
  return [hit.x,hit.y+.045,hit.z];
 }
 canvas.addEventListener('pointerdown',e=>{mouseDown={x:e.clientX,y:e.clientY,button:e.button};});
 canvas.addEventListener('click',e=>{
  if(!active)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!mouseDown||mouseDown.button!==0||Math.hypot(mouseDown.x-e.clientX,mouseDown.y-e.clientY)>6)return;
  const p=pointAt(e);if(!p){status.textContent='Нажмите на поверхность карты.';return;}
  if(mode==='draw'){
   if(draft.length>=ROAD_EDITOR_LIMITS.pointsPerRoad){status.textContent='Предел: '+ROAD_EDITOR_LIMITS.pointsPerRoad+' точек.';return;}
   if(draft.length&&horizontal(draft.at(-1),p)<.75){status.textContent='Точка слишком близко к предыдущей.';return;}
   draft.push(p);renderDraft();buttons.finish.disabled=draft.length<2;buttons.cancel.disabled=false;
   status.textContent='Точка № '+draft.length+' добавлена.';
   panel.querySelector('#roadEditorCount').textContent='Добавлено: '+state.added.length+' · Скрыто участков: '+state.hidden.length+' · Точек: '+draft.length;
  }else{
   const near=nearestRoadSegment(routes,p,{maxDistance:8,skip:r=>state.hidden.some(h=>h.sourceId===r.id&&nearestRoadSegment([h],p,{maxDistance:h.width*.5}) )});
   if(!near){status.textContent='Нажмите непосредственно на автомобильную дорогу.';return;}
   if(state.added.some(r=>r.id===near.road.id)){
    checkpoint();state.added=state.added.filter(r=>r.id!==near.road.id);
    render();status.textContent='Добавленная дорога удалена.';return;
   }
   const section=roadSection(near.road,near.at,number('#roadEditorEraseSpan',6,300));
   if(!section||state.hidden.length>=ROAD_EDITOR_LIMITS.hidden){status.textContent='Нельзя удалить этот участок.';return;}
   checkpoint();state.hidden.push(section);render();status.textContent='Участок скрыт. Отмена вернёт полотно.';
  }
 },true);
 panel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mode){setMode(b.dataset.mode);return;}
  switch(b.dataset.action){
   case 'close':setActive(false);break;
   case 'finish':finish();break;
   case 'cancel':draft=[];renderDraft();buttons.finish.disabled=true;buttons.cancel.disabled=true;status.textContent='Точки сброшены.';break;
   case 'undo':undo();break;
   case 'redo':redo();break;
   case 'clear':clear();break;
   case 'export':{
    const url=URL.createObjectURL(new Blob([JSON.stringify({...clone(),coordinateSystem:'baikonur-museum-world'},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='rockettrip-roads.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Файл с дорогами сохранён.';break;
   }
   case 'import':panel.querySelector('#roadEditorImport').click();break;
  }
 });
 panel.querySelector('#roadEditorImport').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(file.size>3000000)throw Error('Файл слишком большой.');
   const loaded=validateRoadEdits(JSON.parse(await file.text()));checkpoint();Object.assign(state,loaded);
   nextId=Math.max(1,...state.added.map(r=>Number(r.id.match(/\d+$/)?.[0]||0)+1));draft=[];render();
   status.textContent='Схема импортирована: '+state.added.length+' дорог, скрыто '+state.hidden.length+' участков.';
  }catch(error){status.textContent='Ошибка импорта: '+error.message;}
  e.target.value='';
 });
 document.addEventListener('keydown',e=>{
  if(!active||e.target.closest('input,select,textarea'))return;
  if(e.key==='Escape'){if(draft.length){draft=[];renderDraft();buttons.finish.disabled=true;buttons.cancel.disabled=true;}else setActive(false);}
  else if(e.key==='Enter'){e.preventDefault();finish();}
  else if(e.key==='Backspace'&&draft.length){e.preventDefault();draft.pop();renderDraft();buttons.finish.disabled=draft.length<2;buttons.cancel.disabled=!draft.length;}
  else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
 });
 try{
  const saved=localStorage.getItem(ROAD_EDITOR_STORAGE);
  if(saved){Object.assign(state,validateRoadEdits(JSON.parse(saved)));nextId=Math.max(1,...state.added.map(r=>Number(r.id.match(/\d+$/)?.[0]||0)+1));}
 }catch{status.textContent='Сохранённая схема повреждена. Импортируйте её из JSON или очистите правки.';}
 button?.addEventListener('click',()=>setActive(!active));
 setMode('draw');
 return {get active(){return active;},setActive,undo,redo,finish,
  snapshot:clone,stats:()=>({version:ROAD_EDITOR_VERSION,active,mode,added:state.added.length,hidden:state.hidden.length,
   draftPoints:draft.length,history:history.length,sourceRoadPaths:base.length,maskApplied:maskEnabled.value===1,selectedRoads:routes.length})};
}
