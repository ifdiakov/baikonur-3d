import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-authoring-overlays';
await mkdir(out,{recursive:true});
const files=['index.html','src/camera-altitude.js','src/coordinate-grid.js','src/transport-reference-labels.js'];
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
if(prefix==='public'){
 const expected=Object.fromEntries(await Promise.all(files.map(async file=>[file,digest(await readFile(file))])));
 let matches=false,last={};
 for(let attempt=0;attempt<60;attempt++){
  last={};
  for(const file of files){
   try{
    const response=await fetch(new URL(file+'?v=20261109-overlays-off-v1&verify='+Date.now(),base),{signal:AbortSignal.timeout(20000)});
    last[file]=response.ok?digest(Buffer.from(await response.arrayBuffer())):'HTTP '+response.status;
   }catch(error){last[file]=error.message;}
  }
  matches=files.every(file=>last[file]===expected[file]);
  if(matches)break;
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 assert(matches,'Published files do not match this release: '+JSON.stringify({expected,actual:last}));
 console.log('AUTHORING_OVERLAYS_PUBLIC_FILES_PASS',JSON.stringify(last));
}
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
page.setDefaultTimeout(120000);
const errors=[],shaderErrors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/i.test(message.text()))shaderErrors.push(message.text());});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__OVERLAY_QA_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const frame=()=>page.evaluate(()=>window.__OVERLAY_QA_FRAME());
async function load(search){
 await page.goto(base+search,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.stats?.()&&window.__MUSEUM_COORD_GRID&&window.__MUSEUM_TRANSPORT_LABELS,null,{timeout:240000});
 await frame();await frame();
}
async function checkHidden(name){
 await page.mouse.move(720,450);
 const state=await page.evaluate(()=>{
  const visible=id=>{const e=document.getElementById(id);if(!e)return false;const s=getComputedStyle(e);return !e.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&e.getBoundingClientRect().width>0;};
  return {
   grid:window.__MUSEUM_COORD_GRID.isEnabled(),labels:window.__MUSEUM_TRANSPORT_LABELS.isEnabled(),
   visible:Object.fromEntries(['cameraAltitude','coordinateGridHud','coordinateGridPointerBadge','transportReferenceLabels','transportReferenceLegend'].map(id=>[id,visible(id)])),
   gridPressed:document.getElementById('coordinateGridToggle').getAttribute('aria-pressed'),
   labelsPressed:document.getElementById('transportLabelsToggle').getAttribute('aria-pressed'),
   objectLabels:document.querySelectorAll('#labelLayer .site-label').length,
   objectLabelLayerHidden:getComputedStyle(document.getElementById('labelLayer')).display==='none',
   ready:document.body.classList.contains('museum-ready'),shadersValid:window.__BAIKONUR_QA.stats().shadersValid
  };
 });
 assert.equal(state.grid,false);assert.equal(state.labels,false);
 assert(Object.values(state.visible).every(v=>!v),'A technical overlay is still visible: '+JSON.stringify(state));
 assert.equal(state.gridPressed,'false');assert.equal(state.labelsPressed,'false');
 assert(state.objectLabels>30,'Object labels must be preserved');assert.equal(state.objectLabelLayerHidden,false);
 assert(state.ready);assert(state.shadersValid);
 checks.push({name,...state});
}
try{
 await load('?tour=0');
 await checkHidden('desktop-default');
 await page.screenshot({path:out+'/'+prefix+'-desktop.png',timeout:180000});
 await page.evaluate(()=>document.getElementById('coordinateGridToggle').click());
 assert.equal(await page.evaluate(()=>window.__MUSEUM_COORD_GRID.isEnabled()),true);
 await page.evaluate(()=>document.getElementById('coordinateGridToggle').click());
 await page.evaluate(()=>document.getElementById('transportLabelsToggle').click());
 assert.equal(await page.evaluate(()=>window.__MUSEUM_TRANSPORT_LABELS.isEnabled()),true);
 await page.evaluate(()=>document.getElementById('transportLabelsToggle').click());
 await checkHidden('manual-switches-return-off');
 // Deliberately leave editing enabled, then revisit a legacy grid=1 URL.
 // Neither a previous editing session nor that old link may restore it.
 await page.evaluate(()=>document.getElementById('coordinateGridToggle').click());
 await page.setViewportSize({width:390,height:844});
 await load('?tour=0&grid=1');
 await checkHidden('mobile-fresh-legacy-link');
 await page.screenshot({path:out+'/'+prefix+'-mobile.png',timeout:180000});
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);
 await writeFile(out+'/'+prefix+'-result.json',JSON.stringify({passed:true,prefix,checks,errors,shaderErrors},null,2));
 console.log('AUTHORING_OVERLAYS_BROWSER_PASS',JSON.stringify({prefix,checks,errors,shaderErrors}));
}catch(error){
 await writeFile(out+'/'+prefix+'-failure.json',JSON.stringify({error:error.message,checks,errors,shaderErrors},null,2));
 await page.screenshot({path:out+'/'+prefix+'-failure.png',timeout:180000}).catch(()=>{});
 throw error;
}finally{await browser.close();}
