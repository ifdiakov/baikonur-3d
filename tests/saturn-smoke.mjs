import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
 '--enable-webgl','--disable-gpu-sandbox'
]});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message||String(error)));
const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const url=new URL(origin);url.searchParams.set('site','23');
await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:40000});
await page.waitForFunction(()=>{
 const qa=window.__BAIKONUR_QA;
 return !!qa?.stats()?.saturn;
},{timeout:60000});
await page.waitForTimeout(600);
const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
console.log('SATURN MODEL',JSON.stringify(stats.saturn));
assert.equal(stats.saturn.version,'1.0','3D model version');
assert.equal(stats.saturn.siteNumber,23);
assert.equal(stats.saturn.largeAntennaCount,2);
assert.equal(stats.saturn.dishDiameterMetres,25);
assert.deepEqual(stats.saturnPlacement,[709,806]);
assert.ok(stats.saturn.instancedFrameBatches>=2,'Steel antenna lattice must be GPU-instanced');
assert.ok(stats.saturn.primitiveCount>800,'Model must contain photographic structural detail');
for(const [key,min] of [
 ['25m-parabolic-reflector',2],['dish-radial-rib',400],
 ['feed-support-truss',8],['white-radome',1],['control-building',4],
 ['access-from-highway',1],['tower-horizontal-cornice',8]
])assert.ok((stats.saturn.featureCounts[key]||0)>=min,'Missing '+key);
assert.equal(stats.sites,98,'New attributed Site 23 must be in general catalog');
assert.ok(await page.locator('#title').isVisible(),'Direct ?site=23 link must focus Saturn');
assert.ok((await page.locator('#title').textContent()).includes('ИП-5'));
assert.ok((await page.locator('#description').textContent()).includes('предварительная'));
await page.locator('#detailMore').click();
assert.equal(await page.locator('#infoExtra a[href*="drive.google.com/file/"]').count(),4);
const viewport=await page.evaluate(()=>{
 const canvas=document.querySelector('#view canvas');
 return{w:canvas?.width||0,h:canvas?.height||0,webglError:document.querySelector('#error')?.textContent||''};
});
assert.ok(viewport.w>=1200&&viewport.h>=800,'3D renderer must paint viewport');
assert.equal(viewport.webglError,'','No runtime failure visible in museum error overlay');
await page.screenshot({path:'qa-saturn-ip5.png'});
assert.deepEqual(errors,[],'No uncaught JavaScript errors');
await browser.close();
console.log('SATURN IP-5 browser smoke PASSED: 2x 25m P-200, instanced trusses, radome, buildings, provisional geolocation, direct link, 4 photo refs.');
