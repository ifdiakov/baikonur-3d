import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-owner19/local';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1400,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(180000);
const report={base,environment:'Chromium/SwiftShader; controlled animation frames for geometry inspection, not physical-device FPS',checks:[],passed:false};
await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let fn;window.requestAnimationFrame=cb=>cb.name==='animate'?(fn=cb,0):raf(cb);window.__FRAME=()=>fn?.();});
await page.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.continue();const response=await route.fetch();let body=await response.text();body=body.replace('if(mik112Exhibit)detail.connectMik112','window.__DETAIL=detail;if(mik112Exhibit)detail.connectMik112').replace('window.__BAIKONUR_QA={','window.__D={scene,camera,renderer,ctl,objects,layers,geography,transport,roadLOD,roadEditor,steppeSurface,displayRoadGrade,requestTransportDetail,portalArchive,museumTerrainHeightAt,siteRecords};window.__BAIKONUR_QA={');await route.fulfill({response,body});});
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  report.hashes={};const hash=b=>createHash('sha256').update(b).digest('hex');
  for(const f of ['index.html','museum.html','workshop.html','src/owner-rail-curves.js','src/owner-ad-refinements.js','src/road-editor.js','data/owner19-release.json','data/osm/transport-geometry-bake-v1.json.gz','data/osm/road-lod-authoritative-v1.json.gz']){const expected=hash(await readFile(f));let actual;for(let i=0;i<24;i++){const r=await fetch(new URL(f+'?accept='+Date.now(),base));if(r.ok){actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;}await new Promise(r=>setTimeout(r,4000));}assert.equal(actual,expected,'Published file '+f);report.hashes[f]=actual;}
 }
 await page.goto(new URL('museum.html?tour=0',base).href,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__D,null,{timeout:240000});
 report.loading=await page.evaluate(()=>{const m=__MUSEUM_STARTUP.stats().marks,t=n=>m.find(x=>x.name===n)?.at;return {firstFrameMs:Math.round(t('first-frame')-t('startup')),interactiveMs:Math.round(t('interactive')-t('startup'))};});
 await page.evaluate(()=>{__D.requestTransportDetail();__FRAME();});await page.waitForFunction(()=>!!window.__DETAIL,null,{timeout:240000});
 await page.evaluate(()=>__FRAME());await page.screenshot({path:out+'/full-museum-evening.png'});
 report.geometry=await page.evaluate(async()=>{
  const T=await import('three'),d=__D,transport=__DETAIL,roads=transport.editableRoadPaths(),rails=transport.terrainPaths().rails,checks=[];
  d.roadLOD.update(100,[...d.layers.roads.children,...d.layers.rails.children].filter(o=>o.name.startsWith('OpenStreetMap ·')));
  const ok=(n,value,detail)=>{checks.push({item:n,passed:!!value,detail});};
  const w=(x,y)=>new T.Vector3((x-650)*3.4,.72,(y-522.5)*3.4),v=p=>p.isVector3?p:new T.Vector3(...p),flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  function nearest(ps,p){let best={distance:Infinity};for(let i=1;i<ps.length;i++){const a=v(ps[i-1]),b=v(ps[i]),dx=b.x-a.x,dz=b.z-a.z,t=T.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1),q=a.clone().lerp(b,t),dist=flat(q,p);if(dist<best.distance)best={distance:dist,point:q,tangent:b.clone().sub(a).setY(0).normalize(),segment:i};}return best;}
  const r3=d.roadEditor.path('road-3'),r8=d.roadEditor.path('road-8'),primary=roads.find(r=>r.id==='osm-road-173082916'),host589=roads.find(r=>r.id==='osm-road-183464610');
  for(const [n,r,host,which]of [[1,r3,primary,0],[15,r8,host589,-1]]){const p=v(which?r.points.at(-1):r.points[0]),hit=nearest(host.points,p),a=which?v(r.points.at(-2)):p,b=which?p:v(r.points[1]),dot=Math.abs(b.clone().sub(a).setY(0).normalize().dot(hit.tangent));ok(n,hit.distance<.03&&Math.abs(hit.point.y-p.y)<.03&&dot<.12,{gap:hit.distance,heightGap:Math.abs(hit.point.y-p.y),orthogonalityError:dot});}
  const turn=transport.roadPaths().find(r=>r.id==='gagarin-site2-turnoff'),colors=d.roadEditor.stats().sourceMaterialColors;
  ok(2,turn?.surface==='asphalt'&&colors.asphalt==='#555751',{reference:'АД-05DPJT',source:'gagarin-site2-turnoff',material:colors.asphalt});
  const branch=roads.find(r=>r.id==='osm-road-54569454'),hit=nearest(r3.points,branch.points[0]);ok(3,hit.distance<.05&&Math.abs(hit.point.y-branch.points[0].y)<.03,{gap:hit.distance,heightGap:Math.abs(hit.point.y-branch.points[0].y)});
  function turnAngle(points,target,radius){let max=0;for(let i=1;i<points.length-1;i++){const a=v(points[i-1]),b=v(points[i]),c=v(points[i+1]);if(flat(b,target)>radius)continue;const u=b.clone().sub(a).setY(0),q=c.clone().sub(b).setY(0);if(u.length()<.01||q.length()<.01)continue;max=Math.max(max,u.angleTo(q));}return max;}
  const bend=turnAngle(r3.points,w(620,402.8),12);ok(4,bend<.5&&!d.roadEditor.snapshot().added.some(r=>r.id==='road-4'),{maxLocalTurnRadians:bend,singleRoad:true});
  const mainRail=rails.find(r=>r.sourceWayId==='37547653'&&r.points.some(p=>flat(p,w(605.2,420.9))<3));
  const gap5=Math.max(nearest(mainRail.points,w(605.2,420.9)).distance,nearest(mainRail.points,w(604.6,425.7)).distance),angle5=turnAngle(mainRail.points,w(605,423),13);ok(5,gap5<.6&&angle5<.5,{checkpointGap:gap5,maxTurnRadians:angle5});
  d.scene.updateMatrixWorld(true);const meshes=[];d.scene.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(!a.visible)return;meshes.push(o);});
  const hits=(p,only=meshes)=>new T.Raycaster(new T.Vector3(p.x,200,p.z),new T.Vector3(0,-1,0)).intersectObjects(only,false);
  const asphalt=h=>/дорожное полотно|полотно редактора · asphalt|асфальт трассы/.test(h.object.name),shoulder=h=>/обочины|полотно редактора · shoulder/.test(h.object.name);
  for(const [n,x,y]of [[6,585,402.6],[7,580.2,404]]){const p=w(x,y),host=roads.filter(r=>r.width>=3).map(r=>({r,...nearest(r.points,p)})).sort((a,b)=>a.distance-b.distance)[0],normal=new T.Vector3(-host.tangent.z,0,host.tangent.x),found=[];for(const side of [-1,1]){const q=host.point.clone().addScaledVector(normal,side*(host.r.width/2+.15));found.push(hits(q).some(shoulder));}ok(n,found.every(Boolean),{road:host.r.id,shoulders:found});}
  const separate=roads.find(r=>r.id==='osm-road-172704701');let clearance=Infinity;for(const p of separate.points.filter(p=>flat(p,w(559.5,406.6))<13.6))for(const r of rails){if(r.abandoned)continue;const gap=nearest(r.points,p).distance-separate.width/2-r.width/2;clearance=Math.min(clearance,gap);}ok(8,clearance>2.4,{minimumEdgeGap:clearance,required:2.4});
  ok(9,!hits(w(558.4,405.2)).some(asphalt),{noAsphaltAtDeletedDeadEnd:true});
  const town=d.objects.find(o=>o.record.id==='pad-113').g;town.updateWorldMatrix(true,true);const {SITE113_PATHS,site113Pixel}=await import('./src/site113-layout.js');let roadHits=0;for(const line of SITE113_PATHS){const [x,z]=site113Pixel(line[Math.floor(line.length/2)]),p=new T.Vector3(x,0,z).applyMatrix4(town.matrixWorld);if(hits(p).some(h=>h.object.material?.color?.getHexString?.()==='555751'&&h.point.y> -2.69))roadHits++;}ok(10,roadHits===SITE113_PATHS.length,{visibleCourtConnections:roadHits,expected:SITE113_PATHS.length,ground:d.displayRoadGrade.version});
  const rail11=rails.find(r=>r.sourceWayId==='37546649'&&r.points.some(p=>flat(p,w(538.2,434.7))<3)),gap11=nearest(rail11.points,w(538.2,434.7)).distance,angle11=turnAngle(rail11.points,w(538.2,434.7),9);ok(11,gap11<.6&&angle11<.5,{gap:gap11,maxTurnRadians:angle11});
  let overlap=0;const roadMeshes=meshes.filter(o=>/дорожное полотно|грунтовые проезды/.test(o.name));for(const [x,y]of [[538.7,440.9],[543.4,446.2]])for(let a=-1;a<=1;a+=.5)for(let b=-1;b<=1;b+=.5){const h=hits(w(x+a,y+b),roadMeshes);if(h.some(asphalt)&&h.some(q=>q.object.name==='OSM · грунтовые проезды'))overlap++;}ok(12,overlap===0,{overlappingAsphaltGravelSamples:overlap});
  const removed=[[568.8,420],[560.8,384.5]].map(([x,y])=>({x,y,asphalt:hits(w(x,y)).filter(asphalt).length}));ok(13,removed.every(r=>!r.asphalt),removed);
  const seam=rails.find(r=>r.sourceWayId==='owner-rail-continuity-579-587');let seamGap=Infinity;if(seam){seamGap=0;for(const p of [seam.points[0],seam.points.at(-1)]){let dist=Infinity;for(const r of rails.filter(r=>r.sourceWayId==='37546649'))for(const q of [r.points[0],r.points.at(-1)])dist=Math.min(dist,p.distanceTo(q));seamGap=Math.max(seamGap,dist);}}ok(14,seamGap<.001,{threeDimensionalEndpointGap:seamGap});
  const under=hits(w(589,342.7)).filter(h=>/Архив · (wall|roof)/.test(h.object.name));ok(16,under.length===0,{buildingHits:under.length});
  const ukss=transport.roadPaths().find(r=>r.id==='museum-yubileiny-250a-ukss'),through=transport.stats().facilityPorts.find(r=>r.id==='pad-250a-to-pad-250');ok(17,ukss.width===2.5&&through.roadGap<.001&&through.maxGrade<.085,{width:ukss.width,joinGap:through.roadGap,maxSlope:through.maxGrade});
  const {MUSEUM_DISPLAY_OFFSETS}=await import('./src/osm-geography.js');
  const sites=d.siteRecords.filter(s=>['pad-202','pad-204'].includes(s.id)).map(s=>({id:s.id,x:s.x,y:s.y}));
  ok(18,JSON.stringify(MUSEUM_DISPLAY_OFFSETS['pad-204'])==='[-10,0]'&&sites.some(s=>s.id==='pad-204'&&Number.isFinite(s.x)),{anchor:sites.find(s=>s.id==='pad-204'),expectedOffset:[-10,0]});ok(19,JSON.stringify(MUSEUM_DISPLAY_OFFSETS['pad-202'])==='[0,-5]'&&sites.some(s=>s.id==='pad-202'&&Number.isFinite(s.y)),{anchor:sites.find(s=>s.id==='pad-202'),expectedOffset:[0,-5]});
  return {checks:checks.sort((a,b)=>a.item-b.item),colors,bake:__BAIKONUR_QA.stats().transportBake};
 });
 report.checks=report.geometry.checks;
 const areas=[['t605',605.7,424.2,48],['t612',612.5,414.1,48],['bend620',620,402.8,48],['rail605',605,423,65],['shoulder585',585,402.6,46],['shoulder580',580.2,404,46],['road-rail559',559.5,406.6,65],['site113',568.72,407.38,70],['rail538',538.2,434.7,60],['ramp538',538.7,440.9,48],['ramp543',543.4,446.2,48],['removed568',568.8,420,30],['removed560',560.8,384.5,30],['rail-seam',583,385,95],['t589',589.8,377.1,45],['building589',589,342.7,48],['ukss',589,259.8,80]];
 await page.addStyleTag({content:'body>*:not(#view){visibility:hidden!important}#view,#view canvas{visibility:visible!important}'});
 await page.evaluate(()=>{__BAIKONUR_QA.evening.setEvening(false);__BAIKONUR_QA.setLabelsVisible(false);__D.ctl.enableDamping=false;});
 for(const [name,x,y,h]of areas){await page.evaluate(({x,y,h})=>{const d=__D;d.ctl.target.set((x-650)*3.4,.72,(y-522.5)*3.4);d.camera.position.set(d.ctl.target.x,h,d.ctl.target.z+.001);d.ctl.update();d.roadLOD.update(100,[...d.layers.roads.children,...d.layers.rails.children].filter(o=>o.name.startsWith('OpenStreetMap ·')));d.renderer.render(d.scene,d.camera);},{x,y,h});await page.screenshot({path:out+'/'+name+'.png'});}
 assert.deepEqual(errors,[]);assert.equal(report.checks.length,19);assert(report.checks.every(c=>c.passed),'Owner checks failed: '+JSON.stringify(report.checks.filter(c=>!c.passed)));report.passed=true;
}catch(e){report.error=e.stack;await page.screenshot({path:out+'/failure.png',timeout:60000}).catch(()=>{});throw e;}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('OWNER19_BROWSER_PASS',JSON.stringify({checks:report.checks.length,loading:report.loading}));
