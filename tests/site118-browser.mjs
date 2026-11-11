import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {measureSite118,assertSite118Measurement} from './site118-geometry.mjs';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out=process.env.QA_OUT||'qa-site118';
const modes=(process.env.QA_MODES||'desktop').split(',');
const version='site118-drive-20261111-v1';
const manifest=JSON.parse(await readFile('assets/models/site118/manifest-v1.json','utf8'));
const report={passed:false,base,sourceCommit:process.env.GITHUB_SHA||null,modes,version,publicHashes:{},checks:[],
  environment:'Complete evening museum; Chromium software WebGL. The test advances real animation frames. Mobile is viewport/touch emulation, not a physical device or FPS measurement.'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const started=performance.now();let browser,page,activeMode;
await mkdir(out,{recursive:true});
const save=()=>writeFile(`${out}/${prefix}-report.json`,JSON.stringify(report,null,2)+'\n');
const progress=phase=>console.log('SITE118_PROGRESS',activeMode||'bytes',phase,Math.round((performance.now()-started)/1000)+'s');

async function assetFiles(directory){
  const entries=await readdir(directory,{withFileTypes:true}),files=[];
  for(const entry of entries){const path=directory+'/'+entry.name;if(entry.isDirectory())files.push(...await assetFiles(path));else if(entry.isFile())files.push(path);}
  return files.sort();
}
async function publishedBytes(){
  const files=['index.html','museum.html','workshop.html','credits.html','src/site118-source.js',
    'src/archive-models.js','src/archive-manifest.js','src/museum-scale.js','data/catalog.json',
    'src/workshop-panel.js','src/workshop-panel.css','src/workshop-state.js',...await assetFiles('assets/models/site118')];
  for(let start=0;start<files.length;start+=4){
    const results=await Promise.allSettled(files.slice(start,start+4).map(async file=>{
      const expected=hash(await readFile(file));
      const response=await fetch(new URL(file+'?verify=site118-'+expected.slice(0,16),base),{signal:AbortSignal.timeout(45000)});
      assert(response.ok,`Published ${file}: HTTP ${response.status}`);
      const actual=hash(Buffer.from(await response.arrayBuffer()));report.publicHashes[file]={expected,actual};
      assert.equal(actual,expected,'Published bytes differ: '+file);
    }));
    for(const result of results)if(result.status==='rejected')throw result.reason;
  }
  await save();progress('all-published-bytes-match:'+files.length);
}
const frame=()=>page.evaluate(()=>window.__SITE118_FRAME());
const measure=()=>page.evaluate(measureSite118,{manifest});
async function click(selector){
  const element=page.locator(selector);await element.scrollIntoViewIfNeeded();
  const hit=await element.evaluate(el=>{const r=el.getBoundingClientRect(),front=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {clickable:front===el||el.contains(front),front:front?.id||front?.className,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};});
  report.lastClick={mode:activeMode,selector,...hit};
  assert(hit.clickable,'Ordinary click is covered: '+JSON.stringify(report.lastClick));
  await element.click();
}
async function capture(name){
  progress('capture-start:'+name);await frame();
  await page.screenshot({path:`${out}/${prefix}-${activeMode}-${name}.png`,timeout:90000});
  report.lastCapture={mode:activeMode,name};await save();progress('capture-complete:'+name);
}
async function projection(){
  return page.evaluate(()=>{
    const d=__SITE118_TEST,T=d.THREE,root=d.objects.find(o=>o.record.id==='pad-118').g;
    root.updateWorldMatrix(true,true);d.camera.updateMatrixWorld(true);
    // Real above-ground vertices determine the area; underground pipes must
    // neither shrink the model framing nor masquerade as its contact datum.
    const inverse=root.matrixWorld.clone().invert(),bounds=new T.Box3(),point=new T.Vector3();
    root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);if(point.y>=-.04)bounds.expandByPoint(point);}});
    const samples=[bounds.getCenter(new T.Vector3())];
    for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z])samples.push(new T.Vector3(x,0,z));
    return {width:innerWidth,height:innerHeight,points:samples.map((local,i)=>{
      const world=root.localToWorld(local.clone()),ndc=world.clone().project(d.camera),x=(ndc.x+1)*innerWidth/2,y=(1-ndc.y)*innerHeight/2;
      const blocker=document.elementFromPoint(x,y)?.closest('#info,#ui,#workshopPanel,#timeDock');
      return {id:i,local:local.toArray(),world:world.toArray(),ndc:ndc.toArray(),x,y,coveredBy:blocker?.id||null};
    })};
  });
}
function assertProjection(result,view){
  assert.equal(result.points.length,5);
  // Close ground views may intentionally crop the remote edge. Overview and
  // plan must expose the complete actual footprint, and every view its centre.
  for(const point of view==='ground'?result.points.slice(0,1):result.points){
    assert(point.ndc.every(Number.isFinite)&&point.ndc[2]>=-1&&point.ndc[2]<=1,'Model outside camera depth: '+JSON.stringify(point));
    assert(point.x>=4&&point.x<=result.width-4&&point.y>=4&&point.y<=result.height-4,'Model clipped by viewport: '+JSON.stringify({view,point}));
    assert.equal(point.coveredBy,null,'Model hidden behind a panel: '+JSON.stringify({view,point}));
  }
}

