import {chromium} from 'playwright';import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import path from 'node:path';
const base=process.env.BAIKONUR_BUILD_URL||'http://127.0.0.1:8765/';
const hash=createHash('sha256');async function fingerprint(dir){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())await fingerprint(file);else{hash.update(file);hash.update(await readFile(file));}}}
for(const folder of ['src','data','assets'])await fingerprint(folder);hash.update(await readFile('workshop.html'));
const version=hash.digest('hex').slice(0,12),out='public-data/'+version;await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__BAKE_FRAME=()=>pending?.(performance.now());});
await page.exposeFunction('__WRITE_PUBLIC',async(file,b64)=>{if(!/^[a-zA-Z0-9_./-]+$/.test(file)||file.includes('..'))throw Error('Bad export path');const dest=path.join(out,file);await mkdir(path.dirname(dest),{recursive:true});const data=Buffer.from(b64,'base64');await writeFile(dest,file.endsWith('.gz')?gzipSync(data,{level:9}):data);});
try{
 await page.goto(base+'workshop.html?bakePublic=1&tour=0',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.__WORKSHOP_SCENE&&document.body.classList.contains('museum-ready'),null,{timeout:240000});
 await page.evaluate(async()=>{await window.__WORKSHOP_READY;const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);window.__WORKSHOP_SCENE.requestTransportDetail();window.__BAKE_FRAME();});
 await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:240000});
 await page.evaluate(async()=>{await Promise.allSettled([window.__BAIKONUR_QA.site31.load(),window.__BAIKONUR_QA.site2.load(),window.__BAIKONUR_QA.gagarinTable.load()]);});
 console.log('Source scene ready; compiling visitor assets');
 const result=await page.evaluate(async()=>{const {exportPublicMuseum}=await import('./src/public-build-export.js');return exportPublicMuseum(window.__WORKSHOP_SCENE,window.__WRITE_PUBLIC);});
 const manifest=JSON.parse(await readFile(out+'/manifest-source.json','utf8'));manifest.base='./'+out+'/';manifest.release=version;manifest.builtAt=new Date().toISOString();
 for(const s of manifest.sites)if(s.asset)s.transferBytes=(await readFile(out+'/'+s.asset)).length;
 await writeFile('public-data/manifest.json',JSON.stringify(manifest));
 console.log('PUBLIC_DATA_BUILT',JSON.stringify({...result,version,errors}));if(errors.length)throw Error('Source scene errors: '+errors.join('; '));
}catch(e){await mkdir('qa-two-editions',{recursive:true});await page.screenshot({path:'qa-two-editions/build-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
