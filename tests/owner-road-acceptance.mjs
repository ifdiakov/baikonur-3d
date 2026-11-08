import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const out='qa-owner-roads';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(180000);
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__ROAD_FRAME=()=>pending?.(performance.now());});
await page.route('**/*',async route=>{
 if(route.request().resourceType()!=='document')return route.continue();
 const response=await route.fetch();let html=await response.text();
 html=html.replace('window.__BAIKONUR_QA={','window.__ROAD_DEBUG={scene,camera,ctl,renderer,layers,geography,siteRecords,transport,roadLOD,portalArchive,steppeSurface,displayRoadGrade,requestTransportDetail};window.__BAIKONUR_QA={');
 await route.fulfill({response,body:html});
});
const areas=[['t605',605.7,424.2,48],['t612',612.5,414.1,48],['bend620',620,402.8,48],['shoulder585',585,402.6,46],['shoulder580',580.2,404,46],['ad-rail559',559.5,406.6,65],['ramp538',538.7,440.9,55],['ramp543',543.4,446.2,55],['t589',589.8,377.1,48],['rail-seam',583,385,90],['ad-removal',565,401,150],['building589',589,342.7,48],['ukss-road',589,259.8,65]];
try{
 await page.goto(base+'?view=site113&grid=0&tour=0',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__ROAD_DEBUG,null,{timeout:240000});
 await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(false);window.__BAIKONUR_QA.setLabelsVisible(false);window.__ROAD_DEBUG.requestTransportDetail();window.__ROAD_FRAME();});
 await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:240000});
 await page.addStyleTag({content:'body > :not(#view){visibility:hidden!important} #view{visibility:visible!important} #view canvas{visibility:visible!important}'});
 const report={stage:'inspection',errors,areas:{}};
 for(const [name,x,y,h]of areas){
  const info=await page.evaluate(({x,y,h})=>{
   const d=window.__ROAD_DEBUG,q=window.__BAIKONUR_QA,wx=(x-650)*3.4,wz=(y-522.5)*3.4;
   d.ctl.enableDamping=false;d.ctl.maxPolarAngle=Math.PI/2;d.ctl.target.set(wx,.72,wz);d.camera.position.set(wx,h,wz+.01);d.ctl.update();d.camera.updateMatrixWorld(true);
   d.roadLOD?.update(100,d.scene.children.flatMap(g=>g.children.filter(c=>c.name.startsWith('OpenStreetMap ·'))));
   d.renderer.render(d.scene,d.camera);
   const paths=d.transport.editableRoadPaths().filter(r=>r.points.some(p=>Math.hypot(p.x-wx,p.z-wz)<h*.6)).map(r=>({id:r.id,width:r.width,tags:r.tags,points:r.points.filter(p=>Math.hypot(p.x-wx,p.z-wz)<h*.9).map(p=>[p.x/3.4+650,p.y,p.z/3.4+522.5])}));
   return {map:[x,y],camera:q.cameraState(),paths};
  },{x,y,h});
  report.areas[name]=info;await page.screenshot({path:out+'/'+name+'.png'});
 }
 await page.evaluate(()=>{const d=window.__ROAD_DEBUG,q=window.__BAIKONUR_QA;q.site113.inspect('top');d.ctl.update();d.camera.updateMatrixWorld(true);d.renderer.render(d.scene,d.camera);});
 await page.screenshot({path:out+'/site113-top.png'});
 report.site113=await page.evaluate(()=>{const d=window.__ROAD_DEBUG,q=window.__BAIKONUR_QA;return {stats:q.site113.stats(),grade:q.site113.groundStats(),camera:q.cameraState(),roads:q.stats().roadEditor};});
 await writeFile(out+'/inspection.json',JSON.stringify(report,null,2));
 console.log('ROAD_INSPECTION_CAPTURED',JSON.stringify({errors,areas:areas.length,detailReady:await page.evaluate(()=>window.__BAIKONUR_QA.stats().transportBake.detailReady)}));
}finally{await browser.close();}
