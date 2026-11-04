import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:840},deviceScaleFactor:1});
const errors=[],shaders=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/shader|GL_INVALID_OPERATION|VALIDATE_STATUS|compile/i.test(m.text()))shaders.push(m.text());});
try{
 await page.goto(process.env.BAIKONUR_URL||'http://127.0.0.1:8765/?tour=0&view=terrain&detail=close',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.gameTerrain?.stats?.(),null,{timeout:180000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA.gameTerrain.stats().status!=='queued',{timeout:150000});
 await page.waitForFunction(()=>Boolean(window.__BAIKONUR_QA.gameTerrain.stats().detailedMaterialVersion),{timeout:150000});
 const report=await page.evaluate(()=>{
  const qa=window.__BAIKONUR_QA;
  return {terrain:qa.gameTerrain.stats(),shaderValid:qa.stats().shadersValid,ready:document.body.classList.contains('museum-ready')};
 });
 assert.equal(report.terrain.materialFamilies.length,5);
 assert.equal(report.terrain.atlasTile,512);
 assert.equal(report.terrain.atlasGpuBytes,2048*1024*4*3);
 assert(report.shaderValid,'Entire 3D museum must compile without shader failures');
 assert(report.ready);
 assert.deepEqual(errors,[]);assert.deepEqual(shaders,[]);
 console.log('DETAILED_TERRAIN_BROWSER_PASS '+JSON.stringify(report));
}catch(e){console.error('DETAILED_TERRAIN_BROWSER_FAIL '+e.message+'; page errors: '+JSON.stringify(errors)+'; shader errors: '+JSON.stringify(shaders));throw e;}finally{await browser.close();}
