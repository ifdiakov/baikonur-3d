import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
// The full scene is canonical; do not maintain a second hand-edited copy.
let html=await readFile('index.html','utf8');
assert(html.includes('MUSEUM_WORKSHOP_SPLIT_V1'),'Canonical scene must contain the workshop integration');
assert(html.includes('window.__MUSEUM_WORKSHOP?.roadsChanged?.()'),'Road editor autosave integration is required');
html=html.replaceAll('./src/workshop-panel.css?v=split-v1','./src/workshop-panel.css?v=split-v4');
await writeFile('index.html',html);
await writeFile('workshop.html',html.replace(/<title>[^<]+<\/title>/,'<title>Мастерская — Байконур 3D</title>'));
// Existing tests of the full scene must explicitly select that scene now that
// the empty-query home URL opens the lightweight public museum.
for(const name of ['osm-release-browser','a320-browser','museum4-browser','complex-history-browser']){
 const path='tests/'+name+'.mjs';let source=await readFile(path,'utf8');
 source=source.replace('page.goto(base,',"page.goto(base+(base.includes('?')?'&':'?')+'full=1',").replace('page.goto(url,',"page.goto(url+(url.includes('?')?'&':'?')+'full=1',");
 await writeFile(path,source);
}
let context=await readFile('PROJECT_CONTEXT.md','utf8');
if(!context.includes('### Приёмка разделения — выпуск v4')){
 context+='\n\n### Приёмка разделения — выпуск v4\n09.11.2026: мастерская и лёгкий музей собраны из одной исходной сцены. Для близкого вида дорожное покрытие каждой площадки запекается исходным GPU-рендером с реальными масками удаления, а не проекцией необрезанных треугольников. Дополнительная проверка tests/public-terrain-patch.mjs подтверждает совпадение покрытия с исходными треугольниками рельефа без подъёма полотна. Высотомер в мастерской вынесен из области редактирования, на телефоне показан компактно. Старые тесты полной сцены используют full=1; новая главная страница — museum.html. Полные запуски и прочие сложные сцены пока загружают прежний просмотрщик по запросу. Черновик локальный; публикация через авторизованный GitHub, не серверную админку. Отчёты скорости CI помечать как программный WebGL; у мастерской после первого кадра при функциональной проверке остановлен непрерывный цикл анимации, это не замер кадров в секунду. Проверки опубликованной версии обязательны перед докладом.\n';
 await writeFile('PROJECT_CONTEXT.md',context);
}
console.log('WORKSHOP_ENTRY_READY');
