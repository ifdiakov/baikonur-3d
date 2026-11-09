import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-freeze/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const report={base,condition:'Chromium/Linux/software WebGL; paused test-only rendering isolates main-thread responsiveness during exact-geometry preparation. Not a physical device or FPS claim.',checks:[],passed:false};let page;
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  for(const file of ['index.html','museum.html','workshop.html','src/transport-detail-worker.bundle.js','src/transport-detail-job.js','src/road-editor.js','src/workshop-road-editor.js']){
   const hash=b=>createHash('sha256').update(b).digest('hex'),expected=hash(await readFile(file));let actual='';
   for(let i=0;i<24;i++){const r=await fetch(new URL(file+'?verify='+Date.now(),base));if(r.ok)actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,5000));}assert.equal(actual,expected,file+' public hash mismatch');
  }
 }
 const modes=(process.env.QA_MODES||'baseline,desktop,mobile,workshop').split(',');
 let reference=process.env.REFERENCE_REPORT?JSON.parse(await readFile(process.env.REFERENCE_REPORT,'utf8')).checks.find(c=>c.mode==='baseline'):null;
 for(const mode of modes){
  console.log('TRANSITION_BEGIN',mode);const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1200,height:800},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let fn;window.requestAnimationFrame=cb=>cb.name==='animate'?(fn=cb,0):raf(cb);window.__STEP=()=>fn?.();});
  await page.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.continue();const response=await route.fetch();let html=await response.text();html=html.replace('window.__BAIKONUR_QA={','window.__TRANSITION_DEBUG={scene,camera,ctl,requestTransportDetail};window.__BAIKONUR_QA={');await route.fulfill({response,body:html});});
  const file=mode==='baseline'?'qa-reference.html':mode==='workshop'?'workshop.html':'museum.html';
  await page.goto(new URL(file+'?tour=0',base).href,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:240000});
  await page.evaluate(()=>{__BAIKONUR_QA.arrival.pause();__BAIKONUR_QA.traffic.pause();__BAIKONUR_QA.setAltitude(430,'pad-112a');});
  await page.evaluate(()=>{window.__HEART={start:performance.now(),last:performance.now(),gaps:[],ticks:0};window.__HEART_TIMER=setInterval(()=>{const h=__HEART,now=performance.now();h.gaps.push(now-h.last);h.last=now;h.ticks++;},50);});
  await page.waitForTimeout(150);await page.evaluate(()=>__TRANSITION_DEBUG.requestTransportDetail());
  let inputRoundTripMs=null;
  if(mode!=='baseline'){
   await page.waitForFunction(()=>__BAIKONUR_QA.stats().transportBake.job?.state==='building');
   const inputStart=Date.now();await page.locator('#search').evaluate(e=>{e.value='Союз';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#search').evaluate(e=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));});inputRoundTripMs=Date.now()-inputStart;
   assert(inputRoundTripMs<2500,'UI must respond during worker calculation');
  }
  await page.waitForFunction(()=>__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:300000});await page.waitForTimeout(120);
  const metric=await page.evaluate(()=>{clearInterval(__HEART_TIMER);return{totalMs:Math.round(performance.now()-__HEART.start),maxTimerGapMs:Math.round(Math.max(...__HEART.gaps)),ticks:__HEART.ticks,bake:__BAIKONUR_QA.stats().transportBake};});
  console.log('TRANSITION_READY',mode,JSON.stringify(metric));assert.deepEqual(errors,[]);
  if(mode!=='baseline'){assert.equal(metric.bake.job.state,'ready');assert.equal(metric.bake.attempts,1);assert(metric.maxTimerGapMs<2500,'Preparation must not freeze the UI: '+metric.maxTimerGapMs);}
  const signature=await page.evaluate(async()=>{
   const out=[],roots=[];__TRANSITION_DEBUG.scene.traverse(o=>{if(/^OpenStreetMap · (автодороги|железнодорожные пути)$/.test(o.name))roots.push(o);});
   const hex=bytes=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
   for(const root of roots){const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});for(const mesh of meshes){const attributes={};for(const [k,a]of Object.entries({...mesh.geometry.attributes,index:mesh.geometry.index})){if(a)attributes[k]={count:a.count,itemSize:a.itemSize,normalized:a.normalized,hash:hex(await crypto.subtle.digest('SHA-256',a.array))};}
    const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>({type:m.type,color:m.color?.getHex(),roughness:m.roughness,metalness:m.metalness,side:m.side,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,polygonOffset:m.polygonOffset}));out.push({name:mesh.name,attributes,materials});}}
   return out.sort((a,b)=>a.name.localeCompare(b.name));
  });
  if(mode==='baseline')reference={signature,...metric};else if(reference)assert.deepEqual(signature,reference.signature,'Road and rail buffers and materials must remain identical');
  if(mode!=='baseline'){
   for(const h of [760,430,300,760,300])await page.evaluate(h=>{__BAIKONUR_QA.setAltitude(h,'pad-112a');__TRANSITION_DEBUG.requestTransportDetail();},h);
   assert.equal(await page.evaluate(()=>__BAIKONUR_QA.stats().transportBake.attempts),1);
   await page.evaluate(()=>__BAIKONUR_QA.openObject('building-mzk'));assert.equal(await page.locator('#title').textContent(),'МЗК');assert((await page.locator('#description').textContent()).includes('Спальня Бога'));
   await page.evaluate(()=>__BAIKONUR_QA.openObject('building-sdi'));assert.equal(await page.locator('#title').textContent(),'СДИ');assert((await page.locator('#description').textContent()).includes('самое высокое'));
   await page.evaluate(()=>{document.getElementById('info').style.display='none';__BAIKONUR_QA.mzkSdi.inspect('all');__STEP();});await page.screenshot({path:out+'/'+mode+'-mzk-sdi.png',timeout:180000});
   assert.equal(await page.locator('.detail-card[data-site-id="building-mzk"]').count(),1);assert.equal(await page.locator('.detail-card[data-site-id="building-sdi"]').count(),1);assert.equal(await page.locator('.site-label[data-site-id="pad-112a"]').isVisible(),false);
  }
  await page.evaluate(()=>{__BAIKONUR_QA.setAltitude(300,'pad-31');__STEP();});await page.screenshot({path:out+'/'+mode+'-detail.png',timeout:180000});
  assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid),'Invalid shader');
  if(mode==='workshop'){
   await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-113'));const old=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(old+1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),old);
  }
  assert.deepEqual(errors,[]);report.checks.push({mode,...metric,inputRoundTripMs,geometryCount:signature.length,signature,errors});await writeFile(out+'/report.json',JSON.stringify(report,null,2));await context.close();
 }
 report.passed=true;
}catch(error){report.error=error.stack;await page?.screenshot({path:out+'/failure.png',timeout:60000}).catch(()=>{});throw error;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('TRANSITION_BROWSER_PASS',JSON.stringify(report.checks.map(({mode,maxTimerGapMs,totalMs})=>({mode,maxTimerGapMs,totalMs}))));
