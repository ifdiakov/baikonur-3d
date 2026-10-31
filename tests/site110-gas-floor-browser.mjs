import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'diagnostic',out='qa-site110-gas-floor';
const revision=process.env.QA_EXPECTED_REVISION||'20261031-facilities-rails-lighting-v5';
const probes=[[820,620],[835,640],[817,715],[847,715],[870,800]];
const pose={position:[-188.91781968042898,8.48,-693.616637878786],target:[-199.685499680429,-3.56,-679.294217878786]};
const cases=[['baseline',[]],['main-off',['main']],['regional-off',['regional']],['intermediate-off',['intermediate']],['satellite-off',['satellite']],['all-terrain-off',['main','regional','intermediate','satellite']]];
const evidence={base,prefix,revision,probes,pose,errors:[],shaderErrors:[],failedResources:[],views:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
page.on('pageerror',error=>evidence.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(message.text()))evidence.shaderErrors.push(message.text());});
const sameOrigin=url=>new URL(url).origin===new URL(base).origin;
page.on('response',response=>{if(response.status()>=400&&sameOrigin(response.url()))evidence.failedResources.push({url:response.url(),status:response.status()});});
page.on('requestfailed',request=>{if(sameOrigin(request.url()))evidence.failedResources.push({url:request.url(),error:request.failure()?.errorText});});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__GAS_FLOOR_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__GAS_FLOOR_FRAME());
async function pixels(bytes){return page.evaluate(async({encoded,points})=>{
 const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();
 const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(img,0,0);
 return points.map(point=>({point,rgb:Array.from(context.getImageData(point[0],point[1],1,1).data).slice(0,3)}));
 },{encoded:bytes.toString('base64'),points:probes});}
try{
 const url=new URL(base);url.searchParams.set('gas-diagnostic','1');url.searchParams.set('view','site110');url.searchParams.set('detail','trench');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:240000});
 const ready=await page.evaluate(()=>window.__BAIKONUR_QA.rockets.whenReady());assert(ready.length===7&&ready.every(Boolean),'The actual source exhibits are loaded');
 assert(await page.evaluate(()=>Boolean(window.__BAIKONUR_QA.terrainMaskDiagnostics)),'The isolated opt-in diagnostic hook is present');
 await page.evaluate(pose=>{
  const q=window.__BAIKONUR_QA;q.focusSite('pad-110');q.inspectSite110('trench');q.evening.setEvening(false);
  q.terrainMaskDiagnostics.pinCamera(pose);q.terrainMaskDiagnostics.requestProgramCapture();
 },pose);
 for(const [name,hidden]of cases){
  await page.evaluate(hidden=>window.__BAIKONUR_QA.terrainMaskDiagnostics.setHidden(hidden),hidden);await step();
  const bytes=await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
  const state=await page.evaluate(({probes,first})=>window.__BAIKONUR_QA.terrainMaskDiagnostics.snapshot({probes,includePrograms:first,includeRays:first}),{probes,first:name==='baseline'});
  for(const key of ['position','target'])state.camera[key].forEach((value,i)=>assert(Math.abs(value-pose[key][i])<1e-9,'The diagnostic camera must not move between layer toggles'));
  assert.deepEqual(state.layers.filter(layer=>!layer.visible).map(layer=>layer.id).sort(),[...hidden].sort());
  const rgb=await pixels(bytes);evidence.views.push({name,hidden,pixels:rgb,state});
  console.log('SITE110_GAS_OWNER_VIEW',name,JSON.stringify(rgb));
  await writeFile(`${out}/${prefix}-result.json`,JSON.stringify(evidence,null,2));
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.terrainMaskDiagnostics.restore());
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);
 const baseline=evidence.views[0].pixels;
 evidence.pixelChanges=evidence.views.slice(1).map(view=>({name:view.name,maximumChannelDeltas:view.pixels.map((pixel,i)=>Math.max(...pixel.rgb.map((value,j)=>Math.abs(value-baseline[i].rgb[j]))))}));
 // This is an owner-finding diagnostic, not an assertion that any particular
 // layer is responsible. Retain all real frames and exact GPU bindings.
 evidence.passed=true;evidence.checkedAt=new Date().toISOString();
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify(evidence,null,2));
 console.log('SITE110_GAS_OWNER_DIAGNOSTIC_PASS',JSON.stringify(evidence.pixelChanges));
}catch(error){
 evidence.failure={message:error.message,stack:error.stack};
 try{await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:60000});}catch{}
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify(evidence,null,2));throw error;
}finally{await browser.close();}
