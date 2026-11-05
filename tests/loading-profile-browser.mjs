import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
const page=await context.newPage(),requests=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin)requests.push(u.pathname);});
try{
 await page.goto(new URL('?tour=0',base).href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__MUSEUM_STARTUP?.stats?.().marks.some(m=>m.name==='interactive'),null,{timeout:180000});
 const stats=await page.evaluate(()=>{
  const marks=window.__MUSEUM_STARTUP.stats().marks;
  const get=name=>marks.find(x=>x.name===name).at;
  return {firstFrameMs:Math.round(get('first-frame')-get('startup')),interactiveMs:Math.round(get('interactive')-get('startup')),
   firstSceneReady:!!window.__BAIKONUR_QA,loaderHidden:document.getElementById('museumLoading')?.hidden,
   stages:marks.filter(x=>x.name.startsWith('stage-')).map(x=>({stage:x.name,ms:Math.round(x.at-get('startup'))})),
   transportPhases:window.__BAIKONUR_QA.stats().transport.buildPhases};
 });
 assert(stats.firstSceneReady&&stats.loaderHidden);
 const gallery=requests.filter(x=>x.includes('/assets/preloader/'));
 for(const file of ['soyuz-launch-20261103.webp','energia-buran-20261103.webp','tracking-station-20261103.webp','proton-rollout-20261103.webp','launch-complex-20261105.webp','buran-hangar-20261105.webp'])
  assert(gallery.some(x=>x.endsWith(file)),'All six gallery slides must load for the CSS carousel: '+file);
 assert(!requests.some(x=>x.endsWith('/src/complex-history-content.js')),'Full archive must not load before visitor opens it');
 const initialRequests=requests.length;
 await page.evaluate(()=>{document.querySelector('#complexHistoryAccordion').open=true;document.querySelector('[data-museum-action="history:why"]').click();});
 await page.waitForFunction(()=>document.querySelector('#complexHistoryPanel')?.hidden===false,null,{timeout:120000});
 assert.match(await page.locator('#complexHistoryPanel h3').textContent(),/Тюра-Там/);
 assert(requests.slice(initialRequests).some(x=>x.endsWith('/src/complex-history-content.js')),'Full history loads on demand');
 assert.deepEqual(errors,[]);
 await mkdir('qa-loading',{recursive:true});
 await writeFile('qa-loading/profile.json',JSON.stringify({measuredAt:new Date().toISOString(),...stats,
  initialRequests,initialGallery:gallery,extraHistoryRequests:requests.length-initialRequests,errors},null,2));
 console.log('MUSEUM_FAST_LOADING_BROWSER_PASS '+JSON.stringify({firstFrameMs:stats.firstFrameMs,interactiveMs:stats.interactiveMs,initialRequests,initialGallery:gallery}));
}finally{await browser.close();}
