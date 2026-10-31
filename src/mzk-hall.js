import * as THREE from 'three';

// Owner references, refreshed 2026-10-30: i-81 / i-82 / i-85 / i-86 / i-87
// and nbbxt5R7HgbOJZFd. The footprint and height tag come from OSM way
// 172704643. Facade subdivisions and hidden surfaces remain photo estimates.
// No photograph is used as a texture; the sheet weathering is procedural.
function claddingMaterial(frame, width, height){
 const material=new THREE.MeshStandardMaterial({color:0x56615d,roughness:.94,metalness:.12});
 material.name='МЗК · выцветшая профилированная обшивка';
 frame.updateMatrix();
 const fromRoot=frame.matrix.clone().invert();
 material.onBeforeCompile=shader=>{
  shader.uniforms.mzkFromRoot={value:fromRoot};
  shader.uniforms.mzkDimensions={value:new THREE.Vector2(width,height)};
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   uniform mat4 mzkFromRoot;
   varying vec3 vMzkPosition;
  `).replace('#include <project_vertex>',`#include <project_vertex>
   vec4 mzkPoint=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
    mzkPoint=instanceMatrix*mzkPoint;
   #endif
   vMzkPosition=(mzkFromRoot*mzkPoint).xyz;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform vec2 mzkDimensions;
   varying vec3 vMzkPosition;
   float mzkHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float mzkNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mzkHash(i),mzkHash(i+vec2(1,0)),f.x),mix(mzkHash(i+vec2(0,1)),mzkHash(i+vec2(1,1)),f.x),f.y);}
  `).replace('#include <map_fragment>',`#include <map_fragment>
   vec2 sheet=vec2(vMzkPosition.x+vMzkPosition.z*.37,vMzkPosition.y);
   float edge=smoothstep(mzkDimensions.x*.29,mzkDimensions.x*.48,abs(vMzkPosition.x));
   float band=1.0-smoothstep(.5,2.6,abs(vMzkPosition.y-mzkDimensions.y*.78));
   float islands=mzkNoise(sheet*vec2(.22,.30))*.62+mzkNoise(sheet*vec2(1.45,.7))*.38;
   float worn=smoothstep(.70-edge*.31-band*.18,.83-edge*.31-band*.18,islands);
   float ribs=.91+.09*cos(sheet.x*15.0);
   float streak=.93+.07*mzkNoise(sheet*vec2(2.2,.09));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.73,.735,.69),worn)*ribs*streak;
  `);
 };
 material.customProgramCacheKey=()=> 'mzk-weathered-sheet-v1';
 return material;
}

export function buildMzkHall(k,{x=0,z=0,yaw=0,width=140.6,depth=71.4,height=62}={}){
 const frame=new THREE.Group();frame.name='МЗК · монтажно-заправочный корпус';
 frame.position.set(x,0,z);frame.rotation.y=yaw;k.root.add(frame);
 k.mat.mzkSheet=claddingMaterial(frame,width,height);
 const box=(w,h,d,x,y,z,m,tag)=>k.box(w,h,d,x,y,z,m,tag,0,frame);
 const rod=(a,b,r,m,tag)=>k.rod(a,b,r,m,tag,frame);
 const W=width,D=depth,H=height,half=W/2,side=D/2;

 // One broad, flat-roofed block. The enormous doors occupy its short ends.
 box(W,H,D,0,H/2,0,'mzkSheet','mzk-main-volume');
 box(W+.8,.65,D+.8,0,H+.325,0,'concrete','mzk-flat-roof');
 for(const sx of [-1,1])box(.35,1.15,D+.8,sx*(half+.2),H+.8,0,'light','mzk-roof-parapet');
 for(const sz of [-1,1])box(W+.8,1.15,.35,0,H+.8,sz*(side+.2),'light','mzk-roof-parapet');
 for(let xx=-half+5;xx<half;xx+=8)box(.10,.05,D-.4,xx,H+.68,0,'steel','mzk-roof-panel-joint');
 for(const xx of [-W*.29,W*.28]){
  box(13,2.3,7,xx,H+1.8,-D*.12,'steel','mzk-roof-equipment-house');
  box(13.6,.35,7.6,xx,H+3.12,-D*.12,'light','mzk-roof-equipment-cap');
 }
 for(let i=0;i<8;i++){
  const xx=-half+11+i*(W-22)/7;
  box(1.2,1.6,1.2,xx,H+1.3,D*.26,'rust','mzk-roof-vent');
 }

 // Both long elevations are visible in the new ground photographs. Each
 // has two narrow paired stair/service risers and two continuous glazing bands.
 const towerX=[-W*.265,W*.265],towerW=14.2,towerProjection=3.5,annexDepth=9.4,annexHeight=12.8;
 for(const sz of [-1,1]){
  const face=sz*(side+.18),outer=sz*(side+annexDepth/2);
  for(const yy of [16.1,48.0]){
   const gh=yy<20?3.4:1.55;
   box(W-2,gh,.28,0,yy,face,'glass','mzk-horizontal-glazing-band');
   box(W-1,.25,.75,0,yy-gh/2-.12,face+sz*.24,'light','mzk-window-sill');
   for(let xx=-half+2;xx<half;xx+=3.1)box(.13,gh,.4,xx,yy,face+sz*.18,'concrete','mzk-window-mullion');
  }
  box(W,3,.7,0,45.5,face+sz*.4,'mzkSheet','mzk-upper-gallery-belt');
  for(let yy=20;yy<H;yy+=7.8)box(W,.11,.16,0,yy,face+sz*.13,'concrete','mzk-sheet-horizontal-joint');
  for(let xx=-half+4;xx<half;xx+=6.2)box(.09,H-18,.15,xx,(H+18)/2,face+sz*.14,'steel','mzk-sheet-vertical-joint');

  // A projecting low podium, broken at the two risers. The near elevation
  // is mostly pale panels; the other shows the dense glazed vertical fins.
  box(W+2,annexHeight,annexDepth,0,annexHeight/2,outer,'light','mzk-low-long-podium');
  box(W+3,.4,annexDepth+1,0,annexHeight+.2,outer,'concrete','mzk-podium-roof');
  const front=sz*(side+annexDepth+.08);
  box(W,2.2,.22,0,1.65,front,'glass','mzk-ground-floor-glazing');
  for(let xx=-half+1;xx<half;xx+=3.2){
   box(.22,2.2,.4,xx,1.65,front+sz*.2,'light','mzk-ground-window-mullion');
   const glazed=sz<0;
   box(glazed?2.25:2.88,8.6,.24,xx+1.35,7.5,front,glazed?'glass':'light',glazed?'mzk-annex-tall-glazing':'mzk-annex-pale-panel');
   box(.23,9.2,glazed?1.1:.45,xx,7.7,front+sz*.25,'concrete','mzk-annex-vertical-fin');
  }
  for(const xx of towerX){
   box(towerW,H+2.2,towerProjection,xx,(H+2.2)/2,sz*(side+towerProjection/2),'mzkSheet','mzk-service-tower');
   box(2.2,H-5,.25,xx,(H+1)/2,sz*(side+towerProjection+.14),'glass','mzk-tower-window-slot');
   for(const dx of [-towerW/2,towerW/2])box(.33,H+2.2,.45,xx+dx,(H+2.2)/2,sz*(side+towerProjection+.2),'light','mzk-tower-edge');
   for(let yy=3;yy<H;yy+=3.8)box(2.3,.14,.35,xx,yy,sz*(side+towerProjection+.3),'concrete','mzk-tower-window-transom');
   // Riser projects through the low wing. A recessed entrance remains below.
   box(towerW+1.4,9.2,.65,xx,8.2,front+sz*.5,'mzkSheet','mzk-podium-tower-face');
   box(3.0,3.4,.25,xx,1.7,front+sz*.12,'dark','mzk-podium-entrance');
   box(towerW+1.7,.45,2.4,xx,3.6,front+sz*1.0,'light','mzk-entrance-canopy');
  }
 }

 const portalWidth=D*.77,portalHeight=H*.75;
 for(const sx of [-1,1]){
  const end=sx*(half+.2);
  box(.7,portalHeight,portalWidth,end,portalHeight/2,0,'dark','mzk-end-portal-recess');
  box(.82,portalHeight-.8,portalWidth-1.5,end+sx*.18,portalHeight/2,0,'light','mzk-solid-end-gate');
  for(let zz=-portalWidth/2+2;zz<portalWidth/2;zz+=3.8)box(.25,portalHeight-.9,.13,end+sx*.65,portalHeight/2,zz,'concrete','mzk-end-gate-rib');
  for(let yy=4;yy<portalHeight;yy+=7.2)box(.25,.16,portalWidth-1.2,end+sx*.7,yy,0,'concrete','mzk-end-gate-panel-joint');
  box(.3,portalHeight,.28,end+sx*.74,portalHeight/2,0,'steel','mzk-gate-leaf-joint');
  for(const sz of [-1,1])box(2.1,portalHeight+1,3.4,end,portalHeight/2,sz*(portalWidth/2+1.7),'light','mzk-end-portal-pier');
  box(6.0,4.8,D+4.0,end+sx*1.7,portalHeight+2.0,0,'light','mzk-projecting-portal-head');
  box(6.3,.25,D+4.5,end+sx*1.8,portalHeight+4.55,0,'concrete','mzk-portal-head-cap');
  for(let zz=-D/2+4;zz<D/2;zz+=7)box(4.4,.5,.65,end+sx*1.3,portalHeight-.6,zz,'rust','mzk-portal-head-soffit');
  // Parallel western tracks share the two verified source-route sockets.
  k.path([[sx*(half+1),0],[sx*(half+27),0]],portalWidth,.08,'concrete','mzk-end-apron',frame);
  for(const trackZ of [-10,10])k.rail([[sx*(half+1),trackZ],[sx*(half+28),trackZ]],{bed:false,y:.22,tag:'mzk-portal-rail',parent:frame});
 }
 // The small cantilevered control gallery is visible at one rear corner.
 box(7.5,4.8,13,-half-2.6,19,-side+4,'light','mzk-projecting-control-gallery');
 box(.2,2.2,10,-half-6.5,19.7,-side+4,'glass','mzk-gallery-window');
 for(const zz of [-side-.7,-side+8.8])rod([-half-5,0,zz],[-half-5,16.6,zz],.28,'concrete','mzk-gallery-support');

 return {kind:'mzk',center:[x,z],yaw,dimensions:{width:W,depth:D,height:H},
  sourceWay:'way/172704643',heightBasis:'OSM-height-tag',footprintBasis:'OSM-long-and-short-edges',
  serviceTowersPerLongFacade:2,longFacades:2,endPortals:2,roof:'flat',annexHeight,
  gateMaterial:'solid-pale-sheet',cladding:'procedural-weathered-dark-sheet',
  facadeBasis:'owner-photos-20261030',hiddenGeometry:'interpreted',frame};
}
