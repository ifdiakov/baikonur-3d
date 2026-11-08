import * as THREE from 'three';

// Stable, owner-facing museum map coordinates, not geographic GPS coordinates.
// X grows eastward in the original map plane, Y grows southward.
export function createCoordinateGrid({scene,camera,canvas,width=1300,height=1045,scale=3.4}){
 const group=new THREE.Group();group.name='Координатная сетка · музей';group.visible=false;
 group.renderOrder=30;scene.add(group);
 const fine=[],minor=[],major=[],axisY=2.4;
 const line=(arr,x1,z1,x2,z2)=>arr.push(x1,axisY,z1,x2,axisY,z2);
 const toX=x=>(x-width/2)*scale,toZ=y=>(y-height/2)*scale;
 for(let x=0;x<=width;x+=5)line(x%100===0?major:x%25===0?minor:fine,toX(x),toZ(0),toX(x),toZ(height));
 for(let y=0;y<=height;y+=5)line(y%100===0?major:y%25===0?minor:fine,toX(0),toZ(y),toX(width),toZ(y));
 for(const [segments,color,opacity] of [[fine,0x91c6d0,.13],[minor,0x86c9d6,.38],[major,0xffdc86,.78]]){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
  const mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
  mesh.frustumCulled=false;group.add(mesh);
 }
 const labelMaterial=new Map();
 function addLabel(label,x,z){
  let mat=labelMaterial.get(label);
  if(!mat){
   const c=document.createElement('canvas');c.width=256;c.height=64;
   const ctx=c.getContext('2d');ctx.fillStyle='rgba(12,30,37,.88)';ctx.fillRect(0,0,256,64);
   ctx.strokeStyle='#e2c77c';ctx.lineWidth=2;ctx.strokeRect(2,2,252,60);
   ctx.fillStyle='#fff4d5';ctx.font='bold 27px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,128,34);
   const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
   mat=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false});labelMaterial.set(label,mat);
  }
  const sprite=new THREE.Sprite(mat);sprite.position.set(x,axisY+2,z);sprite.scale.set(52,13,1);group.add(sprite);
 }
 for(let x=0;x<=width;x+=100)addLabel('X '+x,toX(x),toZ(0));
 for(let y=0;y<=height;y+=100)addLabel('Y '+y,toX(0),toZ(y));
 const hud=document.createElement('div');hud.id='coordinateGridHud';
 hud.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:120;display:none;pointer-events:none;background:#10262ce8;color:#fff4d5;border:1px solid #c9a760;border-radius:8px;padding:9px 14px;font:600 12px/1.5 Arial,sans-serif;box-shadow:0 4px 20px #0007;text-align:center';
 hud.textContent='СЕТКА · наведите курсор на карту · Shift + клик — копировать координаты';document.body.appendChild(hud);
 const pointerBadge=document.createElement('div');pointerBadge.id='coordinateGridPointerBadge';
 pointerBadge.style.cssText='position:fixed;top:0;left:0;z-index:121;display:none;pointer-events:none;white-space:nowrap;background:rgba(12,30,37,.93);color:#fff4d5;border:1px solid #d8b973;border-radius:6px;padding:5px 8px;font:700 12px/1.35 Arial,sans-serif;box-shadow:0 3px 12px #0008;transform:translate3d(0,0,0)';
 pointerBadge.setAttribute('aria-hidden','true');document.body.appendChild(pointerBadge);
 function hidePointerBadge(){pointerBadge.style.display='none';}
 function showPointerBadge(e,p){
  if(!p){hidePointerBadge();return;}
  pointerBadge.textContent='X: '+p.x.toFixed(1)+'  ·  Y: '+p.y.toFixed(1);
  pointerBadge.style.display='block';
  const rect=pointerBadge.getBoundingClientRect();
  const left=e.clientX+18+rect.width>innerWidth-8?e.clientX-rect.width-14:e.clientX+18;
  const top=e.clientY+18+rect.height>innerHeight-8?e.clientY-rect.height-14:e.clientY+18;
  pointerBadge.style.left=Math.max(6,left)+'px';
  pointerBadge.style.top=Math.max(6,top)+'px';
 }
 const raycaster=new THREE.Raycaster(),cursor=new THREE.Vector2(),surface=new THREE.Plane(new THREE.Vector3(0,1,0),0),world=new THREE.Vector3();
 let enabled=false,last=null;
 const toggle=document.getElementById('coordinateGridToggle');
 function setEnabled(value){
  enabled=Boolean(value);group.visible=enabled;hud.style.display=enabled?'block':'none';
  document.dispatchEvent(new CustomEvent('coordinate-grid-change',{detail:{enabled}}));
  if(toggle){toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=enabled?'▦ КООРДИНАТНАЯ СЕТКА · ВЫКЛ':'▦ КООРДИНАТНАЯ СЕТКА · ВКЛ';}
  if(!enabled){last=null;hidePointerBadge();}
 }
 function readPointer(e){
  const bounds=canvas.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return null;
  cursor.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);
  raycaster.setFromCamera(cursor,camera);
  if(!raycaster.ray.intersectPlane(surface,world))return null;
  const x=world.x/scale+width/2,y=world.z/scale+height/2;
  if(x<0||x>width||y<0||y>height)return null;
  return {x:Math.round(x*10)/10,y:Math.round(y*10)/10};
 }
 canvas.addEventListener('pointermove',e=>{
  if(!enabled)return;
  last=readPointer(e);
  showPointerBadge(e,last);
  hud.textContent=last?'X: '+last.x.toFixed(1)+' · Y: '+last.y.toFixed(1)+' | Shift + клик — копировать координаты':'Координатная сетка · наведите на территорию';
 });
 canvas.addEventListener('pointerleave',hidePointerBadge);
 canvas.addEventListener('pointercancel',hidePointerBadge);
 canvas.addEventListener('click',e=>{
  if(!enabled||!e.shiftKey)return;
  const p=readPointer(e);if(!p)return;
  e.preventDefault();e.stopImmediatePropagation();
  const copy='X='+p.x.toFixed(1)+', Y='+p.y.toFixed(1);
  navigator.clipboard?.writeText(copy).then(()=>{hud.textContent='Скопировано: '+copy;}).catch(()=>{hud.textContent='Координаты: '+copy;});
 },true);
 document.addEventListener('keydown',e=>{
  if(e.key.toLowerCase()!=='g'||e.altKey||e.ctrlKey||e.metaKey||/input|textarea|select/i.test(e.target?.tagName||''))return;
  setEnabled(!enabled);
 });
 toggle?.addEventListener('click',()=>setEnabled(!enabled));
 // Owner request 2026-11-09: every visit starts with a clean museum view.
 // Legacy ?grid=1 links must not restore debugging overlays. G and the
 // existing button remain available for deliberate editing sessions.
 setEnabled(false);
 window.__MUSEUM_COORD_GRID={setEnabled,isEnabled:()=>enabled,last:()=>last,version:'coordinate-grid-v5-default-hidden'};
 return {setEnabled,isEnabled:()=>enabled,group};
}
