import {readFile,writeFile} from 'node:fs/promises';
let html=await readFile('index.html','utf8');
if(!html.includes('MUSEUM_WORKSHOP_SPLIT_V1')){
 html=html.replace("try{\nconst attribution=",`// MUSEUM_WORKSHOP_SPLIT_V1: one canonical full scene, two generated entrypoints.
const IS_WORKSHOP=location.pathname.endsWith('/workshop.html');
const WORKSHOP_BUILD=new URLSearchParams(location.search).get('workshopBuild')==='1';
const {validateWorkshopState,applyWorkshopObjects}=await import('./src/workshop-state.js?v=split-v1');
try{
const attribution=`);
 const marker="const ownerRoadEditsReady=startup.fetchJSON('./data/road-edits-authoritative-20261103.json?v=20261108-no-road-105',{optional:true});";
 if(!html.includes(marker))throw Error('Owner road loader changed: rebase split implementation');
 html=html.replace(marker,`const publishedWorkshopReady=startup.fetchJSON('./data/workshop-published.json?v=split-v1',{optional:true}).then(data=>validateWorkshopState(data||{version:1,objects:{}}));
const ownerRoadEditsReady=startup.fetchJSON('./data/road-edits-authoritative-20261103.json?v=20261108-no-road-105',{optional:true}).then(async roads=>(await publishedWorkshopReady).roadEdits||roads);`);
 html=html.replace('roads:transport.editableRoadPaths(),button:null,readOnly:true,','roads:transport.editableRoadPaths(),button:null,readOnly:!IS_WORKSHOP||WORKSHOP_BUILD,');
 html=html.replace('window.__BAIKONUR_QA={',`const publishedWorkshop=await publishedWorkshopReady;
applyWorkshopObjects(objects,publishedWorkshop);
if(IS_WORKSHOP&&!WORKSHOP_BUILD){
 const style=document.createElement('link');style.rel='stylesheet';style.href='./src/workshop-panel.css?v=split-v1';document.head.append(style);
 const {installWorkshop}=await import('./src/workshop-panel.js?v=split-v1');
 installWorkshop({scene,objects,camera,controls:ctl,canvas:renderer.domElement,roadEditor,transport,terrainHeightAt:museumTerrainHeightAt,altimeter:cameraAltitude,coordinateGrid,published:publishedWorkshop});
}
window.__BAIKONUR_QA={`);
 await writeFile('index.html',html);
}
let workshop=html.replace(/<title>[^<]+<\/title>/,'<title>Мастерская — Байконур 3D</title>');
await writeFile('workshop.html',workshop);
for(const file of ['index.html','workshop.html']){let source=await readFile(file,'utf8');source=source.replace('eveningScene?.refreshRoadEditor(roadEditor);}', 'eveningScene?.refreshRoadEditor(roadEditor);window.__MUSEUM_WORKSHOP?.roadsChanged?.();}');await writeFile(file,source);}
let editor=await readFile('src/road-editor.js','utf8');
if(!editor.includes('replaceSnapshot(data)')){
 editor=editor.replace('snapshot:clone,maskAt,roadLightRemoved,','replaceSnapshot(data){const valid=validateRoadEdits(data);checkpoint();Object.assign(state,valid);draft=[];render();return clone();},snapshot:clone,maskAt,roadLightRemoved,');
 await writeFile('src/road-editor.js',editor);
}
console.log('WORKSHOP_ENTRY_READY');
let context=await readFile('PROJECT_CONTEXT.md','utf8');
if(!context.includes('## Разделение музея и мастерской — 09.11.2026')){
 context+='\n\n## Разделение музея и мастерской — 09.11.2026\n\nДва входа: museum.html — облегчённый публичный просмотрщик; workshop.html — мастерская с высотомером, координатами, размещением и высотой объектов, правками точек дорог. Общий источник опубликованных правок: data/workshop-published.json. Черновики сохраняются в браузере; публичная запись требует GitHub-аутентификации. Статический URL мастерской не является защищённой админкой. Посетителю выдаются подготовленные модели и рисунок дорог на земле, детали загружаются по запросу, кеш ограничен и освобождается. Полные реконструкции и богатые карточки доступны отдельным загружаемым по запросу окном старой сцены. Сборка scripts/build-public-scene.mjs, проверки tests/museum-split-browser.mjs; скорость CI с программным WebGL нельзя выдавать за реальное устройство. Полный протокол в docs/museum-workshop-split.md.\n\nПосле каждой итерации обязателен понятный пользователю отчёт по четырём ролям: 3D-разработчик, разработчик интерфейса, специалист по оптимизации моделей, тестировщик производительности. Для каждой: что изменилось и что ещё улучшить. Не заявлять независимых агентов, если проверка проведена одной моделью. Не объявлять прежние дефекты перекрёстков и 113 исправленными только из-за разделения входов.\n';
 await writeFile('PROJECT_CONTEXT.md',context);
}
