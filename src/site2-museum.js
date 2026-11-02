import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {SITE2_VERSION,SITE2_REFERENCE,SITE2_ACCESS,SITE2_BURAN,SITE2_STAIR,SITE2_VIEWS,site2Point as P} from './site2-layout.js?v=20261102-site2-photo-v3';
import {registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {createLightField} from './light-field.js?v=20261028-site41-v1';

import {buildSite2Outdoor} from './site2-outdoor.js?v=20261102-site2-photo-v3';

const YAW=-Math.atan2(137,250);
export function buildSite2Museum(root){
 const k=archiveKit(root);
 for(const [key,color]of Object.entries({cream:0xd9cfae,panelYellow:0xd5ba65,panelGrey:0x777b79,roofRed:0x794c42,paver:0xb79582,vehicle:0x66654d,tires:0x242726,leaf:0x6f7856,sand:0xa99b82})){
  k.mat[key]=k.mat[key==='tires'?'dark':key==='leaf'?'green':'wall'].clone();k.mat[key].color.setHex(color);
 }
 function groupAt(pixel,yaw=0){const g=new THREE.Group(),[x,z]=P(pixel);g.position.set(x,0,z);g.rotation.y=yaw;root.add(g);return g;}
 function labels(text,w,h,parent,position,rotation=[0,0,0],color='#25292b'){
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,side:THREE.DoubleSide});
  if(typeof document!=='undefined'){
   const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.clearRect(0,0,1024,160);ctx.fillStyle=color;ctx.font='900 118px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,83,1000);
   mat.map=new THREE.CanvasTexture(c);mat.map.colorSpace=THREE.SRGBColorSpace;mat.transparent=true;mat.alphaTest=.1;mat.depthWrite=false;
  }
  const key='site2-label-'+Object.keys(k.mat).length;k.mat[key]=mat;
  const m=k.direct(new THREE.PlaneGeometry(w,h),key,'site2-sign',parent);m.position.fromArray(position);m.rotation.set(...rotation);return m;
 }
 const footprint=[[173,400],[258,323],[615,482],[694,341],[956,671],[864,830],[175,482]].map(P);
 k.poly(footprint,.025,'sand','site2-ground');
 // Asphalt perimeter walk and the central garden paths follow the overview.
 const loop=[[180,405],[208,386],[250,403],[544,553],[604,584],[853,723],[875,686],[846,661],[610,531],[267,354],[234,360],[210,389]];
 k.path(loop.map(P),3.5,.10,'asphalt','site2-main-access');
 k.path([[544,553],[573,585],[589,603]].map(P),4,.12,'asphalt','site2-museum-entry-path');
 k.path([[216,459],[390,552],[511,605],[576,632],[835,774],[875,700]].map(P),2.1,.14,'paver','site2-perimeter-footpath');
 k.path([[261,417],[412,495],[574,582]].map(P),2.7,.14,'paver','site2-central-alley');
 for(const [a,b]of [[[350,404],[303,501]],[[492,476],[447,574]],[[529,497],[487,595]]])k.path([a,b].map(P),1.6,.145,'paver','site2-garden-crosswalk');
 // The original network port remains explicitly joined by the visible asphalt.
 const entryCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(...[SITE2_ACCESS.road[0],0,SITE2_ACCESS.road[2]]),...[[208,386],[250,403],[282,420]].map(p=>{const[x,z]=P(p);return new THREE.Vector3(x,0,z);})],false,'centripetal');
 k.path(entryCurve.getPoints(22).map(p=>[p.x,p.z]),6,.102,'asphalt','site2-network-entry');
 // Painted curbs are solid strips, not coplanar decals.
 for(const route of [[[216,459],[390,552],[511,605],[576,632],[835,774]],[[258,347],[610,525],[848,655]]]){
  const pts=route.map(P);for(let i=1;i<pts.length;i++){const[a,b]=[pts[i-1],pts[i]],len=Math.hypot(b[0]-a[0],b[1]-a[1]);k.box(len,.22,.18,(a[0]+b[0])/2,.16,(a[1]+b[1])/2,'paver','site2-curb',-Math.atan2(b[1]-a[1],b[0]-a[0]));}
 }
 // Museum: long two-storey cream volume, low red roof and tiled entrance end.
 const hall=groupAt([716,668],YAW),L=84,W=13.2,H=7.6;
 const box=(w,h,d,x,y,z,m,tag)=>k.box(w,h,d,x,y,z,m,tag,0,hall);
 box(L,H,W,0,H/2,0,'cream','site2-museum-volume');box(L+.7,.32,W+.8,0,H+.16,0,'roofRed','site2-museum-roof');
 for(let x=-40;x<42;x+=3.6){
  for(const z of [-W/2-.11,W/2+.11])for(const y of [2.3,5.5]){
   box(2.0,1.65,.12,x,y,z,'glass','site2-museum-window');box(.09,1.7,.15,x,y,z+Math.sign(z)*.08,'white','site2-museum-mullion');
  }
  box(.09,.06,W+.9,x,H+.34,0,'steel','site2-roof-seam');
 }
 for(const z of [-W/2-.05,W/2+.05]){
  box(L,.48,.12,0,3.9,z,'panelYellow','site2-facade-band');box(L,.3,.12,0,.30,z,'roofRed','site2-plinth');
  for(let yy=.7;yy<7.3;yy+=.35)box(L,.025,.12,0,yy,z,'light','site2-siding-joint');
 }
 // Main portal occupies the west end; the colourful cladding wraps its face.
 for(let col=0;col<8;col++)for(let row=0;row<4;row++){
  const z=-5.775+col*1.65,y=.95+row*1.88;if(Math.abs(z)<3.5&&y<5.7)continue;
  box(.15,1.8,1.63,-42.09,y,z,['white','panelGrey','panelYellow','cream'][(col*7+row*3)%4],'site2-entry-panel');
 }
 box(.2,4.3,5.9,-42.15,2.58,0,'glass','site2-entry-glazing');
 for(const z of [-2.9,0,2.9])box(.27,4.35,.12,-42.3,2.6,z,'steel','site2-entry-mullion');
 box(3.8,.35,7.5,-43.6,5.1,0,'panelGrey','site2-entry-canopy');
 for(const z of [-3.6,3.6])for(const x of [-42.5,-45.3])box(.22,4.7,.22,x,2.5,z,'steel','site2-entry-post');
 for(let i=0;i<3;i++)box(1.2,.17,6.8,-45.8-i*.4,.18+i*.12,0,'concrete','site2-entry-step');
 // East end: pale horizontal strips, small AC unit and caged roof ladder.
 for(let y=1;y<7;y+=1.9)box(.14,1.0,4.3,42.09,y,0,'white','site2-east-end-band');
 box(.65,.65,.8,42.42,4.5,1.7,'light','site2-air-conditioner');
 for(const z of [-2.8,-2.2])k.rod([42.35,.7,z],[42.35,8.5,z],.04,'steel','site2-roof-ladder',hall);
 for(let y=.8;y<8.5;y+=.31)k.rod([42.35,y,-2.8],[42.35,y,-2.2],.035,'steel','site2-roof-ladder-rung',hall);
 for(let x=-40;x<=40;x+=4)for(const z of [-W/2+.2,W/2-.2])k.rod([x,7.8,z],[x,8.6,z],.035,'steel','site2-roof-guard',hall);
 for(const z of [-W/2+.2,W/2-.2])k.rod([-41,8.6,z],[41,8.6,z],.035,'steel','site2-roof-guard',hall);
 // A readable front identification plate, subdued like the photographed facade.
 labels('МУЗЕЙ КОСМОДРОМА',6.2,.55,hall,[-42.22,6.2,0],[0,-Math.PI/2,0]);

 const orbiter=new THREE.Group();orbiter.name='Буран · опоры и правый трап';orbiter.position.set(SITE2_BURAN.position[0],0,SITE2_BURAN.position[2]);orbiter.rotation.y=SITE2_BURAN.yaw;root.add(orbiter);
 const ob=(w,h,d,x,y,z,m,tag)=>k.box(w,h,d,x,y,z,m,tag,0,orbiter);
 k.poly([[-15,-20],[14,-20],[14,20],[-15,20]],.13,'sand','site2-buran-court',orbiter);
 for(const z of [-8.8,6.4]){
  ob(5.6,.32,5.6,0,1.24,z,'vehicle','site2-carrier-deck');
  for(const x of [-2.1,2.1]){
   ob(.35,.5,5.5,x,1.12,z,'vehicle','site2-carrier-chassis');
   for(const dz of [-2.0,-.68,.68,2.0]){
    const tyre=k.direct(new THREE.CylinderGeometry(.45,.45,.32,16),'tires','site2-carrier-wheel',orbiter);tyre.rotation.z=Math.PI/2;tyre.position.set(x,.60,z+dz);
    const hub=k.direct(new THREE.CylinderGeometry(.22,.22,.34,12),'steel','site2-carrier-hub',orbiter);hub.rotation.z=Math.PI/2;hub.position.set(x,.60,z+dz);
   }
  }
  const cradleHeight=z<0?.34:.52;
  for(const x of [-1.5,1.5])ob(.4,cradleHeight,2.5,x,1.4+cradleHeight/2,z,'steel','site2-cradle-support');
 }
 // Closed white stair tunnel, on physical starboard: forward(+Z) x up(+Y)=-X.
 const stair=SITE2_STAIR,run=stair.top[0]-stair.bottom[0],rise=stair.top[1]-stair.bottom[1];
 const z=stair.top[2],half=stair.width/2,at=t=>[stair.bottom[0]+run*t,stair.bottom[1]+rise*t,z];
 for(let i=0;i<stair.steps;i++){
  const t=(i+.5)/stair.steps,[x,y]=at(t);ob(run/stair.steps+.015,.15,stair.width,x,y,z,'concrete','site2-covered-stair-step');
 }
 const b=at(0),t=at(1),head=stair.headroom;
 for(const side of [-1,1]){
  const zz=z+side*half;
  const a=[b[0],b[1]-.1,zz],c=[t[0],t[1]-.1,zz],d=[t[0],t[1]+head,zz],e=[b[0],b[1]+head,zz];
  if(side===1)k.quad(a,c,d,e,'white','site2-stair-side',orbiter);else k.quad(e,d,c,a,'white','site2-stair-side',orbiter);
  k.rod([b[0],b[1]+1,zz-side*.10],[t[0],t[1]+1,zz-side*.10],.035,'steel','site2-stair-handrail',orbiter);
 }
 k.quad([b[0],b[1]+head,z+half],[t[0],t[1]+head,z+half],[t[0],t[1]+head,z-half],[b[0],b[1]+head,z-half],'white','site2-stair-roof',orbiter);
 ob(.55,.16,stair.width,-2.78,5.1,z,'steel','site2-stair-landing');
 // Dark interior at the doorway; the bottom entrance remains visibly open.
 const threshold=k.direct(new THREE.PlaneGeometry(stair.width,head),'dark','site2-stair-upper-door',orbiter);threshold.rotation.y=-Math.PI/2;threshold.position.set(-2.69,5.1+head/2,z);
 const door=k.direct(new THREE.BoxGeometry(.06,head,stair.width*.5),'white','site2-stair-open-door',orbiter);door.position.set(b[0]-.42,head/2+.14,z+half+.16);door.rotation.y=.68;
 labels('БУРАН',4.8,.95,orbiter,[-8.7,3.75,z+half+.035],[0,0,Math.atan2(rise,run)]);
 // Visitor paths stop at the foot of the tunnel and wrap the transporter court.
 k.path([[-14,7.6],[-17,7.6],[-17,21],[13,21],[16,14]],1.7,.16,'paver','site2-buran-visitor-path',orbiter);
 for(const [x,z]of [[-17,7.6],[12,16],[-13,-18]]){ob(.1,1,.1,x,.65,z,'steel','site2-exhibit-plaque-post');ob(.8,.45,.08,x,1.3,z,'cream','site2-exhibit-plaque');}

 // Monument and formal western garden, preserving the overview's layout.
 const [gx,gz]=P([404,510]);k.cyl(8.3,.13,gx,.15,gz,'paver','site2-gagarin-circle');k.cyl(5.9,.14,gx,.17,gz,'sand','site2-gagarin-circle-inset');
 k.box(1.5,3,1.5,gx,1.7,gz,'concrete','site2-monument-pedestal');k.cyl(.42,1.6,gx,3.9,gz,'steel','site2-monument-figure');k.sphere(.31,gx,4.95,gz,'steel','site2-monument-head');
 for(const side of [-1,1])k.rod([gx+side*.32,4.4,gz],[gx+side*.5,3.6,gz+.05],.10,'steel','site2-monument-arm');
 const [rx,rz]=P([272,444]);k.cyl(1.15,.35,rx,.3,rz,'concrete','site2-rocket-plinth');k.cyl(.32,6.6,rx,3.8,rz,'white','site2-entrance-rocket');
 const cone=k.direct(new THREE.ConeGeometry(.32,1.3,12),'light','site2-entrance-rocket-nose');cone.position.set(rx,7.75,rz);
 for(const side of [-1,1])for(const axis of [0,1]){const dx=axis?0:side*.38,dz=axis?side*.38:0;k.cyl(.16,2.5,rx+dx,1.75,rz+dz,'white','site2-entrance-rocket-booster');}

 const outdoor=buildSite2Outdoor(k,root,YAW);
 const vehicles=outdoor.vehicles;
 // Low fence, sparse trees, benches and the photographed single-arm lamps.
 const fence=[[180,385],[258,323],[615,482],[694,341],[956,671],[864,830],[175,482],[179,416]];
 for(let i=1;i<fence.length;i++){
  const a=P(fence[i-1]),b=P(fence[i]),length=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]);
  k.box(length,1.65,.12,(a[0]+b[0])/2,1,(a[1]+b[1])/2,'steel','site2-perimeter-fence',yaw);
  for(let d=0;d<length;d+=4.2){const t=d/length;k.box(.25,2.15,.25,a[0]+(b[0]-a[0])*t,1.1,a[1]+(b[1]-a[1])*t,'paver','site2-fence-post');}
 }
 const treePixels=[[284,376],[315,393],[389,428],[450,460],[551,512],[565,576],[564,615],[616,625],[644,638],[675,655],[730,683],[780,705],[830,730],[648,567],[688,588],[760,627],[849,681],[285,467],[328,491],[470,565],[510,586],[598,489],[685,399],[716,424],[822,598]];
 for(const [i,p]of treePixels.entries()){
  let[x,z]=P(p);const c=Math.cos(YAW),s=Math.sin(YAW),dx=x-hall.position.x,dz=z-hall.position.z,lx=dx*c-dz*s;let lz=dx*s+dz*c;
  if(Math.abs(lx)<L/2+3&&Math.abs(lz)<W/2+4){lz=Math.sign(lz||-1)*(W/2+4);x=hall.position.x+lx*c+lz*s;z=hall.position.z-lx*s+lz*c;}
  const height=4.8+(i%5)*.45;k.cyl(.13,height*.65,x,height*.33,z,'rust','site2-tree-trunk');
  for(const [dx,dz,dy]of [[-1.1,0,0],[1.1,.25,.2],[0,-.5,1.1]])k.sphere(1.8,x+dx,height+dy,z+dz,'leaf','site2-tree-crown',[1.2,1,1.1]);
 }
 const lamps=[];
 for(const p of [[223,425],[361,493],[490,563],[577,610],[674,669],[806,741],[872,666],[749,565],[644,503],[682,375]]){
  const[x,z]=P(p);k.rod([x,.2,z],[x,5.7,z],.075,'steel','site2-lamp-post');k.rod([x,5.7,z],[x+.8,6.1,z],.055,'steel','site2-lamp-arm');k.box(.55,.16,.3,x+.8,6.12,z,'light','site2-lamp-head');lamps.push({position:[x+.8,6.0,z],normal:[0,-1,0],size:[.45,.2]});
 }
 lamps.forEach((lamp,i)=>registerFacilityFloodlights(root,{id:'site2-museum-lamp-'+i,target:[lamp.position[0],.14,lamp.position[2]],lamps:[lamp]}));
 // Night lighting follows Site 2 when its museum anchor is relocated.
 // One batched point field gives distant visibility without ten real-time lights.
 const site2LightField=createLightField(root,lamps.map((lamp,i)=>({
  x:lamp.position[0],y:lamp.position[1],z:lamp.position[2],height:0,
  color:0xffd3a0,size:10,brightness:1.6
 })),{name:'Площадка №2 · освещение территории',minPixels:4.4});
 // Two real light sources gently pick out the Buran and the starboard stairs.
 for(const [name,position,target,intensity,range] of [
  ['Буран',[18,14,21],[35,5,0],4.8,85],
  ['Правый трап',[12,10,-9],[32,4,-7],3.2,48]
 ]){
  const lamp=new THREE.SpotLight(0xffdfb5,intensity,range,Math.PI/5,.65,1.5);
  lamp.name='Пл. 2 · подсветка '+name;
  lamp.position.set(...position);lamp.target.position.set(...target);
  lamp.castShadow=false;root.add(lamp,lamp.target);
 }
 root.userData.site2Lighting={lamps:lamps.length,accentLights:2,batch:site2LightField.root.name};

 for(const p of [[368,502],[433,537],[528,577]]){const[x,z]=P(p);k.box(2.3,.18,.65,x,.7,z,'rust','site2-bench-seat',YAW);k.box(2.3,.65,.10,x,1,z+.25,'rust','site2-bench-back',YAW);}
 const metadata={version:SITE2_VERSION,reference:SITE2_REFERENCE,unit:'metre',scale:.14,anchorPreserved:true,footprint,roadPort:SITE2_ACCESS.road,buran:{...SITE2_BURAN},stair:{...SITE2_STAIR},building:{center:[hall.position.x,0,hall.position.z],yaw:YAW,dimensions:[L,H,W]},vehicles,outdoorExhibits:outdoor.exhibits,views:SITE2_VIEWS,asset:{status:'pending'}};
 root.userData.site2Model=metadata;
 // All authored site fixtures are static. Bake nested custom wheels/faces so
 // archiveKit can merge them by material alongside the instanced primitives.
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),direct=[];
 root.traverse(o=>{if(o.isMesh&&o.parent!==root)direct.push(o);});
 for(const o of direct){o.geometry.applyMatrix4(inverse.clone().multiply(o.matrixWorld));root.add(o);o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1);}
 return {...k.finish(),site2:metadata};
}
