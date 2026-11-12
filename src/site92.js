import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {SITE92_VERSION,SITE92_YAW,SITE92_SHIFT,SITE92_HALLS,site92Point,site92HallPosition} from './site92-layout.js?v=20261111-v1';
// Satellite plan + owner's facade photo. Fine dimensions are interpretive.
export function buildSite92(root){
 const k=archiveKit(root),P=site92Point,buildingBounds=[];
 for(const [i,row] of SITE92_HALLS.entries()){
  const [x,z]=site92HallPosition(i),w=row[2]*.6,d=row[3]*.6,h=row[4];
  buildingBounds.push({id:'hall-'+i,x,z,width:w+.95,depth:d+1,yaw:SITE92_YAW});
  const hall=k.hall({x,z,w,d,h,yaw:SITE92_YAW,roof:i<2?'blue':i===5?'dark':'roof',wall:i<2?'concrete':'light',floors:i<2?3:2,gates:i<2?0:1,monitor:false,tag:'site92-hall-'+i});
  if(i>=2)continue;
  // Photo: large yellow lifting-door field, pale pedestrian/rail access below,
  // grey concrete pylons and exposed winding truss above each gate.
  const front=d/2+.48,gw=w*.74,gh=h*.59;
  k.box(gw,gh,.32,0,h*.64,front,'yellow','site92-yellow-gate',0,hall);
  for(let yy=h*.35;yy<h*.95;yy+=2.1)k.box(gw,.08,.09,0,yy,front+.21,'steel','site92-gate-horizontal-seam',0,hall);
  for(const xx of [-gw/2-.9,gw/2+.9]){
   k.box(1.5,h+1,1.25,xx,(h+1)/2,front-.15,'light','site92-gate-pylon',0,hall);
   for(let yy=3;yy<h;yy+=3.2)k.box(.38,.65,.10,xx,yy,front+.55,'dark','site92-pylon-recess',0,hall);
  }
  const lowWidth=gw*.34,lowHeight=h*.27;
  k.box(lowWidth+.6,lowHeight+.4,.15,0,lowHeight/2,front+.23,'dark','site92-low-door-recess',0,hall);
  k.box(lowWidth,lowHeight,.18,0,lowHeight/2,front+.34,'light','site92-low-door',0,hall);
  k.box(.10,lowHeight,.08,0,lowHeight/2,front+.47,'steel','site92-low-door-seam',0,hall);
  for(const xx of [-gw*.31,gw*.31])k.box(2.4,3,.20,xx,1.5,front+.25,'light','site92-personnel-door',0,hall);
  // Open steel winding frames, not solid roof cubes.
  const trussW=gw*.88,ty=h+7,tz=front-3.0;
  for(const zz of [tz-1.5,tz+1.5]){
   k.rod([-trussW/2,h,zz],[-trussW/2,ty,zz],.17,'steel','site92-winch-upright',hall);
   k.rod([trussW/2,h,zz],[trussW/2,ty,zz],.17,'steel','site92-winch-upright',hall);
   k.rod([-trussW/2,ty,zz],[trussW/2,ty,zz],.17,'steel','site92-winch-top',hall);
   for(let j=0;j<4;j++){
    const a=-trussW/2+j*trussW/4,b=a+trussW/4;
    k.rod([a,ty,zz],[(a+b)/2,h+.5,zz],.11,'steel','site92-winch-diagonal',hall);
    k.rod([(a+b)/2,h+.5,zz],[b,ty,zz],.11,'steel','site92-winch-diagonal',hall);
   }
  }
  for(const xx of [-trussW/2,0,trussW/2])k.rod([xx,ty,tz-1.5],[xx,ty,tz+1.5],.14,'steel','site92-winch-tie',hall);
  for(let zz=-d/2+16;zz<d/2-20;zz+=30)k.box(2.8,.8,3.8,0,h+1,zz,'steel','site92-roof-vent',0,hall);
  // Front apron extends over the vacated footprint; fixed external routes stay
  // in place, while the last approach continues toward the moved doorway.
  k.box(w+8,.18,68,0,.06,d/2+34,'concrete','site92-gate-apron',0,hall);
 }
 for(const p of [[443,180],[416,211],[457,141]]){const[x,z]=P(p);k.tank(x,z,3.2,9);}
 const oldRails=[[[1280,949],[1150,802],[1000,653],[850,540],[807,508]],[[1280,949],[1137,778],[991,623],[861,527]],[[1280,949],[1120,733],[1034,582],[1080,420],[1305,322]],[[1248,924],[1020,824],[845,729],[740,632]],[[20,706],[214,842],[435,971]]];
 oldRails.forEach((row,i)=>{
  const points=row.map(P);
  if(i<2){
   const [x,z]=site92HallPosition(i),halfDepth=SITE92_HALLS[i][3]*.3,
    gate=[x+Math.sin(SITE92_YAW)*(halfDepth+1.0),z+Math.cos(SITE92_YAW)*(halfDepth+1.0)],
    approach=[gate[0]+Math.sin(SITE92_YAW)*35,gate[1]+Math.cos(SITE92_YAW)*35];
   // Preserve all source-side points up to the existing yard junction.
   const start=points.at(-1),previous=points.at(-2),length=Math.hypot(start[0]-previous[0],start[1]-previous[1]),
    c1=[start[0]+(start[0]-previous[0])/length*22,start[1]+(start[1]-previous[1])/length*22],
    curve=new THREE.CubicBezierCurve3(new THREE.Vector3(start[0],0,start[1]),new THREE.Vector3(c1[0],0,c1[1]),new THREE.Vector3(approach[0],0,approach[1]),new THREE.Vector3(gate[0],0,gate[1]));
   points.push(...curve.getPoints(32).slice(1).map(p=>[p.x,p.z]));
  }
  k.rail(points,{tag:'site92-rail-'+i});
 });
 k.path([[132,90],[273,180],[417,302],[374,397],[736,685],[987,758]].map(P),7,.16);
 k.path([[418,302],[550,177],[704,97],[975,202],[1077,431],[901,638]].map(P),5,.14);
 const model={version:SITE92_VERSION,mainBuildingShiftMetres:[...SITE92_SHIFT],worldShiftAtMuseumScale:SITE92_SHIFT.map(n=>n*.14),buildings:buildingBounds,photo:'15RCfLb_ARg-2EvRqjBO-BOmfMSX0OwvH',satellite:'1eVJZ3hWXMuNqe-zMPDXJzRMUUfNS5KQs',sourcePhotosPublished:false,dimensionsSurveyed:false,externalRoadsMoved:false};
 root.userData.site92Model=model;root.userData.tracedAxes=[{part:'two-main-halls',a:[580,280],b:[838,478]}];
 return {...k.finish(),site92:model};
}
