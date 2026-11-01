import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {MUSEUM_SECTIONS,MUSEUM_LAUNCH_ENTRIES,MUSEUM_SILO_GROUP} from '../src/museum-menu.js';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-menu',revision='20261101-satellite-surface-v1';
const sections=['sitesAccordion','equipmentAccordion','infrastructureAccordion','mythsAccordion','graveyardAccordion'];
const titles=['СТАРТОВЫЕ КОМПЛЕКСЫ','РАКЕТЫ И ТЕХНИКА','ИНФРАСТРУКТУРА','МИФЫ И ЛЕГЕНДЫ','КОСМИЧЕСКОЕ КЛАДБИЩЕ'];
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
  const dock=rect(document.getElementById('timeDock')),launch=rect(document.getElementById('nextLaunchPanel'));
  const launchActions=[...document.querySelectorAll('#nextLaunchPanel .next-launch__site,#nextLaunchPanel .next-launch__schedule')].map(element=>{const r=rect(element);return{label:element.textContent,...r,accessible:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  return {width:innerWidth,height:innerHeight,stack:rect(document.getElementById('museumLeftStack')),dock,launch,lowerDockTop:Math.min(dock.y,launch.y),
   launchActions,headers:[...document.querySelectorAll('.museum-section > summary')].map(element=>({id:element.parentElement.id,...rect(element)}))};
 });
}
function checkLowerDocks(layout,{stacked=false}={}){
 const {dock,launch,width,height}=layout;
 for(const r of [dock,launch])assert.ok(r.width>0&&r.height>0&&r.x>=0&&r.right<=width&&r.y>=0&&r.bottom<=height,'Both lower panels fit inside the viewport');
 const overlap=Math.max(0,Math.min(dock.right,launch.right)-Math.max(dock.x,launch.x))*Math.max(0,Math.min(dock.bottom,launch.bottom)-Math.max(dock.y,launch.y));
 assert.equal(overlap,0,'The timeline and launch panel never overlap');
 assert.equal(layout.launchActions.length,2,'Both the site and schedule actions remain present');
 for(const action of layout.launchActions)assert.ok(action.accessible&&action.x>=launch.x-1&&action.right<=launch.right+1&&action.y>=launch.y-1&&action.bottom<=launch.bottom+1,action.label+' fits inside the launch dock and receives pointer input');
 if(stacked){
  assert.ok(Math.abs(dock.x-launch.x)<=1&&Math.abs(dock.width-launch.width)<=1&&dock.width>=width*.9,'Narrow screens use two aligned full-width dock rows');
  assert.ok(dock.bottom<launch.y,'The timeline sits above the launch panel with a visible gap');
  assert.ok(dock.height<=110&&launch.height<=110,'Both narrow-screen dock rows remain compact');
 }else{
  assert.ok(Math.abs(dock.y-launch.y)<=1&&Math.abs(dock.height-launch.height)<=1,'Desktop timeline and launch panels share a top edge and height');
  assert.ok(dock.right<launch.x,'The launch panel continues to the right of the timeline with a gap');
  assert.ok(Math.abs(dock.width/(dock.width+launch.width)-.75)<=.02,'The desktop timeline occupies three quarters of the two panel widths');
 }
}
async function selectedCardDockOverlaps(){
 return page.evaluate(()=>{
  const info=document.getElementById('info').getBoundingClientRect();
  const overlap=id=>{const r=document.getElementById(id).getBoundingClientRect();return Math.max(0,Math.min(r.right,info.right)-Math.max(r.left,info.left))*Math.max(0,Math.min(r.bottom,info.bottom)-Math.max(r.top,info.top));};
  return {launch:overlap('nextLaunchPanel'),timeline:overlap('timeDock')};
 });
}
async function nextLaunchState(){
 return page.evaluate(()=>{
  const host=document.getElementById('nextLaunchPanel'),panel=host.querySelector('.next-launch');
  const digits=['days','hours','minutes','seconds'].map(unit=>panel.querySelector('[data-countdown-unit="'+unit+'"]').textContent);
  const numbers=digits.map(Number),time=panel.querySelector('time');
  return {digits,totalSeconds:numbers[0]*86400+numbers[1]*3600+numbers[2]*60+numbers[3],
   deadline:Date.parse(time.dateTime),now:Date.now(),mode:panel.dataset.state,status:panel.querySelector('.next-launch__status').textContent,
   inLeftMenu:document.getElementById('ui').contains(host),inRightMenu:document.getElementById('museumRightStack').contains(host)};
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
 assert.deepEqual(await page.locator('#ui > .museum-section').evaluateAll(elements=>elements.map(element=>element.id)),sections);
 assert.equal(await page.locator('#museumIdentity .museum-name').textContent(),'БАЙКОНУР');
 assert.equal(await page.locator('#museumIdentity .museum-subtitle').textContent(),'ИНТЕРАКТИВНЫЙ МУЗЕЙ 3D');
 assert.equal(await page.locator('#museumIdentity .museum-dimension').textContent(),'3D');
 assert.equal(await page.locator('#toursAccordion').count(),0,'Tours are removed rather than visually hidden');
 assert.equal(await page.locator('#museumRightStack').isVisible(),true);
 assert.equal(await page.locator('#nextLaunchPanel .next-launch__eyebrow').textContent(),'СЛЕДУЮЩИЙ ЗАПУСК');
 assert.equal(await page.locator('#nextLaunchPanel .next-launch__name').textContent(),'ПРОГРЕСС МС-37');
 const schedule=page.locator('#nextLaunchPanel a.next-launch__schedule');
 assert.equal(await schedule.isVisible(),true);assert.match(await schedule.textContent(),/Расписание запусков/);
 assert.equal(await schedule.getAttribute('href'),'https://rockettrip.space/raspisanie');
 assert.equal(await schedule.getAttribute('target'),'_blank');assert.match(await schedule.getAttribute('rel'),/\bnoopener\b/);
 assert.equal(await page.locator('#nextLaunchPanel [role="timer"]').getAttribute('aria-live'),'off','Second-by-second updates must not continually announce over the screen reader');
 const countdownBefore=await nextLaunchState();assert.equal(countdownBefore.inRightMenu,true);assert.equal(countdownBefore.inLeftMenu,false);
 assert.ok(countdownBefore.digits.every((value,index)=>(index===0?/^\d{3,}$/:/^\d{2}$/).test(value)),'All four countdown groups contain stable-width digits');
 assert.ok(Math.abs(countdownBefore.totalSeconds-Math.max(0,Math.ceil((countdownBefore.deadline-countdownBefore.now)/1000)))<=1,'The visible countdown uses the real launch instant and wall clock');
 if(countdownBefore.deadline>countdownBefore.now+2000){
  assert.match(countdownBefore.status,/предварительн/i,'A provisional launch time is visibly identified');
  await page.waitForFunction(previous=>{
   const panel=document.getElementById('nextLaunchPanel'),values=['days','hours','minutes','seconds'].map(unit=>Number(panel.querySelector('[data-countdown-unit="'+unit+'"]').textContent));
   return values[0]*86400+values[1]*3600+values[2]*60+values[3]<previous;
  },countdownBefore.totalSeconds,{timeout:5000});
 }else if(countdownBefore.deadline<=countdownBefore.now)assert.equal(countdownBefore.totalSeconds,0,'An elapsed launch must not produce a negative counter');
 evidence.nextLaunch={before:countdownBefore,after:await nextLaunchState()};
 assert.equal(await page.locator('#museumIdentity img,.rockettrip-logo,#cyclogramsAccordion,#timelineEvents,#timelineEventPanel').count(),0,'Removed branding and event UI do not remain hidden in the page');
 const catalogue=await page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,s=q.stats();return{sections:q.menu.stats().sections,sites:s.sites,stations:s.stations,research:s.researchObjects,history:s.historyEvents};
 });
 const launch=catalogue.sections.find(s=>s.id==='sitesAccordion'),infrastructure=catalogue.sections.find(s=>s.id==='infrastructureAccordion'),graveyard=catalogue.sections.find(s=>s.id==='graveyardAccordion');
 const siteIds=catalogue.sections.flatMap(section=>section.siteIds);
 assert.equal(siteIds.length,catalogue.sites+catalogue.stations,'Every existing rendered object remains reachable');
 assert.equal(new Set(siteIds).size,siteIds.length,'A site has one catalogue entry, with no duplicate category');
 for(const id of ['pad-1','pad-31','pad-41','pad-45','pad-81','pad-90','pad-109','pad-110','pad-200','pad-250'])assert.ok(launch.siteIds.includes(id),id+' is a launch or stand-start complex');
 for(const id of ['pad-5','pad-42','pad-112','pad-112a','pad-251','airfield','pad-23','pad-75','pad-3','pad-254','pad-130','pad-175'])assert.ok(infrastructure.siteIds.includes(id),id+' is infrastructure');
 assert.equal(launch.count,10,'Nine named launch complexes and one silo group form the top-level launch menu');
 assert.equal(launch.siteCount,40,'Grouping keeps all 40 physical launch facilities reachable');
 assert.equal(infrastructure.siteIds.length,58+catalogue.stations);
 assert.equal(graveyard.researchIds.length,catalogue.research);assert.equal(catalogue.history,18,'The historical data is preserved after removing its bottom strip');
 assert.equal(await page.locator('#infrastructureList .entry-station').count(),catalogue.stations,'Railway stations and depots stay in infrastructure');
 evidence.catalogue=catalogue;
 for(const id of sections)assert.equal(await page.locator('#'+id).evaluate(element=>element.open),false);
 assert.equal(await page.locator('#mobileMenuToggle').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().labelsVisible),true);
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 await shot('desktop-menu');evidence.desktop=await menuBounds();
 checkLowerDocks(evidence.desktop);
 assert.ok(evidence.desktop.stack.bottom<evidence.desktop.lowerDockTop,'Sidebar remains above both lower panels');
 assert.ok(evidence.desktop.dock.height<=120&&evidence.desktop.dock.height>=70,'The desktop dock stays compact');
 await page.locator('#nextLaunchPanel .next-launch__site').click();await selectedSite('pad-31');
 const launchCardLayout=await selectedCardDockOverlaps();
 assert.deepEqual(launchCardLayout,{launch:0,timeline:0},'Both lower docks leave the opened Site 31 card usable');evidence.nextLaunch.siteCard=launchCardLayout;
 await page.locator('#close').click();await page.evaluate(()=>window.__BAIKONUR_QA.showOverview());
 await page.locator('#year').focus();await page.keyboard.press('ArrowLeft');
 assert.equal(await page.locator('#yearVal').textContent(),'2025','The compact year control remains keyboard-accessible');
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#yearVal').textContent(),'2026');
 await openSection('infrastructureAccordion');await page.locator('#infrastructureSearch').fill('Юбилейный');
 assert.equal(await page.locator('#infrastructureList [data-site-id="pad-251"]').count(),1);
 await page.locator('#infrastructureList [data-site-id="pad-251"]').click();await selectedSite('pad-251');
 await page.locator('#infrastructureSearch').fill('');await shot('desktop-infrastructure');
 await openSection('sitesAccordion');
 assert.deepEqual(await page.locator('#list > .entry').evaluateAll(elements=>elements.map(element=>element.dataset.siteId)),MUSEUM_LAUNCH_ENTRIES.map(entry=>entry.id),'The nine named launch complexes remain separate top-level buttons');
 const siloGroup=page.locator('#'+MUSEUM_SILO_GROUP.id),siloEntries=siloGroup.locator('[data-site-id]');
 assert.equal(await page.locator('#list > details.silo-group').count(),1);
 assert.match(await siloGroup.locator(':scope > summary').textContent(),/Шахтные установки/);
 assert.equal(await siloGroup.evaluate(element=>element.open),false,'The 31 silos begin in one collapsed group');
 assert.deepEqual((await siloEntries.evaluateAll(elements=>elements.map(element=>element.dataset.siteId))).sort(),[...MUSEUM_SILO_GROUP.siteIds].sort());
 assert.equal(await page.locator('#count').textContent(),'10');
 await siloGroup.locator(':scope > summary').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(id=>document.getElementById(id).open,MUSEUM_SILO_GROUP.id);
 assert.equal(await page.locator('#sitesAccordion').evaluate(element=>element.open),true,'Opening the nested native details keeps the launch catalogue open');
 assert.equal(await siloGroup.locator('[data-site-id="pad-109"]').isVisible(),true);
 await page.locator('#search').fill('109');
 assert.equal(await siloGroup.evaluate(element=>element.open),true,'Searching a silo number reveals its result inside the group');
 assert.equal(await page.locator('#list > .entry').count(),0);
 assert.deepEqual(await siloEntries.evaluateAll(elements=>elements.map(element=>element.dataset.siteId)),['pad-109']);
 await shot('desktop-silo-search');
 await siloGroup.locator('[data-site-id="pad-109"]').click();await selectedSite('pad-109');await page.locator('#close').click();
 for(const query of ['ШПУ','Шахтные установки']){
  await page.locator('#search').fill(query);
  assert.equal(await siloGroup.evaluate(element=>element.open),true);
  assert.equal(await siloEntries.count(),31,query+' finds every silo installation');
  assert.equal(await page.locator('#list > .entry').count(),0);
 }
 await page.locator('#search').fill('Протон');
 for(const id of ['pad-81','pad-200'])assert.equal(await page.locator('#list [data-site-id="'+id+'"]').count(),1);
 assert.equal(await siloGroup.isVisible(),false,'Unmatched silos do not appear in a Proton search');
 assert.equal(await page.locator('#list [data-site-id="pad-251"]').count(),0,'Airports no longer appear among launch complexes');
 await page.locator('#search').fill('');
 assert.equal(await page.locator('#list > .entry').count(),9);assert.equal(await siloEntries.count(),31);
 assert.equal(await page.locator('#count').textContent(),'10','Clearing search restores ten top-level launch entries');
 evidence.silos={topLevel:10,installations:31,searches:['109','ШПУ','Шахтные установки','Протон'],selected:'pad-109'};
 await openSection('graveyardAccordion');await page.locator('#graveyardSearch').fill('BAI-001');
 assert.equal(await page.locator('#graveyardList [data-research-id="BAI-001"]').count(),1);
 await page.locator('#graveyardList [data-research-id="BAI-001"]').click();assert.ok((await page.locator('#title').textContent()).startsWith('BAI-001'));
 await page.locator('#graveyardSearch').fill('');

 // Native details controls must work from the keyboard as well as the mouse.
 await page.locator('#mythsAccordion > summary').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.getElementById('mythsAccordion').open);
 assert.equal(await page.locator('#mythsAccordion [data-museum-action]').count(),12);
 assert.equal(await page.locator('#mythsAccordion .museum-menu-empty').count(),0);
 await openSection('equipmentAccordion');
 assert.equal(await page.locator('#mythsAccordion').evaluate(element=>element.open),false);
 const equipmentActions=MUSEUM_SECTIONS.find(section=>section.id==='equipmentAccordion').items.map(item=>item.action);
 assert.deepEqual(await page.locator('#equipmentAccordion [data-museum-action]').evaluateAll(elements=>elements.map(element=>element.dataset.museumAction)),equipmentActions,
  'The rendered equipment menu includes every current catalogue action in order');
 assert.equal(await page.locator('#equipmentAccordion [data-museum-action]').first().getAttribute('data-museum-action'),'zenit-3sl');
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

 const cycle=await action('flight-cycle');assert.equal(cycle.arrival,true);assert.equal(cycle.train,false);
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
 const trainCycle=await action('train-cycle');assert.equal(trainCycle.train,true);assert.equal(trainCycle.arrival,false);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().elapsed),0);
 await action('silo-cycle');await selectedSite('pad-109');
 await action('r16-memorial','graveyardAccordion');await selectedSite('pad-41');
 await page.evaluate(()=>{document.getElementById('year').value='1990';document.getElementById('year').dispatchEvent(new Event('input',{bubbles:true}));});
 await action('mik-ruins','graveyardAccordion');await selectedSite('pad-112');
 assert.equal(await page.locator('#year').inputValue(),'2026','The ruins entry opens the existing damaged-roof state');

 for(const id of sections)if(await page.locator('#'+id).evaluate(element=>element.open))await page.locator('#'+id+' > summary').click();
 await page.setViewportSize({width:960,height:900});await page.evaluate(()=>window.__BAIKONUR_QA.showOverview());await step();
 evidence.tablet=await menuBounds();checkLowerDocks(evidence.tablet,{stacked:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__BAIKONUR_QA.showOverview());
 const toggle=page.locator('#mobileMenuToggle');assert.equal(await toggle.isVisible(),true);assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#museumRightStack').isVisible(),true);
 assert.equal(await page.locator('#nextLaunchPanel').isVisible(),true,'The launch dock stays visible while the phone menu is closed');
 const phoneLaunch=await nextLaunchState();assert.equal(phoneLaunch.inRightMenu,true);assert.equal(phoneLaunch.inLeftMenu,false,'The launch dock retains its own host on the phone');
 assert.equal(await page.locator('#nextLaunchPanel').count(),1,'There is one live countdown at every viewport size');
 evidence.mobileClosed=await menuBounds();checkLowerDocks(evidence.mobileClosed,{stacked:true});
 assert.equal(await schedule.isVisible(),true,'The schedule link remains available with the phone menu closed');
 await shot('mobile-closed-menu');
 for(const id of sections)assert.equal(await page.locator('#'+id).isVisible(),false);
 await toggle.click();for(const id of sections)assert.equal(await page.locator('#'+id).isVisible(),true);
 assert.equal(await page.locator('#nextLaunchPanel').isVisible(),true,'Opening the phone menu leaves the launch dock visible');
 evidence.mobile=await menuBounds();checkLowerDocks(evidence.mobile,{stacked:true});
 assert.ok(evidence.mobile.stack.bottom<evidence.mobile.lowerDockTop,'The expanded mobile menu stays above both lower docks');
 assert.equal(await page.locator('#museumIdentity .museum-name').isVisible(),true);assert.equal(await page.locator('#museumIdentity .museum-subtitle').isVisible(),true);
 for(const h of evidence.mobile.headers){assert.ok(h.x>=0&&h.right<=390&&h.height>=40,h.id+' remains a full-width touch target');assert.ok(h.y>=0&&h.bottom<evidence.mobile.lowerDockTop,h.id+' is visible above the lower docks');}
 await shot('mobile-menu');
 await openSection('equipmentAccordion');await page.locator('[data-museum-action="tua"]').click();
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');await selectedSite('pad-112');
 assert.equal(await page.locator('#nextLaunchPanel').isVisible(),true,'Selecting a phone exhibit keeps the lower launch dock visible');
 assert.deepEqual(await selectedCardDockOverlaps(),{launch:0,timeline:0},'The phone TUA card does not cover either lower dock');
 assert.equal(await page.locator('#mik112Tua').getAttribute('aria-pressed'),'true');
 await shot('mobile-tua');
 await toggle.click();await openSection('equipmentAccordion');await page.locator('[data-museum-action="flight-cycle"]').click();
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
 await openSection('equipmentAccordion');await page.locator('[data-museum-action="flight-cycle"]').click();
 assert.equal(await toggle.isVisible(),true);assert.equal(await page.locator('#arrivalPanel').isVisible(),true);
 await toggle.click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().following),false);
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('LEFT_MENU_BROWSER_PASS',JSON.stringify({prefix,revision,sections:sections.length,actions:evidence.actions.length,statusCases:evidence.statuses.length,desktopDock:evidence.desktop.dock.height,mobileDock:evidence.mobile.dock.height,mobile:true,nextLaunch:true}));
}catch(error){
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));throw error;
}finally{await browser.close();}
