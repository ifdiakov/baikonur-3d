import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-rocket-exhibits';
const revision='20261031-facilities-rails-lighting-v3';
const expected={
 gagarin:['pad-1','soyuz'],site31:['pad-31','soyuz'],ukss:['pad-250','energia-polyus'],
 site110:['pad-110','energia-buran'],'mik112-hall':['pad-112','energia-buran'],
 'tua-0':['pad-112','energia-buran'],'tua-1':['pad-112','energia-buran']
};
const choices=['energia-polyus','energia-buran','energia','energia-m'];
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],modelRequests:[],choices:[],views:[],stories:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
page.on('pageerror',error=>{evidence.errors.push(error.message);console.error('ROCKET_RUNTIME_ERROR',error.message);});
page.on('console',message=>{
 if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(message.text()))evidence.shaderErrors.push(message.text());
});
page.on('response',response=>{
 const url=new URL(response.url());
 if(response.status()>=400&&url.origin===new URL(base).origin)evidence.failedResources.push({url:response.url(),status:response.status()});
});
page.on('requestfailed',request=>{
 if(new URL(request.url()).origin===new URL(base).origin)evidence.failedResources.push({url:request.url(),failure:request.failure()?.errorText});
});
page.on('request',request=>{
 const url=new URL(request.url());
 if(/\/assets\/models\/rockets\/[^/]+\.glb$/.test(url.pathname))evidence.modelRequests.push(url.pathname);
});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__ROCKET_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__ROCKET_FRAME());
const shot=async name=>{
 await step();await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 evidence.views.push({name,camera:await page.evaluate(()=>window.__BAIKONUR_QA.cameraState())});
};
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);
function checkScale(stats){
 assert.equal(stats.placements.length,7);near(stats.commonMetre,.14,'Common physical unit');
 for(const placement of stats.placements){
  assert.equal(placement.status,'ready',placement.key+' loaded');assert.equal(placement.error,null);
  assert.equal(placement.metresToWorld.length,3);placement.metresToWorld.forEach(n=>near(n,.14,placement.key+' world metre'));
  assert([...placement.position,...placement.quaternion].every(Number.isFinite));
  assert(placement.assetStats.bytes>0&&placement.assetStats.triangles>0,placement.key+' decoded asset');
 }
}
async function menuAction(id,section='equipmentAccordion'){
 const toggle=page.locator('#mobileMenuToggle');
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 const details=page.locator('#'+section);
 if(!await details.evaluate(element=>element.open))await details.locator(':scope > summary').click();
 await details.locator(`[data-museum-action="${id}"]`).click();
}
async function chooseThroughUi(id){
 await page.locator('#tuaRocketChoice').selectOption(id);
 await page.locator('#tuaPlaceRocket').click();
 await page.waitForFunction(id=>{
  const placements=window.__BAIKONUR_QA.rockets.stats().placements.filter(p=>p.key.startsWith('tua-'));
  return placements.length===2&&placements.every(p=>p.modelId===id&&p.status==='ready'&&p.visible);
 },id,{timeout:90000});
 const states=await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats());checkScale(states);
 assert.equal(await page.locator('#tuaRocketChoice').inputValue(),id);
 assert.equal(await page.locator('#tuaPlaceRocket').isEnabled(),true);
 assert.equal(await page.locator('#tuaHideRocket').getAttribute('aria-pressed'),'true');
 evidence.choices.push({id,placements:states.placements.filter(p=>p.key.startsWith('tua-'))});
 return states;
}

