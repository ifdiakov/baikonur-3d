import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const RELEASE='20261109-evening-navigation-v2';
export const targets=['index.html','museum.html','workshop.html','src/evening-scene.js','src/arrival-flight.js','src/museum-menu.js','src/evening.css'];
function replaceOnce(text,old,value){assert(text.includes(old),'Expected source not found: '+old.slice(0,100));assert.equal(text.split(old).length,2,'Ambiguous source: '+old.slice(0,80));return text.replace(old,value);}
const nestedLayoutCSS="\n/* NESTED_TRADITIONS_LAYOUT_V1 */\n#mythsAccordion #traditionsAccordion{flex:0 0 auto}\n#mythsAccordion #traditionsAccordion>.sites-accordion-body{max-height:none;overflow:visible}\n#mythsAccordion #traditionsAccordion:not([open])>summary .sites-chevron{transform:none}\n";
function finishLayout(path,text){return path==='src/evening.css'&&!text.includes('NESTED_TRADITIONS_LAYOUT_V1')?text+nestedLayoutCSS:text;}
export function transform(path,text){
 if(text.includes('EVENING_NAVIGATION_V1'))return finishLayout(path,text);
 if(path.endsWith('.html')){
  const start=text.indexOf('<div id="museumLightSwitch"'),end=text.indexOf('</div>\n</div>',start);
  assert(start>0&&end>start,'Original light switch required');
  text=text.slice(0,start)+text.slice(end+'</div>\n</div>'.length);
  const traditions=text.match(/<details id="traditionsAccordion"[\s\S]*?<\/details>/)?.[0];
  const myths=text.match(/<details id="mythsAccordion"[\s\S]*?<\/details>/)?.[0];
  assert(traditions&&myths,'Both original story sections required');
  text=replaceOnce(text,traditions,'');
  text=replaceOnce(text,myths,myths.replace('</div></details>',traditions.replace('sites-accordion museum-section','sites-accordion museum-subsection')+'</div></details>'));
  const sync=text.match(/function syncMuseumLightButtons\(isNight\)\{[\s\S]*?\n\}\n/)?.[0];assert(sync);text=replaceOnce(text,sync,'');
  text=replaceOnce(text,'syncMuseumLightButtons(value);','');
  const listener="for(const btn of document.querySelectorAll('#museumLightSwitch [data-light]')){\n btn.addEventListener('click',()=>eveningScene.setEvening(btn.dataset.light==='night'));\n}\n";
  text=replaceOnce(text,listener,'');
  const bounds=text.match(/^const museumCameraBounds=.+;$/m)?.[0];assert(bounds);
  text=replaceOnce(text,bounds+'\n','');text=replaceOnce(text,"const airportObject=objects.find(o=>o.record.id==='airfield');",bounds+"\nconst airportObject=objects.find(o=>o.record.id==='airfield');");
  const followBounds="const arrivalMapBounds={minX:Math.min(museumCameraBounds.minX,(geography.bounds.minX-W/2)*S),maxX:Math.max(museumCameraBounds.maxX,(geography.bounds.maxX-W/2)*S),minZ:Math.min(museumCameraBounds.minZ,(geography.bounds.minY-H/2)*S),maxZ:Math.max(museumCameraBounds.maxZ,(geography.bounds.maxY-H/2)*S)};";
  text=replaceOnce(text,bounds,bounds+'\n'+followBounds);
  text=replaceOnce(text," getNavigationBounds:()=>museumCameraBounds,\n onFollow(){cancelBuranRequest();groundTraffic?", " getNavigationBounds:()=>museumCameraBounds,getFollowBounds:()=>arrivalMapBounds,\n onFollow(){cancelBuranRequest();groundTraffic?");
  text=text.replaceAll('eveningScene.setEvening(false)','eveningScene.setEvening(true)');
  const daylight='  scene.background.set(0xa6afb4);scene.fog.color.set(0xa6afb4);scene.fog.density=.000055;sun.color.set(0xe3e9ed);sun.intensity=1.12;\n  hemisphere.color.set(0xc6d0d6);hemisphere.groundColor.set(0x6c706c);hemisphere.intensity=2.3;\n';
  text=replaceOnce(text,daylight,'  // The owner requires the same evening presentation during historical reconstructions.\n');
  for(const module of ['evening-scene.js','arrival-flight.js','museum-menu.js','evening.css'])text=text.replace(new RegExp('('+module.replace('.','\\.')+'\\?v=)[^\'"\\s]+','g'),'$1'+RELEASE);
  text=replaceOnce(text,'<head>','<head><!-- EVENING_NAVIGATION_V1 -->');
 }else if(path==='src/evening-scene.js'){
  const begin=text.indexOf(' function setEvening(value)'),end=text.indexOf(' const stationaryLights=',begin);assert(begin>0&&end>begin);
  text=text.slice(0,begin)+` // EVENING_NAVIGATION_V1: the public scene and workshop are permanently evening.
 // Keep the method for callers, but never permit old reconstruction code to enable daylight.
 function setEvening(){evening=true;sky.visible=true;
  scene.background.set(0x172844);scene.fog.color.set(0x202c46);scene.fog.density=.000115;
  hemisphere.color.set(0x9ab5ee);hemisphere.groundColor.set(0x29344b);hemisphere.intensity=.82;
  sun.color.set(0xffb488);sun.intensity=.5;sun.position.set(-700,180,500);
  for(const [m,c] of originals)m.color.copy(c).multiply(new THREE.Color(0x53647f));
  for(const field of fields){if(field.setEvening)field.setEvening(true);else{field.root.visible=true;field.setStrength(1);}}
  for(const f of floods)f.light.visible=f.owner.visible;
  onModeChange?.(true);
 }
 button?.remove();setEvening();
`+text.slice(end);
  text=text.replace("version:'evening-road-lighting-v4',evening,","version:'evening-road-lighting-v5-locked',evening,permanentEvening:true,");
 }else if(path==='src/arrival-flight.js'){
  text=replaceOnce(text,"container,onFollow,getNavigationBounds}){","container,onFollow,getNavigationBounds,getFollowBounds=getNavigationBounds}){");
  text="// EVENING_NAVIGATION_V1\nimport {arrivalFollowAvailable} from './arrival-follow-availability.js?v="+RELEASE+"';\n"+text;
  text=replaceOnce(text,"const followTarget=new THREE.Vector3();let savedControls={},lastRelease=null;","const followTarget=new THREE.Vector3();let savedControls={},lastRelease=null;\n const canFollow=()=>arrivalFollowAvailable(state,getFollowBounds?.(),suppressed);\n function syncFollowAvailability(){\n  const available=canFollow(),title=available?(following?'Вращайте мышью или пальцем; колесо — приближение':'Следить за самолётом'):suppressed?'Самолёт недоступен во время реконструкции':'Самолёт за пределами макета';\n  if(follow.disabled===available)follow.disabled=!available;\n  if(follow.title!==title)follow.title=title;\n  const flag=String(!available);if(follow.getAttribute?.('aria-disabled')!==flag)follow.setAttribute('aria-disabled',flag);\n  if(container.dataset.followAvailable!==String(available))container.dataset.followAvailable=String(available);\n  return available;\n }");
  text=replaceOnce(text,"follow.setAttribute('aria-pressed','false');\n }","follow.setAttribute('aria-pressed','false');syncFollowAvailability();\n }");
  text=replaceOnce(text,"function setFollowing(value){if(!value){stopFollowing();return;}if(following)return;","function setFollowing(value){if(!value){stopFollowing();return;}if(!syncFollowAvailability())return false;if(following)return true;");
  text=replaceOnce(text,"follow.setAttribute('aria-pressed','true');\n }","follow.setAttribute('aria-pressed','true');syncFollowAvailability();return true;\n }");
  text=replaceOnce(text,"function render(t){state=arrivalPose(path,t);const visible=state.visible||following;","function render(t){state=arrivalPose(path,t);if(following&&!canFollow())stopFollowing();syncFollowAvailability();const visible=state.visible||following;");
  text=replaceOnce(text,"const uiKey=state.leg+':'+state.segment+':'+status.seconds;","const uiKey=state.leg+':'+state.segment+':'+status.seconds+':'+follow.disabled;");
  text=replaceOnce(text,"label.textContent=labels[state.phase]+","label.textContent=(!canFollow()&&!suppressed?'За пределами макета':labels[state.phase])+");
  text=replaceOnce(text,"renderedVisible:root.visible,following,position:","renderedVisible:root.visible,following,followAvailable:canFollow(),followBounds:{...getFollowBounds?.()},position:");
 }else if(path==='src/museum-menu.js'){
  text="// EVENING_NAVIGATION_V1\n"+text;
  text=replaceOnce(text,"museum-seven-sections-v13-rd180","museum-six-sections-v14-nested-traditions");
  text=replaceOnce(text,"{id:'traditionsAccordion',title:","{id:'traditionsAccordion',parent:'mythsAccordion',title:");
  text=replaceOnce(text,'  body.replaceChildren();',"  const nested=[...body.children].filter(child=>child.matches('details.museum-subsection'));\n  body.replaceChildren();");
  text=replaceOnce(text,'  const count=details.querySelectorAll',"  body.append(...nested);\n  const count=details.querySelectorAll");
  text=replaceOnce(text,' return {stats:()=>'," // Parent counts include nested stories after both sections have been populated.\n for(const section of sections){const counter=section.querySelector('.sites-accordion-count');if(section.id==='mythsAccordion'&&counter){const count=section.querySelectorAll('[data-museum-action]').length;counter.textContent=String(count);counter.hidden=count===0;}}\n return {stats:()=>");
 }else if(path==='src/evening.css'){
  text+='\n/* EVENING_NAVIGATION_V1 */\n#arrivalFollow:disabled{opacity:.42;cursor:not-allowed;background:#30425555;border-color:#ffffff1a}\n#arrivalFollow:disabled:hover{background:#30425555;border-color:#ffffff1a}\n#mythsAccordion #traditionsAccordion{margin:8px 0 0;border:1px solid #ffffff20;border-radius:8px}\n#mythsAccordion #traditionsAccordion>summary{padding:9px 7px}\n#mythsAccordion #traditionsAccordion .sites-accordion-title{font-size:9px;letter-spacing:.045em}\n';
 }else throw Error('Unexpected target '+path);
 return finishLayout(path,text);
}
export async function apply(){
 for(const path of targets){let text=await readFile(path,'utf8');await writeFile(path,transform(path,text));}
 const testPath='tests/menu-catalog-contract.mjs';let test=await readFile(testPath,'utf8');
 if(!test.includes('EVENING_NAVIGATION_V1')){
  test=test.replace("const ids=['sitesAccordion','equipmentAccordion','reconstructionsAccordion','complexHistoryAccordion','mythsAccordion','traditionsAccordion','graveyardAccordion'];","// EVENING_NAVIGATION_V1\nconst ids=['sitesAccordion','equipmentAccordion','reconstructionsAccordion','complexHistoryAccordion','mythsAccordion','graveyardAccordion'];");
  test=test.replace("'МИФЫ И ЛЕГЕНДЫ','ТРАДИЦИИ И СУЕВЕРИЯ','КОСМИЧЕСКОЕ КЛАДБИЩЕ'","'МИФЫ И ЛЕГЕНДЫ','КОСМИЧЕСКОЕ КЛАДБИЩЕ'");
  test=test.replaceAll('MUSEUM_SECTIONS.map(section=>','MUSEUM_SECTIONS.filter(section=>!section.parent).map(section=>');
  test+="\nassert.equal(MUSEUM_SECTIONS.find(s=>s.id==='traditionsAccordion').parent,'mythsAccordion');\nassert.match(aside, /id=\"mythsAccordion\"[\\s\\S]*id=\"traditionsAccordion\" class=\"sites-accordion museum-subsection\"/);\n";
  await writeFile(testPath,test);
 }
 const browserPath='tests/original-museum-browser.mjs';let browser=await readFile(browserPath,'utf8');
 if(!browser.includes('EVENING_NAVIGATION_V1')){
  browser="// EVENING_NAVIGATION_V1\nimport {verifyEveningNavigation} from './evening-navigation-browser-checks.mjs';\n"+browser;
  browser=replaceOnce(browser,"'src/workshop-terrain-voids.js'])","'src/workshop-terrain-voids.js','src/evening-scene.js','src/arrival-flight.js','src/arrival-follow-availability.js','src/museum-menu.js','src/evening.css'])");
  browser=replaceOnce(browser,"if(mode==='desktop'){","state.requestedChanges=await verifyEveningNavigation(page,{mode,out});\n  if(mode==='desktop'){");
  browser=replaceOnce(browser,"assert.equal(await page.evaluate(()=>__BAIKONUR_QA.evening.evening),false);","assert.equal(await page.evaluate(()=>__BAIKONUR_QA.evening.evening),true,'Daylight requests must leave the museum in evening mode');");
  await writeFile(browserPath,browser);
 }
 let context=await readFile('PROJECT_CONTEXT.md','utf8');
 if(!context.includes('## 2026-11-09 · Постоянный вечер и навигация самолёта')){
  context+='\n\n## 2026-11-09 · Постоянный вечер и навигация самолёта\nПоследние три требования владельца: убрать переключатель освещения и дневной вариант макета; «Следить» недоступна, пока самолёт за пределами макета; «Традиции и суеверия» — вложенный свёрнутый раздел «Мифов и легенд».\nРеализация одинакова в index.html, museum.html и workshop.html. Вечерние цвета, туман, фонари, геометрия, транспорт и исходные подробные модели сохранены. Дневная ветвь центрального управления светом удалена; старый вызов setEvening(false) безопасно оставляет вечер. Посадка и погрузка Бурана больше не подменяют атмосферу дневной. Это режим музейного показа, не утверждение об историческом времени суток событий. Отдельных дневных GLB не удалять: геометрия и материалы используются общим макетом.\nКнопка сопровождения проверяет координаты X/Z по общей области географии музея и флангов, включая город и весь аэродром Крайний, без дополнительной зоны свободной камеры, видимость самолёта и подавление во время реконструкции. Вне карты кнопка disabled/aria-disabled; повторный прилёт автоматически её включает. При вылете активное сопровождение завершается с возвратом камеры в допустимые границы. Программный вызов не обходит проверку. Вложенные традиции сохраняют исходные статьи, обработчик и счётчик, не закрывают родительский раздел.\nПроверка: tests/evening-navigation-unit.mjs, tests/evening-navigation-source.mjs и checks внутри tests/original-museum-browser.mjs. Сравнение с c3f6a737dc5f9c78332c7db3806251b104bc6456 допускает только эти адресные изменения, все остальные старые src/data/assets сохраняются. Релиз по workflow restore-original-museum; прохождение публичного прогона обязательно для утверждения публикации. Предыдущие дорожные дефекты этим обновлением не исправляются.\n';await writeFile('PROJECT_CONTEXT.md',context);
 }
 console.log('EVENING_NAVIGATION_APPLIED');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await apply();
