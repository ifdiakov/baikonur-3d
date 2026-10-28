import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local';await mkdir('qa-flanks',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(45000);
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let frozen=false,pending;
 window.requestAnimationFrame=fn=>frozen&&fn.name==='animate'?(pending=fn,0):native(fn);
 window.__freezeMuseum=()=>{frozen=true;};
 window.__stepMuseum=()=>new Promise(resolve=>native(t=>{const fn=pending;pending=null;fn?.(t);resolve();}));
});
const step=()=>page.evaluate(()=>window.__stepMuseum());
const errors=[],shaders=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader/i.test(m.text()))shaders.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
try{
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__BAIKONUR_QA?.showFlanks,null,{timeout:120000});
 await page.evaluate(()=>window.__freezeMuseum());await step();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleZones),0);
 await page.locator('#flanksView').click();await step();await page.waitForTimeout(400);
 const state=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(state.flankCardLayout,'horizontal');assert.equal(state.flankDistricts.version,'angular-territories-v2');
 assert.equal(state.flankDistricts.visibleZones,3);assert.equal(state.flankDistricts.visibleBoundaries,2);
 assert.ok(state.flankDistricts.alpha>.9);assert.equal(state.flankCards.panels,3);
 assert.equal(state.flankCards.plane,'screen');assert.equal(state.flankCards.groundPanels,0);
 assert.equal(state.flankDistricts.groundTextPanels,0);
 assert.equal(await page.locator('.flank-territory-layer,.flank-on-terrain').count(),0,'No text or portrait panels remain on the ground');
 assert.deepEqual(await page.locator('.flank-engineer').allTextContents(),['ЧЕЛОМЕЙ','КОРОЛЁВ','ЯНГЕЛЬ']);
 const rects=await page.locator('.flank-label').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.district,x:r.x,y:r.y,w:r.width,h:r.height,transform:getComputedStyle(e).transform};}));
 const ui=await page.locator('#ui').boundingBox();console.log('FLANK RECTS',JSON.stringify({rects,ui,hero:await page.locator('#hero').evaluate(e=>({inline:e.style.opacity,computed:getComputedStyle(e).opacity}))}));
 for(const r of rects){assert.ok(r.x>ui.x+ui.width-6,r.id+' clears the left controls');assert.ok(r.x+r.w<1602,r.id+' fits the viewport');assert.ok(r.y>0&&r.y+r.h<850,r.id+' stays above the timeline');assert.ok(!r.transform.includes('matrix3d'),'Restored cards stay screen-aligned');}
 for(let i=1;i<rects.length;i++)assert.ok(rects[i].x>rects[i-1].x+rects[i-1].w,'Territory cards do not overlap');
 const portraits=await page.locator('.flank-portrait img').evaluateAll(es=>es.map(e=>({src:e.currentSrc||e.src,loaded:e.complete&&e.naturalWidth>0})));
 assert.ok(portraits.every(p=>p.loaded),'All three local archival portraits load');
 await page.screenshot({path:`qa-flanks/${prefix}-cards-evening.png`,timeout:90000});
 await page.locator('#eveningToggle').click();await step();await page.screenshot({path:`qa-flanks/${prefix}-cards-day.png`,timeout:90000});await page.locator('#eveningToggle').click();
 await page.locator('#showLabels').uncheck();await step();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleZones),0);assert.equal(await page.locator('.flank-label:visible').count(),0);await page.locator('#showLabels').check();await step();
 await page.locator('.flank-label[data-district="center"]').click();await step();await page.waitForTimeout(350);
 const close=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.ok(close.flankDistricts.alpha<.05);assert.ok(await page.locator('.site-label:visible').count()>0);
 await page.locator('#flanksView').click();await step();await page.locator('.flank-label[data-district="right"]').focus();await page.keyboard.press('Enter');await step();await page.waitForTimeout(350);assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.alpha))<.05);
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(1450));assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleBoundaries),0);
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(460));assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleBoundaries),0);
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(180));assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleZones),0);
 // The user's hotel correction must reach the actual visible card and logo.
 const hotel=await page.evaluate(async()=>{
  const catalog=await (await fetch('./data/catalog.json',{cache:'no-store'})).json();
  const index=catalog.sites.findIndex(site=>site.id==='pad-75');
  if(index<0)throw new Error('Missing Seven Winds hotel record');
  window.__BAIKONUR_QA.focusSite(index);return catalog.sites[index];
 });await step();
 assert.equal(hotel.organisation.org,'ЦЭНКИ');assert.deepEqual([hotel.x,hotel.y],[639,551]);
 assert.ok((await page.locator('#title').textContent()).includes('7 ветров'));
 assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),'tsenki');
 assert.equal(await page.locator('#infoOrgRole').textContent(),'Владелец — ЦЭНКИ');
 assert.ok((await page.locator('#infoPurpose').textContent()).includes('принадлежит ЦЭНКИ'));
 await page.waitForFunction(()=>{const image=document.querySelector('#infoOrg img');return image?.complete&&image.naturalWidth>0;});
 await page.screenshot({path:`qa-flanks/${prefix}-seven-winds.png`,timeout:90000});
 await page.setViewportSize({width:390,height:844});await step();
 await page.locator('#flanksView').click();await step();await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankCardLayout),'vertical');
 const mobile=await page.evaluate(()=>({
  cards:[...document.querySelectorAll('.flank-label')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}),
  uiRight:document.getElementById('ui').getBoundingClientRect().right,
  dockTop:document.getElementById('timeDock').getBoundingClientRect().top
 }));
 for(const r of mobile.cards){assert.ok(r.x>=mobile.uiRight+6&&r.x+r.w<=390,'Mobile card clears sidebar and viewport');assert.ok(r.y>0&&r.y+r.h<mobile.dockTop,'Mobile card stays above timeline');}
 for(let i=1;i<mobile.cards.length;i++)assert.ok(mobile.cards[i].y>=mobile.cards[i-1].y+mobile.cards[i-1].h,'Stacked mobile cards do not overlap');
 await page.screenshot({path:`qa-flanks/${prefix}-cards-mobile.png`,timeout:90000});
 assert.deepEqual(errors,[]);assert.deepEqual(shaders,[]);
 await writeFile(`qa-flanks/${prefix}-result.json`,JSON.stringify({passed:true,rects,mobile,portraits,offline:!!process.env.BAIKONUR_OFFLINE,state:state.flankDistricts,errors,shaders},null,2));console.log('FLANKS_BROWSER_PASS',JSON.stringify({rects,mobile,portraits}));
}catch(e){await page.screenshot({path:`qa-flanks/${prefix}-failure.png`,timeout:60000}).catch(()=>{});console.error(JSON.stringify({message:e.message,errors,shaders}));throw e;}finally{await browser.close();}