try{
 const url=new URL(base);url.searchParams.delete('view');url.searchParams.delete('detail');url.searchParams.delete('site');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 const readiness=await page.evaluate(()=>window.__BAIKONUR_QA.rockets.whenReady());assert.deepEqual(readiness,[true,true,true,true,true,true,true]);
 const statsCycles=await page.evaluate(()=>{
  const ancestors=new WeakMap(),cycles=[];let count=0;
  function walk(value,path){
   if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||cycles.length>=4||++count>30000)return;
   if(ancestors.has(value)){cycles.push({path,ancestor:ancestors.get(value)});return;}
   ancestors.set(value,path);
   const entries=value.isObject3D?[['parent',value.parent],['children',value.children]]:Object.entries(value);
   for(const [key,child]of entries)walk(child,path+(Array.isArray(value)?'['+key+']':'.'+key));
   ancestors.delete(value);
  }
  walk(window.__BAIKONUR_QA.stats(),'stats');return cycles;
 });
 evidence.statsCycles=statsCycles;if(statsCycles.length)console.log('ROCKET_STATS_CYCLES',JSON.stringify(statsCycles));
 const serializable=await page.evaluate(()=>{try{JSON.stringify(window.__BAIKONUR_QA.stats());return true;}catch(error){return error.message;}});assert.equal(serializable,true,'Public QA statistics serialize without scene handles');
 const initial=await page.evaluate(()=>({rocket:window.__BAIKONUR_QA.rockets.stats(),knowledge:window.__BAIKONUR_QA.knowledge(),clearance:window.__BAIKONUR_QA.clearance(),stats:window.__BAIKONUR_QA.stats()}));
 checkScale(initial.rocket);assert.equal(initial.rocket.loadedAssetCount,3);
 assert.deepEqual(Object.fromEntries(initial.rocket.placements.map(p=>[p.key,[p.siteId,p.modelId]])),expected);
 assert.equal(new Set(initial.rocket.placements.map(p=>p.modelId)).size,3);
 assert(initial.rocket.placements.every(p=>p.visible));
 assert.equal(initial.knowledge.stories,12);assert(initial.knowledge.sources>=15);
 assert(initial.clearance.areas.some(a=>a.id==='mik112-hall'));
 assert(initial.clearance.areas.some(a=>a.id==='yubileiny-runway'&&a.polygon.length===4));
 assert.equal(initial.stats.mik112.tua.status,'ready');assert.equal(initial.stats.mik112.tua.version,'tua-drive-model-v2');
 assert.equal(initial.stats.mik112.tua.assetStats.triangleCount,93800);
 assert.equal(initial.stats.mik112.tua.instanceCount,2);
 assert.equal(initial.stats.mik112.columnDisplay.modernDetachedColumns,0);
 assert.equal(initial.stats.mik112.features['museum-assembly-cradle'],2);
 const airport=initial.stats.airports.find(a=>a.key==='yubileiny');assert(airport);
 assert.equal(airport.length,2250);assert.equal(airport.width,42);assert.equal(airport.physicalToLocal,.5);
 assert.deepEqual(airport.physicalDimensions.runway,[4500,84]);assert.equal(airport.geometry.taxiwaySourceFeatures,11);
 assert(airport.access.port[0]>0,'The airport driveway reaches the facilities side');
 assert.equal(await page.locator('#error').isVisible(),false);
 evidence.initial={rocket:initial.rocket,knowledge:initial.knowledge,clearance:initial.clearance,airport:{version:airport.version,length:airport.length,width:airport.width,physicalDimensions:airport.physicalDimensions,access:airport.access},mik:{version:initial.stats.mik112.version,columnDisplay:initial.stats.mik112.columnDisplay}};console.log('ROCKET_BROWSER_RUNTIME_READY',JSON.stringify({placements:initial.rocket.placements.length,uniqueModels:initial.rocket.loadedAssetCount,stories:initial.knowledge.stories}));
 await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(false);window.__BAIKONUR_QA.setLabelsVisible(false);});
 evidence.timeline=[];
 for(const [year,visible] of [[1985,false],[1986,true],[2026,true]]){
  await page.locator('#year').evaluate((input,year)=>{input.value=String(year);input.dispatchEvent(new Event('input',{bubbles:true}));},year);
  const state=await page.evaluate(()=>({year:window.__BAIKONUR_QA.stats().mik112.year,tua:window.__BAIKONUR_QA.stats().mik112.tua.visible,placements:window.__BAIKONUR_QA.rockets.stats().placements.filter(p=>p.key.startsWith('tua-'))}));
  assert.equal(state.year,year);assert.equal(state.tua,visible,'TUA follows the historical timeline');
  assert.equal(state.placements.length,2);
  for(const placement of state.placements){assert.equal(placement.visible,true,'A historical year preserves the chosen exhibit state');assert.equal(placement.effectiveVisible,visible,'The exhibit follows its transporter visibility');}
  evidence.timeline.push(state);
 }

 await menuAction('tua');
 assert.equal(await page.locator('#tuaRocketControls').isVisible(),true);
 assert.match(await page.locator('#title').textContent(),/ТУА|Кузнечик|Кузнечки/i);
 assert.deepEqual(await page.locator('#tuaRocketChoice option').evaluateAll(options=>options.map(o=>o.value)),choices);
 const knowledge=page.locator('#infoExtra .museum-knowledge[data-knowledge-kind="rocket"][data-knowledge-id="tua"]');
 assert.equal(await knowledge.count(),1);assert.equal(await knowledge.isVisible(),true);
 assert(await knowledge.locator('a[href*="buran.ru/"]').count()>=2,'The TUA card cites the archive');
 assert.match(await knowledge.textContent(),/571\s*т/,'TUA source payload rating is present');
 evidence.tuaCard=await knowledge.innerText();
 await shot('tua-card-initial');console.log('ROCKET_BROWSER_TUA_CARD_READY');
 for(const id of choices){
  const state=await chooseThroughUi(id);
  for(const p of state.placements.filter(p=>!p.key.startsWith('tua-')))assert.equal(p.modelId,expected[p.key][1],'TUA selection leaves other exhibits unchanged');
 }
 console.log('ROCKET_BROWSER_FOUR_CHOICES_READY');
 const allLoaded=await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats());assert.equal(allLoaded.loadedAssetCount,5);
 assert.equal(evidence.modelRequests.length,5,'One binary request supplies all copies of each model');
 assert.equal(new Set(evidence.modelRequests).size,5,'Shared models are not downloaded for each site');
 await page.locator('#tuaHideRocket').click();
 assert.equal(await page.locator('#tuaHideRocket').getAttribute('aria-pressed'),'false');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.filter(p=>p.key.startsWith('tua-')).every(p=>!p.visible)),true);
 assert.match(await page.locator('#tuaRocketStatus').textContent(),/без ракеты/);
 await shot('tua-without-exhibit');
 await page.locator('#tuaHideRocket').click();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.filter(p=>p.key.startsWith('tua-')).every(p=>p.visible)),true);
 await chooseThroughUi('energia-buran');

 // Inspect the actual seven placements through the same public site controls.
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-1'));await shot('gagarin-soyuz');
 await page.evaluate(()=>{window.__BAIKONUR_QA.focusSite('pad-31');window.__BAIKONUR_QA.inspectSite31('all');});await shot('site31-soyuz');
 await page.evaluate(()=>{window.__BAIKONUR_QA.focusSite('pad-250');window.__BAIKONUR_QA.inspectUkss('overview');});await shot('ukss-polyus');
 await page.locator('#ukssMockupToggle').click();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='ukss').visible),false);
 await page.locator('#ukssMockupToggle').click();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='ukss').visible),true);
 await page.evaluate(()=>{window.__BAIKONUR_QA.focusSite('pad-110');window.__BAIKONUR_QA.inspectSite110('left');});await shot('site110-buran');
 await page.evaluate(()=>{window.__BAIKONUR_QA.focusSite('pad-112');window.__BAIKONUR_QA.inspectMik112('top');});await shot('mik112-hall');
 await page.evaluate(()=>window.__BAIKONUR_QA.inspectMik112('tua'));await shot('tua-buran');
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-251'));
 await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().airports.find(a=>a.key==='yubileiny').mriya.status==='ready',null,{timeout:180000});
 await shot('yubileiny');await page.locator('#airportViews button:last-child').click();await shot('yubileiny-mriya');

 // Legends are visibly distinguished from documents and attributed memoirs.
 if(!await page.locator('#mythsAccordion').evaluate(el=>el.open))await page.locator('#mythsAccordion > summary').click();
 assert.equal(await page.locator('#mythsAccordion [data-museum-action]').count(),12);
 for(const [id,type,label] of [
  ['abort-51','documented','Документированный факт'],['coins-under-tua','recollection','Воспоминание участника'],
  ['dmb-inscription','disputed','Спорная история'],['baikal-secret-flight','hoax','Первоапрельский розыгрыш']
 ]){
  await menuAction('story:'+id,'mythsAccordion');
  const card=page.locator(`#infoExtra [data-knowledge-kind="story"][data-knowledge-id="${id}"]`);
  assert.equal(await card.count(),1);assert.equal(await card.locator('.museum-knowledge-badge').getAttribute('data-evidence'),type);
  assert.equal(await card.locator('.museum-knowledge-badge').textContent(),label);
  assert(await card.locator('a[href*="buran.ru/"]').count()>0);
  assert.equal(await page.locator('#tuaRocketControls').isVisible(),false,'Story cards hide unrelated placement controls');
  evidence.stories.push({id,type,label,text:await card.innerText()});
 }
 await shot('legend-labelled-as-hoax');

 await page.setViewportSize({width:390,height:844});await menuAction('tua');await step();
 assert.equal(await page.locator('#tuaRocketControls').isVisible(),true);
 const mobile=await page.evaluate(()=>{
  const selectors=['#info','#tuaRocketControls','#tuaRocketChoice','#tuaPlaceRocket','#tuaHideRocket'];
  return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,rects:selectors.map(selector=>{
   const el=document.querySelector(selector),r=el.getBoundingClientRect();return{selector,x:r.x,right:r.right,width:r.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
  })};
 });
 assert(mobile.documentWidth<=390+1,'The phone page has no horizontal overflow');
 for(const r of mobile.rects){assert(r.x>=-1&&r.right<=391,r.selector+' fits the phone width');assert(r.scrollWidth<=r.clientWidth+2,r.selector+' does not crop content horizontally');}
 evidence.mobile=mobile;await shot('mobile-tua-controls');
 await chooseThroughUi('energia-m');await shot('mobile-tua-energia-m');
 await page.locator('#tuaHideRocket').click();assert.equal(await page.locator('#tuaHideRocket').getAttribute('aria-pressed'),'false');
 await page.locator('#tuaHideRocket').click();await chooseThroughUi('energia-buran');
 await menuAction('story:baikal-secret-flight','mythsAccordion');await shot('mobile-legend');
 const end=await page.evaluate(()=>({rockets:window.__BAIKONUR_QA.rockets.stats(),stats:window.__BAIKONUR_QA.stats()}));
 checkScale(end.rockets);assert.equal(end.stats.shadersValid,true);assert(end.stats.render.drawCalls>0);
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('ROCKET_EXHIBITS_BROWSER_PASS',JSON.stringify({prefix,placements:7,initialUniqueModels:3,loadedModels:5,commonMetre:.14,choices:4,storyTypes:4,mobile:true,views:evidence.views.length}));
}catch(error){
 console.error('ROCKET_BROWSER_FAILURE',error.message);
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));throw error;
}finally{await browser.close();}
