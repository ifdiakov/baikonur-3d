import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-freeze/browser';await mkdir(out,{recursive:true});
const launch=()=>chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const report={base,condition:'Chromium/Linux/software WebGL; test-only paused drawing isolates main-thread calculation. Separate real frames verify camera transitions. Not a physical device or FPS test.',checks:[],passed:false};let page,browser;
try{
 if(process.env.VERIFY_PUBLIC==='1')for(const file of ['index.html','museum.html','workshop.html','src/transport-detail-worker.bundle.js','src/transport-detail-job.js','src/transport-detail-codec.js','src/road-editor.js','src/workshop-road-editor.js']){
  const hash=b=>createHash('sha256').update(b).digest('hex'),expected=hash(await readFile(file));let actual='';
  for(let i=0;i<24;i++){const r=await fetch(new URL(file+'?verify='+Date.now(),base));if(r.ok)actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,5000));}assert.equal(actual,expected,file+' live revision mismatch');
 }
 let reference=process.env.REFERENCE_REPORT?JSON.parse(await readFile(process.env.REFERENCE_REPORT,'utf8')).checks.find(c=>c.mode==='baseline'):null;
 for(const mode of (process.env.QA_MODES||'baseline,desktop,mobile,workshop').split(',')){
  browser=await launch();const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1200,height:800},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(180000);
  const errors=[],failed=[];report.current={mode,errors,failed};console.log('TRANSITION_BEGIN',mode);
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',mode,e.message);});page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let fn;window.requestAnimationFrame=cb=>cb.name==='animate'?(fn=cb,0):raf(cb);window.__STEP=()=>fn?.();});
  await page.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.continue();const response=await route.fetch();let html=await response.text();html=html.replace('window.__BAIKONUR_QA={',"window.__TRANSITION_DEBUG={scene,camera,ctl,requestTransportDetail,bake:()=>({enabled:transportFromBake,detailReady:detailTransportReady,detailLoading:detailTransportLoading,job:typeof transportDetailJob==='undefined'?null:transportDetailJob?.stats(),attempts:typeof transportDetailAttempts==='undefined'?0:transportDetailAttempts})};window.__BAIKONUR_QA={");await route.fulfill({response,body:html});});
  await page.goto(new URL((mode==='baseline'?'qa-reference.html':mode==='workshop'?'workshop.html':'museum.html')+'?tour=0',base).href,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')||document.getElementById('museumRetry')?.hidden===false,null,{timeout:240000,polling:200});
  assert.deepEqual(errors,[]);assert(await page.evaluate(()=>!!window.__BAIKONUR_QA),'Startup failed: '+JSON.stringify(failed));
  await page.evaluate(()=>{__BAIKONUR_QA.arrival.seek(80);__BAIKONUR_QA.traffic.seek(80);__BAIKONUR_QA.setAltitude(430,'pad-112a');});
  await page.evaluate(()=>{window.__HEART={start:performance.now(),last:performance.now(),gaps:[],ticks:0};window.__HEART_TIMER=setInterval(()=>{const h=__HEART,now=performance.now();h.gaps.push(now-h.last);h.last=now;h.ticks++;},50);});
  await page.waitForTimeout(150);await page.evaluate(()=>__TRANSITION_DEBUG.requestTransportDetail());let inputRoundTripMs=null;
  if(mode!=='baseline'){
   await page.waitForFunction(()=>{const j=__TRANSITION_DEBUG.bake().job;return j?.state==='building'||j?.error;},null,{polling:200});
   const begin=Date.now();await page.locator('#search').evaluate(e=>{e.value='Союз';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#search').evaluate(e=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));});inputRoundTripMs=Date.now()-begin;assert(inputRoundTripMs<2500,'UI input blocked');
  }
  await page.waitForFunction(()=>{const b=__TRANSITION_DEBUG.bake();return b.detailReady||b.job?.error;},null,{timeout:240000,polling:200});await page.waitForTimeout(150);
  const metric=await page.evaluate(()=>{clearInterval(__HEART_TIMER);return{totalMs:Math.round(performance.now()-__HEART.start),maxTimerGapMs:Math.round(Math.max(...__HEART.gaps)),ticks:__HEART.ticks,bake:__TRANSITION_DEBUG.bake()};});
  console.log('TRANSITION_READY',mode,JSON.stringify(metric));report.current={mode,...metric,errors,failed};assert(metric.bake.detailReady,JSON.stringify(metric.bake));assert.deepEqual(errors,[]);
  if(mode!=='baseline'){assert.equal(metric.bake.job.state,'ready');assert.equal(metric.bake.attempts,1);assert(metric.maxTimerGapMs<2500,'Main-thread pause '+metric.maxTimerGapMs);}
  const signature=await page.evaluate(async()=>{
   const rows=[],roots=[];__TRANSITION_DEBUG.scene.traverse(o=>{if(/^OpenStreetMap · (автодороги|железнодорожные пути)$/.test(o.name)||o.name==='Трасса · дальнее визуальное продолжение')roots.push(o);});
   const hex=b=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
   for(const root of roots){const list=[];root.traverse(o=>{if(o.geometry&&o.material)list.push(o);});for(const m of list){const attributes={};for(const [k,a]of Object.entries({...m.geometry.attributes,index:m.geometry.index,instanceMatrix:m.instanceMatrix,instanceColor:m.instanceColor})){if(a)attributes[k]={count:a.count,itemSize:a.itemSize,normalized:a.normalized,instanced:!!a.isInstancedBufferAttribute,hash:hex(await crypto.subtle.digest('SHA-256',a.array))};}
    const materials=(Array.isArray(m.material)?m.material:[m.material]).map(a=>({type:a.type,color:a.color?.getHex(),roughness:a.roughness,metalness:a.metalness,emissive:a.emissive?.getHex(),emissiveIntensity:a.emissiveIntensity,side:a.side,opacity:a.opacity,transparent:a.transparent,depthWrite:a.depthWrite,polygonOffset:a.polygonOffset,vertexShader:a.vertexShader,fragmentShader:a.fragmentShader}));rows.push({name:m.name,type:m.isInstancedMesh?'InstancedMesh':m.type,attributes,materials});}}
   return rows.sort((a,b)=>a.name.localeCompare(b.name));
  });
  await writeFile(out+'/'+mode+'-geometry.json',JSON.stringify(signature,null,2));
  if(mode==='baseline')reference={signature,...metric};else if(reference)assert.deepEqual(signature,reference.signature,'Original road, rail, lamp and material data differs');
  if(mode!=='baseline'){
   for(const h of [760,430,300,760,300])await page.evaluate(h=>{__BAIKONUR_QA.setAltitude(h,'pad-112a');__TRANSITION_DEBUG.requestTransportDetail();},h);assert.equal(await page.evaluate(()=>__TRANSITION_DEBUG.bake().attempts),1);
   await page.evaluate(()=>__BAIKONUR_QA.openObject('building-mzk'));assert.equal(await page.locator('#title').textContent(),'МЗК');assert((await page.locator('#description').textContent()).includes('Спальня Бога'));
   await page.evaluate(()=>__BAIKONUR_QA.openObject('building-sdi'));assert.equal(await page.locator('#title').textContent(),'СДИ');assert((await page.locator('#description').textContent()).includes('самое высокое'));
   await page.evaluate(()=>{document.getElementById('info').style.display='none';__BAIKONUR_QA.mzkSdi.inspect('all');__STEP();});await page.screenshot({path:out+'/'+mode+'-mzk-sdi.png',timeout:180000});
   // BUILDING_CARD_OCCLUSION_CHECK: painted text and buttons must remain readable and clickable.
   const readability=await page.evaluate(()=>['building-mzk','building-sdi'].map(id=>{
    const card=document.querySelector('.detail-card[data-site-id="'+id+'"]'),text=card.querySelector('p'),button=card.querySelector('.more'),r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {id,unclipped:text.scrollHeight<=text.clientHeight+1,clickable:button===hit||button.contains(hit)};
   }));assert(readability.every(r=>r.unclipped&&r.clickable),JSON.stringify(readability));
   const boxes=[];for(const id of ['building-mzk','building-sdi']){const el=page.locator('.detail-card[data-site-id="'+id+'"]');assert(await el.isVisible(),id+' must be visible');const box=await el.boundingBox();assert(box.x>=0&&box.x+box.width<=page.viewportSize().width+1,id+' clipped');boxes.push(box);}
   const [a,b]=boxes;assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Building cards overlap');assert.equal(await page.locator('.site-label[data-site-id="pad-112a"]').isVisible(),false);
  }
  await page.evaluate(()=>{__BAIKONUR_QA.setAltitude(300,'pad-31');__STEP();});await page.screenshot({path:out+'/'+mode+'-detail.png',timeout:180000});assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));
  // NP_ROYALTENT_ACCEPTANCE
  if(mode!=='baseline'){
   await page.evaluate(()=>{__BAIKONUR_QA.focusSite('np-31-1');__STEP();});
   const np=await page.evaluate(()=>__BAIKONUR_QA.np31());assert.equal(np.instanceCount,1);assert(np.visible);assert.equal(np.model.version,'rockettrip-np-royaltent-20261109-v3');assert.equal(np.model.tentSpecs.length,2);assert(np.model.tentSpecs.every(t=>t.chords===12&&t.anchorBolts===16));assert.deepEqual(np.model.mapCoordinates,{x:912.9,y:304.9});assert(await page.evaluate(()=>__BAIKONUR_QA.evening.evening));
   await page.screenshot({path:out+'/'+mode+'-np-evening.png',timeout:180000});await writeFile(out+'/'+mode+'-np.json',JSON.stringify(np,null,2));
  }
  if(mode==='workshop'){await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-113'));const old=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(old+1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),old);}
  assert.deepEqual(errors,[]);report.checks.push({mode,...metric,inputRoundTripMs,geometryCount:signature.length,signature,errors});await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();browser=null;
 }
 report.passed=true;
}catch(error){report.error=error.stack;await page?.screenshot({path:out+'/failure.png',timeout:30000}).catch(()=>{});throw error;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('TRANSITION_BROWSER_PASS',JSON.stringify(report.checks.map(({mode,maxTimerGapMs,totalMs})=>({mode,maxTimerGapMs,totalMs}))));
