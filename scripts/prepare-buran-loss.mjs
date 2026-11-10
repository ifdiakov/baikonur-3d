import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const marker='// BURAN_LOSS_INTEGRATION_V1';
const integration=`
// BURAN_LOSS_INTEGRATION_V1
async function requestBuranLoss(){
 const token=++buranLossRequest,button=document.getElementById('buranLossStart');
 button.disabled=true;button.textContent='Загрузка реконструкции…';
 try{
  if(!buranLoss){
   const {createBuranLoss}=await import('./src/buran-loss.js?v=20261110-v1');
   buranLoss=createBuranLoss({root:objects[mik112Index].g,model:mik112Exhibit,camera,controls:ctl,
    onBeforeStart:()=>{window.__MUSEUM_ONBOARDING?.cancel?.();cancelBuranRequest();puaLoading?.stop({releaseCamera:false});buranLanding?.stop({releaseCamera:false});energiaLaunch?.stop({releaseCamera:false});soyuzLaunch?.stop({releaseCamera:false});arrivalFlight?.stopFollowing({releaseCamera:false});groundTraffic?.stopFollowing();fly=false;setMobileMenu(false);},onStop:()=>updateLabels()});
  }
  if(token!==buranLossRequest)return false;
  return await buranLoss.start();
 }catch(error){button.title=error.message;button.textContent='Повторить: Гибель Бурана';console.warn('Buran loss reconstruction:',error);return false;}
 finally{button.disabled=false;if(!button.textContent.startsWith('Повторить'))button.textContent='Гибель Бурана';}
}
const buranLossStart=document.createElement('button');buranLossStart.id='buranLossStart';buranLossStart.type='button';buranLossStart.textContent='Гибель Бурана';buranLossStart.title='12 мая 2002 · историческая реконструкция обрушения МИК-112';buranLossStart.onclick=requestBuranLoss;document.getElementById('mik112Controls').append(buranLossStart);
`;
const outputs=new Map();
for(const file of ['index.html','museum.html','workshop.html']){
 let s=readFileSync(file,'utf8');if(s.includes(marker))continue;
 const old=" rocketExhibits.add('mik112-hall',{parent,...mounts.hall,modelId:'energia-buran',siteId:'pad-112'});";assert(s.includes(old),'Expected static hall exhibit in '+file);
 s=s.replace(old,' // The intact Energia–Buran hall display is removed. Historical payload is temporary and lazy-loaded by the loss reconstruction.');
 s=s.replace('let buranLanding=null;','let buranLanding=null;let buranLoss=null,buranLossRequest=0;');
 s=s.replace("document.getElementById('mik112Top').onclick=()=>focusMik112('top');","document.getElementById('mik112Top').onclick=()=>focusMik112('top');\n"+integration);
 for(const signature of ['function focus(i){','function showFlanks(){','function showOverview(topDown=false){','function setMuseumYear(year){','function openMuseumAction(action){']){assert(s.includes(signature));s=s.replace(signature,signature+"\n ++buranLossRequest;buranLoss?.stop({restoreCamera:false});");}
 s=s.replace('buranLanding.update(now);','buranLanding.update(now);buranLoss?.update(now);');
 s=s.replace('inspectMik112:focusMik112,','buranLoss:{start:requestBuranLoss,seek:t=>buranLoss?.seek(t),pause:()=>buranLoss?.pause(),resume:()=>buranLoss?.resume(),stop:()=>buranLoss?.stop(),view:v=>buranLoss?.setView(v),stats:()=>buranLoss?.stats()||{active:false,loaded:false}},inspectMik112:focusMik112,');
 s=s.replace('</head>','<link rel="stylesheet" href="./src/buran-loss.css?v=20261110-v1"></head>');
 s=s.replace('animate();startup.ready();',"if(new URLSearchParams(location.search).get('view')==='buran-loss'){openMenuSite('pad-112');focusMik112('all');}\nanimate();startup.ready();");
 assert(s.includes(marker)&&s.includes('buranLoss?.update(now)')&&!s.includes("rocketExhibits.add('mik112-hall'"));outputs.set(file,s);
}
// Apply only after every entrypoint has passed preflight validation.
for(const [file,contents]of outputs)writeFileSync(file,contents);
const heading='## 2026-11-10 · Гибель Бурана, МИК-112';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(heading))appendFileSync('PROJECT_CONTEXT.md','\n\n'+heading+'\nПостоянная связка Энергия—Буран убрана только из зала МИК-112 (mik112-hall). Модели на площадке110, двух ТУА и Юбилейном не удаляются. В карточке112 кнопка «Гибель Бурана» лениво загружает собственную сцену с временным историческим макетом,72плитами,39фермами,опорами и пылью; нет огня/взрыва или изображения погибших. Дата события12.05.2002;13мая — дата фотографий источника https://www.buran.ru/htm/foto7.htm. Движение частей и длительность — музейная интерпретация, не расчёт причин аварии. Архивные фотографии не копируются. Вечернее оформление сохраняется.\nПауза, продолжение, перемотка, повтор, общий вид/разрез/сверху; закрытие возвращает исходную геометрию, видимость ТУА и камеру. Ресурсы сцены освобождаются; общий GLB-источник не модифицируется. До нажатия сцена и модель внутри зала не создаются. Проверки: tests/buran-loss-source.mjs и tests/buran-loss-browser.mjs. Готовность фиксировать только после публичного прогона.\n');
const status='## 2026-11-10 · Редактор и реконструкция';
if(!readFileSync('docs/WORK_STATUS.md','utf8').includes(status))appendFileSync('docs/WORK_STATUS.md','\n\n'+status+'\nРедактор в духе Generals: запрос принят, но перетаскивание отдельных зданий, АД/ЖД и удаление ответвления до развилки с восстановлением обочины пока НЕ реализованы. Высотомер в рамках этой задачи также не проверен; не объявлять редактор готовым.\nМИК112: постоянный экспонат внутри зала удалён; кнопка и управляемая реконструкция обрушения реализованы. Статус публикации — только по public-report из tests/buran-loss-browser.mjs. Остальные незавершённые задачи сохраняются.\n');
console.log('BURAN_LOSS_ENTRYPOINTS_READY');
