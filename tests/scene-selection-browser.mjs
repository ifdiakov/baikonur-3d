import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',baseline=process.argv.includes('--baseline');
mkdirSync('qa-selection',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1,hasTouch:true});
page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.__BAIKONUR_QA.selectionState());
const reset=async()=>{
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite(0);q.setAltitude(800,'pad-23');});
 await page.waitForTimeout(300);
};
try{
 const u=new URL(origin);u.searchParams.set('v','selection-no-jump-v1');u.searchParams.set('site','1');
 await page.goto(u.toString(),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats()?.saturn?.largeAntennaCount===2,null,{timeout:90000});
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));
 await reset();
 const points=await page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,s=q.stats(),[x,z]=s.saturnPlacement,k=s.saturnScale;
  return [[180,-80],[-180,50],[260,0],[200,150],[380,0]].map(([dx,dz])=>q.projectWorld((x-650)*3.4+dx*k,0,(z-522.5)*3.4+dz*k))
   .filter(p=>p&&p.x>350&&p.x<1250&&p.y>70&&p.y<800&&document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS');
 });
 assert.ok(points.length,'Need visible background sample');
 if(baseline){
  let reproduced=false;
  for(const p of points){await reset();await page.mouse.click(p.x,p.y);await page.waitForTimeout(200);
   if((await page.locator('#title').textContent()).includes('Сатурн')){reproduced=true;break;}}
  await page.screenshot({path:'qa-selection/baseline.png',timeout:60000});
  writeFileSync('qa-selection/baseline.json',JSON.stringify({reproduced,errors},null,2));
  console.log('LEGACY_SATURN_JUMP',reproduced);
 }else{
  assert.equal((await state()).version,'1.0-no-terrain-jump');
  const samples=[];
  for(const p of points){const hit=await page.evaluate(p=>window.__BAIKONUR_QA.selection.inspectAt(p.x,p.y),p);
   if(hit.legacy?.component==='murguduk-hill'&&!hit.physical)samples.push(p);}
  assert.ok(samples.length,'Regression must click an actual hill triangle, not arbitrary empty sky');
  let before=await state();
  for(const p of samples){await page.mouse.click(p.x,p.y);await page.waitForTimeout(120);}
  let after=await state();
  assert.equal(after.currentObject,0,'A hill/background click must not select Saturn');
  assert.equal(after.selections,before.selections);
  assert.ok(after.ignoredBackdrop>before.ignoredBackdrop);
  // A genuine drag ending on a physical station object must not refocus it.
  const target=await page.evaluate(()=>{const q=window.__BAIKONUR_QA;return q.selection.pointForSite(q.stats().saturnIndex);});
  assert.ok(target,'At least one physical Saturn building must remain selectable');
  before=await state();
  await page.mouse.move(target.x-90,target.y-30);await page.mouse.down();
  await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.up();await page.waitForTimeout(300);
  after=await state();assert.equal(after.currentObject,0);assert.equal(after.selections,before.selections);assert.ok(after.ignoredGestures>before.ignoredGestures);
  // Returning the pointer to its start is still a drag, not a click.
  await reset();before=await state();
  await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+65,target.y+20,{steps:6});await page.mouse.move(target.x,target.y,{steps:6});await page.mouse.up();
  assert.equal((await state()).selections,before.selections);
  await page.mouse.move(800,450);await page.mouse.wheel(0,-180);await page.waitForTimeout(250);
  await page.keyboard.press('w');await page.waitForTimeout(250);assert.equal((await state()).selections,before.selections);
  // Right-button rotation cannot select an exhibit.
  await page.mouse.move(810,450);await page.mouse.down({button:'right'});await page.mouse.move(865,475,{steps:6});await page.mouse.up({button:'right'});
  assert.equal((await state()).selections,before.selections);
  await page.screenshot({path:`qa-selection/${prefix}-navigation.png`,timeout:60000});
  // Explicit click still works; no blanket disabling of selection.
  await reset();const click=await page.evaluate(()=>{const q=window.__BAIKONUR_QA;return q.selection.pointForSite(q.stats().saturnIndex);});
  assert.ok(click);before=await state();await page.mouse.click(click.x,click.y);await page.waitForTimeout(250);
  after=await state();assert.equal(after.currentObject,await page.evaluate(()=>window.__BAIKONUR_QA.stats().saturnIndex));assert.equal(after.selections,before.selections+1);
  await page.screenshot({path:`qa-selection/${prefix}-intentional-saturn.png`,timeout:60000});
  // Touch pan and pinch remain camera gestures.
  await reset();before=await state();
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:770,y:450,id:1},{x:870,y:450,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:740,y:470,id:1},{x:900,y:470,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
  assert.equal((await state()).selections,before.selections);
  // The lighting tool owns its clicks, never the exhibit selector.
  await page.evaluate(()=>window.__BAIKONUR_QA.lighting.setActive(true));before=await state();await page.mouse.click(800,450);
  assert.equal((await state()).selections,before.selections);await page.evaluate(()=>window.__BAIKONUR_QA.lighting.setActive(true));
  assert.equal(await page.locator('#error').isVisible(),false);
  assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
  const home=new URL(origin);home.searchParams.set('v','selection-no-jump-v1');
  await page.goto(home.toString(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__BAIKONUR_QA?.selection,null,{timeout:90000});
  await page.waitForTimeout(500);
  assert.equal((await state()).selections,0);
  assert.ok(!(await page.locator('#title').textContent()).includes('Сатурн'),'Home URL may not force Saturn');
  await page.screenshot({path:`qa-selection/${prefix}-home.png`,timeout:60000});
  assert.deepEqual(errors,[]);
  writeFileSync(`qa-selection/${prefix}-result.json`,JSON.stringify({passed:true,origin,checkedAt:new Date().toISOString(),hillSamples:samples.length,state:await state(),errors,checks:['hill-not-pickable','pan-not-click','out-and-back-drag','wheel','keyboard','right-drag','intentional-click','touch-pinch','lighting-tool']},null,2));
  console.log('SCENE_SELECTION_BROWSER_PASS',prefix);
 }
}catch(e){await page.screenshot({path:`qa-selection/${prefix}-failure.png`,timeout:30000}).catch(()=>{});writeFileSync(`qa-selection/${prefix}-failure.json`,JSON.stringify({message:e.message,errors},null,2));throw e;}
finally{await browser.close();}
