import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local';await mkdir('qa-flanks',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(45000);
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let frozen=false,pending;
 window.requestAnimationFrame=fn=>frozen&&fn.name==='animate'?(pending=fn,0):native(fn);
 window.__freezeMuseum=()=>{frozen=true;};
 window.__stepMuseum=()=>new Promise(resolve=>native(t=>{const fn=pending;pending=null;fn?.(t);resolve();}));
});
const step=()=>page.evaluate(()=>window.__stepMuseum());
const errors=[],shaders=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader/i.test(m.text()))shaders.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
try{
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().flankDistricts.version==='contours-three-level-v5'&&window.__BAIKONUR_QA.inspectFlankBoundaries,null,{timeout:120000});
 await page.evaluate(()=>window.__freezeMuseum());await step();
 const overview=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(overview.mapHierarchy.level,'overview');assert.equal(overview.flankDistricts.visibleZones,0);
 assert.equal(overview.flankDistricts.visibleOverviewBoundary,1);assert.equal(overview.flankDistricts.visibleOverviewFill,1);
 assert.equal(overview.flankDistricts.overviewBoundarySegments,14);
 assert.ok(overview.flankDistricts.overviewAlpha>.99&&overview.flankDistricts.overviewFillOpacity>0&&overview.flankDistricts.overviewFillOpacity<=.035);
 assert.ok(overview.flankDistricts.overviewBoundaryOpacity>=.2&&overview.flankDistricts.overviewBoundaryOpacity<=.3);
 assert.equal(await page.locator('.flank-label:visible,.site-label:visible,.detail-card:visible').count(),0,'The opening map shows only the overall contour');
 await page.evaluate(()=>window.__BAIKONUR_QA.showFlanks());await step();await page.waitForTimeout(400);
 const state=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(state.flankCardLayout,'horizontal');assert.equal(state.flankDistricts.version,'contours-three-level-v5');
 assert.equal(state.mapHierarchy.level,'flanks');assert.equal(state.flankDistricts.visibleOverviewBoundary,0);
 assert.equal(await page.locator('.site-label:visible,.detail-card:visible').count(),0,'Object labels wait until the next zoom level');
 assert.equal(state.flankDistricts.visibleZones,3);assert.equal(state.flankDistricts.visibleBoundaries,2);
 assert.equal(state.flankDistricts.visibleOuterBoundaries,1);assert.equal(state.flankDistricts.outerBoundarySegments,16);
 assert.deepEqual(state.flankDistricts.boundaryVertices,[2,2]);assert.equal(state.flankDistricts.outerBoundary.length,14);
 assert.deepEqual(state.flankDistricts.polygons.map(p=>p.length),[4,6,10]);assert.equal(state.flankDistricts.reference.version,'owner-osm-outline-20261028-v2');
 assert.deepEqual(state.flankDistricts.reference.imageSize,[1986,1632]);assert.equal(state.flankDistricts.reference.sourceFile,'контур и фланги.png');
 assert.equal(state.flankDistricts.coordinateSystem,'osm-map');assert.equal(state.flankDistricts.reliefClipped,true);
 assert.ok(state.flankDistricts.alpha>.9);assert.equal(state.flankCards.panels,3);
 assert.equal(state.flankCards.plane,'screen');assert.equal(state.flankCards.groundPanels,0);
 assert.equal(state.flankDistricts.groundTextPanels,0);assert.equal(state.flankDistricts.reliefCount,1);assert.deepEqual(state.flankDistricts.reliefFlanks,['center']);assert.equal(state.flankDistricts.visibleReliefSurfaces,1);
 assert.equal(await page.locator('.flank-territory-layer,.flank-on-terrain').count(),0,'No text or portrait panels remain on the ground');
 assert.deepEqual(await page.locator('.flank-engineer').allTextContents(),['ЧЕЛОМЕЙ','КОРОЛЁВ','ЯНГЕЛЬ']);
 const rects=await page.locator('.flank-label').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.district,x:r.x,y:r.y,w:r.width,h:r.height,transform:getComputedStyle(e).transform};}));
 const ui=await page.locator('#ui').boundingBox();console.log('FLANK RECTS',JSON.stringify({rects,ui,hero:await page.locator('#hero').evaluate(e=>({inline:e.style.opacity,computed:getComputedStyle(e).opacity}))}));
 for(const r of rects){assert.ok(r.x>ui.x+ui.width-6,r.id+' clears the left controls');assert.ok(r.x+r.w<1602,r.id+' fits the viewport');assert.ok(r.y>0&&r.y+r.h<850,r.id+' stays above the timeline');assert.ok(!r.transform.includes('matrix3d'),'Restored cards stay screen-aligned');}
 for(let i=1;i<rects.length;i++)assert.ok(rects[i].x>rects[i-1].x+rects[i-1].w,'Territory cards do not overlap');
 const portraits=await page.locator('.flank-portrait img').evaluateAll(es=>es.map(e=>({src:e.currentSrc||e.src,loaded:e.complete&&e.naturalWidth>0})));
 assert.ok(portraits.every(p=>p.loaded),'All three local archival portraits load');
 await page.screenshot({path:`qa-flanks/${prefix}-cards-evening.png`,timeout:90000});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});await step();await page.screenshot({path:`qa-flanks/${prefix}-cards-day.png`,timeout:90000});await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});
 // The wider inspection view includes the complete perimeter and the empty
 // southern area. Hide only the screen cards while recording these views.
 await page.evaluate(()=>window.__BAIKONUR_QA.inspectFlankBoundaries());await step();
 const contourCamera=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
 assert.ok([...contourCamera.position,...contourCamera.target].every(Number.isFinite));
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOuterBoundaries),1);
 const contourStyle=await page.addStyleTag({content:'.flank-label,.flank-portrait-credits{visibility:hidden!important}'});
 try{
  await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));await step();
  await page.screenshot({path:`qa-flanks/${prefix}-boundaries-day.png`,timeout:90000});
  await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await step();
  await page.screenshot({path:`qa-flanks/${prefix}-boundaries-evening.png`,timeout:90000});
 }finally{await contourStyle.evaluate(el=>el.remove());}
 await page.evaluate(()=>window.__BAIKONUR_QA.showFlanks());await step();

 // Render a raised surface across multiple district boundaries. Flat fills
 // and neon sit below this opaque surface, so pixel changes can only come
 // from the actual relief overlay shader. This proves clipping on the GPU.
 const fixtureSites=await page.evaluate(()=>({saturn:window.__BAIKONUR_QA.siteState('pad-23').map,city:window.__BAIKONUR_QA.siteState('city').map}));
 const reliefPixels=await page.evaluate(async fixtureSites=>{
  const THREE=await import('three');
  const {buildFlankDistricts}=await import('./src/flank-districts.js?v=20261028-museum4-osm-live-v2');
  const {FLANK_OUTLINE,FLANK_BORDERS,FLANK_POLYGONS,containsFlankPoint}=await import('./src/flank-boundaries.js?v=20261028-museum4-osm-live-v2');
  const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
  const scene=new THREE.Scene(),districts=buildFlankDistricts(scene,point,1300,1045);
  const extent=[...FLANK_OUTLINE,fixtureSites.saturn,fixtureSites.city],minX=Math.min(...extent.map(p=>p[0]))-100,maxX=Math.max(...extent.map(p=>p[0]))+100,minY=Math.min(...extent.map(p=>p[1]))-100,maxY=Math.max(...extent.map(p=>p[1]))+100;
  const base=new THREE.Mesh(new THREE.PlaneGeometry((maxX-minX)*3.4,(maxY-minY)*3.4),new THREE.MeshBasicMaterial({color:0x444444}));
  base.rotation.x=-Math.PI/2;base.position.copy(point((minX+maxX)/2,(minY+maxY)/2,10));scene.add(base);scene.updateMatrixWorld(true);
  districts.addTerrainSurface(base,'center');scene.updateMatrixWorld(true);
  const renderer=new THREE.WebGLRenderer({antialias:false,logarithmicDepthBuffer:true});renderer.setSize(8,8);
  const target=new THREE.WebGLRenderTarget(8,8),camera=new THREE.OrthographicCamera(-.3,.3,.3,-.3,.1,200);
  camera.up.set(0,0,-1);const data=new Uint8Array(8*8*4);
  function interior(key,index){
   const ring=FLANK_POLYGONS[index],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);let best=null,clearance=-1;
   for(let ix=1;ix<32;ix++)for(let iy=1;iy<32;iy++){
    const p=[x0+(x1-x0)*ix/32,y0+(y1-y0)*iy/32];if(!containsFlankPoint(key,p))continue;
    const gap=Math.min(...ring.map((a,i)=>{const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}));
    if(gap>clearance){clearance=gap;best=p;}
   }
   if(!best||clearance<1)throw new Error('No interior probe for '+key);return best;
  }
  const probes=[{name:'saturn',point:fixtureSites.saturn,inside:true},{name:'southern-city',point:fixtureSites.city,inside:false},
   {name:'left-flank',point:interior('left',0),inside:false},{name:'right-flank',point:interior('right',2),inside:false}];
  function edgeProbes(name,a,b){
   const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   return [-1,1].map(side=>{
    const p=[(a[0]+b[0])/2-dy/length*.75*side,(a[1]+b[1])/2+dx/length*.75*side];
    return {name:name+'-'+side,point:p,inside:containsFlankPoint('center',p)};
   });
  }
  const center=FLANK_POLYGONS[1];let outerProbes;
  for(let i=0;i<center.length;i++){
   const pair=edgeProbes('outer-edge',center[i],center[(i+1)%center.length]);
   if(pair.filter(p=>p.inside).length===1&&pair.some(p=>!['left','center','right'].some(key=>containsFlankPoint(key,p.point)))){outerProbes=pair;break;}
  }
  if(!outerProbes)throw new Error('No exterior central-flank edge for GPU clipping test');
  probes.push(...outerProbes,...edgeProbes('internal-edge',FLANK_BORDERS[0][0],FLANK_BORDERS[0][1]));
  function sample(p,alpha){
   districts.setOpacity(alpha);const center=point(...p,10);camera.position.copy(center).add(new THREE.Vector3(0,100,0));camera.lookAt(center);camera.updateMatrixWorld(true);
   renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,8,8,data);
   return Array.from(data.slice((4*8+4)*4,(4*8+4)*4+3));
  }
  try{return probes.map(probe=>({...probe,off:sample(probe.point,0),on:sample(probe.point,1)}));}
  finally{
   target.dispose();renderer.dispose();
   scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});
  }
 },fixtureSites);
 assert.equal(reliefPixels.filter(p=>p.name.startsWith('outer-edge')&&p.inside).length,1);
 assert.equal(reliefPixels.filter(p=>p.name.startsWith('internal-edge')&&p.inside).length,1);
 for(const probe of reliefPixels){
  const difference=probe.on.map((v,i)=>v-probe.off[i]),change=Math.max(...difference.map(Math.abs));
  if(probe.inside){assert.ok(change>5,'The central relief is visibly colored: '+JSON.stringify(probe));assert.ok(difference[1]>difference[0]&&difference[2]>difference[0],'Relief retains the central cyan color');}
  else assert.ok(change<=1,'The relief shader leaves other districts and the south unpainted: '+JSON.stringify(probe));
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));await step();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleZones),0);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOuterBoundaries),0);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleReliefSurfaces),0);assert.equal(await page.locator('.flank-label:visible').count(),0);await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(true));await step();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOuterBoundaries),1);
 await page.locator('.flank-label[data-district="center"]').click();await step();await page.waitForTimeout(350);
 const close=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.ok(close.flankDistricts.alpha<.05);assert.ok(await page.locator('.site-label:visible').count()>0);
 await page.evaluate(()=>window.__BAIKONUR_QA.showFlanks());await step();await page.locator('.flank-label[data-district="right"]').focus();await page.keyboard.press('Enter');await step();await page.waitForTimeout(350);assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.alpha))<.05);
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(1450));assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleBoundaries),0);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOuterBoundaries),0);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOverviewBoundary),1);
 assert.equal(await page.locator('.flank-label:visible,.site-label:visible,.detail-card:visible').count(),0);
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOverviewBoundary),0);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOverviewFill),0);await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(true));await step();
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(460));assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleBoundaries),0);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOuterBoundaries),0);
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(180));assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleZones),0);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOuterBoundaries),0);
 // The user's hotel correction must reach the actual visible card and logo.
 const hotel=await page.evaluate(async()=>{
  const catalog=await (await fetch('./data/catalog.json',{cache:'no-store'})).json();
  const index=catalog.sites.filter(r=>!r.aliasOf&&r.render!==false).findIndex(site=>site.id==='pad-75');
  if(index<0)throw new Error('Missing Seven Winds hotel record');
  window.__BAIKONUR_QA.focusSite(index);return catalog.sites.filter(r=>!r.aliasOf&&r.render!==false)[index];
 });await step();
 assert.equal(hotel.organisation.org,'ЦЭНКИ');assert.deepEqual([hotel.x,hotel.y],[639,551]);
 assert.ok((await page.locator('#title').textContent()).includes('7 ветров'));
 assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),'tsenki');
 assert.equal(await page.locator('#infoOrgRole').textContent(),'Владелец — ЦЭНКИ');
 assert.ok((await page.locator('#infoPurpose').textContent()).includes('принадлежит ЦЭНКИ'));
 await page.waitForFunction(()=>{const image=document.querySelector('#infoOrg img');return image?.complete&&image.naturalWidth>0;});
 await page.screenshot({path:`qa-flanks/${prefix}-seven-winds.png`,timeout:90000});
 await page.setViewportSize({width:390,height:844});await step();
 await page.evaluate(()=>window.__BAIKONUR_QA.showFlanks());await step();await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankCardLayout),'vertical');
 const mobile=await page.evaluate(()=>({
  cards:[...document.querySelectorAll('.flank-label')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}),
  uiBottom:document.getElementById('ui').getBoundingClientRect().bottom,
  dockTop:document.getElementById('timeDock').getBoundingClientRect().top
 }));
 for(const r of mobile.cards){assert.ok(r.x>=9&&r.x+r.w<=390,'Mobile card fits the viewport');assert.ok(r.y>=mobile.uiBottom+10&&r.y+r.h<mobile.dockTop,'Mobile card stays below the compact toolbar and above the timeline');}
 for(let i=1;i<mobile.cards.length;i++)assert.ok(mobile.cards[i].y>=mobile.cards[i-1].y+mobile.cards[i-1].h,'Stacked mobile cards do not overlap');
 await page.screenshot({path:`qa-flanks/${prefix}-cards-mobile.png`,timeout:90000});
 assert.deepEqual(errors,[]);assert.deepEqual(shaders,[]);
 await writeFile(`qa-flanks/${prefix}-result.json`,JSON.stringify({passed:true,rects,mobile,portraits,contourCamera,reliefPixels,offline:!!process.env.BAIKONUR_OFFLINE,overview:overview.flankDistricts,state:state.flankDistricts,errors,shaders},null,2));console.log('FLANKS_BROWSER_PASS',JSON.stringify({rects,mobile,portraits,reliefPixels}));
}catch(e){await page.screenshot({path:`qa-flanks/${prefix}-failure.png`,timeout:60000}).catch(()=>{});console.error(JSON.stringify({message:e.message,errors,shaders}));throw e;}finally{await browser.close();}
