import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-krayniy';
const revision='20261030-krayniy-terminal-v1';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],views:[],mobile:[]};
page.on('pageerror',e=>evidence.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(m.text()))evidence.shaderErrors.push(m.text());});
page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)evidence.failedResources.push({url:r.url(),status:r.status()});});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__KRAYNIY_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__KRAYNIY_FRAME());
const shot=async name=>{await step();await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});};
const url=detail=>{const u=new URL(base);u.searchParams.set('view','krayniy');u.searchParams.set('detail',detail);return u.href;};
async function ready(){
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 assert.equal(await page.locator('#error').isVisible(),false);
}
async function current(view){
 const state=await page.evaluate(()=>({stats:window.__BAIKONUR_QA.stats(),camera:window.__BAIKONUR_QA.cameraState()}));
 assert.equal(state.stats.krayniyTerminalView,view);
 assert.equal(await page.locator(`#airportViews [data-airport-view="${view}"]`).getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#airportViews [aria-pressed="true"]').count(),1);
 const [x,y,z]=state.camera.position,[tx,ty,tz]=state.camera.target;
 const elevation=Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI;
 assert.ok(elevation>=29.99&&elevation<=90.01,'Every view respects the camera elevation');
 assert.ok(state.stats.render.drawCalls>0&&state.stats.shadersValid);
 return {view,camera:state.camera,elevation,render:state.stats.render};
}
async function mobileLayout(){
 return page.evaluate(()=>{
  const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  return{width:innerWidth,height:innerHeight,info:box('#info'),dock:box('#timeDock'),header:box('#museumLeftStack'),
   buttons:[...document.querySelectorAll('#airportViews [data-airport-view]')].map(b=>{const r=b.getBoundingClientRect();return{view:b.dataset.airportView,x:r.x,y:r.y,right:r.right,bottom:r.bottom};})};
 });
}
try{
 await page.goto(url('airside'),{waitUntil:'domcontentloaded',timeout:90000});await ready();
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 const airport=initial.airports.find(a=>a.key==='krayniy'),terminal=airport?.terminal;
 assert.ok(terminal);assert.equal(terminal.version,'krayniy-drive-terminal-v1');
 assert.equal(terminal.source.photos.length,5);
 assert.ok(terminal.center[0]<0&&airport.apron[0]<0&&airport.taxiX<0,'Terminal, apron and taxiway occupy the requested opposite side');
 assert.ok(Math.abs(terminal.center[2])<3,'The terminal is near the runway midpoint shown in the satellite reference');
 assert.equal(airport.length,1380);assert.equal(airport.referenceLength,3100);assert.equal(airport.osmRunwayId,37591623);
 assert.ok(terminal.drawCalls<=24&&terminal.triangles<8000,'The photo reconstruction remains lightweight');
 assert.deepEqual(terminal.signTexts,['БАЙКОНУР','АЭРОПОРТ']);assert.equal(terminal.externalTextures,0);
 assert.equal(await page.locator('#airportViews [data-airport-view]').count(),4);
 assert.equal(initial.ukss.status,'ready');assert.equal(initial.mik112.tua.status,'ready');
 evidence.terminal=terminal;evidence.airport={length:airport.length,referenceLength:airport.referenceLength,apron:airport.apron,taxiX:airport.taxiX};
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 for(const view of ['airside','landside','top','all']){
  await page.locator(`#airportViews [data-airport-view="${view}"]`).click();await step();
  evidence.views.push(await current(view));await shot(view+'-day');
 }
 assert.notDeepEqual(evidence.views[0].camera.position,evidence.views[1].camera.position,'The two facades have distinct viewpoints');
 await page.locator('#airportViews [data-airport-view="airside"]').click();
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await shot('airside-evening');
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));

 // The unrelated airport retains its original controls and aircraft exhibit.
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-251'));await step();
 assert.equal(await page.locator('#airportViews button').count(),2);
 assert.equal(await page.locator('#airportViews button:last-child').textContent(),'Мрия и Буран');
 assert.equal(await page.locator('#info').evaluate(e=>e.classList.contains('terminal-active')),false);
 await page.evaluate(()=>window.__BAIKONUR_QA.inspectKrayniyTerminal('airside'));
 await page.setViewportSize({width:390,height:844});await step();
 assert.equal(await page.locator('#info').evaluate(e=>e.classList.contains('terminal-active')),true);
 for(const view of ['airside','landside','top']){
  await page.locator(`#airportViews [data-airport-view="${view}"]`).click();await step();
  const layout=await mobileLayout();
  assert.ok(layout.info.bottom<=layout.dock.y-5,'The compact card stays above the timeline');
  assert.ok(layout.info.y>=layout.header.bottom+20,'The card leaves a usable map area below the header');
  for(const button of layout.buttons)assert.ok(button.x>=layout.info.x&&button.right<=layout.info.right+1&&button.y>=layout.info.y&&button.bottom<=layout.info.bottom,'All four controls stay visible');
  evidence.mobile.push({...await current(view),layout});await shot('mobile-'+view);
 }
 await page.locator('#detailMore').click();
 assert.equal(await page.locator('#info').evaluate(e=>e.classList.contains('terminal-details-open')),true);
 assert.equal(await page.locator('#infoExtra a[href*="drive.google.com/file/d/"]').count(),5);
 assert.match(await page.locator('#infoExtra').textContent(),/аэровокзал Крайнего/);
 await page.locator('#airportViews [data-airport-view="airside"]').click();
 assert.equal(await page.locator('#info').evaluate(e=>e.classList.contains('terminal-details-open')),false);
 await page.locator('#close').click();await step();assert.equal(await page.locator('#info').isVisible(),false);
 await shot('mobile-card-closed');

 // Fresh portrait navigation exercises the direct URL without a preceding
 // desktop visit or state left by a QA-only focus operation.
 await page.goto(url('landside'),{waitUntil:'domcontentloaded',timeout:90000});await ready();await step();
 await current('landside');await shot('mobile-deep-link');
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('KRAYNIY_TERMINAL_BROWSER_PASS',JSON.stringify({prefix,revision,views:evidence.views.length,mobileViews:evidence.mobile.length,triangles:terminal.triangles,draws:terminal.drawCalls}));
}catch(error){
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));throw error;
}finally{await browser.close();}
