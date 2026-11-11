import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const mode=process.env.QA_MODE||'desktop',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-card-share/'+mode;
await mkdir(out,{recursive:true});
const report={passed:false,mode,base,checks:[],hashes:{},environment:'Chromium/SwiftShader. Real clipboard write/read; permission-failure paths additionally simulated. Mobile screen/touch emulation, not a physical-device or FPS test.'};
let browser,page;const errors=[],shaderErrors=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['index.html','museum.html','workshop.html','encyclopedia.html','workshop/model.html','src/card-share.js','src/card-share.css','src/model-viewer.js','src/model-inspector.js'];
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  const expected=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))]))),deadline=Date.now()+150000;
  let pending=[...files];
  do{await Promise.all(pending.map(async f=>{try{const r=await fetch(new URL(f+'?share-copy='+expected[f].slice(0,16),base),{signal:AbortSignal.timeout(12000)});if(r.ok&&sha(Buffer.from(await r.arrayBuffer()))===expected[f])report.hashes[f]=expected[f];}catch{}}));pending=files.filter(f=>!report.hashes[f]);if(pending.length)await new Promise(r=>setTimeout(r,4000));}while(pending.length&&Date.now()<deadline);
  assert.deepEqual(pending,[],'Published files do not match this revision');
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
 const mobile=mode==='mobile',admin=mode==='workshop';
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,permissions:['clipboard-read','clipboard-write'],serviceWorkers:'block'});
 await context.addInitScript(()=>{
  const raf=requestAnimationFrame.bind(window);let step;
  window.requestAnimationFrame=fn=>fn.name==='animate'?(step=fn,0):fn.name==='animateModel'?0:raf(fn);
  window.__SHARE_FRAME=()=>step?.(performance.now());
  window.__REAL_CLIPBOARD=navigator.clipboard;window.__NATIVE_SHARE_CALLS=0;
  Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{window.__NATIVE_SHARE_CALLS++;throw Error('Native sharing must not be invoked');}});
 });
 page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
 const expected=mobile?{kind:'event',id:'buran-loss'}:admin?{kind:'site',id:'tua-112'}:{kind:'site',id:'pad-112'};
 const entry=admin?'workshop.html':'museum.html',url=new URL(entry,base);url.search=new URLSearchParams({share:expected.kind+':'+expected.id,tour:'0'});
 async function ready(){await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__MUSEUM_SHARE,null,{timeout:150000,polling:200});assert(await page.evaluate(()=>__MUSEUM_SHARE.ready));await page.evaluate(()=>__SHARE_FRAME());}
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});await ready();
 const target=await page.evaluate(()=>__MUSEUM_SHARE.current());assert.equal(target.kind,expected.kind);assert.equal(target.id,expected.id);report.checks.push('Incoming object link opens correct card');
 const coverage=await page.evaluate(()=>({targets:__MUSEUM_SHARE.targets().length,valid:__MUSEUM_SHARE.targets().every(t=>!!__MUSEUM_SHARE.url(t)),missing:[...document.querySelectorAll('.site-label,.detail-card')].filter(e=>e.querySelectorAll(':scope > .museum-share-button').length!==1).length}));
 assert(coverage.targets>90&&coverage.valid);assert.equal(coverage.missing,0);report.coverage=coverage;
 async function copy(locator,kind,id,scope=page){
  await page.bringToFront();await locator.click();await scope.waitForFunction(()=>document.querySelector('.museum-share-toast')?.textContent==='Ссылка скопирована в буфер обмена',null,{timeout:10000});
  const value=await scope.evaluate(()=>window.__REAL_CLIPBOARD.readText()),u=new URL(value);
  assert.equal(kind==='article'?u.hash.slice(1):u.searchParams.get('share'),kind==='article'?id:kind+':'+id);
  assert(!u.pathname.includes('/workshop'));assert.equal(u.searchParams.get('draft'),null);
  assert.equal(await scope.evaluate(()=>__NATIVE_SHARE_CALLS),0);return value;
 }
 const copied=await copy(page.locator('#infoShare'),expected.kind,expected.id);report.copied=copied;report.checks.push('Actual system clipboard contains the exact public link; visible confirmation; native menu not invoked');
 await page.screenshot({path:out+'/card-and-confirmation.png',timeout:60000});
 if(admin){assert(await page.locator('#workshopPanel').isVisible());assert(await page.locator('#cameraAltitude').isVisible());report.checks.push('Admin tools and altimeter retained; shared link opens public museum');}
 if(mobile){assert.equal(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().active),false);const b=await page.locator('#infoShare').boundingBox();assert(b&&b.x>=0&&b.x+b.width<=390&&b.y>=0&&b.y+b.height<=844);report.checks.push('Mobile copy button accessible; event does not autoplay');}
 if(mode==='desktop'){
  // Paste exactly what was copied, rather than calling a route helper only.
  await page.goto(copied,{waitUntil:'domcontentloaded',timeout:90000});await ready();assert.equal((await page.evaluate(()=>__MUSEUM_SHARE.current())).id,'pad-112');report.checks.push('Copied link round-trips through a fresh page load');
  for(const id of ['tua-112','pad-31','mzk','sdi']){
   const t=await page.evaluate(id=>__MUSEUM_SHARE.targets().find(t=>['mzk','sdi'].includes(id)?t.id.includes(id):t.id===id),id);assert(t);assert(await page.evaluate(t=>__MUSEUM_SHARE.open(t),t));await copy(page.locator('#infoShare'),'site',t.id);
  }
  report.checks.push('Separate MIK/TUA and MZK/SDI links and changed selections');
  assert(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'story',id:'abort-51'})));await copy(page.locator('#infoShare'),'story','abort-51');
  assert(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'rocket',id:'energia-polyus'})));await copy(page.locator('#infoShare'),'rocket','energia-polyus');
  assert(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'event',id:'buran-loss'})));assert.equal(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().active),false);await copy(page.locator('#infoShare'),'event','buran-loss');
  await page.locator('#buranLossStart').click();await page.waitForFunction(()=>__BAIKONUR_QA.buranLoss.stats().active,null,{timeout:90000,polling:200});await page.evaluate(()=>__BAIKONUR_QA.buranLoss.pause());
  await copy(page.locator('#buranLossPanel > .museum-share-button'),'event','buran-loss');await page.locator('#buranLossClose').click();report.checks.push('Equipment/story/event cards and dynamically loaded event panel copy correct targets');
  // Clipboard permission denied: actual legacy fallback must still copy.
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError');}}}));
  await copy(page.locator('#infoShare'),'event','buran-loss');report.checks.push('Real legacy clipboard fallback succeeds when modern permission is denied');
  await page.evaluate(()=>{window.__EXEC_COPY=document.execCommand;document.execCommand=()=>false;});await page.locator('#infoShare').click();
  await page.waitForSelector('.museum-share-dialog[open]');assert.match(await page.locator('.museum-share-toast').innerText(),/Не удалось/);assert((await page.locator('.museum-share-dialog input').inputValue()).includes('event%3Aburan-loss'));await page.locator('.museum-share-dialog button').click();
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:window.__REAL_CLIPBOARD});document.execCommand=window.__EXEC_COPY;});report.checks.push('Total clipboard refusal shows manual link, never a false success');
  await page.locator('#infoShare').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#infoShare').dataset.shareStatus==='copied');assert.equal(new URL(await page.evaluate(()=>__REAL_CLIPBOARD.readText())).searchParams.get('share'),'event:buran-loss');report.checks.push('Keyboard activation');
  await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'model',id:'rd180'}));await page.waitForFunction(()=>__BAIKONUR_QA.modelInspector.stats().ready,null,{timeout:90000,polling:200});
  const frame=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert(frame);await copy(frame.locator('.intro > .museum-share-button'),'model','rd180',frame);await page.screenshot({path:out+'/equipment-copy.png',timeout:60000});report.checks.push('Actual 3D-viewer iframe copies public model link');
  await page.goto(new URL('encyclopedia.html#r7',base).href,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForSelector('#detail > .museum-share-button');
  assert.equal(await page.locator('#cards .museum-share-button').count(),await page.locator('#cards .card').count());assert.equal(await page.locator('button button').count(),0);await copy(page.locator('#detail > .museum-share-button'),'article','r7');report.checks.push('Encyclopedia article/card sharing and valid button nesting');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/failure.png',timeout:20000}).catch(()=>{});process.exitCode=1;}
finally{report.errors=errors;report.shaderErrors=shaderErrors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('CARD_SHARE_BROWSER',JSON.stringify(report));
