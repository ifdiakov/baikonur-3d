import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local';mkdirSync('qa-mik112',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1800,height:1100},deviceScaleFactor:1});
const errors=[],shaderErrors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|compile shader/i.test(m.text()))shaderErrors.push(m.text());});
try{
 const url=new URL(origin);url.searchParams.set('site','112');url.searchParams.set('v','mik112-layout-ne-v3');
 await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats()?.mik112?.transporterCount===2,{timeout:90000});
 await page.waitForTimeout(1500);
 const s=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(s.mik112.version,'1.3-photo-frames');assert.equal(s.mik112.transporterCount,2);
 assert.deepEqual(s.mik112Placement,[640,361]);
 assert.ok(s.mik112.features['triangular-perforated-cheek']===4);
 assert.ok(s.mik112.features['ochre-perforated-fork']===8);
 assert.ok(s.mik112.features['bogie-wheel']>=100);
 assert.ok(s.mik112.features['closed-sliding-door']>=4);
 assert.ok(s.mik112.features['retained-light-roof']>=1);
 assert.equal(s.mik112.features['mik-floor-finish'],1);
 assert.ok(s.mik112.features['fallen-roof-frame']>=1);
 assert.ok(s.mik112.instancedBatches<80,'GPU draw-call count must remain controlled');
 assert.ok(s.mik112Rail.connected);assert.equal(s.mik112Rail.tracks.length,4);
 assert.equal(s.mik112Rail.sourceRoute,'t-central-north','western trunk, not phantom feeder');
 assert.deepEqual(s.mik112.suppressedFallbackGeometry,[]);
 for(const track of s.mik112Rail.tracks){assert.ok([...track.start,...track.end].every(Number.isFinite));}
 // MIK112_LAYOUT_GEOMETRY_ASSERTIONS: numerical checks of the rendered transforms.
 const lay=s.mik112.layout;
 assert.deepEqual(lay.scale,[.14,.14,.14]);assert.equal(lay.yaw,-Math.PI/4);
 assert.equal(lay.highDoorEndZ,-120);assert.equal(lay.lowDoorEndZ,120);
 assert.equal(lay.transporterSide,'north-east');
 for(const c of lay.transporterLocal)assert.ok(c[2]<-150,'TUA must stand beyond opposite end, not inside hall');
 for(const c of lay.transporterWorld){
  assert.ok(c[0]>lay.centerWorld[0]&&c[2]<lay.centerWorld[2],'TUA must be NE of the hall on the museum map');
 }
 const rootX=(640-650)*3.4,rootZ=(361-522.5)*3.4;
 assert.ok(Math.hypot(lay.centerWorld[0]-rootX,lay.centerWorld[2]-rootZ)<1e-7);
 for(const r of s.mik112Rail.tracks){
  assert.ok(r.localStart[2]<-258&&r.junctionGap<1e-7);
  assert.ok(Math.hypot(...r.localStart.map((v,i)=>v-r.localEntry[i]))<1e-6);
 }
 assert.equal(s.mik112Rail.version,'ne-end-common-gauge-v4');
 assert.ok(s.mik112Rail.joinGap<1e-7);
 // An approach spline may not cross through the assembly building.
 const cs=Math.cos(lay.yaw),sn=Math.sin(lay.yaw),inverse=p=>{
  const dx=p[0]-rootX,dz=p[2]-rootZ;
  return [(cs*dx-sn*dz)/.14,(sn*dx+cs*dz)/.14];
 };
 for(const p of [...s.mik112Rail.stemSamples,...s.mik112Rail.tracks.flatMap(r=>r.curveSamples)]){
  const [x,z]=inverse(p);assert.ok(!(x>-97&&x<97&&z>-123&&z<123),'Railway must not cross the hall walls');
 }
 assert.ok(s.shadersValid,'Custom surface materials compile');
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.ok((await page.locator('#title').textContent()).includes('112'));
 await page.screenshot({path:`qa-mik112/${prefix}-overview.png`});
 await page.locator('#mik112Tua').click();await page.waitForTimeout(700);
 await page.screenshot({path:`qa-mik112/${prefix}-grasshoppers.png`});
 await page.locator('#showLabels').uncheck();
 await page.screenshot({path:`qa-mik112/${prefix}-grasshoppers-clear.png`});
 await page.locator('#mik112Top').click();await page.waitForTimeout(700);
 await page.screenshot({path:`qa-mik112/${prefix}-plan.png`});
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(95,'pad-112'));
 await page.waitForTimeout(400);
 await page.screenshot({path:`qa-mik112/${prefix}-map-placement.png`});
 await page.locator('#showLabels').check();
 await page.locator('#year').evaluate(el=>{el.value='1988';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().mik112.roofState),'historical-intact');
 await page.locator('#mik112All').click();await page.waitForTimeout(500);
 await page.screenshot({path:`qa-mik112/${prefix}-1988.png`});
 await page.locator('#year').evaluate(el=>{el.value='2026';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().mik112.roofState),'photo-ruined');
 // Ensure the existing Saturn model and shared station cards still operate.
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite(q.stats().saturnIndex);});
 assert.ok((await page.locator('#title').textContent()).includes('Сатурн'));
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().saturn.largeAntennaCount),2);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite(q.stats().mik112Index);});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);
 assert.equal(await page.locator('#error').isVisible(),false);
 await page.screenshot({path:`qa-mik112/${prefix}-mobile.png`});
 assert.deepEqual(errors,[],'No runtime errors');assert.deepEqual(shaderErrors,[],'No WebGL shader errors');
 const result={passed:true,origin,checkedAt:new Date().toISOString(),model:s.mik112,rail:s.mik112Rail,errors,shaderErrors};
 writeFileSync(`qa-mik112/${prefix}-result.json`,JSON.stringify(result,null,2)+'\n');
 console.log('MIK112_BROWSER_PASS',JSON.stringify({origin,meshes:s.mik112.meshCount,batches:s.mik112.instancedBatches,features:s.mik112.features}));
}catch(e){
 await page.screenshot({path:`qa-mik112/${prefix}-failure.png`}).catch(()=>{});
 writeFileSync(`qa-mik112/${prefix}-failure.json`,JSON.stringify({message:e.message,errors,shaderErrors},null,2));throw e;
}finally{await browser.close();}
