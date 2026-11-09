import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
// Preserve the existing authoring application. NEVER rewrite or redirect the visitor entrypoint.
const publicBefore=await readFile('index.html');
let workshop=await readFile('workshop.html','utf8');
assert(workshop.includes('MUSEUM_WORKSHOP_SPLIT_V1')&&workshop.includes('installWorkshop({'),'Existing workshop integration is required');
workshop=workshop.replaceAll('./src/road-editor.js?','./src/workshop-road-editor.js?').replaceAll('./src/terrain-voids.js?','./src/workshop-terrain-voids.js?');
await writeFile('workshop.html',workshop);
assert((await readFile('index.html')).equals(publicBefore),'Preparing the workshop must not alter the public museum');
let context=await readFile('PROJECT_CONTEXT.md','utf8');
const heading='## 2026-11-09 · Полное восстановление оригинального музея';
if(!context.includes(heading)){
 context+='\n\n'+heading+'\nПоследнее безусловное указание владельца: вернуть меню, внешний вид, карту, туман, фонари, транспорт и всё внешнее оформление точно как до облегчённой замены. Это отменяет выпуск public-museum как основного музея. Референс — dfdeed5a331773275c412068f801d25ef9737baf, последняя версия перед разделением. index.html и museum.html восстановлены побайтно из исходного index.html; оригинальные существовавшие src/data/assets должны совпадать с референсом. Никаких новых упрощённых моделей, плоской замены карты, отдельного окна для живого транспорта или урезанного меню.\nМастерская workshop.html сохраняется отдельно, с прежними возможностями редактирования, высотомером, координатами и черновиками. Добавленные редакторские API изолированы в workshop-road-editor.js и workshop-terrain-voids.js, чтобы публичные исходники совпадали с оригиналом. Облегчённые ресурсы оставлены только как неиспользуемый эксперимент. Автоматическая сборка/публикация эксперимента отключена; prepare-workshop больше не меняет публичную страницу.\nПроверка восстановления: tests/original-museum-source.mjs сравнивает содержимое всех оригинальных ресурсов и обоих публичных входов с референсом. tests/original-museum-browser.mjs проверяет полный интерфейс, свет, фланги, движение машин/поезда/самолёта, desktop/mobile и доступность редактора. Отдельно проверяются опубликованные файлы и браузер после GitHub Pages. Проверка не означает исправления старых дефектов дорог или ускорения полной сцены.\nДальнейшая оптимизация допустима только при сохранении согласованного изображения и функций. Не менять дизайн, меню, состав сцены или заметную детализацию без согласования. Сначала доказательство визуального равенства, потом показатели скорости. После обновления — короткий понятный отчёт по четырём ролям (3D, интерфейс, модели/оптимизация, тестирование). В конце КАЖДОГО сообщения пользователю две ссылки-кнопки: [Музей](https://ifdiakov.github.io/baikonur-3d/museum.html) и [Админка](https://ifdiakov.github.io/baikonur-3d/workshop.html).\n';
 await writeFile('PROJECT_CONTEXT.md',context);
}
console.log('ORIGINAL_PUBLIC_PRESERVED_WORKSHOP_READY');
