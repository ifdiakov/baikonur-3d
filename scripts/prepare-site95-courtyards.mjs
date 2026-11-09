import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const version='20261109-site95-courtyards-v2';
let path='src/site95-layout.js',s=readFileSync(path,'utf8');
if(!s.includes('SITE95_COURTYARDS')){
 assert(s.includes("SITE95_VERSION='20261106-site95-town-v1'"));
 s="import {SITE95_COURTYARDS} from './site95-courtyard-plan.js?v=20261109-courts-v2';\n"+s;
 s=s.replace("'20261106-site95-town-v1'","'"+version+"'");
 const a=s.indexOf('const displayOffsets='),b=s.indexOf('const trace=',a);assert(a>0&&b>a);s=s.slice(0,a)+s.slice(b);
 s=s.replace(' const position=site95Pixel(b),offset=displayOffsets[i+1]||[0,0];',' const position=site95Pixel(b),planned=SITE95_COURTYARDS.buildings[i],offset=planned.position.map((v,j)=>v-position[j]);');
 s=s.replace('displayOffset:offset,position:position.map((v,j)=>v+offset[j])','displayOffset:offset,position:[...planned.position],entrySide:planned.entrySide');writeFileSync(path,s);
}
path='src/site95.js';s=readFileSync(path,'utf8');
if(!s.includes('buildSite95Landscape')){
 s=s.replace("'./site95-layout.js?v=20261106-site95-town-v1'","'./site95-layout.js?v=20261109-courts-v2'");
 s=s.replace('\nexport function buildSite95',"\nimport {buildSite95Landscape} from './site95-landscape.js?v=20261109-courts-v2';\n\nexport function buildSite95");
 s=s.replace(' const blocks=[];'," k.mat.warmWindow=new THREE.MeshStandardMaterial({color:0xd7b489,emissive:0xffbd79,emissiveIntensity:.42,roughness:.7});\n const blocks=[];");
 s=s.replace("intact?'glass':'dark','window'","b.family!=='utility'&&(i*11+j*5+f*3)%7<2?'warmWindow':intact?'glass':'dark','window'");
 s=s.replace('  for(let x=-w/2+4;x<w/2-1;x+=12){','  const entry=b.entrySide||1;\n  for(let x=-w/2+4;x<w/2-1;x+=12){');
 s=s.replace("x,1.1,d/2+.12,'dark','entrance'","x,1.1,entry*(d/2+.12),'dark','entrance'");
 s=s.replace("x,2.5,d/2+.75,'light','canopy'","x,2.5,entry*(d/2+.75),'light','canopy'");
 s=s.replace("x,.075+s*.15,d/2+1.7-s*.5,'concrete','step'","x,.075+s*.15,entry*(d/2+1.7-s*.5),'concrete','step'");
 const a=s.indexOf(' // Footpaths follow'),b=s.indexOf(' const square=',a);assert(a>0&&b>a);s=s.slice(0,a)+' // Courtyard paths share the revised building and entrance coordinates.\n'+s.slice(b);
 s=s.replace('const z=b.depth/2+4.8;','const z=-(b.entrySide||1)*(b.depth/2+4.8);');
 const c=s.indexOf(' for(const [a,b]of [[[770,310]'),d=s.indexOf(' const metadata=',c);assert(c>0&&d>c);s=s.slice(0,c)+' const landscape=buildSite95Landscape(root,k);\n'+s.slice(d);
 s=s.replace('windowLights:false,sourcePhotosPublished:false',"windowLights:true,landscape,condition:'owner-curated historical town interpretation',sourcePhotosPublished:false");writeFileSync(path,s);
}
for(const [file,module]of [['src/archive-buildings.js','site95.js'],['src/archive-models.js','archive-buildings.js'],['index.html','archive-models.js'],['museum.html','archive-models.js'],['workshop.html','archive-models.js']]){
 let t=readFileSync(file,'utf8');const re=new RegExp(module.replaceAll('.','[.]')+'[?]v=[A-Za-z0-9_-]+','g');assert(re.test(t),'Expected import missing: '+file);re.lastIndex=0;t=t.replace(re,module+'?v='+version);writeFileSync(file,t);
}
path='tests/site95-source.mjs';s=readFileSync(path,'utf8').replace('assert(draws<20)','assert(draws<=22)').replace('site95Model.windowLights,false','site95Model.windowLights,true');writeFileSync(path,s);
const heading='## 2026-11-09 · Уютные дворики площадки 95';
if(!readFileSync('PROJECT_CONTEXT.md','utf8').includes(heading))appendFileSync('PROJECT_CONTEXT.md','\n\n'+heading+'\nПо просьбе владельца 51 исходный корпус расставлен просторнее: единая ориентация сохранена, проходы между домами, дорожки к входам и существующим улицам, 60 тёплых фонарей, 19 дополнительных скамеек (23 со сквером),19 деревьев и19 посадочных участков. Часть окон мягко освещена. Монумент, открытая руина и инженерные детали сохранены. Это благоустроенная музейная интерпретация исторического городка, не актуальная фиксация состояния заброшенных зданий.\nЯкорь, масштаб .14, внешние АД/ЖД, земля, освещение и атмосфера всего музея не менялись. Новая сцена: около95тыс.треугольников и20 групп отрисовки, одна общая64×64 текстура света, без новых PointLight/SpotLight. План/фасады/входы/дорожки/мебель используют общие координаты. Проверки: прежняя site95-source и дополнительная site95-courtyards-source; реальный музей и админка через site95-browser, хеши опубликованных файлов.\nИсторическая справка владельца проверена по https://chast-26360.narod.ru/chasti.htm: жилой городок4ИУ и его части. Снимки https://dtf.ru/id123841/1526182-nu-i-poka-yamchik-na-kanikulah-ya-dobralsya-do-svoego-harda-s-interesnymi-fotkami относятся к2014–2015, видео https://rutube.ru/video/c1bc015e25a66e320f2a53e3f3fcf6e9/ опубликовано11.07.2023; не объявлять на их основании все здания заброшенными именно сейчас.\nСтатус: готовность и публикацию подтверждать по qa-site95/public-report.json; коммит без публичной приёмки не равен завершению. Предыдущая справка2А и коррекция цвета земли не закрываются этим изменением.\n');
if(!readFileSync('docs/WORK_STATUS.md','utf8').includes('## Дворики площадки 95'))appendFileSync('docs/WORK_STATUS.md','\n\n## Дворики площадки 95\nВерсия '+version+'. Расстановка51корпуса, дорожки,60фонарей,23скамейки и озеленение. Исходные улицы и привязка сохранены. Фактический статус приёмки — qa-site95/public-report.json и run существующего verify-site95.yml. Не смешивать со справкой2А, цветом земли или тенями Энергии.\n');
console.log('SITE95_COURTYARDS_PREPARED',version);
