import {chromium} from 'playwright';import assert from 'node:assert/strict';import{writeFileSync,mkdirSync}from'node:fs';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local';mkdirSync('qa-portal',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});const errors=[],shaderErrors=[];
// Stop the scene loop between inspection frames so software WebGL can capture it.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);window.__PORTAL_PENDING=null;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(window.__PORTAL_PENDING=fn,0):native(fn);
 window.__PORTAL_FRAME=()=>{const fn=window.__PORTAL_PENDING;window.__PORTAL_PENDING=null;fn?.(performance.now());};
});
const capture=page.screenshot.bind(page);page.screenshot=async options=>{
 await page.evaluate(()=>window.__PORTAL_FRAME());return capture({...options,timeout:90000});
};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|compile shader/i.test(m.text()))shaderErrors.push(m.text());});
try{
 await page.goto(base+'?site=1&v=portal-reviewed-v1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats()?.portalArchive?.count===11,null,{timeout:90000});
 await page.waitForTimeout(800);
 await page.locator('#showLabels').uncheck();
 await page.screenshot({path:`qa-portal/${prefix}-gagarin-evening.png`});
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));await page.waitForTimeout(350);
 const s=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(s.gagarin.version,'3.3-below-grade');assert.ok(Math.abs(s.gagarinGround.rimY-s.gagarinGround.groundY)<1e-7);
 assert.ok(s.gagarinGround.floorY<s.gagarinGround.groundY-1);assert.ok(s.terrainVoids.count>=9);assert.ok(s.terrainVoids.materials>=4);assert.ok(s.terrainVoids.spatialCulling);
 assert.equal(s.saturn.largeAntennaCount,2);assert.equal(s.mik112.transporterCount,2);
 assert.ok(s.shadersValid);assert.equal(await page.locator('#error').isVisible(),false);
 await page.screenshot({path:`qa-portal/${prefix}-gagarin-trench.png`});
 await page.evaluate(()=>{window.__BAIKONUR_QA.inspectGagarinExcavation();document.getElementById('info').style.display='none';});await page.waitForTimeout(350);
 await page.screenshot({path:`qa-portal/${prefix}-gagarin-cutout-clear.png`});
 const orgs=[['pad-1','infracos'],['pad-112a','infracos'],['pad-42','baiterek'],['pad-45','baiterek']];
 const catalog=await (await page.request.get(base+'data/catalog.json?qa=portal-reviewed')).json();
 const city=catalog.sites.find(s=>s.id==='city');assert.deepEqual([city.x,city.y],[710,924]);
 for(const [id,logo]of orgs){const index=catalog.sites.filter(r=>!r.aliasOf&&r.render!==false).findIndex(o=>o.id===id);assert.ok(index>=0);await page.evaluate(i=>window.__BAIKONUR_QA.focusSite(i),index);await page.waitForFunction(expected=>{const e=document.querySelector('#infoOrg');const img=e.querySelector('img');return e.dataset.orgLogo===expected&&img?.complete&&img.naturalWidth>0;},logo,{timeout:20000});await page.locator('#infoOrg img').evaluate(img=>img.decode());await page.waitForTimeout(200);await page.screenshot({path:`qa-portal/${prefix}-${id}-brand.png`});}
 const evidence=[];
 for(const model of s.portalArchive.models){
  assert.ok(model.features.primitiveCount>20,model.id+' has model geometry');assert.ok(model.bounds.every(Number.isFinite));assert.ok(model.bounds[0]>2&&model.bounds[2]>2);assert.ok(model.features.batches<180,model.id+' static geometry must be GPU-batched');
  await page.evaluate(i=>window.__BAIKONUR_QA.focusSite(i),model.index);await page.waitForTimeout(200);
  if(['pad-81','pad-92','pad-95','pad-110','pad-251','city'].includes(model.id))await page.screenshot({path:`qa-portal/${prefix}-${model.id}.png`});
  evidence.push({id:model.id,orientation:model.orientation,primitiveCount:model.features.primitiveCount,batches:model.features.batches,bounds:model.bounds});
 }
 await page.locator('#all').click();await page.mouse.move(980,450);await page.mouse.down();await page.mouse.move(1050,480,{steps:8});await page.mouse.up();await page.waitForTimeout(250);
 assert.ok(!(await page.locator('#title').textContent()).includes('Сатурн'),'No navigation jump');
 await page.goto(base+'archive.html?model=np-rockettrip&v=portal-photo-v1',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__ARCHIVE_QA?.stats()?.length===5,null,{timeout:60000});
 for(const id of ['np-rockettrip','kpp-7','pad-41-study','pad-2-study','interior-study']){await page.selectOption('#study',id);const models=await page.evaluate(()=>window.__ARCHIVE_QA.stats());assert.equal(models.filter(m=>m.visible).length,1);assert.ok(models.find(m=>m.id===id).features.primitiveCount>10);if(['np-rockettrip','interior-study'].includes(id))await page.screenshot({path:`qa-portal/${prefix}-${id}.png`});}
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);
 writeFileSync(`qa-portal/${prefix}-result.json`,JSON.stringify({passed:true,base,version:'1.0-portal-photo-pass',scope:'_для портала Байконур',mapModels:evidence,studyCount:5,ownership:orgs,gagarinGround:s.gagarinGround,voids:s.terrainVoids,cityPlacement:[city.x,city.y],dayAndEveningChecked:true,errors,shaderErrors,checkedAt:new Date().toISOString()},null,2));
 console.log('PORTAL_BROWSER_PASS',JSON.stringify({models:evidence.length,studies:5,organisations:orgs,gagarin:s.gagarinGround}));
}catch(e){await page.screenshot({path:`qa-portal/${prefix}-failure.png`}).catch(()=>{});writeFileSync(`qa-portal/${prefix}-failure.json`,JSON.stringify({error:e.message,errors,shaderErrors},null,2));throw e;}finally{await browser.close();}
