import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const output='qa-soyuz-launch';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl',
 '--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const evidence={base,pads:[],errors:[]};
for(const id of ['pad-1','pad-31']){
 const page=await browser.newPage({viewport:{width:1480,height:880},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',m=>{if(m.type()==='error'&&/Shader Error|compile shader|VALIDATE_STATUS|GL_INVALID_OPERATION|Uncaught|ReferenceError|TypeError/.test(m.text()))errors.push(m.text());});
 await page.addInitScript(()=>{
  const native=requestAnimationFrame.bind(window);let frame=null;
  window.requestAnimationFrame=fn=>fn.name==='animate'?(frame=fn,0):native(fn);
  window.__SOYUZ_FRAME=()=>{const next=frame;frame=null;next?.(performance.now());};
 });
 const url=new URL(base);url.searchParams.set('view',id==='pad-1'?'gagarin':'site31');
 try{
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.getElementById('museumLoading')?.dataset.state==='ready'&&window.__BAIKONUR_QA?.soyuz?.stats(),null,{timeout:180000});
  await page.locator('#soyuzLaunchStart').waitFor({state:'visible',timeout:30000});
  await page.locator('#soyuzLaunchStart').click();
  await page.waitForFunction(()=>window.__BAIKONUR_QA?.soyuz?.stats()?.active===true,null,{timeout:100000});
  const getStats=()=>page.evaluate(()=>window.__BAIKONUR_QA.soyuz.stats());
  const draw=()=>page.evaluate(()=>window.__SOYUZ_FRAME());
  const take=async(label,seconds)=>{
   await page.evaluate(seconds=>window.__BAIKONUR_QA.soyuz.seek(seconds),seconds);
   await draw();await draw();
   const status=await getStats();
   assert.equal(status.time,seconds);
   await page.screenshot({path:output+'/'+id+'-'+label+'.png',timeout:180000});
   return status;
  };
  const before=await take('t-minus-30',-30);
  assert.equal(before.sample.firstColumnOpen,1);
  assert.equal(before.sample.secondColumnOpen,0);
  assert.equal(before.sample.enginePower,0);
  const second=await take('t-minus-5',-5);
  assert.equal(second.sample.secondColumnOpen,1);
  assert.equal(second.sample.enginePower,1);
  assert.ok(second.pneumaticColumns?.length===2,'Must have two visible hinged columns');
  assert.ok(second.pneumaticColumns.every(m=>Math.abs(m.rotationZ)>.2),'Columns must rotate about horizontal hinge');
  assert.equal(second.exhaust?.flameAttachedToRocket,true,'Engine flame follows the rocket');
  assert.ok(second.exhaust?.engineJets>=5);
  assert.ok(second.exhaust?.cloudSprites>=400,'Smoke uses feathered layered sprites');
  assert.ok(second.sourceMasks>0,'Fused source columns must be suppressed while animated');
  const liftoff=await take('t-plus-8',8);
  assert.ok(liftoff.sample.altitudeMetres>0);
  assert.equal(liftoff.sample.supportOpen,1);
  assert.ok(errors.length===0,'Browser/WebGL errors: '+errors.join(' ; '));
  const restored=await page.evaluate(()=>{
   window.__BAIKONUR_QA.soyuz.stop({releaseCamera:true});
   const stats=window.__BAIKONUR_QA.soyuz.stats();
   return {stats,visible:!document.getElementById('soyuzLaunchPanel').hidden};
  });
  assert.equal(restored.stats.active,false);
  assert.equal(restored.visible,false);
  evidence.pads.push({id,before:before.sourceMasks,second:second.pneumaticColumns,exhaust:second.exhaust,liftoff:liftoff.sample.altitudeMetres});
 }catch(error){
  try{await page.screenshot({path:output+'/'+id+'-error.png'});}catch{}
  evidence.errors.push({id,error:String(error),browser:errors});
  console.error('SOYUZ_LAUNCH_BROWSER_FAILURE',JSON.stringify(evidence));await page.close();break;
 }
 await page.close();
}
await browser.close();
assert.equal(evidence.errors.length,0,'Browser smoke check failed');
assert.equal(evidence.pads.length,2);
console.log('SOYUZ_LAUNCH_BROWSER_PASS '+JSON.stringify(evidence));
