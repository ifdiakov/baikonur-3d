import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-camera-navigation';
const revision=process.env.BAIKONUR_EXPECTED_REVISION||'20261102-energia-polyus-v2';
const origin=new URL(base).origin,groundY=-2.755;
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],failedRequests:[],views:[],cycles:[],inputs:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
page.on('pageerror',error=>evidence.errors.push(error.message));
page.on('console',message=>{
 if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(message.text()))evidence.shaderErrors.push(message.text());
});
page.on('response',response=>{
 if(response.status()>=400&&new URL(response.url()).origin===origin)evidence.failedResources.push({url:response.url(),status:response.status()});
});
page.on('requestfailed',request=>{
 if(new URL(request.url()).origin===origin)evidence.failedRequests.push({url:request.url(),error:request.failure()?.errorText});
});
// Every deliberate frame is the production render loop. Input is delivered by
// Playwright/CDP, never by calling moveCamera or changing the controls object.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__CAMERA_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
 window.__CAMERA_INPUT=[];
 for(const type of ['keydown','keyup','pointerdown','pointerup','wheel'])document.addEventListener(type,event=>{
  window.__CAMERA_INPUT.push({type,trusted:event.isTrusted,key:event.key,pointerType:event.pointerType,button:event.button,target:event.target.id||event.target.tagName});
 },{capture:true,passive:true});
});
const step=()=>page.evaluate(()=>window.__CAMERA_FRAME());
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const norm=a=>Math.hypot(...a);
const cameraDistance=s=>distance(s.camera.position,s.camera.target);
const cameraOffset=s=>subtract(s.camera.position,s.camera.target);
const near=(a,b,tolerance,message)=>assert(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);

