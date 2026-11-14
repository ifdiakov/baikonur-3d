import {mobileEnabled,mobileCoverage} from './helpers/qa-scope.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
 '--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox'
]});
const errors=[],logs=[],out='qa-encyclopedia-media';
await mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1500,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/3D|WebGL|SyntaxError|ReferenceError/.test(m.text()))logs.push(m.text())});
page.setDefaultTimeout(90000);
const stat=()=>page.evaluate(()=>window.__ENCYCLOPEDIA_QA?.stats());
try{
 await page.goto(new URL('encyclopedia.html',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().items===36,null,{timeout:90000});
 let x=await stat();
 assert.deepEqual(JSON.parse(JSON.stringify(x.mediaKinds)),{model3d:7,none:15,logo:7,wordmark:1,portrait:6});
 assert.equal(await page.locator('#cards .card').count(),36);
 // All six technology cards must show independently generated model thumbnails.
 await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().previewCount===7,null,{timeout:90000});
 const rocketIds=['r7','soyuz','soyuzcraft','proton','energia','buran'];
 for(const id of rocketIds){
  const image=page.locator('#cards [data-article-id="'+id+'"] img.model-thumbnail');
  assert.equal(await image.count(),1,'Missing 3D thumbnail in '+id);
  assert.equal(await image.evaluate(img=>img.src.startsWith('data:image/')),true,'Unrendered 3D thumbnail for '+id);
 }
 await page.screenshot({path:out+'/all-articles.png',fullPage:true});

 await page.locator('#cards [data-article-id="proton"]').click();
 await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().model?.activeId==='proton');
 assert.equal(await page.locator('#detail .detail-model-stage canvas').count(),1,'The selected technology article must contain an interactive WebGL model');
 await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().model?.mode==='museum-asset',null,{timeout:90000});
 await page.screenshot({path:out+'/proton-model.png'});
 // The Soyuz SPACECRAFT must not be replaced by a Soyuz ROCKET.
 await page.locator('#cards [data-article-id="soyuzcraft"]').click();
 await page.waitForFunction(()=>window.__ENCYCLOPEDIA_QA?.stats().model?.activeId==='soyuzcraft');
 assert.equal(await page.locator('#detail .detail-model-stage canvas').count(),1);
 assert.equal((await stat()).model.mode,'illustrative');
 await page.screenshot({path:out+'/soyuz-spacecraft.png'});

 await page.locator('#tabs button').filter({hasText:'Конструкторы'}).click();
 assert.equal(await page.locator('#cards .card').count(),7);
 assert.equal(await page.locator('#cards .card-media[data-kind="portrait"] img').count(),6);
 await page.locator('#cards [data-article-id="korolev"]').click();
 assert.equal(await page.locator('#detail .detail-media[data-kind="portrait"] img').count(),1);
 assert.match(await page.locator('#detail .media-credit').textContent(),/RocketTrip|архив/);
 await page.screenshot({path:out+'/designers.png',fullPage:true});

 await page.locator('#tabs button').filter({hasText:'Предприятия'}).click();
 assert.equal(await page.locator('#cards .card').count(),8);
 assert.equal(await page.locator('#cards .card-media[data-kind="logo"] img').count(),7);
 assert.equal(await page.locator('#cards .card-media[data-kind="wordmark"]').count(),1);
 await page.locator('#cards [data-article-id="molniya"]').click();
 assert.match(await page.locator('#detail .media-credit').textContent(),/Молния/);
 await page.screenshot({path:out+'/organizations.png',fullPage:true});

 if(mobileEnabled){
 await page.setViewportSize({width:390,height:844});
 await page.locator('#cards [data-article-id="energiaorg"]').click();
 await page.screenshot({path:out+'/mobile-enterprise.png',fullPage:true});
 }
 assert.deepEqual(errors,[],'No uncaught errors in encyclopaedia');
 assert.deepEqual(logs,[],'No WebGL or JavaScript errors in encyclopaedia');
 x=await stat();
 await writeFile(out+'/result.json',JSON.stringify({pass:true,mobileCoverage,stats:x,errors,logs},null,2));
 console.log('ENCYCLOPEDIA_MEDIA_BROWSER_PASS',JSON.stringify({previewCount:7,people:7,companies:8,interactive:true}));
}catch(error){
 await writeFile(out+'/failure.json',JSON.stringify({message:error.message,errors,logs,stats:await stat()},null,2));
 await page.screenshot({path:out+'/failure.png'}).catch(()=>{});
 throw error;
}finally{await browser.close();}
