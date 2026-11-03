import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-road-editor';await mkdir(out,{recursive:true});
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
const browser=await chromium.launch(options),page=await browser.newPage({
 viewport:{width:1600,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true});
page.setDefaultTimeout(90000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__ROAD_EDITOR_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const frame=()=>page.evaluate(()=>window.__ROAD_EDITOR_FRAME());
try{
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.roadEditor,null,{timeout:300000});
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats());
 assert(initial.sourceRoadPaths>100);
 assert.equal(initial.added,18,'18 owner roads must be published');assert.equal(initial.hidden,289,'289 removals must be published');
 assert(initial.maskTiles.length===3&&initial.maskTiles.some(t=>t.enabled));
 await page.locator('#roadEditorToggle').click();
 await page.locator('#roadEditorPanel').waitFor({state:'visible'});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).active,true);
 await page.mouse.click(850,680);await page.mouse.click(970,690);await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).draftPoints,2);
 await page.locator('#roadEditorPanel [data-action="finish"]').click();await frame();
 let snapshot=await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.snapshot());
 assert.equal(snapshot.added.length,19);assert.equal(snapshot.hidden.length,289);
 assert.equal(snapshot.added.at(-1).points.length,2);
 const road=snapshot.added.at(-1);
 assert(road.points.every(p=>p.every(Number.isFinite)));
 await page.locator('#roadEditorPanel [data-action="undo"]').click();await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,18);
 await page.locator('#roadEditorPanel [data-action="redo"]').click();await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,19);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#roadEditorPanel [data-action="export"]').click();
 const downloaded=await downloadPromise;
 const exported=JSON.parse(await readFile(await downloaded.path(),'utf8'));
 assert.equal(exported.added.length,19);assert.equal(exported.hidden.length,289);assert.equal(exported.version,1);
 await page.locator('#roadEditorImport').setInputFiles({name:'broken.json',mimeType:'application/json',
  buffer:Buffer.from('{"version":1,"added":[{"id":"bad","points":[["invalid"]]}],"hidden":[]}')});
 await page.waitForFunction(()=>document.getElementById('roadEditorStatus').textContent.includes('Ошибка импорта'));
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,19);
 // Remove a freshly built road and recover it with Undo.
 await page.locator('#roadEditorPanel [data-mode="erase"]').click();
 const center=road.points[0].map((v,i)=>(v+road.points[1][i])/2);
 const click=await page.evaluate(p=>window.__BAIKONUR_QA.projectWorld(...p),center);
 assert(click.x>320&&click.x<1220&&click.y>200&&click.y<940,
  'The editable road is under the canvas, not hidden behind a panel');
 await page.mouse.click(click.x,click.y);await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,18);
 await page.locator('#roadEditorPanel [data-action="undo"]').click();await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,19);
 await page.screenshot({path:out+'/'+prefix+'-editor.png'});
 // JSON is persistent in this browser but source OSM must not be changed.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.roadEditor,null,{timeout:300000});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,19);
 assert.equal(await page.locator('#roadEditorPanel').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('ROAD_EDITOR_BROWSER_PASS',JSON.stringify({sourcePaths:initial.sourceRoadPaths,importVersion:exported.version,download:downloaded.suggestedFilename()}));
}finally{
 if(errors.length)console.log('ROAD_EDITOR_PAGE_ERRORS',JSON.stringify(errors));
 await browser.close();
}
