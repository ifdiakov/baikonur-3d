import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const marker='20261110-network-v1';
const publicBefore=await Promise.all(['index.html','museum.html'].map(f=>readFile(f)));
// Selection overlays belong after transparent ground in Three's render queue.
let ui=await readFile('src/workshop-network-editor.js','utf8');
for(const color of ['0xffbf6a','0xff6259','0xffd18b'])ui=ui.replace('color:'+color+',depthTest:false}', 'color:'+color+',depthTest:false,transparent:true,depthWrite:false}');
await writeFile('src/workshop-network-editor.js',ui);
let panel=await readFile('src/workshop-panel.js','utf8');
if(!panel.includes('installNetworkEditor')){
 panel=panel.replace("from './workshop-state.js';","from './workshop-state-network.js?v="+marker+"';\nimport {installNetworkEditor} from './workshop-network-editor.js?v="+marker+"';");
 panel=panel.replace('function snapshot(){return {version:1,objects:clone(state.objects),roadEdits:roadEditor.snapshot()};}', 'let network=null,restoring=false;\n function snapshot(){return {version:1,objects:clone(state.objects),roadEdits:roadEditor.snapshot(),railEdits:network?.railSnapshot()??state.railEdits};}');
 panel=panel.replace('function save(){try','function save(){if(restoring)return;try');
 panel=panel.replace('function restore(next){state=','function restore(next){restoring=true;try{state=');
 panel=panel.replace('if(state.roadEdits)roadEditor.replaceSnapshot(state.roadEdits);fields();save();}', 'if(state.roadEdits)roadEditor.replaceSnapshot(state.roadEdits);network?.restoreRails(state.railEdits);fields();}finally{restoring=false;}save();}');
 panel=panel.replace("$('wsMove').onclick=()=>{moveMode","$('wsMove').onclick=()=>{network?.setMode(null);moveMode");
 panel=panel.replace("$('wsRoadDraw').onclick=()=>roadEditor.setActive(!roadEditor.active);","$('wsRoadDraw').onclick=()=>network?.setMode('road:draw');");
 panel=panel.replace('<summary>Дороги, узлы и перекрёстки</summary>','<summary>Точные координаты АД</summary>');
 panel=panel.replace('state.objects,roadEdits:next}', 'state.objects,roadEdits:next,railEdits:network?.railSnapshot()}');
 panel=panel.replace('fillObjects();selectRoad();',"fillObjects();selectRoad();\n network=installNetworkEditor({scene,camera,controls,canvas,roadEditor,transport,terrainHeightAt,panel,initialRails:state.railEdits,checkpoint,save,onUndo:()=>$('wsUndo').click(),onRedo:()=>$('wsRedo').click()});\n network.railSnapshot();");
 panel=panel.replace('roadsChanged:()=>save(),','roadsChanged:()=>save(),networkChangedRoots:()=>network?.attach(),');
 panel=panel.replace('roadEditing:true,localDraft','roadEditing:true,railEditing:true,network:network?.stats(),localDraft');
 panel=panel.replace('Сборка создаст новое покрытие и модели;', 'Экспорт содержит АД и ЖД. Публикация схемы требует отдельной проверки; ');
 await writeFile('src/workshop-panel.js',panel);
}
assert(panel.includes('network=installNetworkEditor')&&panel.includes('railEdits:network?.railSnapshot()'),'Network integration missing');
let html=await readFile('workshop.html','utf8');
html=html.replace('./src/workshop-panel.js?v=split-v1','./src/workshop-panel.js?v='+marker).replace('./src/workshop-panel.css?v=split-v4','./src/workshop-panel.css?v='+marker);
if(!html.includes('window.__MUSEUM_WORKSHOP?.networkChangedRoots?.()'))html=html.replace("for(const key of ['roads','rails'])layers[key].add(...result.roots[key]);", "for(const key of ['roads','rails'])layers[key].add(...result.roots[key]);\n   window.__MUSEUM_WORKSHOP?.networkChangedRoots?.();");
html=html.replace('Boolean(roadEditor?.active)||Boolean(energiaLaunch','Boolean(roadEditor?.active)||Boolean(window.__MUSEUM_NETWORK_EDITOR?.active)||Boolean(energiaLaunch').replace('&&!roadEditor?.active&&','&&!roadEditor?.active&&!window.__MUSEUM_NETWORK_EDITOR?.active&&');
// The second replacement must not be applied twice.
html=html.replaceAll('&&!window.__MUSEUM_NETWORK_EDITOR?.active&&!window.__MUSEUM_NETWORK_EDITOR?.active&&','&&!window.__MUSEUM_NETWORK_EDITOR?.active&&');
assert(html.includes('./src/workshop-panel.js?v='+marker));await writeFile('workshop.html',html);
const heading='## 2026-11-10 · Редактор АД и ЖД';
for(const path of ['PROJECT_CONTEXT.md','docs/WORK_STATUS.md'])if(!(await readFile(path,'utf8')).includes(heading))await appendFile(path,'\n\n'+heading+'\nЧетыре явных инструмента в админке: проложить/удалить АД и ЖД. Точки мышью, привязка к однотипной сети, предпросмотр, Enter/Backspace/Escape. Удаление выделяет топологическую ветку до ближайших развилок или тупика, включая переходы между последовательными исходными OSM-фрагментами; перед применением красный предпросмотр и подтверждение. Пересечения на разных уровнях не считаются развилками. АД используют прежнее полотно и обочину; ЖД — метрику RAIL_PROFILE, балласт/шпалы/стальные рельсы, плавный путь.\nЖД имеют отдельный admin-only слой изменений, включая удаление из реальных merged-геометрий и LOD. Вертикальные грани и атрибуты сохранены; соседний проходящий путь защищён у развилки. При поздней загрузке Worker текущие удаления повторно применяются. Undo/redo, локальное сохранение, перезагрузка, JSON-экспорт/импорт АД+ЖД совместимы со старыми черновиками. Высотомер и редактирование объектов сохранены. Публичный музей, его дороги, свет, туман и исходные данные не изменяются черновиком. Новые пути не перепрокладывают автоматически маршруты движущихся машин/поезда; публикация пользовательского JSON требует отдельной проверки и интеграции, не кнопка автоматической записи в GitHub.\nСтатус завершения определяется qa-workshop-network/public-report.json; не объявлять проверку пройденной до фактического прогона. Новый редактор отдельных зданий/перетаскивание — другая незавершённая задача.\n');
for(const [i,f]of ['index.html','museum.html'].entries())assert((await readFile(f)).equals(publicBefore[i]),'Visitor entrypoint changed');
console.log('ADMIN_NETWORK_PREPARED_PUBLIC_UNCHANGED');
