import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const version='20261111-share-v1';
const bridge=`// CARD_SHARING_V1: public links only; site and story state come from the real cards.
let sharedEventSelection=null;
function shareCardTarget(index){const o=cardObjects[index];return o?{kind:'site',id:o.record.id,title:o.record.titleFull||o.mapTitle||o.name}:null;}
function shareInfoTarget(){
 if(sharedEventSelection)return {...sharedEventSelection,title:document.getElementById('title').textContent};
 if(activeKnowledge)return {kind:activeKnowledge.kind==='story'?'story':'rocket',id:activeKnowledge.id,title:document.getElementById('title').textContent};
 if(currentResearch?.kind==='bridge')return {kind:'view',id:'south-interchange',title:'Мост и южная развязка'};
 if(currentResearch?.id)return {kind:'research',id:currentResearch.id,title:currentResearch.title};
 return shareCardTarget(currentObject);
}
async function openSharedTarget(target){
 const {kind,id}=target;
 if(kind==='site')return openMenuSite(id);
 if(kind==='model')return Object.hasOwn(MODEL_CATALOG,id)?modelInspector.open([id]):false;
 if(kind==='rocket'){
  if(!museumKnowledge.getRocket(id))return false;
  const site=({soyuz:'pad-1',energia:'pad-112','energia-m':'pad-112','energia-polyus':'pad-250','energia-buran':'pad-110',buran:'pad-110',tua:'tua-112',proton:'pad-81',zenit:'pad-45'})[id];
  return !!site&&showRocketKnowledge(id,site);
 }
 if(kind==='story')return showArchiveStory(id);
 if(kind==='history')return SHARE_HISTORY_MENU.some(item=>item.id===id)?openComplexHistory(id):false;
 if(kind==='view')return id==='south-interchange'?focusInterchange('bridge'):false;
 if(kind==='research'){startup.promote?.('museum-history',90);await historicalDataReady;const item=researchObjects.find(item=>item.id===id);if(!item)return false;showResearch(item);return true;}
 if(kind==='event'){
  const event=SHARE_EVENTS[id];if(!event||!openMenuSite(event.site))return false;
  // A shared event opens its card, not an unsolicited animation or sound.
  sharedEventSelection={kind:'event',id};document.getElementById('title').textContent=event.title;
  if(event.button){const button=document.getElementById(event.button);if(button){button.hidden=false;button.style.display='';button.focus({preventScroll:true});}}
  return true;
 }
 return false;
}
`;
const install=`const cardSharing=installMuseumSharing({cardTarget:shareCardTarget,infoTarget:shareInfoTarget,openTarget:openSharedTarget,
 historyTarget:()=>({kind:'history',id:complexHistoryPanel?.stats().current||'purpose',title:document.querySelector('.complex-history__title')?.textContent||'История космодрома'}),
 soyuzSite:()=>soyuzLaunch?.stats().siteId});
window.__MUSEUM_SHARE={...cardSharing,open:openSharedTarget,targets:()=>cardObjects.map((_,i)=>shareCardTarget(i))};
`;
for(const file of ['index.html','museum.html','workshop.html']){
 let text=await readFile(file,'utf8');if(!text.includes('// CARD_SHARING_V1:')){
  assert(text.includes('animate();startup.ready();'));
  text=text.replace('</head>',`<link rel="stylesheet" href="./src/card-share.css?v=${version}"></head>`);
  text=text.replace("import * as THREE from 'three';",`import {installMuseumSharing,SHARE_EVENTS} from './src/card-share.js?v=${version}';\nimport {COMPLEX_HISTORY_MENU as SHARE_HISTORY_MENU} from './src/complex-history-menu.js?v=20261103-lean-startup-v1';\nimport * as THREE from 'three';`);
  if(!text.includes('import {installMuseumSharing'))text=text.replace('import * as THREE from "three";',`import {installMuseumSharing,SHARE_EVENTS} from './src/card-share.js?v=${version}';\nimport {COMPLEX_HISTORY_MENU as SHARE_HISTORY_MENU} from './src/complex-history-menu.js?v=20261103-lean-startup-v1';\nimport * as THREE from "three";`);
  assert(text.includes('import {installMuseumSharing'));
  text=text.replace('function focus(i){',bridge+'\nfunction focus(i){\n sharedEventSelection=null;');
  for(const marker of ['function showResearch(item){','function showRocketKnowledge(id,siteId,move=true){','function showArchiveStory(id){',"function focusInterchange(view='bridge'){"]){assert(text.includes(marker));text=text.replace(marker,marker+'\n sharedEventSelection=null;');}
  text=text.replace('animate();startup.ready();',install+'animate();startup.ready();');
  text=text.replaceAll('model-inspector.js?v=20261108-rd180-v1','model-inspector.js?v='+version);
  await writeFile(file,text);
 }
}
{
 const path='src/model-viewer.js';let s=await readFile(path,'utf8');if(!s.includes('createShareButton')){
  s=`import {createShareButton} from './card-share.js?v=${version}';\n`+s;
  s=s.replace('function renderIntro(id){',"document.getElementById('modelSubtitle').after(createShareButton(()=>({kind:'model',id:current,title:MODEL_CATALOG[current].title})));\nfunction renderIntro(id){");await writeFile(path,s);
 }
}
{
 const path='src/model-inspector.js';let s=await readFile(path,'utf8');
 s=s.replace("frame.setAttribute('allow','fullscreen')","frame.setAttribute('allow','fullscreen; web-share; clipboard-write')");
 s=s.replace("MODEL_VIEWER_VERSION+'-autorotate-v2'","MODEL_VIEWER_VERSION+'-autorotate-v2-share-v1'");await writeFile(path,s);
}
{
 const path='workshop/model.html';let s=await readFile(path,'utf8');if(!s.includes('card-share.css'))s=s.replace('</head>',`<link rel="stylesheet" href="../src/card-share.css?v=${version}"></head>`);
 s=s.replace('model-viewer.js?v=20261108-site45-choice-v1','model-viewer.js?v='+version);await writeFile(path,s);
}
{
 const path='encyclopedia.html';let s=await readFile(path,'utf8');if(!s.includes('createShareButton')){
  s=s.replace('</head>',`<link rel="stylesheet" href="./src/card-share.css?v=${version}"></head>`);
  const scriptTag=s.includes('<script type="module">')?'<script type="module">':'<script>';
  assert(s.includes(scriptTag),'Encyclopedia application script missing');
  s=s.replace(scriptTag,`<script type="module">\nimport {createShareButton} from './src/card-share.js?v=${version}';`);
  assert(s.includes('b.onclick=()=>open(x.id);cards.append(b);'));
  s=s.replace('b.onclick=()=>open(x.id);cards.append(b);',`b.onclick=()=>open(x.id);const wrapper=el('div','encyclopedia-card-wrap');wrapper.append(b,createShareButton({kind:'article',id:x.id,title:x.name}));cards.append(wrapper);`);
  s=s.replace('appendMediaCredit(detail,x);',"detail.append(createShareButton({kind:'article',id:x.id,title:x.name}));\n appendMediaCredit(detail,x);");await writeFile(path,s);
 }
}
// The encyclopedia originally uses a classic script. Its share import must be
// a real module binding, including previously generated candidate versions.
{
 const path='encyclopedia.html';let s=await readFile(path,'utf8');
 if(!s.includes('import {createShareButton}')){
  assert(s.includes('<script>'),'Encyclopedia classic script not found');
  s=s.replace('<script>',`<script type="module">\nimport {createShareButton} from './src/card-share.js?v=${version}';`);await writeFile(path,s);
 }
}
assert.equal(await readFile('index.html','utf8'),await readFile('museum.html','utf8'));
const note='\n\n## 2026-11-11 · Поделиться карточкой\nПо образцу стрелки владельца добавлен собственный векторный значок «Поделиться». Кнопки есть в обеих плашках каждого объекта карты, полной карточке, окне 3D-техники, событиях/реконструкциях, истории и статьях энциклопедии. Ссылки ведут на конкретный публичный объект museum.rockettrip.space, без editor/draft/диагностических параметров; МИК/ТУА и МЗК/СДИ имеют разные адреса. Русские буквы в идентификаторах площадок сохраняются без транслитерации. Ссылка события открывает карточку без самозапуска анимации. Web Share вызывается только нажатием; fallback — копирование, затем диалог с выделяемой ссылкой. Отмена не выдаёт ложное подтверждение и не копирует. Нет внешних share-сервисов/трекинга, геометрия, свет, транспорт и черновик не меняются. Модуль не выполняет покадровую работу. Статус завершения — только по qa-card-share/public-report.json; source gate не заменяет публичную проверку.\n';
for(const file of ['PROJECT_CONTEXT.md','docs/WORK_STATUS.md'])if(!(await readFile(file,'utf8')).includes('## 2026-11-11 · Поделиться карточкой'))await appendFile(file,note);
console.log('CARD_SHARING_INTEGRATED');
