import fs from 'node:fs';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {chromium} from 'playwright';
const files=['src/transport-bake.js','src/osm-transport.js','src/owner-ad-refinements.js','src/owner-rail-curves.js','src/owner19-surface-ownership.js','src/site113-road-grade.js','src/osm-geography.js','data/road-edits-authoritative-20261103.json'];
const digest=createHash('sha256');for(const f of files)digest.update(f).update(fs.readFileSync(f));const hash=digest.digest('hex');
const target='data/osm/transport-geometry-bake-v1.json.gz';
try{if(JSON.parse(gunzipSync(fs.readFileSync(target))).ownerSourceHash===hash){console.log('OWNER19_CACHES_ALREADY_MATCH',hash);process.exit(0);}}catch{}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}});page.on('pageerror',e=>console.error(e.message));
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='animate'?0:raf(fn);});
 // Offline data preparation only. Browser acceptance uses the real renderer.
 await page.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.continue();const res=await r.fetch();const html=(await res.text()).replace('renderer.setPixelRatio(','renderer.render=()=>{};renderer.setPixelRatio(');await r.fulfill({response:res,body:html});});
 await page.goto((process.env.BAIKONUR_URL||'http://127.0.0.1:8765/')+'?tour=0&bakeTransport=1',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>typeof __BAIKONUR_TRANSPORT_EXPORT==='function',null,{timeout:180000,polling:250});
 const value=await page.evaluate(()=>__BAIKONUR_TRANSPORT_EXPORT());value.ownerSourceHash=hash;
 if(value.ownerRevision!=='20261109-owner19-v2'||value.editable.length<500)throw Error('Invalid rebuilt route cache');
 fs.writeFileSync(target,gzipSync(Buffer.from(JSON.stringify(value)),{level:9}));execFileSync(process.execPath,['scripts/build-authoritative-road-lod.mjs'],{stdio:'inherit'});
 fs.mkdirSync('qa-owner19',{recursive:true});fs.writeFileSync('qa-owner19/cache-build.json',JSON.stringify({passed:true,hash,ownerRevision:value.ownerRevision,roads:value.editable.length,rails:value.terrain.rails.length,sourceFingerprint:value.sourceFingerprint},null,2));console.log('OWNER19_CACHES_REBUILT',hash);
}finally{await browser.close();}
