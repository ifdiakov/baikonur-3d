import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const out='qa-site31-np';await mkdir(out,{recursive:true});
const errors=[],browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
 '--enable-unsafe-swiftshader','--disable-gpu-sandbox'
]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(new URL('?view=np31-1&tour=0',base),{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>Boolean(window.__BAIKONUR_QA?.np31?.().present)&&document.body.classList.contains('museum-ready'),null,{timeout:240000});
 const state=await page.evaluate(()=>{
  const qa=window.__BAIKONUR_QA;
  return {observation:qa.np31(),site:qa.siteState('np-31-1'),camera:qa.cameraState()};
 });
 const np=state.observation;
 assert(np.present&&np.visible,'NP must not be hidden on the published 3D map');
 assert.equal(np.id,'np-31-1');
 assert(np.roadConnected,'NP needs an actual nearby Site 31–1 access road');
 assert(np.roadId,'NP source-road metadata must identify its real placement');
 assert(np.actualDistanceMetres>1450&&np.actualDistanceMetres<3350,'NP placement should be around 2.4 km from Site 31');
 assert(np.clearanceFromRoad>=5.9,'NP platform must not lie on the carriageway');
 assert.equal(np.model.shelters,2);assert.equal(np.model.widthMetres,35);assert.equal(np.model.lengthMetres,50);
 assert(np.bounds.every(Number.isFinite)&&np.bounds[0]>3&&np.bounds[2]>3);
 assert(state.site,'NP must have a selectable museum card');
 assert(Math.hypot(state.camera.target[0]-np.position[0],state.camera.target[2]-np.position[2])<2,
 'Direct ?view=np31-1 must focus on the new stand');
 await page.screenshot({path:out+'/site31-np-night.png',fullPage:true});
 assert.deepEqual(errors,[],'NP must not break main museum startup');
 await writeFile(out+'/result.json',JSON.stringify({pass:true,np,camera:state.camera,errors},null,2));
 console.log('SITE31_NP_BROWSER_PASS',JSON.stringify({roadId:np.roadId,
 actualDistanceMetres:Math.round(np.actualDistanceMetres),bounds:np.bounds}));
}catch(error){await writeFile(out+'/failure.json',JSON.stringify({message:error.message,errors},null,2));throw error}
finally{await browser.close()}
