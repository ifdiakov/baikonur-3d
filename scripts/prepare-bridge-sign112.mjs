import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const signFile='src/road-signs.js';let signs=readFileSync(signFile,'utf8');
if(!signs.includes('geographic-highway-snap-dirmentobe-v3')){
 const editSign=(a,b)=>{assert(signs.includes(a),'Missing sign anchor: '+a);signs=signs.replace(a,b);};
 editSign('geographic-highway-snap-dirmentobe-v2','geographic-highway-snap-dirmentobe-v3');
 editSign('let nearest=Infinity,closest=null,tangent=','let nearest=Infinity,closest=null,roadWidth=6,tangent=');
 editSign('nearest=d;closest=p;tangent.copy','nearest=d;closest=p;roadWidth=road.width||6;tangent.copy');
 editSign('if(spec.snapToHighway===true&&closest)group.position.copy(closest);',`if(spec.snapToHighway===true&&closest){
   group.position.copy(closest);
   const normal=new THREE.Vector3(-tangent.z,0,tangent.x);
   const side=requested.clone().sub(closest).dot(normal)<0?-1:1;
   group.position.addScaledVector(normal,side*(roadWidth/2+(spec.shoulderClearance??8)));
  }`);
 editSign('requestedPosition:requested.toArray(),roadCenterDistance:','requestedPosition:requested.toArray(),highwayPosition:closest?.toArray()??null,shoulderClearance:spec.shoulderClearance??8,roadWidth,roadCenterDistance:');
 editSign('locationReference:s.userData.locationReference}','locationReference:s.userData.locationReference,highwayPosition:s.userData.highwayPosition,shoulderClearance:s.userData.shoulderClearance,roadWidth:s.userData.roadWidth}');
 writeFileSync(signFile,signs);
}
const dataFile='data/road-signs.json',data=JSON.parse(readFileSync(dataFile,'utf8'));
data.version=3;data.east.shoulderClearance=8;data.placementStatus='Eastern sign explicitly anchored to the highway by Dirmentobe, outside the carriageway; automatic route-percent placement is disabled for this sign. Western sign unchanged.';
writeFileSync(dataFile,JSON.stringify(data,null,2)+'\n');
const marker='BRIDGE_SIGN112_V1';
for(const file of ['index.html','museum.html','workshop.html']){
 let s=readFileSync(file,'utf8');if(s.includes('// '+marker))continue;
 const edit=(a,b)=>{assert(s.includes(a),file+': missing '+a.slice(0,95));s=s.replace(a,b);};
 edit('</style>',`@media(min-width:1000px){body.workshop-mode:has(#workshopPanel:not([hidden])) #info:has(#tua112Controls:not([hidden])){right:350px!important;left:auto!important;top:205px!important;max-height:calc(100dvh - 310px)!important;width:min(360px,calc(100vw - 700px))!important}}\n</style>`);
 edit('import {MIK112,buildMik112,connectMik112Rails}',"// "+marker+"\nimport {applyBridgeGroundSurfaces} from './src/bridge-ground-surface.js?v=20261110-v1';\nimport {createMik112Cards,TUA112_CARD_ID} from './src/mik112-cards.js?v=20261110-v1';\nimport {MIK112,buildMik112,connectMik112Rails}");
 edit("let mik112Exhibit=null,mik112Rail=null,tuaExhibit=null,mik112DetailView='all';","let mik112Exhibit=null,mik112Rail=null,tuaExhibit=null,mik112DetailView='all';\nlet refreshMik112Picking=()=>{};");
 edit(' for(const mesh of current)if(!clickable.includes(mesh))clickable.push(mesh);',' for(const mesh of current)if(!clickable.includes(mesh))clickable.push(mesh);\n refreshMik112Picking();');
 edit("   for(const key of ['roads','rails'])layers[key].add(...result.roots[key]);","   for(const key of ['roads','rails'])layers[key].add(...result.roots[key]);\n   for(const root of result.roots.roads)applyBridgeGroundSurfaces(root,{referenceMaterial:satelliteGround.material,steppeSurface,registerGroundSurface,width:W*S,height:H*S});");
 edit("for(const direction of ['west','east']){\n const road=transport.roadPaths()","for(const direction of ['west','east']){\n // Explicit settlement anchors must not be overwritten by a percentage of route length.\n if(roadSignData[direction].snapToHighway===true)continue;\n const road=transport.roadPaths()");
 const start=s.indexOf('for(const bridge of transport.bridgeObjects())bridge.traverse(mesh=>{'),end=s.indexOf('\nscene.userData.syntheticGroundReady=',start);assert(start>=0&&end>start);
 s=s.slice(0,start)+"for(const bridge of transport.bridgeObjects())applyBridgeGroundSurfaces(bridge,{referenceMaterial:satelliteGround.material,steppeSurface,registerGroundSurface,width:W*S,height:H*S});"+s.slice(end);
 edit('const cardObjects=[...objects,...stationObjects,...mzkSdiCards];',`const mik112Cards=createMik112Cards(objects[mik112Index],mik112Exhibit);
const cardObjects=[...objects,...stationObjects,...mzkSdiCards,...mik112Cards.cards];
const tua112Index=cardObjects.findIndex(o=>o.record.id===TUA112_CARD_ID);
refreshMik112Picking=()=>mik112Cards.bindPicking(tua112Index);
refreshMik112Picking();
const pairedCard=o=>Boolean(o.component||o.calloutKind);
const cardSide=o=>o.calloutSide??(o.component==='mzk'?-1:1);`);
 edit('mini.textContent=o.component?o.name:',"mini.textContent=o.calloutKind?o.record.titleShort:o.component?o.name:");
 edit('const badgeText=o.component?o.name:',"const badgeText=o.calloutKind==='tua'?'ТУА · 112':o.calloutKind==='mik112'?'112':o.component?o.name:");
 s=s.replaceAll('cardObjects.filter(o=>!o.component)',"cardObjects.filter(o=>!o.component&&o.calloutKind!=='tua')");
 edit('function displaySiteName(o){','function displaySiteName(o){\n if(o.mapTitle)return o.mapTitle;');
 edit('function placeBuildingCard(el,p,occupied,component){','function placeBuildingCard(el,p,occupied,side){');
 edit("(component==='mzk'?-126:126)",'side*126');
 edit('if(clash&&!cardObjects[a.l.i].component)','if(clash&&!pairedCard(cardObjects[a.l.i]))');
 edit("const shift=cardObjects[a.l.i].component==='mzk'?-100:100;","const shift=cardSide(cardObjects[a.l.i])*100;");
 edit('[ukssIndex,mik112Index,krayniyIndex].includes(currentObject)','[ukssIndex,mik112Index,tua112Index,krayniyIndex].includes(currentObject)');
 edit('Number(!!cardObjects[b.d.i].component)-Number(!!cardObjects[a.d.i].component)','Number(pairedCard(cardObjects[b.d.i]))-Number(pairedCard(cardObjects[a.d.i]))');
 edit("(cardObjects[a.d.i].component==='mzk'?-126:cardObjects[a.d.i].component==='sdi'?126:0)",'(pairedCard(cardObjects[a.d.i])?cardSide(cardObjects[a.d.i])*126:0)');
 edit('cardObjects[a.d.i].component?placeBuildingCard(el,a.p,used,cardObjects[a.d.i].component)','pairedCard(cardObjects[a.d.i])?placeBuildingCard(el,a.p,used,cardSide(cardObjects[a.d.i]))');
 s=s.replaceAll('!cardObjects[a.d.i].component','!pairedCard(cardObjects[a.d.i])');
 edit("currentObject===mik112Index&&tuaExhibit?.metadata.status==='ready'","[mik112Index,tua112Index].includes(currentObject)&&tuaExhibit?.metadata.status==='ready'");
 edit(' tuaRocketControls?.setActive(active);',` tuaRocketControls?.setActive(active&&currentObject===tua112Index);
 const separateTuaControls=document.getElementById('tua112Controls');if(separateTuaControls){const shown=!currentResearch&&currentObject===tua112Index;separateTuaControls.hidden=!shown;separateTuaControls.style.display=shown?'flex':'none';}`);
 edit('syncModelCard(o.isStation?',"syncModelCard(o.calloutKind==='tua'?['tua']:o.isStation?");
 edit("rocketExhibits.prioritizeSite(o.component?'pad-112a':r.id)","rocketExhibits.prioritizeSite(o.calloutKind==='tua'?'pad-112':o.component?'pad-112a':r.id)");
 edit(" }else if(i===mik112Index){\n  focusMik112(new URLSearchParams(location.search).get('view')==='tua'?'tua':'all');"," }else if(i===mik112Index){\n  focusMik112('all');\n }else if(i===tua112Index){\n  startup.promote('tua-detailed-model',100);focusMik112('tua');");
 edit(' tuaRocketControls?.sync();syncRocketLoadStatus();',' refreshMik112Picking();tuaRocketControls?.sync();syncRocketLoadStatus();');
 edit(' document.getElementById("mik112Controls").hidden=i!==mik112Index;',` document.getElementById("mik112Controls").hidden=i!==mik112Index;
 let tuaViews=document.getElementById('tua112Controls');
 if(!tuaViews){tuaViews=document.createElement('div');tuaViews.id='tua112Controls';tuaViews.className='buttons';tuaViews.style.cssText='gap:8px;margin:10px 0;flex-wrap:wrap';document.getElementById('mik112Controls').after(tuaViews);
  for(const [label,action]of [['Кузнечики ближе',()=>focusMik112('tua')],['МИК-112 →',()=>focus(mik112Index)]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;tuaViews.append(b);}
 }
 tuaViews.hidden=i!==tua112Index;tuaViews.style.display=tuaViews.hidden?'none':'flex';`);
 edit("document.getElementById('mik112Tua').onclick=()=>focusMik112('tua');","document.getElementById('mik112Tua').onclick=()=>focus(tua112Index);");
 edit("if(new URLSearchParams(location.search).get('view')==='tua'){openMenuSite('pad-112');focusMik112('tua');showRocketKnowledge('tua','pad-112',false);}","if(new URLSearchParams(location.search).get('view')==='tua')openMenuSite(TUA112_CARD_ID);");
 s=s.replace(/road-signs\.js\?v=[^'"]+/g,'road-signs.js?v=20261110-dirmentobe-v3');
 s=s.replace(/\.\/data\/road-signs\.json(?:\?[^'"]*)?/g,'./data/road-signs.json?v=20261110-dirmentobe-v3');
 writeFileSync(file,s);
}
const heading='## 2026-11-10 · Мост, указатель Дерментюбе и две плашки 112';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(heading))appendFileSync('PROJECT_CONTEXT.md','\n\n'+heading+'\nНасыпь моста: фактические meshes с bridgeApproachTerrain приходят из Worker без shader hooks. Общая спутниковая текстура, world-XZ UV, микродеталь и текущий вечерний цвет применяются при установке подробных roots; прежний проход по начальному placeholder был недостаточен. Геометрия, профиль насыпи, проезды и транспорт не изменены.\nПравый/восточный указатель: явно заданная привязка у Дирментобе больше не заменяется процентной позицией на трассе. Ближайшее сечение r-south-east и отступ за край полотна; левый указатель, надписи, обе стороны и свет сохранены.\n112: самостоятельные МИК-112 и Кузнечики. Плашка транспортёров привязана к существующей группе, индекс выбора обновляется после отложенной загрузки. В физические footprint/DEM расчёты информационная плашка повторно не добавляется. Карточка МИК сохраняет Гибель Бурана; карточка ТУА — свой просмотр и переход обратно. Модели не дублируются.\nПриёмка: tests/bridge-sign112-source.mjs и tests/bridge-sign112-browser.mjs; фактические опубликованные hash и desktop/mobile/workshop. Мобильные проверки — эмуляция. До public-report passed:true не объявлять публикацию принятой. Остальные незавершённые задачи не закрывать этим изменением.\n');
if(!readFileSync('docs/WORK_STATUS.md','utf8').includes(heading))appendFileSync('docs/WORK_STATUS.md','\n\n'+heading+'\nРеализованы три локальных изменения без переделки сцены. Статус завершения определяется public-report.json из qa-bridge-sign112; исходные проверки не заменяют публичную проверку. Предыдущие задачи сохранены.\n');
console.log('BRIDGE_SIGN112_ENTRYPOINTS_READY');
