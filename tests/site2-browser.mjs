import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createMuseumGeography} from '../src/osm-geography.js';
const expectedMap=createMuseumGeography({catalog:JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url))),matches:JSON.parse(await readFile(new URL('../data/osm/catalog-matches.json',import.meta.url)))}).sites.find(s=>s.id==='pad-2');
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-site2';await mkdir(out,{recursive:true});
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.SITE2_USE_PROXY&&process.env.HTTPS_PROXY){const p=new URL(process.env.HTTPS_PROXY);options.proxy={server:p.origin,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)};}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1600,height:1000},ignoreHTTPSErrors:true});
page.setDefaultTimeout(90000);const errors=[],bad=[],buranRequests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)bad.push([r.status(),r.url()]);});
page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/energia-buran.glb'))buranRequests.push(r.url());});
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SITE2_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};});
const frame=()=>page.evaluate(()=>window.__SITE2_FRAME());
const url=new URL(base);url.searchParams.set('view','site2');url.searchParams.set('detail','stairs');
try{
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:300000});console.log('SITE2_MUSEUM_READY');
 await page.waitForFunction(()=>window.__BAIKONUR_QA.site2.stats()?.asset.status==='ready',null,{timeout:180000});
 const [state,site]=await page.evaluate(()=>[window.__BAIKONUR_QA.site2.stats(),window.__BAIKONUR_QA.siteState('pad-2')]);
 const lighting=await page.evaluate(()=>window.__BAIKONUR_QA.evening.stats().facilityLighting);assert.equal(lighting.sites.find(s=>s.siteId==='pad-2')?.fixtures,10);
 assert.equal(state.asset.status,'ready');assert.equal(state.asset.sourceTriangles,33853);assert.equal(state.reference.photoCount,25);assert.deepEqual(site.map,[expectedMap.x,expectedMap.y]);site.scale.forEach(n=>assert(Math.abs(n-.14)<1e-8));
 assert.equal(await page.locator('#site2Views button').count(),4);assert((await page.locator('#modelCardButton').getAttribute('data-models')).includes('buran'));
 await page.locator('#site2Views button').filter({hasText:'Правый трап'}).click();await frame();await page.screenshot({path:`${out}/${prefix}-stairs-evening.png`});
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 for(const [label,view]of [['Вся площадка','all'],['Буран','buran'],['Музей','museum']]){await page.locator('#site2Views button').filter({hasText:label}).click();await frame();await page.screenshot({path:`${out}/${prefix}-${view}.png`});}
 await page.evaluate(()=>window.__BAIKONUR_QA.site2.inspect('top'));await frame();await page.screenshot({path:`${out}/${prefix}-top.png`});
 await page.setViewportSize({width:390,height:844});await page.locator('#site2Views button').filter({hasText:'Правый трап'}).click();await frame();await page.screenshot({path:`${out}/${prefix}-mobile.png`});
 await page.locator('#close').click();await frame();await page.screenshot({path:`${out}/${prefix}-mobile-uncovered.png`});
 assert.equal(buranRequests.length,1,'The museum and all existing Buran exhibits must share a single GLB request');
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 await writeFile(`${out}/${prefix}-evidence.json`,JSON.stringify({state,site,errors,bad,buranRequests:buranRequests.length},null,2));
 console.log('SITE2_BROWSER_PASS',JSON.stringify({base,draws:state.asset.drawCalls,sourceRequests:buranRequests.length}));
}finally{if(errors.length||bad.length)console.log(JSON.stringify({errors,bad}));await browser.close();}
