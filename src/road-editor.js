import * as THREE from 'three';
import {ROAD_EDITOR_VERSION,ROAD_EDITOR_STORAGE,ROAD_EDITOR_LIMITS,validateRoadEdits,reconcileRoadEdits,nearestRoadSegment,roadSection} from './road-editor-core.js?v=20261103-road-editor-core-v4';
import {stitchEditedRoads,buildEditedRoadMeshes,ROAD_EDIT_MESH_VERSION} from './road-editor-mesh.js?v=20261103-road-union-weld-v7-saturn-terrain-clearance';
import {partitionRoadMaskStrokes,roadMaskTileBounds,roadMaskCoverageWidth,ROAD_MASK_TILE_COUNT} from './road-mask-tiles.js?v=20261103-road-parity-v3';
import {deriveEditedRoadStyle,ROAD_EDIT_STYLE_VERSION} from './road-editor-style.js?v=20261103-road-parity-v3';
import {makeRoadSurfaceCutIndex,physicallyCutRoadGeometry,ROAD_GEOMETRY_CUT_VERSION} from './road-geometry-cut.js?v=20261103-source-matched-pavement-v7';

// Edit just the museum display. All original OSM coordinates/topology stay intact.
// A small alpha texture clips existing batched road pavement and paint without
// replacing each source way with thousands of individual draw calls.
export function createRoadEditor({root,camera,canvas,groundMeshes,roadMeshes,roads,button,onActiveChange,onChange=()=>{},terrainHeightAt=null,defaultEdits=null,readOnly=false}){
 const base=roads.filter(r=>r?.points?.length>1).map(r=>({
  id:String(r.id),width:Math.max(1,Number(r.width)||2),
  points:r.points.map(p=>Array.isArray(p)?[...p]:[p.x,p.y,p.z]),
  source:r.source,tags:r.tags||{},marked:r.marked===true,highway:r.highway===true,
  surface:r.surface||'asphalt'
 }));
 const state={version:ROAD_EDITOR_VERSION,added:[],hidden:[]};
 let active=false,mode='draw',draft=[],history=[],future=[],nextId=1,clearPending=false;
 let routes=base,mouseDown=null;
 const editingGroup=new THREE.Group();editingGroup.name='Автодороги · редактор RocketTrip';root.add(editingGroup);
 const previewGroup=new THREE.Group();previewGroup.name='Точки строящейся автодороги';editingGroup.add(previewGroup);
 // Reuse the precise source road palette (materials as configured by the OSM
 // batches), rather than independently chosen editor colors. Copy before
 // the source stencil shader is installed so the new pavement is not clipped.
 const originalMaterial=(name,fallback)=>{
  const match=roadMeshes.find(mesh=>mesh.name===name&&mesh.material?.isMaterial)?.material;
  return match?match.clone():new THREE.MeshStandardMaterial({color:fallback,roughness:.96,metalness:0,side:THREE.DoubleSide});
 };
 const surfaceMaterials={
  asphalt:originalMaterial('OSM · единое дорожное полотно',0xadb2b3),
  ground:originalMaterial('OSM · грунтовые проезды',0xb2a58d),
  highway:originalMaterial('OSM · асфальт трассы',0x42494c),
  shoulder:originalMaterial('OSM · единые обочины',0xc5c1b4),
  paintWhite:originalMaterial('OSM · разметка',0xf2f0e4),
  paintYellow:originalMaterial('Трасса · двойная жёлтая',0xe2b746)
 };
 for(const key of ['paintWhite','paintYellow']){
  const paint=surfaceMaterials[key];paint.polygonOffset=true;
  paint.polygonOffsetFactor=-1;paint.polygonOffsetUnits=-1;paint.depthWrite=false;
 }
 const draftMaterial=new THREE.LineBasicMaterial({color:0xffbd80,depthTest:false});
 const draftPointMaterial=new THREE.MeshBasicMaterial({color:0xffbd80,depthTest:false});
 const draftPointGeometry=new THREE.SphereGeometry(.8,8,6);
 // Three medium-sized atlases keep even the narrow service-road cuts
 // subpixel-free across the far-flung OSM map; source altitude prevents a
 // removed bridge from puncturing the road below it.
 const MASK_SIZE=2048,TILE_COUNT=ROAD_MASK_TILE_COUNT;
 const tiles=Array.from({length:TILE_COUNT},()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=MASK_SIZE;
  const context=canvas.getContext('2d',{alpha:true});
  const texture=new THREE.CanvasTexture(canvas);texture.generateMipmaps=false;
  // Binary discard stencils need exact grade samples: bilinear color
  // interpolation against transparent pixels used to tear the cut edges.
  texture.minFilter=THREE.NearestFilter;texture.magFilter=THREE.NearestFilter;
  return {canvas,context,texture,bounds:{value:new THREE.Vector4(0,0,1,1)},enabled:{value:0},strokes:0,worldUnitsPerPixel:0};
 });
 // The old renderer painted a texture mask on top of old roads. That left
 // washed-out contours and damaged every other intersection in screenshots.
 // Remove deleted sections from triangles themselves. Keep the originals
 // for Undo/Redo and never alter the source OSM graph.
 const targets=new Set(['OSM · единые обочины','OSM · единое дорожное полотно','OSM · асфальт трассы',
  'OSM · грунтовые проезды','OSM · разметка','Трасса · двойная жёлтая','Трасса · белые кромки',
  'road-pavement-union','road-shoulder-union','road-center-dashes','road-edge-lines',
  'Трасса · продолжение · shoulder','Трасса · продолжение · asphalt',
  'Трасса · продолжение · white','Трасса · продолжение · yellow']);
 const sourceMeshes=roadMeshes.filter(m=>m.isMesh&&targets.has(m.name));
 const maskedMeshNames=sourceMeshes.map(m=>m.name);
 const originals=new Map(sourceMeshes.map(m=>[m,m.geometry]));
 let physicalCutStats={version:ROAD_GEOMETRY_CUT_VERSION,meshes:0,clipped:0,removed:0,examined:0,triangles:0};
 function replaceSourceGeometry(){
  const edits=makeRoadSurfaceCutIndex(state.hidden,joinedPaths,{sourceRoads:base});
  let clipped=0,removed=0,examined=0,triangles=0;
  for(const mesh of sourceMeshes){
   const original=originals.get(mesh);
   if(!original)continue;
   if(!edits.clips){
    if(mesh.geometry!==original){mesh.geometry.dispose();mesh.geometry=original;}
    continue;
   }
   const result=physicallyCutRoadGeometry(original,edits,{gradeTolerance:1.05,surfaceName:mesh.name});
   if(mesh.geometry!==original)mesh.geometry.dispose();
   mesh.geometry=result.geometry;
   clipped+=result.stats.clipped;removed+=result.stats.removed;
   examined+=result.stats.examined;triangles+=result.stats.outputTriangles;
  }
  physicalCutStats={version:ROAD_GEOMETRY_CUT_VERSION,meshes:sourceMeshes.length,clipped,removed,examined,triangles,
   clipPolygons:edits.clips,sourceCuts:edits.sourceCuts,replacementCuts:edits.replacementCuts,skippedOffRoad:edits.skippedOffRoad,restoredCrossings:edits.restoredCrossings,protectedClipParts:edits.protectedClipParts};
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
  +'<button type="button" data-action="baseline">Восстановить эталонную схему</button><button type="button" data-action="clear">Очистить правки</button></div>'
  +'<input id="roadEditorImport" type="file" accept=".json,application/json" hidden>'
  +'<p class="road-editor-hint">Изменения сохраняются только в этом браузере. Экспортируйте JSON, чтобы перенести дороги в общий макет. Исходник OpenStreetMap не изменяется.</p>'
  +'<p id="roadEditorStatus" role="status" aria-live="polite"></p>';
 if(!readOnly)document.body.append(panel);
 const status=panel.querySelector('#roadEditorStatus');
 const hint=panel.querySelector('#roadEditorHelp');
 const buttons={finish:panel.querySelector('[data-action="finish"]'),cancel:panel.querySelector('[data-action="cancel"]'),
  undo:panel.querySelector('[data-action="undo"]'),redo:panel.querySelector('[data-action="redo"]'),clear:panel.querySelector('[data-action="clear"]')};
 const clone=()=>({version:ROAD_EDITOR_VERSION,added:state.added.map(r=>({...r,points:r.points.map(p=>[...p])})),
  hidden:state.hidden.map(r=>({...r,points:r.points.map(p=>[...p])}))});
 function persist(){
  try{localStorage.setItem(ROAD_EDITOR_STORAGE,JSON.stringify({...clone(),baselineRevision:baselineData?.revision||null}));return true;}
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
 let joinedPaths=[],joinReport=[],styleReport=[],geometryStats={segments:0,sourceRoads:0,overlaps:0};
 let addedSignature=null,maskSignature=null,erasedIndex=new Map(),baselineData=null,maskStats={partCount:0,duplicateCuts:0,invalidSegments:0,sectorParts:[]};
 function rebuildAdded(){
  for(const child of [...editingGroup.children]){
   if(child===previewGroup)continue;editingGroup.remove(child);
   child.traverse(o=>{if(o.geometry)o.geometry.dispose();});
  }
  const joined=stitchEditedRoads(state.added,{existingRoads:base});
  joinReport=joined.adjustments;
  const styled=joined.roads.map(r=>({...r,profile:deriveEditedRoadStyle(r,base)}));
  styleReport=styled.map(r=>({id:r.id,sourceId:r.profile.sourceId,kind:r.profile.classId,
   widthStart:r.profile.widthStart,widthEnd:r.profile.widthEnd,
   marking:r.profile.marking,marked:r.profile.marked,
   sourceStart:r.profile.matching.start,sourceEnd:r.profile.matching.end}));
  const built=buildEditedRoadMeshes(styled,{terrainHeightAt,existingRoads:base});
  joinedPaths=built.paths;
  geometryStats=built.stats;
  routes=[...base,...joinedPaths];
  for(const [type,g]of Object.entries(built.geometries)){
   if(!g.attributes.position.count){g.dispose();continue;}
   const material=surfaceMaterials[type];
   const mesh=new THREE.Mesh(g,material);mesh.name='Единое полотно редактора · '+type;
   mesh.receiveShadow=true;editingGroup.add(mesh);
  }
 }
 function applyMask(){
  // Source cuts and replacement pavement use identical spatial/grade sampling;
  // only their end caps differ. Butt caps on new roads prevent crescent-shaped
  // holes in the original roadway immediately beyond a new T-junction.
  const partition=partitionRoadMaskStrokes(state.hidden,joinedPaths);
  maskStats=partition.stats;
  erasedIndex=new Map();
  const cellSize=16;
  for(const h of state.hidden)for(let j=1;j<h.points.length;j++){
   const a=h.points[j-1],b=h.points[j],margin=h.width/2+2.5;
   const record={a,b,sourceId:h.sourceId,width:h.width};
   for(let ix=Math.floor((Math.min(a[0],b[0])-margin)/cellSize);ix<=Math.floor((Math.max(a[0],b[0])+margin)/cellSize);ix++)
    for(let iz=Math.floor((Math.min(a[2],b[2])-margin)/cellSize);iz<=Math.floor((Math.max(a[2],b[2])+margin)/cellSize);iz++){
     const key=ix+':'+iz,list=erasedIndex.get(key)||[];list.push(record);erasedIndex.set(key,list);
    }
  }
  for(let i=0;i<TILE_COUNT;i++){
   const tile=tiles[i],ctx=tile.context,parts=partition.tiles[i];
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,MASK_SIZE,MASK_SIZE);
   tile.enabled.value=parts.length?1:0;tile.strokes=parts.length;
   if(!parts.length){tile.texture.needsUpdate=true;tile.worldUnitsPerPixel=0;continue;}
   const {left,bottom,side,metersPerPixel}=roadMaskTileBounds(parts);
   const scale=MASK_SIZE/side;
   tile.bounds.value.set(left,bottom,side,side);tile.worldUnitsPerPixel=metersPerPixel;
   ctx.setTransform(scale,0,0,-scale,-left*scale,(bottom+side)*scale);
   ctx.lineCap='butt';ctx.lineJoin='round';
   for(const segment of parts){
    const {a,b,grade}=segment;
    // Hide the whole OSM section, including both shoulders and edge paint.
    // A .14-unit allowance used to leave two pale outlines along cuts.
    const width=roadMaskCoverageWidth(segment.width,segment.kind);
    const ink='rgb(255,'+grade+',0)';
    ctx.strokeStyle=ink;ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(a[0],a[2]);ctx.lineTo(b[0],b[2]);ctx.stroke();
    // Only fill interior joins. Rounding an outer end used to chew a visible
    // semicircle out of the original OSM road beyond the edited endpoint.
    if(segment.capStart||segment.capEnd){
     ctx.fillStyle=ink;
     for(const [valid,p] of [[segment.capStart,a],[segment.capEnd,b]]){
      if(!valid)continue;
      ctx.beginPath();ctx.arc(p[0],p[2],width*.5,0,Math.PI*2);ctx.fill();
     }
    }
   }
   ctx.setTransform(1,0,0,1,0,0);tile.texture.needsUpdate=true;
  }
  replaceSourceGeometry();
 }
 // Deterministic source-pavement cut audit: read the same mask pixels the
 // fragment shader sees. Avoids mistaken geometric claims based only on
 // centreline data while forgotten white edge stripes are still on screen.
 function maskAt(x,z,y){
  for(const tile of tiles){
   if(!tile.enabled.value)continue;
   const bounds=tile.bounds.value,u=(x-bounds.x)/bounds.z,v=(z-bounds.y)/bounds.w;
   if(u<0||u>=1||v<0||v>=1)continue;
   const px=Math.floor(u*MASK_SIZE),py=Math.floor((1-v)*MASK_SIZE);
   const c=tile.context.getImageData(px,py,1,1).data;
   if(c[3]<=123||c[0]<=128)continue;
   const grade=c[1]/255*48-16;
   if(Math.abs(grade-y)<.85)return {cut:true,grade,alpha:c[3]/255,worldUnitsPerPixel:tile.worldUnitsPerPixel};
  }
  return {cut:false};
 }
 function roadLightRemoved(record){
  const p=record.center||[record.x,record.y,record.z],x=p[0],y=p[1],z=p[2],size=16;
  const list=erasedIndex.get(Math.floor(x/size)+':'+Math.floor(z/size))||[];
  let hidden=false;
  for(const h of list){
   // The highway light planner uses one long route named "highway",
   // while editor cuts retain their individual OSM way IDs.
   const sameSource=h.sourceId===record.roadId||
    record.style==='highway'&&h.width>=3&&h.sourceId.startsWith('osm-road-');
   if(record.roadId&&!sameSource)continue;
   const a=h.a,b=h.b,dx=b[0]-a[0],dz=b[2]-a[2],den=dx*dx+dz*dz;
   if(den<1e-9)continue;
   const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/den));
   const px=a[0]+t*dx,pz=a[2]+t*dz,py=a[1]+t*(b[1]-a[1]);
   if(Math.hypot(x-px,z-pz)<h.width/2+.9&&Math.abs(py-y)<1.1){hidden=true;break;}
  }
  if(!hidden)return false;
  // Do not orphan a useful pole when the user has repaved this exact road.
  const near=nearestRoadSegment(joinedPaths,[x,y,z],{maxDistance:2.5});
  return !near||Math.abs(near.point[1]-y)>1.1;
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
  const freshAdded=JSON.stringify(state.added),freshHidden=JSON.stringify(state.hidden);
  let changed=false;
  if(freshAdded!==addedSignature){addedSignature=freshAdded;rebuildAdded();changed=true;}
  if(changed||freshHidden!==maskSignature){maskSignature=freshHidden;applyMask();changed=true;}
  renderDraft();
  panel.querySelector('#roadEditorCount').textContent='Добавлено: '+state.added.length+' · Удалено участков: '+state.hidden.length+' · Точек: '+draft.length;
  buttons.undo.disabled=!history.length;buttons.redo.disabled=!future.length;
  buttons.finish.disabled=draft.length<2;buttons.cancel.disabled=!draft.length;
  panel.querySelector('#roadEditorEraseSpan').disabled=mode!=='erase';
  panel.querySelector('#roadEditorWidth').disabled=mode!=='draw';
  panel.querySelector('#roadEditorSurface').disabled=mode!=='draw';
  if(button)button.setAttribute('aria-pressed',String(active));
  persist();if(changed)onChange();
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
  if(readOnly)return false;
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
 if(!readOnly){
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
   case 'baseline':{
    if(!baselineData){status.textContent='Эталонная схема ещё не загружена.';break;}
    checkpoint();Object.assign(state,validateRoadEdits(baselineData));draft=[];
    nextId=Math.max(1,...state.added.map(r=>Number(r.id.match(/\d+$/)?.[0]||0)+1));
    render();status.textContent='Эталонная дорожная схема восстановлена.';break;
   }
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
 }
 try{
  baselineData=defaultEdits?{...validateRoadEdits(defaultEdits),revision:defaultEdits.revision||null}:null;
  const saved=localStorage.getItem(ROAD_EDITOR_STORAGE);
  if(saved){
   const snapshot=JSON.parse(saved),local=validateRoadEdits(snapshot);
   Object.assign(state,local);
   // A newer authoritative owner scheme must be visible even to visitors
   // whose browser still holds edits from the preceding release.
   // Preserve their local roads/cuts; merge only missing baseline records.
   if(baselineData?.revision&&snapshot.baselineRevision!==baselineData.revision){
    Object.assign(state,reconcileRoadEdits(local,baselineData));
   }
  }else if(baselineData){Object.assign(state,validateRoadEdits(baselineData));}
  nextId=Math.max(1,...state.added.map(r=>Number(r.id.match(/\d+$/)?.[0]||0)+1));
 }catch{status.textContent='Сохранённая схема повреждена. Импортируйте её из JSON или очистите правки.';}
 if(!readOnly)button?.addEventListener('click',()=>setActive(!active));
 setMode('draw');
 return {get active(){return active;},setActive,undo,redo,finish,
  snapshot:clone,maskAt,roadLightRemoved,path:id=>{const r=joinedPaths.find(r=>r.id===id);return r?{id:r.id,width:r.width,points:r.points.map(p=>[...p])}:null;},stats:()=>({version:ROAD_EDITOR_VERSION,meshVersion:ROAD_EDIT_MESH_VERSION,readOnly,active,mode,
   added:state.added.length,hidden:state.hidden.length,baselineAdded:baselineData?.added.length||0,baselineHidden:baselineData?.hidden.length||0,baselineRevision:baselineData?.revision||null,styleVersion:ROAD_EDIT_STYLE_VERSION,
   draftPoints:draft.length,history:history.length,sourceRoadPaths:base.length,selectedRoads:routes.length,
   joinReport:joinReport.map(r=>({roadId:r.roadId,targetId:r.targetId,distance:r.distance})),
   mesh:geometryStats,physicalCuts:physicalCutStats,roadStyles:styleReport,sourceMaterialColors:Object.fromEntries(Object.entries(surfaceMaterials).map(([k,m])=>[k,'#'+m.color.getHexString()])),
   maskedMeshNames,mask:maskStats,maskApplied:tiles.some(t=>t.enabled.value===1),
   maskTiles:tiles.map(t=>({strokes:t.strokes,worldUnitsPerPixel:t.worldUnitsPerPixel,enabled:t.enabled.value===1}))})};
}
