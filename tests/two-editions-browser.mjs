import assert from 'node:assert/strict';import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_DIR||'qa-two-editions',runs=Number(process.env.QA_RUNS||3),publicOnly=process.env.QA_PUBLIC_ONLY==='1';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const report={base,measuredAt:new Date().toISOString(),environment:'Chromium on GitHub Actions / software WebGL. Not a physical office PC or phone.',network:{downloadMbps:10,latencyMs:80,cache:'cold, new context for each run'},measurements:[],checks:[]};
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
async function open(edition,{mobile=false,throttle=true}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});if(throttle)await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:10e6/8,uploadThroughput:2e6/8});let bytes=0;cdp.on('Network.loadingFinished',e=>bytes+=e.encodedDataLength);
 if(edition==='workshop'&&!throttle)await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='animate'?(window.__WORKSHOP_TEST_FRAME=fn,0):native(fn);});
 const url=base+(edition==='public'?'museum.html?tour=0':'workshop.html?tour=0');await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});
 try{await page.waitForFunction(edition==='public'?()=>window.__PUBLIC_MUSEUM?.stats().ready:()=>window.__MUSEUM_WORKSHOP?.ready&&document.body.classList.contains('museum-ready'),null,{timeout:240000,polling:100});}catch(e){await page.screenshot({path:out+'/'+edition+'-startup-failure.png'}).catch(()=>{});console.error('STARTUP_ERRORS',errors);throw e;}
 const ms=await page.evaluate(()=>performance.now());return {context,page,errors,requests,measurement:{edition,mobile,readyMs:Math.round(ms),transferBytes:bytes,requests:requests.length}};
}
try{
 for(const edition of publicOnly?['public']:['public','workshop'])for(let i=0;i<runs;i++){
  const t=await open(edition);report.measurements.push({...t.measurement,run:i+1});assert.deepEqual(t.errors,[],edition+' JavaScript errors');
  if(edition==='public'){
   assert(!t.requests.some(u=>/\/data\/osm\/(roads|railways)|\/src\/road-editor|\/src\/osm-transport/.test(u)),'No source GIS/editor in visitor startup');
   const s=await t.page.evaluate(()=>window.__PUBLIC_MUSEUM.stats());assert.equal(s.roadMode,'terrain-texture');assert.equal(s.loadedSites,0);assert(s.siteCount>70);report.checks.push({check:'public-no-heavy-startup',passed:true,stats:s});
  }else{
   await t.page.waitForFunction(()=>document.querySelector('#cameraAltitude')?.hidden===false);assert(await t.page.locator('#coordinateGridHud').isVisible());assert(await t.page.locator('#workshopTools').isVisible());assert.equal(await t.page.evaluate(()=>window.__BAIKONUR_QA.stats().roadEditor.readOnly),false);
  }
  if(i===0)await t.page.screenshot({path:out+'/'+edition+'-desktop.png'});await t.context.close();console.log('LOAD_MEASURED',JSON.stringify(t.measurement));
 }
 if(!publicOnly){const t=await open('workshop',{throttle:false});
  const original=await t.page.evaluate(()=>{window.__MUSEUM_WORKSHOP.select('pad-113');return Number(document.querySelector('#wsH').value);});
  await t.page.locator('#wsH').fill(String(original+2));await t.page.locator('#wsApply').click();
  assert(Math.abs(await t.page.evaluate(()=>window.__WORKSHOP_SCENE.objects.find(o=>o.record.id==='pad-113').g.position.y)-(original+2))<.001);
  await t.page.locator('#wsUndo').click();assert(Math.abs(await t.page.evaluate(()=>window.__WORKSHOP_SCENE.objects.find(o=>o.record.id==='pad-113').g.position.y)-original)<.001);
  await t.page.locator('#wsRedo').click();await t.page.reload({waitUntil:'domcontentloaded'});await t.page.waitForFunction(()=>window.__MUSEUM_WORKSHOP?.ready,null,{timeout:240000});
  assert(Math.abs(await t.page.evaluate(()=>window.__WORKSHOP_SCENE.objects.find(o=>o.record.id==='pad-113').g.position.y)-(original+2))<.001);
  await t.page.evaluate(()=>{window.__MUSEUM_WORKSHOP.select('pad-113');document.querySelector('#wsResetObject').click();});
  await t.page.locator('#wsFocus').click();await t.page.locator('#wsRoadList').click();assert(await t.page.locator('#wsRoad option').count()>100);
  const roadBefore=await t.page.evaluate(()=>window.__WORKSHOP_SCENE.roadEditor.snapshot());
  const nodeX=Number(await t.page.locator('#wsRoadX').inputValue());await t.page.locator('#wsRoadX').fill(String(nodeX+.2));await t.page.locator('#wsLinked').uncheck();await t.page.locator('#wsMoveNode').click();
  const roadAfter=await t.page.evaluate(()=>window.__WORKSHOP_SCENE.roadEditor.snapshot());assert(roadAfter.added.length>roadBefore.added.length,'Moving a source road node produces a replacement road');
  await t.page.evaluate(roads=>{const api=window.__MUSEUM_WORKSHOP,s=api.snapshot();s.roads=roads;api.apply(s);},roadBefore);
  await t.page.locator('#wsDraw').click();assert(await t.page.locator('#roadEditorPanel').isVisible());
  report.checks.push({check:'workshop-transform-undo-redo-reload-and-road-node-edit',passed:true});assert.deepEqual(t.errors,[]);await t.context.close();
 }
 const t=await open('public',{throttle:false});
 for(const id of ['pad-113','pad-31','pad-95','pad-45','pad-254','pad-110','pad-1']){
  await t.page.evaluate(id=>window.__PUBLIC_MUSEUM.openSite(id),id);await t.page.waitForFunction(id=>window.__PUBLIC_MUSEUM.stats().loadedIds.includes(id),id,{timeout:180000,polling:200});
  await t.page.waitForTimeout(700);await t.page.screenshot({path:out+'/public-'+id+'.png'});assert(await t.page.locator('#publicInfoTitle').textContent());
 }
 const streamed=await t.page.evaluate(()=>window.__PUBLIC_MUSEUM.stats());assert(streamed.loadedSites<=6);assert(streamed.infoLoads>=7);assert.deepEqual(t.errors,[]);assert.deepEqual(streamed.errors,[]);report.checks.push({check:'on-demand-info-models-and-bounded-cache',passed:true,stats:streamed});
 await t.page.evaluate(()=>window.__PUBLIC_MUSEUM.setOverview());await t.page.waitForTimeout(1800);const a=await t.page.evaluate(()=>window.__PUBLIC_MUSEUM.stats().renderFrames);await t.page.waitForTimeout(1200);const b=await t.page.evaluate(()=>window.__PUBLIC_MUSEUM.stats().renderFrames);assert(b-a<8,'Idle scene must not render continuously');report.checks.push({check:'idle-render-paused',passed:true,framesAfterSettle:b-a});await t.context.close();
 const m=await open('public',{mobile:true});report.measurements.push({...m.measurement,run:1});await m.page.screenshot({path:out+'/public-mobile.png'});assert.deepEqual(m.errors,[]);report.checks.push({check:'mobile-viewport-WebGL',passed:true,device:'emulated viewport, not physical phone'});await m.context.close();
 report.summary=Object.fromEntries(['public','workshop'].map(edition=>{const rows=report.measurements.filter(r=>r.edition===edition&&!r.mobile);return[edition,{runs:rows.length,medianMs:rows.length?median(rows.map(x=>x.readyMs)):null,minMs:rows.length?Math.min(...rows.map(x=>x.readyMs)):null,maxMs:rows.length?Math.max(...rows.map(x=>x.readyMs)):null,medianTransferBytes:rows.length?median(rows.map(x=>x.transferBytes)):null}];}));report.passed=true;
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log('TWO_EDITIONS_PASS',JSON.stringify(report.summary));
}catch(e){report.passed=false;report.failure=e.message;await writeFile(out+'/report.json',JSON.stringify(report,null,2));throw e;}finally{await browser.close();}
