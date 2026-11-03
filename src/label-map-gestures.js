// Map labels remain clickable on a deliberate click, but their transparent
// HUD surfaces must never block normal mouse pan/orbit/zoom gestures.
export const LABEL_MAP_GESTURES_VERSION='label-map-gestures-v1';
const LABEL_SELECTOR='.site-label,.detail-card,.flank-label';
const MOVE_THRESHOLD=7;

export function installLabelMapGestures({layer,canvas}){
 if(!layer||!canvas)throw new TypeError('Map label gesture bridge requires overlay and canvas');
 const ownerWindow=layer.ownerDocument.defaultView;
 if(!ownerWindow)throw new Error('Map label overlay must be in a browser window');
 let pending=null,recentDrag=null;
 const forwarded=new WeakSet(),stats={wheels:0,drags:0,rotations:0,clicksPreserved:0,clicksSuppressed:0};
 const accepts=event=>{
  const target=event.target;
  return target?.closest?.(LABEL_SELECTOR) && layer.contains(target);
 };
 function relay(type,original,{clientX=original.clientX,clientY=original.clientY,button=original.button,buttons=original.buttons}={}){
  const options={
   bubbles:true,cancelable:true,composed:true,
   pointerId:original.pointerId,pointerType:original.pointerType||'mouse',
   isPrimary:original.isPrimary!==false,
   width:original.width||1,height:original.height||1,
   pressure:original.pressure||0,
   button,buttons,clientX,clientY,
   screenX:original.screenX,screenY:original.screenY,
   ctrlKey:original.ctrlKey,shiftKey:original.shiftKey,
   altKey:original.altKey,metaKey:original.metaKey
  };
  const event=new ownerWindow.PointerEvent(type,options);
  forwarded.add(event);
  canvas.dispatchEvent(event);
 }
 function clearListeners(){
  ownerWindow.removeEventListener('pointermove',onMove,true);
  ownerWindow.removeEventListener('pointerup',onUp,true);
  ownerWindow.removeEventListener('pointercancel',onCancel,true);
 }
 function begin(original){
  if(!pending||pending.dragging)return;
  pending.dragging=true;
  stats.drags++;
  if(pending.button!==0)stats.rotations++;
  // OrbitControls owns the camera math. A native pointerdown was on the label;
  // send the initial gesture to its canvas once the user actually drags.
  relay('pointerdown',original,{
   clientX:pending.x,clientY:pending.y,button:pending.button,
   buttons:pending.button===2?2:pending.button===1?4:1
  });
 }
 function onMove(event){
  if(!pending||event.pointerId!==pending.id||forwarded.has(event))return;
  const delta=Math.hypot(event.clientX-pending.x,event.clientY-pending.y);
  if(!pending.dragging&&delta>MOVE_THRESHOLD)begin(event);
  if(!pending.dragging)return;
  // OrbitControls sometimes captures the actual pointer on the canvas.
  // In that case the native move is already delivered; avoid double panning.
  if(event.target!==canvas)relay('pointermove',event);
  event.preventDefault?.();
 }
 function finish(event,cancelled=false){
  if(!pending||event.pointerId!==pending.id||forwarded.has(event))return;
  if(pending.dragging){
   const type=cancelled?'pointercancel':'pointerup';
   if(event.target!==canvas)relay(type,event);
   recentDrag={at:ownerWindow.performance.now(),x:event.clientX,y:event.clientY};
  }
  pending=null;clearListeners();
 }
 function onUp(event){finish(event);}
 function onCancel(event){finish(event,true);}
 function onDown(event){
  if(!accepts(event)||!['mouse','pen'].includes(event.pointerType)||![0,1,2].includes(event.button))return;
  // Start a fresh click/drag transaction. Touch retains the museum's original
  // handlers; accessibility and keyboard activation are unaffected.
  if(pending){pending=null;clearListeners();}
  recentDrag=null;
  pending={id:event.pointerId,button:event.button,x:event.clientX,y:event.clientY,dragging:false};
  ownerWindow.addEventListener('pointermove',onMove,true);
  ownerWindow.addEventListener('pointerup',onUp,true);
  ownerWindow.addEventListener('pointercancel',onCancel,true);
  if(event.button!==0)begin(event);
 }
 function onClick(event){
  if(!accepts(event))return;
  const last=recentDrag,age=last?ownerWindow.performance.now()-last.at:Infinity;
  if(last&&age<650&&Math.hypot(event.clientX-last.x,event.clientY-last.y)<28){
   event.preventDefault();event.stopImmediatePropagation();stats.clicksSuppressed++;recentDrag=null;
  }else stats.clicksPreserved++;
 }
 function onWheel(event){
  if(!accepts(event))return;
  // This is a deliberate wheel event on a floating ground card: give it to
  // OrbitControls instead of scrolling the document or changing the card.
  event.preventDefault();
  event.stopPropagation();
  canvas.dispatchEvent(new ownerWindow.WheelEvent('wheel',{
   bubbles:true,cancelable:true,composed:true,
   deltaX:event.deltaX,deltaY:event.deltaY,deltaZ:event.deltaZ,
   deltaMode:event.deltaMode,
   clientX:event.clientX,clientY:event.clientY,
   screenX:event.screenX,screenY:event.screenY,
   ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,
   altKey:event.altKey,metaKey:event.metaKey
  }));
  stats.wheels++;
 }
 function onContextMenu(event){
  if(accepts(event))event.preventDefault(); // right-button camera orbit
 }
 function onDragStart(event){
  if(accepts(event))event.preventDefault(); // images must not drag out of cards
 }
 layer.addEventListener('pointerdown',onDown,true);
 layer.addEventListener('click',onClick,true);
 layer.addEventListener('wheel',onWheel,{passive:false});
 layer.addEventListener('contextmenu',onContextMenu);
 layer.addEventListener('dragstart',onDragStart);
 return {
  stats:()=>({...stats,dragging:!!pending?.dragging,version:LABEL_MAP_GESTURES_VERSION}),
  dispose(){
   pending=null;clearListeners();
   layer.removeEventListener('pointerdown',onDown,true);
   layer.removeEventListener('click',onClick,true);
   layer.removeEventListener('wheel',onWheel);
   layer.removeEventListener('contextmenu',onContextMenu);
   layer.removeEventListener('dragstart',onDragStart);
  }
 };
}
