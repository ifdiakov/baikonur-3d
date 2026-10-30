import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const prefix=process.env.QA_PREFIX||'local',out='qa-refinement';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});page.setDefaultTimeout(90000);
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let frozen=false,pending;window.requestAnimationFrame=fn=>frozen&&fn.name==='animate'?(pending=fn,0):native(fn);window.__freezeRefinement=()=>{frozen=true;};window.__stepRefinement=()=>new Promise(resolve=>native(t=>{const fn=pending;pending=null;fn?.(t);resolve();}));});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|compile shader|TypeError|ReferenceError|VALIDATE_STATUS/.test(m.text())){errors.push(m.text());console.error(m.text().slice(0,1000));}});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
const shot=async name=>{await page.evaluate(()=>window.__stepRefinement());await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:180000});};
try{
 await page.goto(process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.arrival||document.getElementById('error')?.style.display==='block',null,{timeout:150000});
 assert.ok(await page.evaluate(()=>!!window.__BAIKONUR_QA),await page.locator('#error').textContent());
 const labelsBefore=await page.evaluate(()=>({checked:window.__BAIKONUR_QA.stats().labelsVisible,display:getComputedStyle(document.getElementById('labelLayer')).display}));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.seek(70);q.arrival.setFollowing(true);});
 const followSurface=await page.evaluate(()=>{const hit=document.elementFromPoint(760,370);return{canvas:hit===document.querySelector('#view canvas'),hit:hit?.tagName,checked:window.__BAIKONUR_QA.stats().labelsVisible,display:getComputedStyle(document.getElementById('labelLayer')).display};});
 assert.equal(followSurface.checked,labelsBefore.checked,'Following must preserve the label preference');
 assert.equal(followSurface.display,'none','Ground cards must not obscure the aircraft during follow');
 assert.ok(followSurface.canvas,`The orbit drag must start on the scene canvas, hit ${followSurface.hit}`);
 const before=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());assert.equal(before.aircraft.gearVisible,false);
 await page.mouse.move(760,370);await page.mouse.down();await page.mouse.move(960,470,{steps:3});await page.mouse.up();
 await page.waitForTimeout(500);
 const orbit=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());assert.ok(orbit.following);assert.ok(Math.hypot(...orbit.cameraOffset.map((v,i)=>v-before.cameraOffset[i]))>3,'Left drag must orbit the moving aircraft');
 await page.mouse.wheel(0,-100);await page.waitForTimeout(300);const zoom=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());assert.ok(zoom.following);assert.ok(Math.hypot(...zoom.cameraOffset)<Math.hypot(...orbit.cameraOffset),'Wheel zoom keeps tracking');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(84));const mid=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());assert.ok(mid.gear>0&&mid.gear<1);assert.equal(mid.aircraft.livery,'АЛРОСА');assert.equal(mid.aircraft.litWindows,60);assert.ok(mid.aircraft.cockpitLit);assert.ok(mid.aircraft.gearDoorAngles.some(a=>Math.abs(a)>1));await shot('alrosa-gear');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(120));const down=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());assert.equal(down.gear,1);assert.ok(down.aircraft.gearLegRotations.flat().every(n=>Math.abs(n)<1e-7));assert.ok(down.aircraft.gearDoorAngles.every(n=>Math.abs(n)<1e-7));assert.ok(Math.abs(down.mainWheelBottom-down.runwayY)<1e-5);assert.ok(down.noseWheelBottom>down.mainWheelBottom+.4);assert.ok(down.following);await shot('alrosa-touchdown');
 await page.evaluate(()=>window.__freezeRefinement());
 const labelsRestored=await page.evaluate(()=>{window.__BAIKONUR_QA.arrival.stopFollowing();return{checked:window.__BAIKONUR_QA.stats().labelsVisible,display:getComputedStyle(document.getElementById('labelLayer')).display};});
 assert.deepEqual(labelsRestored,labelsBefore,'Leaving follow must restore the original ground-label state');
 await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(false);window.__BAIKONUR_QA.setLabelsVisible(false);});
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.equal(stats.ukss.trench.branches,1);assert.equal(stats.mik112.features['ochre-perforated-fork'],8);assert.ok(stats.sphericalVessels.length>=3);assert.ok(stats.sphericalVessels.every(([x,y,z])=>Math.abs(x-y)<1e-6&&Math.abs(y-z)<1e-6));
 const k=stats.airports.find(a=>a.key==='krayniy'),y=stats.airports.find(a=>a.key==='yubileiny');assert.ok(Math.abs(y.worldLength/k.worldLength-4500/3100)<1e-8);assert.equal(y.features['mriya-engine'],6);assert.equal(y.features['buran-fuselage'],1);
 assert.equal(stats.traffic.cityRoutes.length,2);assert.equal(stats.transport.interchange.ramps,4);assert.ok(stats.evening.saturnLights.length===4);assert.ok(stats.evening.saturnLights.every(l=>l.y>20));
 for(const sign of stats.highwaySigns.locations){const d=sign.roadTangent;assert.ok(Math.abs(Math.cos(sign.yaw)*d[2]+Math.sin(sign.yaw)*d[0])<1e-6);}
 const minimal=await page.addStyleTag({content:'#ui,#museumLeftStack,#hero,#info,#timeDock,.site-label,.detail-card{visibility:hidden!important}'});
 for(const id of ['pad-110','pad-112a','pad-250']){
  await page.evaluate(id=>{const q=window.__BAIKONUR_QA,s=q.stats();q.focusSite(id==='pad-250'?s.ukssIndex:s.portalArchive.models.find(m=>m.id===id).index);},id);await shot(id);
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.inspectMik112('tua'));await shot('tua');
 await page.evaluate(()=>window.__BAIKONUR_QA.inspectSaturnRelief());await shot('saturn-relief');
 await minimal.evaluate(el=>el.remove());
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite(q.stats().portalArchive.models.find(m=>m.id==='pad-251').index);});
 await page.getByRole('button',{name:'Мрия и Буран',exact:true}).click();await page.locator('#close').click();await shot('mriya-buran');
 await page.evaluate(()=>{window.__BAIKONUR_QA.focusInterchange();});await shot('interchange');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(true);q.setLabelsVisible(true);q.showFlanks();});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.stats())).flankCardLayout,'horizontal');await shot('flanks');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.seek(85);q.arrival.setFollowing(true);});assert.ok(await page.locator('#arrivalFollow').isVisible());await shot('mobile-follow');
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({passed:true,stats,orbit,zoom,errors},null,2));console.log('REFINEMENT_BROWSER_PASS');
}catch(e){console.error('REFINEMENT_FAILURE',e.message);await shot('failure').catch(()=>{});throw e;}finally{await browser.close();}