async function state(){
 return page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,s=q.stats(),arrival=q.arrival.stats();
  return {revision:s.museumRevision,camera:q.cameraState(),render:s.render,shadersValid:s.shadersValid,
   following:arrival.following,aircraftPosition:arrival.position,aircraftTime:arrival.totalElapsed,lastRelease:arrival.lastRelease,
   trainFollowing:q.traffic.stats().train.following,selection:q.selectionState().currentObject,
   activeElement:document.activeElement?.id,width:innerWidth,height:innerHeight,scrollY};
 });
}
function checkFrame(s){
 assert.equal(s.revision,revision);assert.equal(s.shadersValid,true);
 assert(s.render.drawCalls>0&&s.render.triangles>0,'Navigation is exercised in an actual rendered museum');
 assert([...s.camera.position,...s.camera.target].every(Number.isFinite));
}
function checkFree(s,expectedControls){
 assert.equal(s.following,false);assert.equal(s.trainFollowing,false);
 near(s.camera.target[1],groundY,1e-6,'Free navigation targets the museum ground');
 const c=s.camera.controls,b=s.camera.bounds,pb=s.camera.positionBounds,hb=s.camera.heightBounds;
 assert(c,'The QA hook reports the actual OrbitControls configuration');
 assert.equal(c.enablePan,true);assert.deepEqual(c.mouseButtons,{LEFT:2,MIDDLE:1,RIGHT:0});
 assert.deepEqual(c.touches,{ONE:1,TWO:3});
 if(expectedControls)assert.deepEqual(c,expectedControls,'A follow/release cycle restores every exposed control setting');
 assert(s.camera.target[0]>=b.minX-1e-6&&s.camera.target[0]<=b.maxX+1e-6);
 assert(s.camera.target[2]>=b.minZ-1e-6&&s.camera.target[2]<=b.maxZ+1e-6);
 assert(pb&&hb,'The QA hook reports the actual eye and height limits');
 assert(s.camera.position[0]>=pb.minX-1e-6&&s.camera.position[0]<=pb.maxX+1e-6,'The camera eye stays inside the lateral X limits');
 assert(s.camera.position[2]>=pb.minZ-1e-6&&s.camera.position[2]<=pb.maxZ+1e-6,'The camera eye stays inside the lateral Z limits');
 assert(s.camera.position[1]>=hb.min-1e-6&&s.camera.position[1]<=hb.max+1e-6,'The rendered camera stays inside both height limits');
 const offset=cameraOffset(s),elevation=Math.atan2(offset[1],Math.hypot(offset[0],offset[2]));
 assert(elevation>=Math.PI/6-1e-5,'Released navigation retains the minimum 30 degree elevation');
 assert(cameraDistance(s)>=24-1e-6,'The free view has a useful museum-scale orbit');
}
async function shot(name){
 evidence.lastView=name;await step();const s=await state();checkFrame(s);
 await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 evidence.views.push({name,...s});console.log('CAMERA_NAVIGATION_VIEW',name);return s;
}
async function followAtAltitude(){
 assert.equal((await state()).following,false);
 if(!await page.locator('#arrivalFollow').isVisible()){
  const toggle=page.locator('#mobileMenuToggle');
  assert.equal(await toggle.isVisible(),true,'The collapsed phone sidebar retains a real menu button');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.click();assert.equal(await page.locator('#arrivalFollow').isVisible(),true);
 }
 await page.locator('#arrivalFollow').click();
 // Second arrival at the complex centre: high enough to reproduce the tiny
 // airborne-orbit bug, and far from the museum boundary that limits panning.
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(444));
 const s=await state();assert.equal(s.following,true);assert(s.aircraftPosition[1]>300);
 assert.equal(s.camera.controls.enablePan,false);assert.equal(s.activeElement,'arrivalFollow');
 assert(cameraDistance(s)<60,'Aircraft following has its intentionally small orbit');
 return s;
}
async function releaseByButton(expectedControls){
 const followed=await followAtAltitude();
 await page.locator('#arrivalFollow').click();
 const released=await state();checkFree(released,expectedControls);
 assert.equal(released.activeElement,'arrivalFollow','The real release button retains keyboard focus');
 assert(cameraDistance(released)>cameraDistance(followed)*4,'Release expands the orbit to the ground rather than keeping the aircraft pivot');
 assert(released.lastRelease&&released.lastRelease.oldDistance<60);
 near(released.lastRelease.groundY,groundY,1e-9,'The reported release datum is the actual ground');
 evidence.cycles.push({width:released.width,followed,released});return released;
}
async function keyMotion(key,{shift=false}={}){
 const before=await state();assert.equal(before.activeElement,'arrivalFollow');
 if(shift)await page.keyboard.down('Shift');
 await page.keyboard.down(key);
 // The production loop caps elapsed time at 60 ms. Waiting 80 ms makes the speed
 // comparison independent of how fast the CI renderer happens to finish.
 await page.waitForTimeout(80);await step();
 await page.keyboard.up(key);if(shift)await page.keyboard.up('Shift');
 const after=await state(),translation=subtract(after.camera.target,before.camera.target);
 checkFree(after,before.camera.controls);
 assert.equal(after.activeElement,'arrivalFollow','WASD/arrows work while the release button is focused');
 assert(norm(translation)>1,'A navigation key visibly moves the free ground view');
 near(after.camera.position[1],before.camera.position[1],1e-6,'Keyboard panning preserves height');
 assert(distance(cameraOffset(after),cameraOffset(before))<1e-5,'Keyboard panning translates camera and target together');
 assert.equal(after.selection,before.selection,'Keyboard movement does not jump to a site view');
 const offset=cameraOffset(before),h=Math.hypot(offset[0],offset[2]);
 const forward=[-offset[0]/h,0,-offset[2]/h],right=[offset[2]/h,0,-offset[0]/h];
 const k=key.toLowerCase(),axis=['w','arrowup'].includes(k)?forward:['s','arrowdown'].includes(k)?forward.map(n=>-n):['a','arrowleft'].includes(k)?right.map(n=>-n):right;
 assert(dot(translation,axis)/norm(translation)>.999,'The key moves in the expected camera-relative direction');
 evidence.inputs.push({type:'keyboard',key,shift,distance:norm(translation),translation,before,after});
 return norm(translation);
}
async function freeCanvasPoint(){
 const toggle=page.locator('#mobileMenuToggle');
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
 return page.evaluate(()=>{
  const canvas=document.querySelector('#view canvas');
  for(const [u,v]of [[.70,.42],[.80,.45],[.60,.50],[.50,.50]]){
   const x=Math.round(innerWidth*u),y=Math.round(innerHeight*v);
   if(document.elementFromPoint(x,y)===canvas&&document.elementFromPoint(x+70,y+10)===canvas)return{x,y};
  }
  throw new Error('No unobstructed canvas area is available for a real input gesture');
 });
}
async function mouseDrag(button,dx,dy){
 const p=await freeCanvasPoint(),before=await state();
 await page.mouse.move(p.x,p.y);await page.mouse.down({button});
 await page.mouse.move(p.x+dx,p.y+dy,{steps:6});await page.mouse.up({button});await step();
 const after=await state();checkFree(after,before.camera.controls);
 assert.equal(after.selection,before.selection,'Dragging navigates without selecting a site');
 evidence.inputs.push({type:'mouse-drag',button,delta:[dx,dy],before,after});return{before,after};
}

