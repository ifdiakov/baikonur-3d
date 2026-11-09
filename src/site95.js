import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {SITE95_VERSION,SITE95_REFERENCE,SITE95_BUILDINGS,SITE95_VIEWS,SITE95_YAW,site95Pixel} from './site95-layout.js?v=20261109-courts-v2';

import {buildSite95Landscape} from './site95-landscape.js?v=20261109-courts-v2';

export function buildSite95(root){
 const k=archiveKit(root),P=site95Pixel;
 for(const [key,color]of Object.entries({wall:0xc9bb90,light:0xd0cec0,red:0x9c6248,concrete:0xa6a496,roof:0x707c78,dark:0x272c29,glass:0x556862,soil:0x9c9076,green:0x777b51,steel:0x7f9793,asphalt:0x78796e}))k.mat[key].color.setHex(color);
 const box=(g,w,h,d,x,y,z,m,tag)=>k.box(w,h,d,x,y,z,m,'site95-'+tag,0,g);
 k.mat.warmWindow=new THREE.MeshStandardMaterial({color:0xd7b489,emissive:0xffbd79,emissiveIntensity:.42,roughness:.7});
 const blocks=[];
 for(const [i,b]of SITE95_BUILDINGS.entries()){
  const g=new THREE.Group();g.position.set(b.position[0],0,b.position[1]);g.rotation.y=b.yaw;root.add(g);
  const w=b.length,d=b.depth,h=b.floors*3.05+.45,wall=b.family==='brick'?'red':b.family==='panel'?'light':'wall';
  box(g,w,h,d,0,h/2,0,wall,'building');box(g,w+.5,.25,d+.5,0,h+.12,0,'roof','roof');
  box(g,w,.65,d+.12,0,.325,0,'concrete','plinth');
  for(const s of [-1,1]){
   box(g,w+.3,.22,.32,0,h+.25,s*d/2,'light','cornice');
   const n=Math.max(4,Math.round(w/2.6)),step=w/(n+.5);
   for(let j=0;j<n;j++)for(let f=0;f<b.floors;f++){
    const x=-w/2+step*(j+.75),y=2.0+f*3.05,z=s*(d/2+.075),intact=(i+j+f)%4===0;
    // Pale surrounds remain visible around the dark, unlit window openings.
    box(g,1.45,1.9,.12,x,y,z,'light','window-surround');
    box(g,1.19,1.64,.14,x,y,z+s*.075,b.family!=='utility'&&(i*11+j*5+f*3)%7<2?'warmWindow':intact?'glass':'dark','window');
    if(intact)box(g,.07,1.65,.12,x,y,z+s*.16,'light','mullion');
   }
   if(b.family==='panel')for(let f=1;f<b.floors;f++)box(g,w,.09,.04,0,f*3.05+.45,s*(d/2+.04),'concrete','floor-joint');
  }
  for(const s of [-1,1])for(let f=0;f<b.floors;f++)for(const z of [-d*.24,d*.24])box(g,.14,1.65,1.3,s*(w/2+.08),2+f*3.05,z,'dark','end-window');
  const entry=b.entrySide||1;
  for(let x=-w/2+4;x<w/2-1;x+=12){
   box(g,1.45,2.2,.2,x,1.1,entry*(d/2+.12),'dark','entrance');
   box(g,2.6,.18,1.7,x,2.5,entry*(d/2+.75),'light','canopy');
   for(let s=0;s<3;s++)box(g,2.6,.15,.6,x,.075+s*.15,entry*(d/2+1.7-s*.5),'concrete','step');
   box(g,.8,.7,.8,x,h+.6,0,'concrete','vent');
  }
  if(b.family==='panel')for(const s of [-1,1])for(let f=1;f<b.floors;f++){
   box(g,2,.16,1.05,s*(w/2-2),f*3.05+.45,d/2+.52,'concrete','balcony');
   box(g,2,.8,.1,s*(w/2-2),f*3.05+.9,d/2+1,'light','balcony-front');
  }
  blocks.push({...b,height:h});
 }
 // Courtyard paths share the revised building and entrance coordinates.
 const square=new THREE.Group(),sp=P([848,330]);square.position.set(sp[0],0,sp[1]);square.rotation.y=SITE95_YAW;root.add(square);square.updateMatrix();
 const face=(pts,m,tag)=>k.quad(...pts.map(p=>new THREE.Vector3(...p).applyMatrix4(square.matrix).toArray()),m,'site95-'+tag);
 // The white slender monument is reproduced as seen, without assigning an
 // unverified rocket designation or technical dimensions to the object.
 box(square,23,.1,24,0,.05,0,'concrete','square');
 for(const x of [-7,7])box(square,7,.12,16,x,.16,0,'soil','planting-bed');
 box(square,3.2,.3,3.2,0,.25,0,'concrete','monument-step');box(square,2,1.7,2,0,1.25,0,'light','monument-base');
 k.cyl(.48,8.8,0,6.5,0,'white','site95-monument-shaft',0,square);
 for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;const p=t=>[.48*Math.cos(t),10.9,.48*Math.sin(t)];face([p(a),p(b),[0,13.2,0],[0,13.2,0]],'white','monument-tip');}
 for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const c=Math.cos(a),s=Math.sin(a);face([[c*.45,2.1,s*.45],[c*1.1,2.1,s*1.1],[c*1.1,5,s*1.1],[c*.45,7.1,s*.45]],'white','monument-fin');
 }
 for(const z of [-9,9])for(const x of [-7,7]){box(square,3,.18,.75,x,.8,z,'rust','bench');for(const dx of [-1,1])box(square,.15,.7,.6,x+dx,.35,z,'steel','bench-leg');}
 // Paired painted heating mains, raised on white concrete sleepers.
 for(const index of [5,9,12]){
  const b=SITE95_BUILDINGS[index],g=new THREE.Group();g.position.set(b.position[0],0,b.position[1]);g.rotation.y=b.yaw;root.add(g);
  const z=-(b.entrySide||1)*(b.depth/2+4.8);
  for(const s of [-1,1])k.rod([-b.length/2,1.25,z+s*.32],[b.length/2,1.25,z+s*.32],.17,'steel','site95-heating-pipe',g);
  for(let x=-b.length/2;x<=b.length/2;x+=5.5)box(g,.45,1.1,1.5,x,.55,z,'light','pipe-support');
 }
 // A roofless low service ruin and its separate masonry walls, visible in
 // the aerial references: the open interior is actual geometry.
 const ruin=new THREE.Group(),rp=P([610,620]);ruin.position.set(rp[0],0,rp[1]);ruin.rotation.y=SITE95_YAW;root.add(ruin);
 box(ruin,23,.15,10,0,.08,0,'concrete','ruin-floor');
 for(const z of [-5,5]){for(let x=-10;x<=10;x+=4)box(ruin,1.5,3,.45,x,1.5,z,'red','ruin-pier');box(ruin,23,.45,.45,0,3.15,z,'red','ruin-lintel');}
 for(const x of [-11.5,11.5])box(ruin,.45,3.3,10,x,1.65,0,'red','ruin-end-wall');
 for(let i=0;i<12;i++)box(ruin,.5+i%3*.3,.15+i%2*.15,.5+i%4*.2,-9+i*17%19,.25,-3+i*7%7,'concrete','rubble');
 const landscape=buildSite95Landscape(root,k);
 const metadata={version:SITE95_VERSION,reference:SITE95_REFERENCE,buildings:blocks,views:SITE95_VIEWS,anchorPreserved:true,windowLights:true,landscape,condition:'owner-curated historical town interpretation',sourcePhotosPublished:false,dimensionsSurveyed:false};
 root.userData.site95Model=metadata;return {...k.finish(),site95:metadata};
}
