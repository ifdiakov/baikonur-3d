import './finish-owner19-rail.mjs';
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
try{
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='animate'?0:raf(fn);});
 await page.goto('http://127.0.0.1:8765/?tour=0&bakeTransport=1',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>typeof window.__BAIKONUR_TRANSPORT_EXPORT==='function',null,{timeout:180000});
 const json=await page.evaluate(()=>JSON.stringify(window.__BAIKONUR_TRANSPORT_EXPORT())),baked=JSON.parse(json);
 if(baked.version!=='transport-geometry-bake-v1'||baked.stats.roadFeatureCount<2000)throw Error('Invalid exact geometry cache');
 const fields=Object.entries(baked).map(([key,value])=>{const raw=Buffer.from(JSON.stringify(value));return {key,rawBytes:raw.length,gzipBytes:gzipSync(raw,{level:6}).length};}).sort((a,b)=>b.gzipBytes-a.gzipBytes);
 console.log('TRANSPORT_BAKE_BREAKDOWN',JSON.stringify(fields));
 const compressed=gzipSync(Buffer.from(json),{level:9});fs.mkdirSync('data/osm',{recursive:true});fs.writeFileSync('data/osm/transport-geometry-bake-v1.json.gz',compressed);
 await import('../tests/owner19-shared-rail.mjs');
 console.log('TRANSPORT_BAKE_PASS',JSON.stringify({rawBytes:Buffer.byteLength(json),gzipBytes:compressed.length,roads:baked.stats.renderedRoadWays,rails:baked.stats.renderedRailWays}));
}finally{await browser.close();}