try{
  assert(modes.length&&modes.every(mode=>['desktop','mobile','workshop'].includes(mode)),'Unknown QA_MODES');
  if(process.env.VERIFY_PUBLIC==='1')await publishedBytes();
  for(const mode of modes){
    activeMode=mode;const mobile=mode==='mobile';
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||process.env.BAIKONUR_CHROMIUM||undefined,
      args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    page=await context.newPage();page.setDefaultTimeout(90000);
    const result={mode,passed:false,errors:[],shaderErrors:[],failedRequests:[],views:{}};report.checks.push(result);
    page.on('pageerror',error=>{result.errors.push(error.message);console.log('PAGEERROR',error.message);});
    page.on('requestfailed',request=>result.failedRequests.push({url:request.url(),reason:request.failure()?.errorText}));
    page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|compile shader|Error creating WebGL/i.test(message.text()))result.shaderErrors.push(message.text());});
    await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;
      window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
      window.__SITE118_FRAME=()=>pending?.(performance.now());});
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.resourceType()!=='document'||!/(?:^|\/)(?:index|museum|workshop)\.html$/.test(url.pathname))return route.continue();
      const response=await route.fetch(),html=await response.text(),marker='window.__BAIKONUR_QA={';
      assert.equal(html.split(marker).length,2,'The existing full-museum QA marker is unique');
      await route.fulfill({response,body:html.replace(marker,'window.__SITE118_TEST={THREE,scene,camera,ctl,objects,clickable,portalArchive,groundMeshes:[ground,satelliteGround,...outerTerrain.planes,terrainRelief.mesh]};'+marker)});
    });
    const entry=mode==='workshop'?'workshop.html':'museum.html';
    await page.goto(new URL(entry+'?view=site118&tour=0&v=20261111-site118-v1',base).href,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.body.classList.contains('museum-ready')||document.getElementById('error')?.textContent,null,{timeout:180000});
    assert.equal(await page.locator('#error').textContent(),'');
    assert(await page.evaluate(()=>Boolean(window.__SITE118_TEST&&window.__BAIKONUR_QA?.site118)),'The complete museum must supply Site 118');
    assert.equal(await page.evaluate(()=>Boolean(window.__MUSEUM_WORKSHOP)),mode==='workshop');
    assert(await page.evaluate(()=>__BAIKONUR_QA.site118.load()),'The actual source asset loads');
    await page.evaluate(()=>__BAIKONUR_QA.evening.setEvening(true));await frame();
    result.initial=await measure();assertSite118Measurement(result.initial,{manifest,ground:true,picking:true});
    progress('source-loaded-and-real-contacts-checked');

    // Source selection comes through the normal on-map card. A numbered
    // industrial site must not be added to the launch-only sidebar category.
    assert.match(await page.locator('#title').innerText(),/118/);
    assert.equal(await page.locator('#site118Views [data-site118-view]').count(),3);
    assert.equal(await page.locator('#list [data-site-id="pad-118"]').count(),0);
    await click('#close');await page.evaluate(()=>{__BAIKONUR_QA.setLabelsVisible(true);__SITE118_FRAME();});
    const label='.site-label[data-site-id="pad-118"] .site-label-main',detail='.detail-card[data-site-id="pad-118"] .more';
    if(await page.locator(label).isVisible())await click(label);else await click(detail);
    assert.match(await page.locator('#title').innerText(),/118/);assert(await page.locator('#site118Views').isVisible());
    await page.evaluate(()=>__BAIKONUR_QA.setLabelsVisible(false));
    const card=await page.locator('#info').boundingBox();result.card=card;
    assert(card&&card.x>=-1&&card.x+card.width<=(mobile?391:1441)&&card.y>=0,'The ordinary card fits the viewport');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    progress('ordinary-map-card-and-menu-checked');

    for(const view of ['all','ground','top']){
      await click(`[data-site118-view="${view}"]`);await capture(view);
      const projected=await projection();result.views[view]=projected;assertProjection(projected,view);
    }
    result.loaded=await measure();assertSite118Measurement(result.loaded,{manifest,ground:true,picking:true});
    assert.deepEqual(result.loaded.geometry,result.initial.geometry,'Changing real views keeps exactly one source model and unchanged meshes');
    assert.deepEqual(result.loaded.contacts,result.initial.contacts,'Viewing does not move the actual feet relative to the museum terrain');

    if(mode==='workshop'){
      await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-118'));
      const originalHeight=Number(await page.locator('#wsHeight').inputValue()),before=await measure();
      await page.locator('#wsHeight').fill(String(originalHeight+1));await click('#wsApply');
      const moved=await measure();
      assert(Math.abs(moved.root.position[1]-before.root.position[1]-1)<1e-8,'Height edit moves the actual site root');
      for(let i=0;i<before.contacts.length;i++)assert(Math.abs(moved.contacts[i].world[1]-before.contacts[i].world[1]-1)<1e-6,'Each real source foot follows the edited root');
      await click('#wsUndo');const restored=await measure();assertSite118Measurement(restored,{manifest,ground:true,picking:true});
      assert(Math.abs(Number(await page.locator('#wsHeight').inputValue())-originalHeight)<1e-8);
      assert.deepEqual(restored.root,before.root);assert.deepEqual(restored.geometry,before.geometry);
      assert.deepEqual(restored.contacts,before.contacts);assert.deepEqual(restored.negativeProbes,before.negativeProbes);
      result.workshopUndo={height:originalHeight,delta:1,contacts:restored.contacts.length,exactMatrices:true,exactGeometry:true};
      progress('actual-source-height-and-undo-checked');
    }
    await page.evaluate(()=>__BAIKONUR_QA.openObject('pad-254'));
    assert(await page.locator('#site118Views').isHidden(),'The next site must not inherit Site 118 controls');
    result.application=await page.evaluate(()=>({evening:__BAIKONUR_QA.evening.evening,shaders:__BAIKONUR_QA.stats().shadersValid,transport:__BAIKONUR_QA.stats().transportBake}));
    assert(result.application.evening);assert(result.application.shaders);
    assert.deepEqual(result.errors,[]);assert.deepEqual(result.shaderErrors,[]);assert.deepEqual(result.failedRequests,[]);
    result.passed=true;await save();progress('PASS');await browser.close();browser=null;
  }
  report.passed=true;await save();console.log('SITE118_BROWSER_PASS',JSON.stringify({base,modes,hashes:Object.keys(report.publicHashes).length}));
}catch(error){report.error=error.stack;await save();
  if(page&&!page.isClosed())await page.screenshot({path:`${out}/${prefix}-${activeMode||'startup'}-failure.png`,timeout:15000}).catch(()=>{});
  throw error;}
finally{await save();await browser?.close();}
