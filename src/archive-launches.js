import * as THREE from 'three';
import {flamePetal} from './flame-petals.js';
import {archiveKit,imageAxisYaw,imageFrame} from './archive-kit.js?v=20261028-museum4-osm-live-v1';
function ring(k,x,y,z,r,t=.35,m='steel',tag='ring'){const o=k.direct(new THREE.TorusGeometry(r,t,7,48),m,tag);o.rotation.x=Math.PI/2;o.position.set(x,y,z);return o;}
function protonPosition(parent,x,z,yaw,scale=1){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=yaw;g.scale.setScalar(scale);parent.add(g);const k=archiveKit(g);k.pit(0,0,13,13,24);
 for(const s of [-1,1]){k.box(23,1,64,s*26,.5,0,'concrete','launch-apron-side');k.box(32,1,19,0,.5,s*24,'concrete','launch-apron-end');}
 ring(k,0,2,0,12,.6,'steel','proton-launch-ring');
 for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*13,z=Math.sin(a)*13;k.rod([x,1,z],[x*.67,6,z*.67],.8,'steel','proton-launch-support');k.box(4,2,4,x,2,z,'yellow','support-base');}
 for(const s of [-1,1]){k.hall({x:s*32,z:56,w:19,d:69,h:7,gates:0,windows:false,roof:'concrete',tag:'proton-flanking-service-block'});k.path([[s*44,-32],[s*48,35],[s*46,99],[s*13,115]],5,.15);k.rod([s*20,2,4],[s*20,2,100],.8,'light','long-process-pipe');for(let zz=15;zz<96;zz+=10)k.box(2,2,2,s*20,1,zz,'concrete','pipe-support');}
 k.lattice(0,92,58,13,14,{levels:10,deck:true,tag:'proton-service-tower'});
 for(let y=12;y<56;y+=8){k.box(12,.6,9,0,y,84,'steel','service-tower-platform');for(const x of [-5,5])k.rod([x,y+1,80],[x,y+1.5,80],.09,'yellow','tower-guardrail');}
 k.box(12,11,1,0,46,99,'light','service-tower-cladding');for(const [mx,mz] of [[-50,-43],[50,-43],[-53,95],[53,95]])k.lattice(mx,mz,78,4,4,{levels:13,tag:'lightning-mast'});k.rail([[0,130],[0,91],[0,0]]);g.userData.archivePart=k.finish();
}
export function protonComplex(root,id){
 const k=archiveKit(root),is81=id==='pad-81',origin=is81?[650,475]:[710,484],P=imageFrame(origin,.4);
 const pads=is81?[[508,238,416,447],[892,504,754,700]]:[[565,261,425,434],[913,556,779,715]];
 for(const [x,z,ex,ez] of pads){const [px,pz]=P([x,z]);protonPosition(root,px,pz,imageAxisYaw([x,z],[ex,ez]),.62);}
 const buildings=is81?[[779,322,46,95,-.8],[708,429,31,87,-.6],[544,539,31,89,-.6],[223,697,49,96,.9],[223,783,67,113,.9],[351,490,25,65,-.4],[308,487,17,39,-.4],[326,548,20,46,-.4],[341,603,22,45,-.4],[638,588,23,48,-.6],[482,830,27,45,-.4]]:[[779,390,52,83,-.88],[675,470,31,60,-.6],[540,515,35,99,.86],[629,617,28,57,.84],[1000,649,27,52,-.6],[422,588,22,45,-.6],[197,256,24,48,-.6],[156,274,19,38,-.6],[214,223,18,38,-.6]];
 for(const [ix,iz,w,d,yaw] of buildings){const [x,z]=P([ix,iz]);k.hall({x,z,w:w*.4,d:d*.4,h:5,yaw,gates:1,windows:false,roof:'concrete',tag:'satellite-service-building'});}
 const routes=is81?[[[150,902],[295,868],[423,715],[451,525],[416,447]],[[295,868],[469,735],[622,716],[754,700]],[[294,868],[511,766],[695,762],[807,731],[892,640]],[[140,927],[177,646],[221,416],[279,128],[721,31],[1110,293],[1190,552],[1005,790],[479,974]]]:[[[45,406],[188,464],[330,476],[425,434]],[[49,406],[234,570],[428,690],[593,751],[779,715]],[[49,406],[255,633],[430,774],[640,839],[795,800],[889,733]]];
 routes.forEach((p,i)=>i<3?k.rail(p.map(P)):k.path(p.map(P),4,.14));const tanks=is81?[[606,414],[621,448],[587,443],[614,384]]:[[634,539],[674,505],[610,572]];tanks.forEach(p=>{const[x,z]=P(p);k.tank(x,z,3.2,6.5);});root.userData.tracedPads=pads.map(p=>p.slice(0,2));return k.finish();
}
export function energia110(root){
 const k=archiveKit(root),P=imageFrame([589,484],.42),centres=[[442,492],[727,710]];
 for(const [ix,iz]of centres){const[x,z]=P([ix,iz]);k.pit(x,z,25,25,28);
  for(const angle of [-2.12,.0,2.12])flamePetal(k,{x,z,angle,length:64,width:23,depth:28});
  for(const side of [-1,1]){const gx=x+side*14,gz=z-9;k.lattice(gx,gz,60,11,15,{levels:12,deck:true,tag:'energia-service-pylon'});k.box(8,22,1,gx,36,gz-7.5,'light','service-pylon-cladding');
   for(let y=10;y<57;y+=6){k.box(16,.45,9,gx-side*3,y,gz+4,'steel','energia-open-service-platform');for(const dz of [-.5,8.5]){k.rod([gx-8,y+1.2,gz+dz],[gx+8,y+1.2,gz+dz],.09,'yellow','platform-handrail');for(let dx=-8;dx<=8;dx+=4)k.rod([gx+dx,y,gz+dz],[gx+dx,y+1.2,gz+dz],.07,'yellow','platform-post');}}
   for(const z0 of [-27,27])k.box(15,3,9,x+side*27,1.5,z+z0,'concrete','launch-bridge-pier');
   k.box(11,3,67,x+side*27,3,z,'concrete','launch-service-bridge');
   k.rod([gx,8,gz],[gx,59,gz],.45,'light','vertical-feed-main');
  }
  ring(k,x,6,z,12,.7,'steel','energia-service-ring');
  for(let i=0;i<8;i++){const a=i*Math.PI/4;k.box(3,2.5,3,x+Math.cos(a)*13,5,z+Math.sin(a)*13,'yellow','energia-launch-support');}
  for(const[dx,dz]of[[-45,-31],[36,-43],[-39,42],[40,42]]){k.lattice(x+dx,z+dz,84,4,4,{levels:14,tag:'energia-lightning-mast'});k.rod([x+dx,84,z+dz],[x+dx,90,z+dz],.11,'red','lightning-tip');}
 }
 root.userData.flamePetals={perLaunch:3,launches:2,belowGrade:true};
 const buildings=[[680,63,80,131,58],[814,155,88,116,58],[739,402,73,170,7],[653,525,60,100,6],[589,604,56,100,5],[528,685,50,89,5],[365,790,73,118,6],[366,892,33,98,5],[866,532,36,102,6],[821,489,34,102,6],[482,302,31,89,5],[519,309,30,88,5]];
 for(const[ix,iz,w,d,h]of buildings){const[x,z]=P([ix,iz]);k.hall({x,z,w:w*.42,d:d*.42,h:h>50?25:h,yaw:.63,gates:1,windows:false,tag:'energia-technical-building'});}
 for(const pts of[[[204,956],[271,806],[349,652],[442,492]],[[318,992],[476,849],[620,801],[727,710]],[[410,538],[596,269],[692,97]],[[743,700],[857,491],[939,351],[779,239],[657,172]],[[150,179],[88,298],[71,831],[179,939]]])k.rail(pts.map(P));k.path([[245,950],[333,793],[477,588],[613,424],[730,288],[938,350],[1030,510]].map(P),7,.13);root.userData.tracedPads=centres;return k.finish();
}
export function soyuz31(root){
 const k=archiveKit(root);k.pit(0,0,29,35,30);
 for(const s of[-1,1])k.box(16,2,71,s*31,1,5,'concrete','soyuz-launch-bridge');for(const z of[-29,37])k.box(52,2,13,0,1,z,'concrete','soyuz-cross-deck');ring(k,0,5,0,15,1.1,'green','open-soyuz-launch-ring');
 for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,x=Math.cos(a)*18,z=Math.sin(a)*18;k.rod([x,5,z],[x*.55,20,z*.55],1,'green','tulip-support-arm');k.rod([x*1.6,3,z*1.6],[x,15,z],.6,'steel','support-arm-hydraulic');}
 for(const s of[-1,1]){k.lattice(s*22,28,48,7,8,{levels:9,deck:true,material:'green',tag:'soyuz-service-gantry'});for(let y=12;y<46;y+=7){k.box(11,.6,8,s*17,y,26,'green','folding-service-balcony');k.rod([s*22,y+1,21],[s*12,y+1,21],.08,'yellow','service-railing');}}
 for(const[x,z]of[[-70,-48],[70,-48]])k.lattice(x,z,88,5,5,{levels:15,tag:'soyuz-lightning-mast'});k.rail([[0,174],[0,42],[0,3]]);k.path([[-59,139],[-51,57],[-47,-44],[57,-44],[60,133]],6,.1);k.hall({x:61,z:91,w:22,d:40,h:7,roof:'blue',gates:1,tag:'soyuz-service-house'});root.userData.orientationNote='No overhead of Site 31 in the satellite folder; azimuth remains schematic.';return k.finish();
}
export function zenit45(root){
 const k=archiveKit(root);k.cutouts.push({x:0,z:0,rx:26,rz:51,yaw:0,shape:'rectangle'});k.poly([[-26,-51],[26,-51],[26,51],[-26,51]],-27,'dark','zenit-flame-well-floor');
 for(const s of[-1,1]){k.quad([s*26,0,-51],[s*26,0,51],[s*22,-27,46],[s*22,-27,-46],'green','green-flame-well-wall');k.box(11,3,108,s*31.5,1.5,0,'green','zenit-bridge-side');k.rod([s*27,4,-53],[s*27,4,53],.12,'red','red-flame-well-handrail');for(let z=-50;z<=50;z+=5)k.rod([s*27,3,z],[s*27,4,z],.1,'red','handrail-post');}
 for(const z of[-54,54])k.box(74,3,9,0,1.5,z,'concrete','zenit-cross-bridge');for(let i=0;i<18;i++){const a=i/18*Math.PI/2,b=(i+1)/18*Math.PI/2;k.quad([-21,-27+22*(1-Math.cos(a)),-42+28*Math.sin(a)],[21,-27+22*(1-Math.cos(a)),-42+28*Math.sin(a)],[21,-27+22*(1-Math.cos(b)),-42+28*Math.sin(b)],[-21,-27+22*(1-Math.cos(b)),-42+28*Math.sin(b)],'dark','curved-flame-deflector');}
 for(const[x,z]of[[-75,-70],[75,-70],[-75,70],[75,70]])k.lattice(x,z,73,4,4,{levels:12,tag:'zenit-lightning-tower'});k.lattice(44,-20,42,7,9,{levels:8,deck:true,tag:'zenit-fixed-service-mast'});k.box(7,18,8,44,36,-20,'green','zenit-mast-top');k.rail([[0,145],[0,60]]);k.hall({x:78,z:102,w:23,d:50,h:7,roof:'blue',gates:1,tag:'zenit-utility-building'});return k.finish();
}