try{
 const url=new URL(base);for(const key of ['view','detail','site','station'])url.searchParams.delete(key);
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&
  document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 assert.equal(await page.locator('#error').isVisible(),false);
 await step();evidence.initial=await state();checkFrame(evidence.initial);
 const desktopControls=evidence.initial.camera.controls;
 assert(desktopControls&&desktopControls.enablePan);

 await followAtAltitude();await shot('desktop-following-high');
 await page.locator('#arrivalFollow').click();
 let released=await state();checkFree(released,desktopControls);
 assert.equal(released.activeElement,'arrivalFollow');
 assert(cameraDistance(released)>cameraDistance(evidence.views.at(-1))*4);
 evidence.cycles.push({width:1280,followed:evidence.views.at(-1),released});
 await shot('desktop-released-ground');

 let normalW=0;
 for(const key of ['w','s','a','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
  const moved=await keyMotion(key);if(key==='w')normalW=moved;
 }
 const boosted=await keyMotion('w',{shift:true});
 near(boosted/normalW,3,.03,'Shift gives the requested 3x movement speed');
 const resting=await state();await page.waitForTimeout(80);await step();const rested=await state();
 assert(distance(resting.camera.target,rested.camera.target)<1e-6,'Keyup clears movement without a jump or continued drift');

 let gesture=await mouseDrag('left',65,0);
 assert(distance(gesture.before.camera.target,gesture.after.camera.target)>1,'Left drag performs actual panning');
 assert(distance(cameraOffset(gesture.before),cameraOffset(gesture.after))<1e-4,'Left drag translates rather than orbiting');

 // A fresh real follow/release cycle also consumes the previous gesture's
 // damping deltas, so pan inertia cannot disguise a broken orbit mapping.
 await releaseByButton(desktopControls);
 gesture=await mouseDrag('right',65,0);
 assert(distance(gesture.before.camera.target,gesture.after.camera.target)<1e-5,'Right drag keeps the ground pivot fixed');
 near(cameraDistance(gesture.after),cameraDistance(gesture.before),.001,'Right orbit keeps radius');
 const a=cameraOffset(gesture.before),b=cameraOffset(gesture.after);
 assert(dot(a,b)/(norm(a)*norm(b))<.999,'Right drag changes the actual viewing angle');

 await releaseByButton(desktopControls);
 const pointer=await freeCanvasPoint();await page.mouse.move(pointer.x,pointer.y);
 const beforeWheel=await state();await page.mouse.wheel(0,-250);await page.waitForTimeout(80);await step();
 const afterWheel=await state();checkFree(afterWheel,desktopControls);
 assert(cameraDistance(afterWheel)<cameraDistance(beforeWheel)*.98,'The real mouse wheel zooms the released camera');
 evidence.inputs.push({type:'wheel',deltaY:-250,before:beforeWheel,after:afterWheel});
 await shot('desktop-free-inputs');

 // A key pressed during following must also release the camera and immediately
 // pan the ground view, rather than leaving a hidden airborne following mode.
 await followAtAltitude();await page.keyboard.down('ArrowRight');await page.waitForTimeout(80);await step();await page.keyboard.up('ArrowRight');
 const keyRelease=await state();checkFree(keyRelease,desktopControls);
 assert.equal(keyRelease.activeElement,'arrivalFollow');
 evidence.inputs.push({type:'keyboard-release',key:'ArrowRight',after:keyRelease});

 await page.setViewportSize({width:375,height:812});await step();
 const narrowControls=(await state()).camera.controls;
 await followAtAltitude();await shot('mobile-following-high');await page.locator('#arrivalFollow').click();
 const narrow=await state();checkFree(narrow,narrowControls);assert.equal(narrow.activeElement,'arrivalFollow');
 near(narrow.width,375,0,'Narrow viewport is exercised');await freeCanvasPoint();await shot('mobile-released-ground');

 // Native Chromium touch input on the same page avoids a second expensive
 // museum startup while testing actual pointerType=touch handlers.
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
 const point=await freeCanvasPoint(),beforeTouch=await state();
 await touch('touchStart',[{x:point.x,y:point.y,id:1}]);
 for(let n=1;n<=4;n++)await touch('touchMove',[{x:point.x+n*8,y:point.y,id:1}]);
 await touch('touchEnd',[]);await step();const afterTouch=await state();checkFree(afterTouch,narrowControls);
 assert(distance(beforeTouch.camera.target,afterTouch.camera.target)>.5,'One finger pans the ground camera');
 assert(distance(cameraOffset(beforeTouch),cameraOffset(afterTouch))<1e-4,'One finger retains pan instead of the aircraft orbit mapping');
 near(afterTouch.scrollY,beforeTouch.scrollY,0,'The gesture navigates the canvas rather than scrolling the page');
 evidence.inputs.push({type:'one-finger-pan',before:beforeTouch,after:afterTouch});

 await releaseByButton(narrowControls);
 await freeCanvasPoint();
 const beforePinch=await state(),cx=point.x-20,cy=point.y;
 await touch('touchStart',[{x:cx-18,y:cy,id:1},{x:cx+18,y:cy,id:2}]);
 for(let n=1;n<=4;n++)await touch('touchMove',[{x:cx-18-n*4,y:cy,id:1},{x:cx+18+n*4,y:cy,id:2}]);
 await touch('touchEnd',[]);await step();const afterPinch=await state();checkFree(afterPinch,narrowControls);
 assert(cameraDistance(afterPinch)<cameraDistance(beforePinch)*.9,'Two fingers retain real pinch-to-zoom after release');
 evidence.inputs.push({type:'two-finger-pinch',before:beforePinch,after:afterPinch});
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
 await shot('mobile-pan-and-pinch');

 const finalFree=await releaseByButton(narrowControls);await page.waitForTimeout(80);await step();const stable=await state();
 checkFree(stable,narrowControls);
 assert(distance(finalFree.camera.position,stable.camera.position)<1e-5&&distance(finalFree.camera.target,stable.camera.target)<1e-5,'Repeated release has no hidden mode jump');
 evidence.inputEvents=await page.evaluate(()=>window.__CAMERA_INPUT);
 for(const key of ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'])
  assert(evidence.inputEvents.some(e=>e.type==='keydown'&&e.key?.toLowerCase()===key),'Trusted input includes '+key);
 assert(evidence.inputEvents.some(e=>e.pointerType==='touch'&&e.type==='pointerdown'),'The browser received real touch pointers');
 assert(evidence.inputEvents.every(e=>e.trusted),'Navigation checks use trusted browser input, not synthetic DOM dispatch');
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);
 assert.deepEqual(evidence.failedResources,[]);assert.deepEqual(evidence.failedRequests,[]);
 evidence.final=stable;
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('CAMERA_NAVIGATION_BROWSER_PASS',JSON.stringify({prefix,revision,cycles:evidence.cycles.length,inputs:evidence.inputs.length,views:evidence.views.length,widths:[1280,375]}));
}catch(error){
 evidence.failureState=await state().catch(()=>null);
 evidence.inputEvents=await page.evaluate(()=>window.__CAMERA_INPUT||[]).catch(()=>[]);
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));
 throw error;
}finally{await browser.close();}
