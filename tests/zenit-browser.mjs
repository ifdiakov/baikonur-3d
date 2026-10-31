import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-zenit';
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);options.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});
const evidence={base,errors:[],failedResources:[],views:{}};await mkdir(out,{recursive:true});
page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|GL_INVALID|WebGL/.test(m.text()))evidence.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)evidence.failedResources.push({url:r.url(),status:r.status()});});
await page.addInitScript(()=>{const original=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='animate'?(window.__ZENIT_FRAME=fn,0):original(fn);});
const frame=()=>page.evaluate(()=>window.__ZENIT_FRAME());
const stats=()=>page.evaluate(()=>window.__ZENIT_QA.stats());
const shot=async name=>{await frame();await page.screenshot({path:`${out}/${prefix}-${name}.png`,fullPage:true});};
try{
 const url=new URL('workshop/zenit.html',base);url.searchParams.set('qa',prefix);await page.goto(url.href,{waitUntil:'networkidle',timeout:90000});await page.waitForFunction(()=>window.__ZENIT_QA,{timeout:60000});await frame();
 for(const view of ['full','engine','interstage','fairing']){await page.locator(`[data-view="${view}"]`).click();await frame();const s=await stats();assert.equal(s.view,view);assert.ok(s.drawCalls>0&&s.drawCalls<=19);assert.ok(s.renderTriangles>0&&s.renderTriangles<=100160);if(view==='full')assert.equal(s.renderTriangles,100160);assert.equal(await page.locator(`[data-view="${view}"]`).getAttribute('aria-pressed'),'true');evidence.views[view]=s;await shot(view);}
 await page.locator('[data-view="full"]').click();await frame();const assembled=await stats();
 const c=await page.locator('#modelView canvas').boundingBox();await page.mouse.move(c.x+c.width*.5,c.y+c.height*.5);await page.mouse.down();await page.mouse.move(c.x+c.width*.65,c.y+c.height*.55,{steps:6});await page.mouse.up();await frame();assert.notDeepEqual((await stats()).camera,assembled.camera,'Orbit drag must move the camera');
 await page.locator('#explode').click();assert.equal((await stats()).exploded,1);assert.ok((await stats()).bounds[0]>assembled.bounds[0]+10);await shot('exploded');
 await page.locator('#explode').click();assert.equal((await stats()).exploded,0);assert.deepEqual((await stats()).bounds,assembled.bounds);
 await page.locator('#rotate').click();const before=(await stats()).camera;await frame();await frame();assert.notDeepEqual((await stats()).camera,before);await page.locator('#rotate').click();
 await page.locator('#light').click();assert.equal((await stats()).dark,true);await shot('dark');await page.locator('#light').click();
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.__ZENIT_QA.stats().viewport[0]<400);await page.locator('[data-view="full"]').click();await shot('mobile');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const view of ['engine','interstage']){await page.locator(`[data-view="${view}"]`).click();await shot('mobile-'+view);}
 assert.equal(await page.locator('a.back').getAttribute('href'),'../index.html');
 const asset=await page.evaluate(async()=>{const {GLTFLoader}=await import('../src/vendor/three-r160/examples/jsm/loaders/GLTFLoader.js');const {MeshoptDecoder}=await import('../src/vendor/meshopt_decoder-v1.mjs');const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);const gltf=await loader.loadAsync('../assets/models/zenit-3sl/model-v1.glb');let meshes=0,triangles=0;gltf.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});return {meshes,triangles};});assert.equal(asset.meshes,19);assert.equal(asset.triangles,100160);evidence.asset=asset;
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.failedResources,[]);console.log('ZENIT_BROWSER_OK',JSON.stringify({base,views:Object.keys(evidence.views),orbit:true,explode:true,mobile:true}));
}finally{await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(evidence,null,2)+'\n');await browser.close();}
