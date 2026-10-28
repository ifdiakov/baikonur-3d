import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitOverviewCamera} from '../src/overview-camera.js';
import {FLANK_OUTLINE} from '../src/flank-boundaries.js';

const SCENE_SCALE=3.4/1.45;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const hits=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
function intersects(a,b,r){
 const inside=p=>p[0]>=r.left&&p[0]<=r.right&&p[1]>=r.top&&p[1]<=r.bottom;
 if(inside(a)||inside(b))return true;
 const corners=[[r.left,r.top],[r.right,r.top],[r.right,r.bottom],[r.left,r.bottom]];
 return corners.some((c,i)=>hits(a,b,c,corners[(i+1)%4]));
}
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const cases=[
 {width:1600,height:1000,uiRect:rect(15,15,320,595),heroRect:rect(1035,15,550,440),dockTop:818},
 {width:390,height:844,uiRect:rect(9,9,372,110),heroRect:null,dockTop:690},
 {width:1280,height:800,uiRect:rect(15,15,320,595),heroRect:rect(715,15,550,440),dockTop:618},
 {width:1920,height:1080,uiRect:rect(15,15,320,595),heroRect:rect(1355,15,550,440),dockTop:898}
];
const records=[];
for(const view of cases)for(const topDown of [false,true]){
 const input=JSON.stringify(view),outlineBefore=JSON.stringify(FLANK_OUTLINE);
 const fit=fitOverviewCamera({...view,outline:FLANK_OUTLINE,topDown});
 assert.equal(JSON.stringify(view),input);assert.equal(JSON.stringify(FLANK_OUTLINE),outlineBefore);
 assert.ok([...fit.target,fit.height,fit.depth,fit.maxDistance,fit.altitudeLimit].every(Number.isFinite));
 assert.ok(fit.height>=1200&&fit.altitudeLimit>=fit.height);
 assert.ok(fit.maxDistance>=Math.hypot(fit.height,fit.depth));
 assert.ok(Math.atan2(fit.depth,fit.height)<=Math.PI/3+1e-9,'Camera respects OrbitControls polar-angle limit');
 if(topDown)assert.ok(fit.depth<=.0011);
 const camera=new THREE.PerspectiveCamera(52,view.width/view.height,.1,80000);
 const target=new THREE.Vector3(...fit.target).multiplyScalar(SCENE_SCALE);
 camera.position.copy(target).add(new THREE.Vector3(0,fit.height,fit.depth).multiplyScalar(SCENE_SCALE));
 camera.lookAt(target);camera.updateMatrixWorld(true);
 const pixels=FLANK_OUTLINE.map(([x,y])=>new THREE.Vector3((x-650)*3.4,-1.56,(y-522.5)*3.4).project(camera))
  .map(p=>[(p.x+1)*view.width/2,(1-p.y)*view.height/2]);
 for(let i=0;i<pixels.length;i++){
  const a=pixels[i],b=pixels[(i+1)%pixels.length];
  assert.ok(a[0]>=14&&a[0]<=view.width-14&&a[1]>=14&&a[1]<=view.dockTop-14,'Full outline remains within the visible viewport');
  for(const panel of [view.uiRect,view.heroRect].filter(Boolean)){
   const padded={left:panel.left-8,right:panel.right+8,top:panel.top-8,bottom:panel.bottom+8};
   assert.equal(intersects(a,b,padded),false,`${view.width}×${view.height} ${topDown?'top':'overview'} edge ${i} crosses HUD`);
  }
 }
 const sx=pixels.map(p=>p[0]),sy=pixels.map(p=>p[1]);
 const screenWidth=Math.max(...sx)-Math.min(...sx),screenHeight=Math.max(...sy)-Math.min(...sy);
 assert.ok(screenWidth>=(view.width<=640?view.width*.85:300),'The fit does not hide the contour by shrinking it to a tiny shape');
 if(view.width===1600&&!topDown){assert.deepEqual(fit.target,[290,0,-590]);assert.equal(fit.height,1650);}
 records.push({viewport:[view.width,view.height],topDown,height:fit.height,depth:fit.depth,target:fit.target,screenWidth,screenHeight});
}
console.log('OVERVIEW_CAMERA_PASS',JSON.stringify(records));
