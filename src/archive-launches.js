import * as THREE from 'three';
import {buildProtonPosition} from './proton-launch.js?v=20261101-proton-launch-v1';
import {registerFacilityBeacon} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {flamePetal} from './flame-petals.js';
import {archiveKit,imageAxisYaw,imageFrame} from './archive-kit.js?v=20261031-facilities-rails-lighting-v1';
function ring(k,x,y,z,r,t=.35,m='steel',tag='ring'){const o=k.direct(new THREE.TorusGeometry(r,t,7,48),m,tag);o.rotation.x=Math.PI/2;o.position.set(x,y,z);return o;}
// Image coordinates retain the owner's traced layout. The two explicitly named
// parked service gantries in the stored OSM extract calibrate each image in metres.
// Heights and below-grade structures remain photo-guided interpretations.
export const PROTON_METRIC_REFERENCE=Object.freeze({
 'pad-81':{metresPerPixel:1.2749155586463312,gantrySeparationMetres:538.2695904360893,
  imageAnchors:[[416,447],[754,700]],osmNodeIds:[12191888874,12191888875],
  osmAnchorsLonLat:[[62.9771079,46.0716996],[62.9824176,46.0685674]]},
 'pad-200':{metresPerPixel:1.3288964611149723,gantrySeparationMetres:600.6215086208982,
  imageAnchors:[[425,434],[779,715]],osmNodeIds:[12191898608,12191898607],
  osmAnchorsLonLat:[[63.0293723,46.0376892],[63.0354975,46.034368]]}
});
function protonPosition(parent,x,z,yaw,serviceZ){
 const g=new THREE.Group();g.name='Стартовая позиция Протона';g.position.set(x,0,z);g.rotation.y=yaw;parent.add(g);
 g.userData.archivePart=buildProtonPosition(g,{serviceZ,sharedVehicle:true});return g;
}
export function protonComplex(root,id){
 const k=archiveKit(root),is81=id==='pad-81',reference=PROTON_METRIC_REFERENCE[id]||PROTON_METRIC_REFERENCE['pad-200'],origin=is81?[650,475]:[710,484],m=reference.metresPerPixel,P=imageFrame(origin,m);
 const pads=is81?[[508,238,416,447],[892,504,754,700]]:[[565,261,425,434],[913,556,779,715]];
 const positions=[];for(const [x,z,ex,ez] of pads){const [px,pz]=P([x,z]);positions.push(protonPosition(root,px,pz,imageAxisYaw([x,z],[ex,ez]),Math.hypot(ex-x,ez-z)*m));}root.userData.protonPositions=positions.map((p,i)=>({index:i,localPosition:p.position.toArray(),yaw:p.rotation.y,...p.userData.protonLaunch}));
 const buildings=is81?[[779,322,46,95,-.8],[708,429,31,87,-.6],[544,539,31,89,-.6],[223,697,49,96,.9],[223,783,67,113,.9],[351,490,25,65,-.4],[308,487,17,39,-.4],[326,548,20,46,-.4],[341,603,22,45,-.4],[638,588,23,48,-.6],[482,830,27,45,-.4]]:[[779,390,52,83,-.88],[675,470,31,60,-.6],[540,515,35,99,.86],[629,617,28,57,.84],[1000,649,27,52,-.6],[422,588,22,45,-.6],[197,256,24,48,-.6],[156,274,19,38,-.6],[214,223,18,38,-.6]];
 for(const [ix,iz,w,d,yaw] of buildings){const [x,z]=P([ix,iz]);k.hall({x,z,w:w*m,d:d*m,h:5,yaw,gates:1,windows:false,roof:'concrete',tag:'satellite-service-building'});}
 const routes=is81?[[[150,902],[295,868],[423,715],[451,525],[416,447]],[[295,868],[469,735],[622,716],[754,700]],[[294,868],[511,766],[695,762],[807,731],[892,640]],[[140,927],[177,646],[221,416],[279,128],[721,31],[1110,293],[1190,552],[1005,790],[479,974]]]:[[[45,406],[188,464],[330,476],[425,434]],[[49,406],[234,570],[428,690],[593,751],[779,715]],[[49,406],[255,633],[430,774],[640,839],[795,800],[889,733]]];
 routes.forEach((p,i)=>i<3?k.rail(p.map(P),{gauge:1.52}):k.path(p.map(P),4,.14));const tanks=is81?[[606,414],[621,448],[587,443],[614,384]]:[[634,539],[674,505],[610,572]];tanks.forEach(p=>{const[x,z]=P(p);k.tank(x,z,3.2,6.5);});root.userData.tracedPads=pads.map(p=>p.slice(0,2));
 const physical={units:'metres',localScale:1,planMetresPerPixel:m,planCalibration:'distance-between-two-named-parked-service-gantries',
  planSource:'./data/osm/source-overpass.json.gz',osmNodeIds:reference.osmNodeIds,osmAnchorsLonLat:reference.osmAnchorsLonLat,imageAnchors:reference.imageAnchors,
  gantrySeparationMetres:reference.gantrySeparationMetres,padSeparationMetres:Math.hypot(pads[1][0]-pads[0][0],pads[1][1]-pads[0][1])*m,
  railGaugeMetres:1.52,heightsSurveyed:false,absoluteMapAnchorSurveyed:false,
  referenceVehicle:{name:'Proton-M / Breeze-M, standard 4.1 m fairing',heightMetres:58.2,source:'https://www.ilslaunch.com/launch-vehicle/proton-breeze-m/'}};
 root.userData.physicalUnits=physical;return {...k.finish(),physical};
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
export {buildSite45 as zenit45} from './site45.js?v=20261101-model-inspector-v1';
