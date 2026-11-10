import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const marker='MIK112_COLLAPSE_V1';
const integration=`
// MIK112_COLLAPSE_V1: the intact hall exhibit exists ONLY during the requested historical scene.
let mik112Collapse=null,mik112CollapseGeneration=0;
function cancelMik112Collapse(){++mik112CollapseGeneration;mik112Collapse?.stop({restoreCamera:false});const b=document.getElementById('mik112Collapse');if(b){b.disabled=false;b.textContent='Гибель Бурана';}}
async function requestMik112Collapse(){
 const generation=++mik112CollapseGeneration,button=document.getElementById('mik112Collapse');
 if(button){button.disabled=true;button.textContent='Готовим реконструкцию…';}
 try{
  const entry=rocketExhibits.get('site110');if(!entry)throw new Error('Модель комплекса недоступна');
  rocketExhibits.prioritizeSite('pad-110');
  if(entry.status==='error')await rocketExhibits.setModel('site110','energia-buran');else await entry.pending;
  if(generation!==mik112CollapseGeneration)return false;
  if(entry.status!=='ready'||!entry.holder.children[0])throw new Error('Модель не загрузилась. Нажмите ещё раз.');
  const {createMik112Collapse}=await import('./src/mik112-collapse.js?v=20261110-v1');
  if(generation!==mik112CollapseGeneration)return false;
  if(!mik112Collapse)mik112Collapse=createMik112Collapse({root:objects[mik112Index].g,exhibit:mik112Exhibit,camera,controls:ctl,renderer,sourceModel:entry.holder.children[0],onStart(){
   cancelBuranRequest();++soyuzRequestGeneration;soyuzLaunch?.stop({releaseCamera:false});++energiaStartGeneration;energiaLaunch?.stop({releaseCamera:false});puaLoading?.stop({releaseCamera:false});buranLanding?.stop({releaseCamera:false});arrivalFlight?.stopFollowing();groundTraffic?.stopFollowing();fly=false;keys.clear();
   if(roadEditor?.active)roadEditor.setActive(false);if(lightingEditor?.active)lightingEditor.setActive(false);
  },onStop(){updateLabels();}});
  return mik112Collapse.start();
 }catch(error){if(button)button.textContent='Повторить · '+error.message;console.warn('MIK112 reconstruction:',error.message);return false;}
 finally{if(button&&generation===mik112CollapseGeneration){button.disabled=false;if(mik112Collapse?.isActive())button.textContent='Гибель Бурана';}}
}
document.getElementById('mik112Collapse').onclick=requestMik112Collapse;
`;
for(const path of ['index.html','museum.html','workshop.html']){
 let s=readFileSync(path,'utf8');if(s.includes(marker))continue;
 const registration=" rocketExhibits.add('mik112-hall',{parent,...mounts.hall,modelId:'energia-buran',siteId:'pad-112'});";
 assert(s.includes(registration),path+' hall placement missing');s=s.replace(registration,' // No permanent Energia–Buran in the ruined hall: historical content is lazy.');
 const button='<button id="mik112Top" type="button">Сверху</button>';
 assert(s.includes(button));s=s.replace(button,button+'<button id="mik112Collapse" type="button">Гибель Бурана</button>');
 const anchor="let currentObject=0;";assert(s.includes(anchor));s=s.replace(anchor,integration+'\n'+anchor);
 for(const signature of ['function showFlanks(){','function focus(i){','function showOverview(topDown=false){']){assert(s.includes(signature));s=s.replace(signature,signature+'\n cancelMik112Collapse();');}
 s=s.replace('const modelInspector=installModelInspector({onOpen(){','const modelInspector=installModelInspector({onOpen(){\n cancelMik112Collapse();');
 s=s.replace('buranLanding.update(now);energiaLaunch?.update(now);soyuzLaunch?.update(now);','buranLanding.update(now);energiaLaunch?.update(now);soyuzLaunch?.update(now);mik112Collapse?.update(now);');
 s=s.replace("!document.body.classList.contains('buran-landing-active'))applyOverviewFrame", "!document.body.classList.contains('buran-landing-active')&&!mik112Collapse?.isActive())applyOverviewFrame");
 s=s.replace('window.__BAIKONUR_QA={','window.__BAIKONUR_QA={mik112Collapse:{start:requestMik112Collapse,stop:()=>mik112Collapse?.stop(),seek:t=>mik112Collapse?.seek(t),play:()=>mik112Collapse?.play(),pause:()=>mik112Collapse?.pause(),update:t=>mik112Collapse?.update(t),stats:()=>mik112Collapse?.stats()||{loaded:false,active:false,defaultExhibitRemoved:!rocketExhibits.get(\'mik112-hall\')}},');
 s=s.replace("./src/mik112.js?v=20261102-site2-photo-v3","./src/mik112.js?v=20261110-collapse-v1");
 s=s.replace("if(new URLSearchParams(location.search).get('view')==='gagarin')", "if(new URLSearchParams(location.search).get('view')==='buran-loss')openMenuSite('pad-112');\nif(new URLSearchParams(location.search).get('view')==='gagarin')");
 writeFileSync(path,s);
}
{
 const path='src/mik112.js';let s=readFileSync(path,'utf8');
 if(!s.includes('reconstructionCradles')){
  const anchor=' // Two simple museum cradles';assert(s.includes(anchor));s=s.replace(anchor," const reconstructionCradles=new THREE.Group();reconstructionCradles.name='Исторические ложементы · только в реконструкции';reconstructionCradles.visible=false;root.add(reconstructionCradles);\n"+anchor);
  for(const tag of ['museum-assembly-cradle-base','museum-assembly-cradle-support','museum-assembly-cradle']){const needle="'"+tag+"');";assert(s.includes(needle));s=s.replace(needle,"'"+tag+"',reconstructionCradles);");}
  s=s.replace('return {stats:()=>info,setYear,rocketMounts,','return {reconstructionCradles,stats:()=>info,setYear,rocketMounts,');writeFileSync(path,s);
 }
}
const heading='## 2026-11-10 · «Гибель Бурана» в карточке площадки 112';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(heading))appendFileSync('PROJECT_CONTEXT.md','\n\n'+heading+'\nПо просьбе владельца постоянная связка «Энергия—Буран» внутри МИК‑112 удалена; внешние ТУА, площадка110 и МЗК/СДИ не менялись. Ложементы скрыты на обычной карте. Кнопка «Гибель Бурана» открывает отдельную ленивую реконструкцию в той же сцене. Три высоких пролёта, условное падение секций и пыль, 32сек, пауза, перемотка, повтор, ракурсы и разрез. При выходе восстановлены камера, текущая крыша и транспортёры; лётный корабль вновь отсутствует в обычном МИКе.\nИсточник: https://buran.ru/htm/foto7.htm. Дата события12.05.2002;13мая относится к фотоматериалам/заголовку. Не воспроизводить спорные версии причин как установленный факт. Порядок и темп разрушения, расположение обломков условны; вечер — оформление музея, не время события. Используется существующий общий музейный GLB, не точная компоновка11Ф36‑МД. Фото не копировать без разрешения. Без огня и изображения пострадавших.\nАдминский builder дорог/ЖД/отдельных зданий, удаление ветки до развилки и восстановление стыка: отдельная незавершённая задача, не выдавать за готовую. Приёмка сцены — tests/mik112-collapse-source.mjs и tests/mik112-collapse-browser.mjs; завершение только после проверки публичной версии.\n');
const status='## 2026-11-10 · Текущие запросы';
if(!readFileSync('docs/WORK_STATUS.md','utf8').includes(status))appendFileSync('docs/WORK_STATUS.md','\n\n'+status+'\n- Редактор в стиле Generals: анализ начат, реализация НЕ завершена. Требуются перемещение отдельных зданий/АД/ЖД, удаление ветви до развилки с восстановлением стыка/обочины, высотомер.\n- МИК112: постоянный экспонат убран; «Гибель Бурана» — первая условная интерактивная реконструкция. Статус публикации проверять отдельно по публичному отчёту, не закрывать одним коммитом.\n');
console.log('MIK112_COLLAPSE_INTEGRATED');
