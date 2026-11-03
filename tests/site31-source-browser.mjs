import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-site31',prefix=process.env.QA_PREFIX||'local';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(90000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0;
// Exercise failure + recovery against the real asset loader in the full museum.
await page.route('**/assets/models/site31/model-v1.glb*',route=>{requests++;return requests===1?route.abort():route.continue();});
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SITE31_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};});
const frame=()=>page.evaluate(()=>window.__SITE31_FRAME());
try{
 const url=new URL(base);url.searchParams.set('view','site31');url.searchParams.set('detail','structure');await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:300000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA.site31.stats().asset.status==='error');
 assert.equal(await page.locator('#site31Views button').count(),5);await page.locator('#site31LoadStatus button').click();
 await page.waitForFunction(()=>window.__BAIKONUR_QA.site31.stats().asset.status==='ready',null,{timeout:120000});await frame();
 const state=await page.evaluate(()=>window.__BAIKONUR_QA.site31.stats());assert.equal(state.asset.triangles,109604);assert.equal(state.asset.drawCalls,2);assert.equal(requests,2);
 await page.waitForFunction(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='site31')?.status==='ready',null,{timeout:120000});
 const before=await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='site31').visible);
 await page.locator('#rocketExhibitToggle').click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='site31').visible),!before);await page.locator('#rocketExhibitToggle').click();
 const poses=[];for(const [label,id]of [['Стартовый стол','structure'],['Вся площадка','all'],['Газоотвод','duct'],['Подъезды','connections'],['Сверху','top']]){
  await page.locator('#site31Views button').filter({hasText:label}).click();await frame();poses.push(await page.evaluate(()=>window.__BAIKONUR_QA.cameraState()));await page.screenshot({path:`${out}/${prefix}-${id}-evening.png`});
 }
 assert(new Set(poses.map(p=>p.position.join(','))).size===5);for(const p of poses)assert([...p.target,...p.position].every(Number.isFinite));
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));await page.locator('#site31Views button').filter({hasText:'Стартовый стол'}).click();await frame();await page.screenshot({path:`${out}/${prefix}-structure-day.png`});
 await page.locator('#detailMore').click();assert(await page.getByRole('link',{name:'Soviet Model Magic',exact:true}).isVisible());await page.locator('#detailMore').click();
 await page.setViewportSize({width:390,height:844});await page.locator('#site31Views button').filter({hasText:'Стартовый стол'}).click();await frame();await page.screenshot({path:`${out}/${prefix}-mobile.png`});
 const buttons=await page.locator('#site31Views button').evaluateAll(xs=>xs.map(x=>{const b=x.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};}));assert(buttons.every(b=>b.left>=0&&b.right<=390&&b.bottom<=844));
 await page.locator('#close').click();await frame();await page.screenshot({path:`${out}/${prefix}-mobile-uncovered.png`});
 assert.deepEqual(errors,[]);await writeFile(`${out}/${prefix}-evidence.json`,JSON.stringify({base,state,poses,requests,buttons,errors},null,2));console.log('SITE31_BROWSER_PASS',JSON.stringify({base,requests,triangles:state.asset.triangles,drawCalls:state.asset.drawCalls,views:poses.length}));
}finally{if(errors.length)console.log(JSON.stringify({errors}));await browser.close();}
