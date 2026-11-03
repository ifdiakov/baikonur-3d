import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:940},deviceScaleFactor:1});
page.setDefaultTimeout(90000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const stats=()=>page.evaluate(()=>{
 const q=window.__BAIKONUR_QA,c=q.cameraState(),s=q.labelMapGestures.stats();
 return {position:c.position,target:c.target,gesture:s,selection:q.selectionState().currentObject};
});
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
async function cardPoint(selector){
 return page.evaluate(selector=>{
  const cards=Array.from(document.querySelectorAll('#labelLayer '+selector));
  for(const card of cards){
   const rect=card.getBoundingClientRect(),css=getComputedStyle(card);
   if(css.display==='none'||css.pointerEvents==='none'||rect.width<35||rect.height<12)continue;
   const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
   if(x<350||x>innerWidth-350||y<55||y>innerHeight-140)continue;
   const top=document.elementFromPoint(x,y);
   if(card.contains(top))return {x,y,index:card.dataset.siteIndex??null,klass:card.className};
  }
  return null;
 },selector);
}
try{
 const u=new URL(base);u.searchParams.delete('view');u.searchParams.delete('site');
 u.searchParams.set('qa','label-map-gestures');
 await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.labelMapGestures?.stats()
  && document.querySelector('#museumLoading')?.dataset.state==='ready',null,{timeout:180000});
 let p=null;
 for(const [height,site] of [[330,'pad-31'],[340,'pad-1'],[420,'pad-23'],[280,'pad-110']]){
  await page.evaluate(([h,id])=>window.__BAIKONUR_QA.setAltitude(h,id),[height,site]);
  await page.waitForTimeout(260);
  p=await cardPoint('.site-label');
  if(p)break;
 }
 assert(p,'A visible clickable site label is needed for real mouse-gesture testing');

 // Wheel zoom is delivered to the actual Three.js canvas, even though the
 // browser's real hit-tested target is an interactive floating label.
 const before=await stats();
 await page.mouse.move(p.x,p.y);
 await page.mouse.wheel(0,-385);
 await page.waitForTimeout(320);
 const zoomed=await stats();
 assert(zoomed.gesture.wheels>before.gesture.wheels,'Wheel over a label must be forwarded');
 const deltaZoom=Math.abs(distance(before.position,before.target)-distance(zoomed.position,zoomed.target));
 assert(deltaZoom>.05,'Wheel zoom must move the real camera: '+deltaZoom);
 assert.equal(zoomed.selection,before.selection,'Wheel cannot select an object');

 // A real drag beginning ON a clickable button should pan the map, and the
 // subsequent click produced by the browser must not activate the label.
 p=await cardPoint('.site-label');
 assert(p,'The label remains interactive after zoom');
 const panBefore=await stats();
 await page.mouse.move(p.x,p.y);
 await page.mouse.down({button:'left'});
 await page.mouse.move(p.x+104,p.y+36,{steps:10});
 await page.mouse.up({button:'left'});
 await page.waitForTimeout(320);
 const panned=await stats();
 assert(panned.gesture.drags>panBefore.gesture.drags,'Label drag must route to OrbitControls');
 assert(distance(panned.target,panBefore.target)>.02,
  'Left-drag over label must translate the museum map');
 assert.equal(panned.selection,panBefore.selection,'Dragging a label cannot select a site');

 // Ordinary click, including clicks on the nested site button, still opens
 // its object. We deliberately start a fresh pointer transaction.
 p=await cardPoint('.site-label');
 assert(p,'A visible site label remains clickable after camera pan');
 await page.mouse.click(p.x,p.y);
 await page.waitForTimeout(250);
 const clicked=await stats();
 assert(clicked.gesture.clicksPreserved>panned.gesture.clicksPreserved,
  'A normal click must remain available after dragging');
 assert.equal(clicked.selection,Number(p.index),'A click still opens the selected site');

 // Other floating cards and flank labels are included in the bridge.
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(740,'pad-23'));
 await page.waitForTimeout(270);
 const flank=await cardPoint('.flank-label');
 if(flank){
  const turnBefore=await stats();
  await page.mouse.move(flank.x,flank.y);
  await page.mouse.down({button:'right'});
  await page.mouse.move(flank.x+83,flank.y+26,{steps:8});
  await page.mouse.up({button:'right'});
  await page.waitForTimeout(260);
  const turned=await stats();
  assert(turned.gesture.drags>turnBefore.gesture.drags);
  assert(turned.gesture.rotations>turnBefore.gesture.rotations);
  assert(distance(turned.position,turnBefore.position)>.02,
   'Right-drag over flank title must rotate the camera');
 }
 assert.equal(errors.length,0,'No browser errors: '+JSON.stringify(errors));
 console.log('LABEL_MAP_GESTURES_BROWSER_PASS '+JSON.stringify({
  wheelZoomDelta:deltaZoom,
  panningDistance:distance(panned.target,panBefore.target),
  clickIndex:Number(p.index),rightOrbitTested:!!flank,gesture:await stats()
 }));
}finally{await browser.close();}
