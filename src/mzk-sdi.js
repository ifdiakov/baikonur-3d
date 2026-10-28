import * as THREE from 'three';
import {archiveKit} from './archive-kit.js';
// Visible architecture interpreted from owner IMG_0752; no invented measured plan.
export function buildMzkSdi(root){
 const k=archiveKit(root),front=103;
 // Two tall assembly volumes and the immense glazed sliding gate leaves.
 for(const [x,w,h] of [[44,58,62],[104,58,62]]){
  k.hall({x,z:28,w,d:150,h,roof:'light',windows:false,gates:0,tag:'mzk-high-assembly-hall'});
  k.box(w-5,h-7,.8,x,(h-7)/2,front+.5,'dark','mzk-gate-recess');
  for(let dx=-w/2+5;dx<w/2-2;dx+=6){
   for(let y=4;y<h-5;y+=4)k.box(5.4,3.5,.25,x+dx,y,front+1,'glass','mzk-glazed-gate-panel');
   k.box(.38,h-6,.4,x+dx+2.8,(h-6)/2,front+1.2,'steel','mzk-gate-vertical-frame');
  }
  for(let y=2;y<h-4;y+=4)k.box(w-5,.28,.4,x,y,front+1.3,'light','mzk-gate-transom');
  for(const side of [-1,1])k.box(3.4,h+2,6,x+side*w/2,(h+2)/2,front,'light','mzk-gate-concrete-pier');
  k.box(w+3,5,7,x,h,front,'light','mzk-gate-head');
  for(let z=-43;z<104;z+=12){k.box(w+1,.18,.5,x,h+.55,z,'steel','mzk-roof-seam');for(const side of [-1,1]){k.box(1.1,h,.8,x+side*w/2,h/2,z,'light','mzk-side-pilaster');for(let y=7;y<58;y+=9)k.box(.16,3,8,x+side*(w/2+.1),y,z+5,'glass','mzk-side-window-band');}}
  for(const side of [-1,1])k.rail([[x+side*8,front+2],[x+side*8,185]],{tag:'mzk-gate-rail'});
 }
 k.hall({x:165,z:57,w:61,d:94,h:12,floors:2,gates:2,roof:'concrete',tag:'mzk-low-side-annex'});
 k.box(24,5,16,2,33,front+2,'light','mzk-projecting-control-gallery');k.box(21,2.7,.3,2,33.6,front+10.2,'glass','mzk-gallery-glazing');
 for(const x of [-8,12])k.rod([x,0,front],[x,31,front],.55,'concrete','mzk-gallery-support');
 // SDI is a straight-sided frame: no taper or generic antenna mast.
 const cx=-70,cz=5,w=39,d=43,H=105;
 for(const sx of [-1,1])for(const sz of [-1,1])k.box(3.2,H,3.2,cx+sx*w/2,H/2,cz+sz*d/2,'light','sdi-concrete-corner-pier');
 for(let level=0;level<18;level++){const y=level*H/18,ny=(level+1)*H/18;
  for(const side of [-1,1]){
   k.rod([cx-w/2,y,cz+side*d/2],[cx+w/2,y,cz+side*d/2],.42,'steel','sdi-horizontal-beam');
   k.rod([cx+side*w/2,y,cz-d/2],[cx+side*w/2,y,cz+d/2],.42,'steel','sdi-horizontal-beam');
   for(let bay=0;bay<4;bay++){const x0=cx-w/2+bay*w/4,x1=x0+w/4,z0=cz-d/2+bay*d/4,z1=z0+d/4;
    k.rod([x0,y,cz+side*d/2],[x0,ny,cz+side*d/2],.28,'steel','sdi-grid-column');k.rod([x0,y,cz+side*d/2],[x1,ny,cz+side*d/2],.15,'steel','sdi-diagonal-brace');
    k.rod([cx+side*w/2,y,z0],[cx+side*w/2,ny,z0],.28,'steel','sdi-grid-column');k.rod([cx+side*w/2,y,z0],[cx+side*w/2,ny,z1],.15,'steel','sdi-diagonal-brace');}
  }
  if(level%3===0){for(const side of [-1,1]){k.box(w+5,.35,2,cx,y,cz+side*(d/2+1),'steel','sdi-access-balcony');k.rod([cx-w/2-2,y+1.2,cz+side*(d/2+2)],[cx+w/2+2,y+1.2,cz+side*(d/2+2)],.09,'yellow','sdi-balcony-rail');}}
 }
 for(const x of [cx-w/2-2,cx-w/2-3.1])k.rod([x,0,cz],[x,H,cz],.12,'steel','sdi-ladder-stile');for(let y=1;y<H;y+=1)k.rod([cx-w/2-3.1,y,cz],[cx-w/2-2,y,cz],.08,'steel','sdi-ladder-rung');
 k.box(w+7,17,d+6,cx,H+8.5,cz,'light','sdi-white-crown');
 for(const s of [-1,1]){k.box(w-4,1.6,.25,cx,H+9,cz+s*(d/2+3.1),'dark','sdi-crown-window-band');for(let x=-w/2;x<w/2;x+=6)k.box(.6,17,.6,cx+x,H+8.5,cz+s*(d/2+3.3),'concrete','sdi-crown-seam');}
 // Projecting orange bridge crane with bracing, trolley and hanging hook.
 const y=H+21;for(const z of [-5,5]){k.box(86,2,1.4,cx+16,y,cz+z,'yellow','sdi-crane-girder');k.rod([cx-27,y+5,cz+z],[cx+59,y+5,cz+z],.3,'rust','sdi-crane-upper-chord');for(let x=-26;x<58;x+=7)k.rod([cx+x,y,cz+z],[cx+x+7,y+5,cz+z],.22,'rust','sdi-crane-diagonal');}
 k.box(9,3,14,cx+38,y-1,cz,'yellow','sdi-crane-trolley');k.box(7,9,9,cx+58,y-4,cz,'rust','sdi-crane-cabin');k.box(6,2,.2,cx+58,y-2,cz+4.6,'glass','sdi-crane-window');for(const z of [-1,1])k.rod([cx+38,y-2,cz+z],[cx+38,y-22,cz+z],.06,'dark','sdi-hoist-cable');k.cyl(.7,1.5,cx+38,y-23,cz,'yellow','sdi-hoist-block');
 k.path([[-110,130],[-20,130],[160,130]],7,.15);root.userData.mzkSdi={version:'photo-architecture-v2',gateBays:2,sdiTaper:0,sdiLevels:18};return k.finish();
}
