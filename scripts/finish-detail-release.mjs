import {readFile,writeFile,appendFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const placement=`function placeBuildingCard(el,p,occupied,component){
 const w=el.offsetWidth||236,h=el.offsetHeight||200,low=innerWidth>850?338:8;
 const obstacles=[...occupied];
 for(const id of ['ui','museumMobileBar','timeDock','nextLaunchPanel','cameraAltitude','workshopPanel']){
  const node=document.getElementById(id);if(!node)continue;const style=getComputedStyle(node),r=node.getBoundingClientRect();
  if(style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>.05&&r.width&&r.height&&r.right>0&&r.left<innerWidth)obstacles.push(r);
 }
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),x0=clamp(p.x+(innerWidth>850?(component==='mzk'?-126:126):0),low+w/2,innerWidth-w/2-8);
 const xs=[x0,low+w/2,innerWidth-w/2-8],ys=[p.y,70+h*1.07,innerHeight-20+h*.07];
 for(const r of obstacles){xs.push(r.left-w/2-10,r.right+w/2+10);ys.push(r.bottom+10+h*1.07,r.top-10+h*.07);}
 let best=null;
 for(const rawX of xs)for(const rawY of ys){const x=clamp(rawX,low+w/2,innerWidth-w/2-8),y=clamp(rawY,65+h*1.07,innerHeight-10+h*.07),box={left:x-w/2,right:x+w/2,top:y-h*1.07,bottom:y-h*.07};
  if(obstacles.some(r=>!(box.right<r.left-6||box.left>r.right+6||box.bottom<r.top-6||box.top>r.bottom+6)))continue;
  const score=Math.abs(x-x0)+Math.abs(y-p.y);if(!best||score<best.score)best={x,y,box,score};
 }
 if(!best){const y=clamp(p.y,65+h*1.07,innerHeight-10+h*.07);best={x:x0,y,box:{left:x0-w/2,right:x0+w/2,top:y-h*1.07,bottom:y-h*.07}};}
 el.style.left=best.x+'px';el.style.top=best.y+'px';return best.box;
}
`;
for(const file of ['index.html','museum.html','workshop.html']){
 let s=await readFile(file,'utf8');if(s.includes('BUILDING_CARDS_READABLE_V3'))continue;
 const start=s.indexOf('function placeBuildingCard('),end=s.indexOf('function updateLabels(){',start);assert(start>=0&&end>start);
 s=s.slice(0,start)+placement+s.slice(end);
 s=s.replace('</head>',`<style id="buildingCardsReadable">/* BUILDING_CARDS_READABLE_V3 */
.detail-card[data-site-id="building-mzk"] p,.detail-card[data-site-id="building-sdi"] p{display:block;-webkit-line-clamp:unset;overflow:visible;max-height:none}
</style></head>`);
 await writeFile(file,s);
}
const path='tests/transport-transition-browser.mjs';let test=await readFile(path,'utf8');
if(!test.includes('BUILDING_CARD_OCCLUSION_CHECK')){
 const needle="const boxes=[];for(const id of ['building-mzk','building-sdi'])";assert(test.includes(needle));
 test=test.replace(needle,`// BUILDING_CARD_OCCLUSION_CHECK: painted text and buttons must remain readable and clickable.
   const readability=await page.evaluate(()=>['building-mzk','building-sdi'].map(id=>{
    const card=document.querySelector('.detail-card[data-site-id="'+id+'"]'),text=card.querySelector('p'),button=card.querySelector('.more'),r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {id,unclipped:text.scrollHeight<=text.clientHeight+1,clickable:button===hit||button.contains(hit)};
   }));assert(readability.every(r=>r.unclipped&&r.clickable),JSON.stringify(readability));
   const boxes=[];for(const id of ['building-mzk','building-sdi'])`);
 await writeFile(path,test);
}
if(!(await readFile('PROJECT_CONTEXT.md','utf8')).includes('### Вторая причина задержки и читаемость плашек'))await appendFile('PROJECT_CONTEXT.md','\n\n### Вторая причина задержки и читаемость плашек\nПрофилирование main-thread выявило дополнительную паузу около 8 секунд в getImageData при подготовке clearance-маски земли. Контекст этой служебной 2D-маски теперь создаётся с willReadFrequently:true; разрешение, команды рисования и обработка маски прежние. Внешний WebGL-рендер не переводился в программный режим. Проверка кандидата 42647932419: максимальная пауза таймера 35 063 мс в исходной ветке расчёта и 487–652 мс после переноса вычислений; 45 геометрических объектов и их материалы совпали по хешам. Условия: software WebGL в CI, анимация остановлена только измерительным тестом, это не замер FPS на реальном устройстве.\nНовые две плашки сохраняют исходный стиль; полное описание не обрезается двумя строками. Размещение учитывает меню, мобильную шапку, шкалу времени, высотомер и редактор. Дополнительный тест проверяет доступность кнопок через elementFromPoint и отсутствие обрезки текста. Публикацию подтверждать только отдельным публичным прогоном.\n');
console.log('BUILDING_CARDS_READABLE');
