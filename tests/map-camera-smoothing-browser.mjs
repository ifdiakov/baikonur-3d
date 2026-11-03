import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({
 headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']
});
const page=await browser.newPage({viewport:{width:1520,height:920},deviceScaleFactor:1});
page.setDefaultTimeout(90000);
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);
 let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__SMOOTH_MAP_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=async(delay=45)=>{
 await page.waitForTimeout(delay);
 return page.evaluate(()=>{window.__SMOOTH_MAP_FRAME();return window.__BAIKONUR_QA.mapCameraSmoothing.stats();});
};
const state=()=>page.evaluate(()=>{
 const q=window.__BAIKONUR_QA,c=q.cameraState();
 return {eye:c.position,target:c.target,distance:Math.hypot(...c.position.map((v,i)=>v-c.target[i])),
   easing:q.mapCameraSmoothing.stats(),selection:q.selectionState().currentObject};
});
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
async function clearCanvasPoint(){
 return page.evaluate(()=>{
  const canvas=document.querySelector('#view canvas');
  for(const [x,y]of [[770,510],[910,470],[960,610],[690,600],[1080,640]]){
   if(document.elementFromPoint(x,y)===canvas&&document.elementFromPoint(x+110,y+35)===canvas)return{x,y};
  }
  throw new Error('No visible blank map canvas point for a genuine pointer gesture');
 });
}
try{
 const url=new URL(base);url.searchParams.set('qa','smooth-camera-v1');
 for(const name of ['view','detail','editor','site'])url.searchParams.delete(name);
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.mapCameraSmoothing?.stats()
   && document.getElementById('museumLoading')?.dataset.state==='ready',null,{timeout:180000});
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(350,'pad-31'));
 await step();
 const pos=await clearCanvasPoint(),before=await state();
 assert.equal(before.easing.active,false);
 assert.equal(before.easing.dampingFactor>0,true);

 // Three r160's native mouse wheel jumps immediately. The replacement stores
 // a destination radius but leaves this frame at exactly the old distance.
 await page.mouse.move(pos.x,pos.y);
 await page.mouse.wheel(0,-325);
 const queued=await state();
 assert(queued.easing.wheelEvents>before.easing.wheelEvents,'Canvas wheel must be captured');
 assert(queued.easing.goalDistance<before.distance,'Wheel up requests a nearer shot');
 assert(Math.abs(queued.distance-before.distance)<1e-5,
  'Zoom may not jump to the requested radius before the first render frame');

 // Eased zoom must progress across multiple frames, not jump to the end.
 await step(55);
 const first=await state();
 assert(first.distance<before.distance-.05,'First update must begin smoothly zooming in');
 assert(first.distance>queued.easing.goalDistance+.1,'First update must not finish all zoom motion');
 await step(55);const second=await state();
 assert(second.distance<first.distance,'Second frame continues the smooth zoom');
 for(let i=0;i<17;i++)await step(45);
 const settled=await state();
 assert(Math.abs(settled.distance-queued.easing.goalDistance)<Math.abs(first.distance-queued.easing.goalDistance),
  'The orbit radius converges to a stable zoom goal');
 assert.equal(settled.selection,before.selection,'Zooming cannot select another site');

 // The opposite wheel gesture must zoom OUT with the same low-pass animation.
 await page.mouse.wheel(0,320);
 const outQueued=await state();
 assert(outQueued.easing.goalDistance>settled.distance);
 assert(Math.abs(outQueued.distance-settled.distance)<1e-5,'Zoom out also queues without snapping');
 await step(70);
 const afterOut=await state();
 assert(afterOut.distance>outQueued.distance+.05,'Zoom out animates outward');

 // Native OrbitControls has damping on pointer pan. Test its inertia after a
 // genuine drag initiated on the canvas; no artificial tween scripts.
 const start=await clearCanvasPoint();
 for(let i=0;i<15;i++)await step(35); // finish zoom before measuring pan
 const panBefore=await state();
 await page.mouse.move(start.x,start.y);
 await page.mouse.down({button:'left'});
 await page.mouse.move(start.x+95,start.y+35,{steps:8});
 await page.mouse.up({button:'left'});
 const released=await state();
 assert(dist(released.target,panBefore.target)>1,'Left drag pans the map');
 await step(55);const panned=await state();
 assert(dist(panned.target,released.target)>.01,
  'Panning decelerates smoothly instead of freezing at pointer release');

 // Arrow/WASD navigation accelerates and brakes without teleporting.
 await page.keyboard.down('w');
 await step(75);
 const keyDown=await state();
 assert(dist(keyDown.target,panned.target)>.05,'Keyboard direction moves the camera');
 await page.keyboard.up('w');
 await step(50);const keyReleased=await state();
 assert(dist(keyReleased.target,keyDown.target)>.01,'Keyboard motion eases off on release');
 await step(220);
 const slowed=await state();
 assert(slowed.easing.wheelEvents>=2,'Both zoom directions were exercised');
 assert.equal(errors.length,0,'No browser exceptions: '+JSON.stringify(errors));
 console.log('SMOOTH_MAP_CAMERA_BROWSER_PASS '+JSON.stringify({
   startRadius:before.distance,goalRadius:queued.easing.goalDistance,
   firstRadius:first.distance,secondRadius:second.distance,
   settledRadius:settled.distance,
   outwardRadius:afterOut.distance,
   panAfterRelease:dist(panned.target,released.target),
   easing:slowed.easing
 }));
}finally{
 await browser.close();
}
