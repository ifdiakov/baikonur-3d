import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {stat} from 'node:fs/promises';
const cacheBytes=(await stat(new URL('../data/osm/transport-geometry-bake-v1.json.gz',import.meta.url))).size;
const lodBytes=(await stat(new URL('../data/osm/road-lod-authoritative-v1.json.gz',import.meta.url))).size;
assert(cacheBytes<1500000,'Precompiled transport cache must remain compact: '+cacheBytes);
assert(lodBytes<2000000,'LOD needs to stay small: '+lodBytes);
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[],shaders=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',message=>{if(message.type()==='error'&&/shader error|VALIDATE_STATUS|GL_INVALID_OPERATION/i.test(message.text()))shaders.push(message.text());});
try{
 await page.goto('http://127.0.0.1:8765/?tour=0&fastRoads=1',{waitUntil:'domcontentloaded',timeout:90000});
 try{
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.stats?.(),null,{timeout:30000});
 }catch(error){
  const diagnostic=await page.evaluate(()=>({
   error:document.getElementById('error')?.textContent,
   loading:document.getElementById('museumLoadingMessage')?.textContent,
   bodyReady:document.body.classList.contains('museum-ready'),
   startup:window.__MUSEUM_STARTUP?.stats?.(),
   scriptReady:Boolean(window.__BAIKONUR_QA),
   url:location.href
  })).catch(e=>({evaluateError:e.message}));
  console.error('BAIKONUR_BOOT_DIAGNOSTIC',JSON.stringify({diagnostic,pageErrors:errors,shaders}));
  throw error;
 }
 const report=await page.evaluate(()=>{
  const s=window.__BAIKONUR_QA.stats(),a=window.__MUSEUM_STARTUP.stats().marks;
  const beginning=a.find(x=>x.name==='startup')?.at,interactive=a.find(x=>x.name==='first-frame')?.at;
  return {transport:s.transport,bake:s.transportBake,roadLOD:s.roadLOD,roadEditor:s.roadEditor,
   sites:s.sites,firstFrameMs:Math.round(interactive-beginning),shadersValid:s.shadersValid,
   heading:document.getElementById('museumLoading')?.hidden};
 });
 assert.equal(report.transport.baked,true,'Cached topology and source-filtered preview must be used');
 assert.equal(report.bake.enabled,true);
 assert.equal(report.roadEditor.added,19,'Fast overview must preserve the newly repaired Site 105 road');
 assert.equal(report.roadEditor.hidden,286);
 assert(report.roadEditor.maskedMeshNames.includes('OSM · единое дорожное полотно'));
 assert(report.roadEditor.physicalCuts.sourceCuts>=250,'Approved road removals must cut the fast LOD');
 assert(report.roadEditor.physicalCuts.clipped>0,'Fast LOD must have physically removed road triangles');
 assert(['far','medium'].includes(report.roadLOD.mode),'Real far/medium LOD should be displayed');
 assert(report.transport.roadFeatureCount>3000);
 assert(report.sites>30);
 assert(report.heading);
 assert(report.shadersValid);
 assert.deepEqual(errors,[]);
 assert.deepEqual(shaders,[]);
 console.log('TRANSPORT_CACHE_BROWSER_PASS',JSON.stringify({firstFrameMs:report.firstFrameMs,
   cacheBytes,baked:report.transport.baked,sourceBuildMs:report.transport.sourceBuildMilliseconds,
   mode:report.roadLOD.mode,routeCount:report.transport.roadFeatureCount,siteCount:report.sites}));
}finally{await browser.close();}
