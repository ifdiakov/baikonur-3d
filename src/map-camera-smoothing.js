// Consistent frame-rate independent camera easing for the free Baikonur map.
// Three.js r160 OrbitControls already damps pan/orbit, but its mouse wheel
// changes the perspective-camera radius instantly. This module smooths only
// wheel zoom and never interferes with aircraft/rocket follow cameras.
export const MAP_CAMERA_SMOOTHING_VERSION='map-camera-smoothing-v1';
export const MUSEUM_DAMPING_AT_60FPS=.092;

export function smoothingAlpha(dt,seconds=.145){
 const elapsed=Number.isFinite(dt)?Math.max(0,Math.min(dt,.12)):0;
 return 1-Math.exp(-elapsed/Math.max(.01,seconds));
}
export function normalizedWheelPixels(deltaY,deltaMode=0){
 const scale=deltaMode===1?32:deltaMode===2?650:1;
 return Math.max(-650,Math.min(650,(Number(deltaY)||0)*scale));
}
export function wheelZoomScale(deltaY,deltaMode=0,zoomSpeed=1){
 const movement=normalizedWheelPixels(deltaY,deltaMode);
 const speed=Number.isFinite(zoomSpeed)?Math.max(.1,Math.min(3,zoomSpeed)):1;
 return Math.exp(Math.max(-.42,Math.min(.42,movement/120*.08*speed)));
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function createMapCameraSmoothing({canvas,camera,controls,canNavigate=()=>true}){
 if(!canvas||!camera?.position||!controls?.target)throw new TypeError('Smooth map navigation requires a canvas, camera and OrbitControls');
 let goal=null,lastRadius=null,lastTarget=null;
 const stats={wheelEvents:0,animatedFrames:0,externalResets:0,completedZooms:0};
 function cancel(){
  goal=null;lastRadius=null;lastTarget=null;
 }
 function allowed(){return controls.enabled&&controls.enableZoom&&canNavigate();}
 function wheel(event){
  if(!allowed()||!Number.isFinite(event.deltaY)||event.deltaY===0)return;
  event.preventDefault();
  event.stopImmediatePropagation(); // suppress the instant native OrbitControls zoom
  const radius=camera.position.distanceTo(controls.target);
  if(!Number.isFinite(radius)||radius<.01)return;
  const factor=wheelZoomScale(event.deltaY,event.deltaMode,controls.zoomSpeed);
  const minimum=Math.max(.05,Number.isFinite(controls.minDistance)?controls.minDistance:.05);
  const maximum=Math.max(minimum,Number.isFinite(controls.maxDistance)?controls.maxDistance:Infinity);
  goal=clamp((goal??radius)*factor,minimum,maximum);
  stats.wheelEvents++;
 }
 // Capture phase runs before OrbitControls' built-in bubbling wheel handler,
 // and also receives wheel events forwarded by the floating object cards.
 canvas.addEventListener('wheel',wheel,{capture:true,passive:false});
 function update(dt){
  if(!allowed()){cancel();return false;}
  if(goal===null)return false;
  const current=camera.position.distanceTo(controls.target);
  if(!Number.isFinite(current)||current<.001){cancel();return false;}
  // A scripted object focus, overview reset or touch pinch can replace the
  // current orbit. Do not apply stale wheel momentum to its new camera pose.
  if(lastRadius!==null&&(
    Math.abs(Math.log(current/lastRadius))>.045||
    (lastTarget&&controls.target.distanceTo(lastTarget)>Math.max(45,current*.18))
   )){
   stats.externalResets++;cancel();return false;
  }
  const alpha=smoothingAlpha(dt,.155);
  const next=Math.exp(Math.log(current)+(Math.log(goal)-Math.log(current))*alpha);
  if(!Number.isFinite(next)){cancel();return false;}
  const safe=clamp(next,Math.max(.05,controls.minDistance||.05),Math.max(controls.minDistance||.05,controls.maxDistance||Infinity));
  // Preserve the exact azimuth, inclination, ground anchor and latest damped
  // pan/rotate input; only adjust camera-to-target radius.
  camera.position.sub(controls.target).multiplyScalar(safe/current).add(controls.target);
  stats.animatedFrames++;
  lastRadius=safe;
  if(!lastTarget)lastTarget=controls.target.clone();else lastTarget.copy(controls.target);
  if(Math.abs(Math.log(safe/goal))<.0009){
   const finish=clamp(goal,Math.max(.05,controls.minDistance||.05),Math.max(controls.minDistance||.05,controls.maxDistance||Infinity));
   camera.position.sub(controls.target).multiplyScalar(finish/safe).add(controls.target);
   stats.completedZooms++;cancel();
  }
  return true;
 }
 return {
  update,cancel,
  stats:()=>({...stats,version:MAP_CAMERA_SMOOTHING_VERSION,
   active:goal!==null,goalDistance:goal,
   dampingFactor:controls.dampingFactor,zoomSpeed:controls.zoomSpeed,
   panSpeed:controls.panSpeed,rotateSpeed:controls.rotateSpeed}),
  dispose(){cancel();canvas.removeEventListener('wheel',wheel,true);}
 };
}
