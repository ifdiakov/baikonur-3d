import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
 await page.addInitScript(()=>{
  const native=requestAnimationFrame.bind(window);window.__MAP_PENDING=null;
  window.requestAnimationFrame=fn=>fn.name==='animate'?(window.__MAP_PENDING=fn,0):native(fn);
  window.__MAP_FRAME=()=>{const fn=window.__MAP_PENDING;window.__MAP_PENDING=null;fn?.(performance.now());};
 });
 const step=()=>page.evaluate(()=>window.__MAP_FRAME());
 const capture=page.screenshot.bind(page);page.screenshot=async options=>{await step();return capture({...options,timeout:90000});};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',async route=>{
  const path=new URL(route.request().url()).pathname.split('/three@0.160.1/')[1];
  await route.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+path,contentType:'text/javascript'});
 });
 await page.goto(process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().uiRevision==='20261028-museum4-clean-menu',null,{timeout:90000});
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(stats.sites,97);assert.equal(stats.stations,7);
 assert.ok(Math.abs(stats.transport.railGauge-7.3*.43*.28/1.5)<1e-10);assert.equal(stats.transport.railRoutes,14);
 assert.equal(stats.transport.roadMarkings,'arc-length-paint-with-junction-gaps');assert.ok(stats.transport.markingSegments>100);
 assert.ok(stats.transport.kazGateGap<.001);
 assert.equal(stats.transport.interchange.bridges.length,2);
 assert.ok(stats.transport.interchange.bridges.every(b=>b.clearance>5));
 assert.equal(stats.transport.gagarinRail.version,'pad1-matched-track-v2-below-grade');
 assert.equal(stats.saturn.access.preservedVerticalRaise,20);
 assert.equal(stats.saturn.terrain.material,'MeshBasicMaterial');assert.equal(stats.saturn.terrain.sharedMap,true);
 assert.equal(await page.locator('.station-screen-label').count(),0);
 assert.equal(await page.locator('.site-label.station-card').count(),7);
 assert.equal(await page.locator('.detail-card.station-card').count(),7);
 const ids=await page.locator('.detail-card.station-card').evaluateAll(cards=>cards.map(c=>c.dataset.stationId));
 for(const id of ids){
  await page.evaluate(id=>window.__BAIKONUR_QA.focusStation(id),id);
  await page.locator('.detail-card[data-station-id="'+id+'"]').waitFor({state:'visible'});
  assert.ok((await page.locator('#title').textContent()).startsWith('Ж/Д · '));
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.focusStation('st-nagornaya'));
 const detail=page.locator('.detail-card[data-station-id="st-nagornaya"]');
 const label=page.locator('.site-label[data-station-id="st-nagornaya"]');
 await page.keyboard.press('Escape');await detail.hover();
 assert.equal(await detail.locator('.site-eye-toggle').isVisible(),false);
 await detail.click({position:{x:9,y:9}});
 assert.equal(await detail.locator('.site-eye-toggle').isVisible(),true);
 await detail.locator('.site-eye-toggle').click();
 assert.equal(await detail.getAttribute('data-collapsed'),'true');
 assert.equal(await detail.locator('.detail-mini-number').textContent(),'Ж/Д · Нагорная');
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(400,'st-nagornaya'));
 await label.waitFor({state:'visible'});
 assert.equal(await label.getAttribute('data-collapsed'),'true');
 await label.locator('.site-mini-number').click();
 assert.equal(await detail.getAttribute('data-collapsed'),'false');
 assert.equal(await label.getAttribute('data-collapsed'),'false');
 assert.equal(await label.locator('.site-eye-toggle').isVisible(),true);
 await page.locator('[data-layer="rails"]').uncheck();await step();
 await label.waitFor({state:'hidden'});
 await page.locator('[data-layer="rails"]').check();await step();await label.waitFor({state:'visible'});
 await page.locator('#sitesAccordion > summary').click();
 await page.locator('#search').fill('Нагорная');
 assert.equal(await page.locator('#list .entry-station').count(),1);
 await page.locator('#list .entry-station').click();
 assert.ok((await page.locator('#title').textContent()).includes('Нагорная'));
 await page.locator('#detailMore').click();assert.ok((await page.locator('#infoExtra a').first().getAttribute('href')).includes('baykonur-plan.png'));
 await page.locator('#search').fill('');await page.locator('#sitesAccordion > summary').click();
 await page.screenshot({path:'qa-station-card.png'});
 console.log('STATION CARDS PASS: common rendering, selection, collapse, zoom, layers and search');

 const terrain=await page.evaluate(async()=>{
  const THREE=await import('three');const {buildSaturnIP5}=await import('./src/saturn-ip5.js');
  const texture=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
  const root=new THREE.Group();root.position.set(309.4,17.45,657.9);root.scale.setScalar(.525);root.updateMatrixWorld(true);
  buildSaturnIP5(root,{terrainTexture:texture,terrainMaterial:material,terrainWidth:4420,terrainHeight:3553});
  let hill;root.traverse(o=>{if(o.userData.museumComponent==='murguduk-hill')hill=o;});
  const p=hill.geometry.attributes.position,uv=hill.geometry.attributes.uv,c=hill.geometry.attributes.color;
  let error=0,edgeAlpha=0;
  for(let i=0;i<p.count;i++){
    const w=root.localToWorld(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));
    error=Math.max(error,Math.abs(uv.getX(i)-(.5+w.x/4420)),Math.abs(uv.getY(i)-(.5-w.z/3553)));
    if(Math.abs(p.getX(i))===500||Math.abs(p.getZ(i))===500)edgeAlpha=Math.max(edgeAlpha,c.getW(i));
  }
  return {error,edgeAlpha,sameMap:hill.material.map===texture,type:hill.material.type,color:hill.material.color.getHex()};
 });
 assert.ok(terrain.error<1e-6);assert.equal(terrain.edgeAlpha,0);
 assert.equal(terrain.sameMap,true);assert.equal(terrain.type,'MeshBasicMaterial');assert.equal(terrain.color,0xffffff);
 console.log('SATURN TEXTURE PASS',JSON.stringify(terrain));

 await page.locator('#close').click();await page.locator('#showLabels').uncheck();await step();
 await page.evaluate(()=>window.__BAIKONUR_QA.lighting.setActive(true));assert.equal(await page.locator('#lightingPanel').isVisible(),true);
 await page.mouse.click(1030,730);await step();
 let lamps=await page.evaluate(()=>window.__BAIKONUR_QA.lighting.snapshot().lamps);
 assert.equal(lamps.length,1);
 const original={...lamps[0]};
 const pole=await page.evaluate(l=>window.__BAIKONUR_QA.projectWorld(l.x,l.y+l.height*.5,l.z),original);
 await page.locator('[data-mode="move"]').click();await page.mouse.click(pole.x,pole.y);await step();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats())).selected,original.id);
 await page.mouse.click(930,720);await step();
 lamps=await page.evaluate(()=>window.__BAIKONUR_QA.lighting.snapshot().lamps);
 assert.ok(Math.hypot(lamps[0].x-original.x,lamps[0].z-original.z)>1);
 await page.locator('[data-action="undo"]').click();
 assert.deepEqual((await page.evaluate(()=>window.__BAIKONUR_QA.lighting.snapshot().lamps))[0],original);
 await page.locator('[data-mode="remove"]').click();await page.mouse.click(pole.x,pole.y);await step();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats())).count,0);
 await page.locator('[data-action="undo"]').click();
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(90,'pad-3'));
 await page.locator('[data-mode="road"]').click();
 const roadPoint=await page.evaluate(()=>window.__BAIKONUR_QA.projectWorld(160,.72,462.34));
 await page.mouse.click(roadPoint.x,roadPoint.y);await step();
 const rowCount=(await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats())).count;
 assert.ok(rowCount>1,'Road mode must place a row from an actual road click');
 await page.locator('[data-action="undo"]').click();assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats())).count,1);
 await page.mouse.click(roadPoint.x,roadPoint.y);await step();
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').click();
 const download=await downloadPromise;const exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(exported.version,1);assert.equal(exported.lamps.length,rowCount);
 await page.locator('#lampImport').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"lamps":[{"x":"bad"}]}')});
 await page.waitForFunction(()=>document.getElementById('lightingStatus').textContent.includes('Не удалось загрузить'));
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats())).count,rowCount);
 await page.screenshot({path:'qa-lighting-editor.png'});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.lighting,null,{timeout:90000});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats())).count,rowCount);
 assert.equal(await page.locator('#lightingPanel').isVisible(),false);
 await page.locator('#showLabels').uncheck();await step();
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite(0));await page.locator('#close').click();
 await page.screenshot({path:'qa-gagarin-track-join.png'});
 await page.evaluate(()=>window.__BAIKONUR_QA.focusInterchange());
 await page.screenshot({path:'qa-south-two-bridges.png'});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite(q.stats().saturnIndex)});
 await page.locator('#close').click();await page.mouse.move(1000,650);await page.mouse.wheel(0,1800);
 await page.waitForTimeout(400);await page.screenshot({path:'qa-saturn-seamless.png'});
 assert.deepEqual(errors,[]);
 console.log('LIGHTING EDITOR PASS: placement, movement, deletion, rows, undo, export and persistent restore');
}finally{await browser.close();}
