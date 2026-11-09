import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {bakeDistrictFill,bakeDistrictBorder} from '../src/public-atmosphere-geometry.js';
import {FLANK_POLYGONS,FLANK_OUTLINE,FLANK_CENTERS,FLANK_BOUNDARY_VERSION} from '../src/flank-boundaries.js';
import {CITY_TERRITORY_OUTLINE,CITY_TERRITORY_COLOR} from '../src/city-territory.js';
import {FLANK_DISTRICTS} from '../src/flank-districts.js';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error')console.error(m.text())});
await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let cb;window.__PUBLIC_LIGHT_FIELDS=[];window.requestAnimationFrame=fn=>fn.name==='animate'?(cb=fn,0):raf(fn);window.__EXPORT_FRAME=()=>cb?.(performance.now());});
await page.route('**/src/light-field.js*',async route=>{const r=await route.fetch();const src=(await r.text()).replace('return {root,records,refresh,sync,','globalThis.__PUBLIC_LIGHT_FIELDS.push({name,records,poles,pools,minPixels});return {root,records,refresh,sync,');await route.fulfill({response:r,body:src});});
try{
 await page.goto((process.env.BAIKONUR_URL||'http://127.0.0.1:8765/')+'workshop.html?tour=0&workshopBuild=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.evening&&document.body.classList.contains('museum-ready')||document.querySelector('#error')?.textContent,null,{timeout:180000});
 if(!await page.evaluate(()=>!!window.__BAIKONUR_QA?.evening))throw Error(await page.locator('body').innerText());
 const fields=await page.evaluate(()=>{
  const clean=r=>{const c={};for(const k of ['x','y','z','height','lightX','lightY','lightZ','poolX','poolY','poolZ','poolRadiusX','poolRadiusY','radius','color','size','brightness','yaw','style','roadId','kind','airport','powered','visible'])if(r[k]!==undefined)c[k]=r[k];return c;};
  return window.__PUBLIC_LIGHT_FIELDS.filter(f=>/^(Дороги ·|Вечер ·|Аэродромы ·|Мачты ·|Башни ·)/.test(f.name)).map(f=>({name:f.name,poles:f.poles,pools:f.pools,minPixels:f.minPixels,records:f.records.filter(r=>r.visible!==false&&r.powered!==false).map(clean)}));
 });
 const boards=await page.evaluate(()=>window.__BAIKONUR_QA.evening.facilityLightRecords().boards);
 fields.push({name:'Мачты · пятна прожекторов',poles:false,pools:true,minPixels:0,records:boards.filter(b=>b.powered).map(b=>({x:b.position[0],y:b.position[1],z:b.position[2],height:0,lightX:b.position[0],lightY:b.position[1],lightZ:b.position[2],poolX:b.target[0],poolY:b.target[1],poolZ:b.target[2],poolRadiusX:b.radiusX,poolRadiusY:b.radiusY,color:0xffe4bf,size:0,brightness:1.3,visible:true}))});
 const map=p=>[(p[0]-650)*3.4,(p[1]-522.5)*3.4];
 const designers=[['ЧЕЛОМЕЙ','Владимир Николаевич Челомей','chelomey'],['КОРОЛЁВ','Сергей Павлович Королёв','korolev'],['ЯНГЕЛЬ','Михаил Кузьмич Янгель','yangel']];
 const zones=FLANK_DISTRICTS.map((d,i)=>({...d,zone:['ЛЕВЫЙ ФЛАНГ','ЦЕНТРАЛЬНЫЙ ФЛАНГ','ПРАВЫЙ ФЛАНГ'][i],surname:designers[i][0],fullName:designers[i][1],portrait:'assets/flank-portraits/'+designers[i][2]+'.webp',polygon:FLANK_POLYGONS[i].map(map),center:map(FLANK_CENTERS[d.key])}));
 zones.push({key:'city',zone:'ГОРОД БАЙКОНУР',name:'Город Байконур',color:CITY_TERRITORY_COLOR,polygon:CITY_TERRITORY_OUTLINE.map(map)});
 const terrain=JSON.parse(await readFile('data/public-scene.json','utf8'));
 for(const z of zones){z.fill=bakeDistrictFill(z.polygon,terrain);z.border=bakeDistrictBorder(z.polygon,2.2,terrain);z.borderWide=bakeDistrictBorder(z.polygon,12,terrain);}
 for(const f of fields)f.records=f.records.filter(r=>r.x>=terrain.bounds[0]&&r.x<=terrain.bounds[2]&&r.z>=terrain.bounds[1]&&r.z<=terrain.bounds[3]);
 const data={terrainFingerprint:terrain.fingerprint,outlineBorder:bakeDistrictBorder(FLANK_OUTLINE.map(map),3.5,terrain),version:'visitor-atmosphere-20261109-v1',source:'Approved workshop lighting and owner-registered district geometry',boundaryVersion:FLANK_BOUNDARY_VERSION,zones,outline:FLANK_OUTLINE.map(map),fields};
 await writeFile('data/public-atmosphere.json.gz',gzipSync(JSON.stringify(data),{level:9}));
 console.log(JSON.stringify({errors,fields:fields.map(f=>({name:f.name,lights:f.records.length,poles:f.poles,pools:f.pools})),bytes:JSON.stringify(data).length}));
 if(errors.length)throw Error(errors.join('; '));
}catch(e){console.error((await page.locator('body').innerText()).slice(-6000));throw e;}finally{await browser.close()}
