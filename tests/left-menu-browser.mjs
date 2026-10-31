import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-menu',revision='20261031-highway-lighting-v1';
const sections=['sitesAccordion','equipmentAccordion','cyclogramsAccordion','mythsAccordion','graveyardAccordion'];
const titles=['ПЛОЩАДКИ И ОБЪЕКТЫ','РАКЕТЫ И ТЕХНИКА','ЦИКЛОГРАММЫ','МИФЫ И ЛЕГЕНДЫ','КОСМИЧЕСКОЕ КЛАДБИЩЕ'];
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],actions:[],statuses:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
page.on('pageerror',error=>evidence.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(message.text()))evidence.shaderErrors.push(message.text());});
page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin===new URL(base).origin)evidence.failedResources.push({url:response.url(),status:response.status()});});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__MENU_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__MENU_FRAME());
const shot=async name=>{await step();await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});};
async function openSection(id){
 if(!await page.locator('#'+id).evaluate(element=>element.open))await page.locator('#'+id+' > summary').click();
 await page.waitForFunction(id=>document.getElementById(id).open&&[...document.querySelectorAll('.museum-section[open]')].length===1,id);
}
async function action(id,section='equipmentAccordion'){
 await openSection(section);await page.locator(`[data-museum-action="${id}"]`).click();
 const state=await page.evaluate(()=>({menu:window.__BAIKONUR_QA.menu.stats(),selected:window.__BAIKONUR_QA.selectionState(),arrival:window.__BAIKONUR_QA.arrival.stats().following,train:window.__BAIKONUR_QA.traffic.stats().train.following}));
 assert.equal(state.menu.lastAction,id);evidence.actions.push({action:id,...state});return state;
}
async function selectedSite(id){
 const result=await page.evaluate(id=>({selection:window.__BAIKONUR_QA.selectionState(),site:window.__BAIKONUR_QA.siteState(id)}),id);
 assert.equal(result.selection.currentObject,result.site.index);assert.equal(await page.locator('#info').isVisible(),true);
}
async function menuBounds(){
 return page.evaluate(()=>{
  const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  return {width:innerWidth,height:innerHeight,stack:rect(document.getElementById('museumLeftStack')),dock:rect(document.getElementById('timeDock')),
   headers:[...document.querySelectorAll('.museum-section > summary')].map(element=>({id:element.parentElement.id,...rect(element)}))};
 });
}
try{
 const url=new URL(base);url.searchParams.delete('view');url.searchParams.delete('detail');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.equal(await page.locator('#all,#top,#fly,#showLabels,[data-layer]').count(),0);
 assert.ok(!(await page.locator('#ui').innerText()).includes('СЛОИ СЦЕНЫ'));
 assert.deepEqual(await page.locator('.museum-section > summary .sites-accordion-title').allTextContents(),titles);
 for(const id of sections)assert.equal(await page.locator('#'+id).evaluate(element=>element.open),false);
 assert.equal(await page.locator('#mobileMenuToggle').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().labelsVisible),true);
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 await shot('desktop-menu');evidence.desktop=await menuBounds();
 assert.ok(evidence.desktop.stack.bottom<evidence.desktop.dock.y,'Sidebar and time dock do not overlap');

 // Native details controls must work from the keyboard as well as the mouse.
 await page.locator('#mythsAccordion > summary').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.getElementById('mythsAccordion').open);
 assert.equal(await page.locator('#mythsAccordion [data-museum-action]').count(),12);
 assert.equal(await page.locator('#mythsAccordion .museum-menu-empty').count(),0);
 await openSection('equipmentAccordion');
 assert.equal(await page.locator('#mythsAccordion').evaluate(element=>element.open),false);
 assert.equal(await page.locator('#equipmentAccordion [data-museum-action]').count(),10);
 await shot('desktop-equipment');
 await action('r7');await selectedSite('pad-1');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().gagarinRocketVisible),true);
 await action('energia-polyus');await selectedSite('pad-250');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='ukss').visible),true);
 await page.evaluate(()=>window.__BAIKONUR_QA.setUkssMockupVisible(false));
 await action('tua');await selectedSite('pad-112');
 assert.equal(await page.locator('#mik112Tua').getAttribute('aria-pressed'),'true');
 await action('mriya');await selectedSite('pad-251');
 await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().airports.find(a=>a.key==='yubileiny').mriya.status==='ready',null,{timeout:180000});
 await action('silo');await selectedSite('pad-109');
 const aircraft=await action('aircraft');assert.equal(aircraft.arrival,true);assert.equal(aircraft.train,false);
 const train=await action('train');assert.equal(train.train,true);assert.equal(train.arrival,false);
 await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),true,'Sidebar event bubbling must not cancel the selected following mode');

 const cycle=await action('flight-cycle','cyclogramsAccordion');assert.equal(cycle.arrival,true);assert.equal(cycle.train,false);
 const cases=[[0,'inbound',148],[147.1,'inbound',1],[148,'parking',20],[167.1,'parking',1],[168,'outbound',238],[405.1,'outbound',1],[406,'inbound',148],[554,'parking',20],[574,'outbound',238],[812,'inbound',148]];
 const labels={inbound:'МОСКВА-КРАЙНИЙ',parking:'СТОЯНКА',outbound:'КРАЙНИЙ-МОСКВА'};
 for(const [time,id,seconds]of cases){
  const result=await page.evaluate(time=>{
   const q=window.__BAIKONUR_QA;q.arrival.seek(time);const s=q.arrival.stats();
   return{time,status:s.status,segment:s.segment,route:document.getElementById('arrivalRoute').textContent,clock:document.getElementById('arrivalClock').textContent,
    panelStatus:document.getElementById('arrivalPanel').dataset.flightStatus};
  },time);
  assert.equal(result.status.id,id);assert.equal(result.status.seconds,seconds);assert.equal(result.route,labels[id]);assert.equal(result.clock,seconds+' сек');assert.equal(result.panelStatus,id);
  evidence.statuses.push(result);
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(148));await shot('parking-status');
 await page.locator('#arrivalReplay').click();assert.equal(await page.locator('#arrivalClock').textContent(),'148 сек');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().following),true);
 await page.evaluate(()=>{
  const q=window.__BAIKONUR_QA;q.arrival.seek(148);q.arrival.resume();const now=performance.now();q.arrival.update(now);q.arrival.update(now+1100);
 });
 assert.equal(await page.locator('#arrivalClock').textContent(),'19 сек','The displayed countdown advances with simulation time');
 const trainCycle=await action('train-cycle','cyclogramsAccordion');assert.equal(trainCycle.train,true);assert.equal(trainCycle.arrival,false);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().elapsed),0);
 await action('silo-cycle','cyclogramsAccordion');await selectedSite('pad-109');
 await action('r16-memorial','graveyardAccordion');await selectedSite('pad-41');
 await page.evaluate(()=>{document.getElementById('year').value='1990';document.getElementById('year').dispatchEvent(new Event('input',{bubbles:true}));});
 await action('mik-ruins','graveyardAccordion');await selectedSite('pad-112');
 assert.equal(await page.locator('#year').inputValue(),'2026','The ruins entry opens the existing damaged-roof state');

 for(const id of sections)if(await page.locator('#'+id).evaluate(element=>element.open))await page.locator('#'+id+' > summary').click();
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__BAIKONUR_QA.showOverview());
 const toggle=page.locator('#mobileMenuToggle');assert.equal(await toggle.isVisible(),true);assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 for(const id of sections)assert.equal(await page.locator('#'+id).isVisible(),false);
 await toggle.click();for(const id of sections)assert.equal(await page.locator('#'+id).isVisible(),true);
 evidence.mobile=await menuBounds();assert.ok(evidence.mobile.stack.bottom<evidence.mobile.dock.y,'The expanded mobile menu stays above the time dock');
 for(const h of evidence.mobile.headers){assert.ok(h.x>=0&&h.right<=390&&h.height>=40,h.id+' remains a full-width touch target');assert.ok(h.y>=0&&h.bottom<evidence.mobile.dock.y,h.id+' is visible before opening a section');}
 await shot('mobile-menu');
 await openSection('equipmentAccordion');await page.locator('[data-museum-action="tua"]').click();
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');await selectedSite('pad-112');
 assert.equal(await page.locator('#mik112Tua').getAttribute('aria-pressed'),'true');
 await shot('mobile-tua');
 await toggle.click();await openSection('cyclogramsAccordion');await page.locator('[data-museum-action="flight-cycle"]').click();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().following),true);
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 assert.equal(await toggle.isVisible(),true,'Mobile following retains a visible exit to the menu');
 assert.equal(await page.locator('#arrivalPanel').isVisible(),true,'The route and timer remain visible while following');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(168));
 assert.equal(await page.locator('#arrivalRoute').textContent(),'КРАЙНИЙ-МОСКВА');assert.equal(await page.locator('#arrivalClock').textContent(),'238 сек');
 await shot('mobile-following');
 await toggle.click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().following),false);
 await shot('mobile-outbound');
 await openSection('equipmentAccordion');await page.locator('[data-museum-action="train"]').click();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),true);assert.equal(await toggle.isVisible(),true);
 await toggle.click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),false);
 // The existing compact following layout starts at 750px, above the normal
 // phone-menu breakpoint. Its escape control must also work in this band.
 await page.setViewportSize({width:700,height:900});
 await openSection('cyclogramsAccordion');await page.locator('[data-museum-action="flight-cycle"]').click();
 assert.equal(await toggle.isVisible(),true);assert.equal(await page.locator('#arrivalPanel').isVisible(),true);
 await toggle.click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().following),false);
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('LEFT_MENU_BROWSER_PASS',JSON.stringify({prefix,revision,sections:5,actions:evidence.actions.length,statusCases:evidence.statuses.length,mobile:true}));
}catch(error){
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));throw error;
}finally{await browser.close();}
