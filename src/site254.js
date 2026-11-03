import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {SITE254_OFFSET_Z,SITE254_VERSION,SITE254_REFERENCE,SITE254_HALL,SITE254_ACCESS,SITE254_RAIL,SITE254_VIEWS} from './site254-layout.js?v=20261103-site254-e10s5';
import {registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';

export function buildSite254(root){
 const k=archiveKit(root),Z=196;
 for(const [name,color]of Object.entries({white:0xe6e7e2,blue:0x157bc2,roof:0x657c87,glass:0x36525d,steel:0x74848c,concrete:0xb6b6a9,asphalt:0x626969,soil:0xb5ab91,leaf:0x657d52})){
  k.mat[name]=(k.mat[name]||k.mat.green).clone();k.mat[name].color.setHex(color);
 }
 const box=(w,h,d,x,y,z,m='white',tag='site254-panel')=>k.box(w,h,d,x,y,z,m,tag);
 // Only authored paving: the surrounding steppe remains the shared landscape.
 k.poly([[-148,76],[-85,76],[-85,327],[85,327],[85,345],[-148,345]],.07,'asphalt','site254-courts');
 k.poly([[-145,150],[-76,150],[-76,272],[-145,272]],.10,'concrete','site254-report-plaza');
 k.path([[-155,160],[-139,160],[-139,290],[-132,320],[-115,337],[90,337],[101,325],[101,75],[88,61],[-60,61],[-80,76],[-80,106]],7,.12,'asphalt','site254-service-road');
 k.poly([[60.5,213],[112,213],[112,241],[60.5,241]],.11,'concrete','site254-rail-apron');
 // Tall, largely blank high bay, with shallow panel joints rather than windows.
 box(121,37,225,0,18.5,Z,'white','site254-main-hall');
 box(122,.55,226,0,37.28,Z,'roof','site254-main-roof');
 for(const y of [8.5,18.2,27.8,35.8]){
  for(const x of [-60.56,60.56])box(.10,.10,225,x,y,Z,'concrete','site254-horizontal-joint');
  for(const z of [83.44,308.56])box(121,.10,.10,0,y,z,'concrete','site254-horizontal-joint');
 }
 for(let z=86;z<308;z+=2.1)for(const x of [-60.56,60.56])box(.08,36,.035,x,18.5,z,'light','site254-cladding-rib');
 for(let x=-59;x<60;x+=2.1)for(const z of [83.44,308.56])box(.035,36,.08,x,18.5,z,'light','site254-cladding-rib');
 for(let x=-58;x<61;x+=8.4)box(.06,.06,225,x,37.59,Z,'steel','site254-roof-seam');
 for(let z=85;z<308;z+=7.5)box(121,.06,.06,0,37.59,z,'steel','site254-roof-seam');
 // Two long raised roof monitors and four orderly rows of exhaust ventilators.
 for(const z of [132,267]){
  box(11.5,4.3,44,10,39.65,z,'blue','site254-roof-monitor');
  box(12.4,.32,45.2,10,41.95,z,'roof','site254-monitor-cap');
  for(const x of [4.2,15.8]){box(.12,2.1,40,x,39.7,z,'dark','site254-monitor-louvre');for(let zz=z-18;zz<z+20;zz+=2.4)box(.2,2.2,.10,x,39.7,zz,'steel','site254-monitor-frame');}
 }
 let ventCount=0;
 for(const x of [-42,-25,32,48])for(let z=96;z<=300;z+=14.5){
  k.cyl(.73,1.65,x,38.38,z,'steel','site254-roof-vent');k.cyl(1.14,.26,x,39.3,z,'dark','site254-vent-cap');
  box(2.2,.13,2.2,x,37.7,z,'roof','site254-vent-flashing');ventCount++;
 }
 // Low office galleries wrap the southwest end and the northwest side.
 box(121,16,11,0,8,314,'white','site254-front-office');
 box(11,16,222,-66,8,195,'white','site254-side-office');
 for(const y of [.65,16.2]){box(121,.48,11.5,0,y,314,'blue','site254-office-trim');box(11.5,.48,222,-66,y,195,'blue','site254-office-trim');}
 const officeWindows=(along,side)=>{
  for(const p of along){
   for(const y of [3.1,7.9,12.7]){
    const x=side?p:-71.62,z=side?319.62:p;
    box(side?1.55:.13,2.5,side?.13:1.55,x,y,z,'glass','site254-office-window');
    box(side?.08:.20,2.55,side?.20:.08,x,y,z,'white','site254-window-mullion');
    box(side?1.7:.30,.13,side?.30:1.7,x,y-1.3,z,'concrete','site254-window-sill');
   }
   box(side?.35:.6,15.2,side?.6:.35,side?p+1.35:-71.88,8,side?319.88:p+1.35,'white','site254-office-pilaster');
  }
 };
 officeWindows(Array.from({length:38},(_,i)=>-57+i*3),true);
 officeWindows(Array.from({length:69},(_,i)=>88+i*3.15),false);
 // Solid blue stair cores: one at the corner, one near the front right and two along the side.
 for(const [x,z,w,d]of [[-64,315,14,15],[39,316,11,15],[-73,225,12,13],[-73,111,12,13]]){
  box(w,21,d,x,10.5,z,'blue','site254-blue-stair-core');box(w+.6,.35,d+.6,x,21.18,z,'roof','site254-stair-roof');
 }
 // Glazed entrance at the foot of the southwest corner core.
 box(10,4.7,5,-79,2.35,311,'glass','site254-public-entrance');
 for(const z of [309.2,311,312.8])box(.2,4.5,.12,-84.12,2.35,z,'white','site254-entrance-mullion');
 box(5,.38,8,-83,4.95,311,'blue','site254-entry-canopy');
 for(let i=0;i<3;i++)box(2.2-i*.5,.18,7.5,-86-i*.3,.12+i*.14,311,'concrete','site254-entry-steps');
 // Separate narrow tall block and lower cross wing on the report-square side.
 box(18,31,63,-110,15.5,166,'white','site254-tall-annex');
 box(18.8,.5,64,-110,31.3,166,'roof','site254-annex-roof');
 box(4.3,24,.18,-110,16,197.65,'glass','site254-annex-glass-block');
 for(let y=4.6;y<28;y+=.65)box(4.4,.05,.24,-110,y,197.78,'concrete','site254-glass-block-joint');
 for(let x=-111.8;x<=-108.1;x+=.65)box(.05,24,.24,x,16,197.78,'concrete','site254-glass-block-joint');
 for(let z=138;z<195;z+=3.5){box(.14,1.5,.8,-119.1,29,z,'glass','site254-annex-top-window');box(.16,21,.22,-119.15,16,z,'light','site254-annex-fin');}
 box(44,8,14,-98,4,129,'white','site254-low-link');box(45,.4,15,-98,8.2,129,'roof','site254-low-link-roof');
 for(let x=-117;x<-78;x+=3)box(2.3,4.8,.14,x,4.6,136.1,'glass','site254-link-window');
 box(55,7.5,21,19,3.75,66,'white','site254-northeast-annex');box(56,.5,22,19,7.75,66,'roof','site254-northeast-roof');
 for(let x=-5;x<=43;x+=4.3)box(2.6,2,.12,x,4.7,55.4,'glass','site254-northeast-window');
 // A shallow satellite dish above the side wing, facing the entrance square.
 const dish=k.direct(new THREE.SphereGeometry(1.9,20,10,0,Math.PI*2,0,.65),'white','site254-satellite-dish');
 dish.geometry.translate(0,-1.9,0);dish.material= dish.material.clone();dish.material.side=THREE.DoubleSide;dish.rotation.z=-.65;dish.position.set(-74,24,225);
 k.rod([-74,21.3,225],[-74,23.2,225],.13,'steel','site254-dish-support');k.rod([-75,23,225],[-76,25,225],.06,'steel','site254-dish-feed');
 // Transport opening on the southeast wall. Shared 1520-mm display rail profile.
 box(.18,13,12,60.68,6.5,227,'dark','site254-transport-recess');
 for(const z of [221,233])box(.32,13.7,.48,60.95,6.9,z,'blue','site254-gate-jamb');
 box(.32,.65,13,60.95,13.6,227,'blue','site254-gate-header');
 for(let z=221.5;z<233;z+=1)box(.20,12.7,.07,60.84,6.5,z,'steel','site254-gate-rib');
 k.rail([[60.5,227],[110,227]],{y:.20,tag:'site254-transport-rail'});
 // Small front-right electrical yard visible in the elevated photograph.
 k.poly([[49,348],[85,348],[85,371],[49,371]],.13,'concrete','site254-substation-base');
 box(8,3.4,6,55,1.7,355,'blue','site254-substation-hut');box(8.5,.22,6.5,55,3.52,355,'roof','site254-substation-roof');
 for(const x of [67,77])for(const z of [353,362]){
  box(3.5,2.1,3,x,1.2,z,'steel','site254-transformer');
  for(let i=-2;i<=2;i++)box(.13,2.1,3.3,x+i*.6,1.2,z,'light','site254-cooling-fin');
  for(const dz of [-.9,0,.9]){k.cyl(.16,1,x,2.9,z+dz,'dark','site254-insulator');k.cyl(.28,.14,x,3.1,z+dz,'concrete','site254-insulator-disc');}
 }
 // Forecourt paths, planting and restrained site fixtures.
 for(const x of [-139,-88])k.path([[x,180],[x,303]],1.8,.15,'concrete','site254-walkway');
 for(const z of [202,273,306])k.path([[-139,z],[-76,z]],1.8,.15,'concrete','site254-cross-path');
 for(const [i,[x,z]]of [[-133,211],[-133,238],[-133,264],[-93,281],[-95,296],[-126,294],[-119,282],[-132,102],[-131,119]].entries()){
  k.cyl(.17,3.8,x,2,z,'rust','site254-tree-trunk');k.sphere(2.8,x,5.5+(i%3)*.3,z,'leaf','site254-tree-crown',[1,1.3,1]);
 }
 // Compact parking markings and cars, kept clear of the report square and doorway.
 for(let x=-118;x<-88;x+=3.2){box(.09,.035,5.4,x,.155,329,'white','site254-parking-line');}
 for(const [i,x]of [-113,-103,-93].entries()){
  box(1.8,1,4.2,x,.8,330,i===1?'dark':'white','site254-car-body');box(1.55,.65,2.2,x,1.55,330,'glass','site254-car-cabin');
  for(const dx of [-.9,.9])for(const dz of [-1.3,1.3])k.sphere(.36,x+dx,.44,330+dz,'dark','site254-car-wheel',[.45,1,1]);
 }
 box(2.4,2.25,6.7,-129,1.6,313,'white','site254-crew-minibus');box(2.48,.85,4.9,-129,2.35,312.8,'glass','site254-minibus-windows');
 for(const x of [-130.2,-127.8])for(const z of [310.9,315])k.sphere(.43,x,.54,z,'dark','site254-minibus-wheel',[.45,1,1]);
 const lamps=[[-141,176],[-141,251],[-125,324],[-48,332],[31,332],[96,288],[96,176],[79,65]];
 for(const [i,[x,z]]of lamps.entries()){
  k.rod([x,.15,z],[x,8,z],.09,'steel','site254-lamp-post');k.rod([x,8,z],[x+1.5,8.5,z],.065,'steel','site254-lamp-arm');box(.9,.20,.4,x+1.5,8.5,z,'light','site254-lamp-head');
  registerFacilityFloodlights(root,{id:'site254-lamp-'+i,target:[x+1.5,.1,z+SITE254_OFFSET_Z],lamps:[{position:[x+1.5,8.4,z+SITE254_OFFSET_Z],normal:[0,-1,0],size:[.7,.3]}]});
 }
 if(typeof document!=='undefined'){
  // Small identification plates; no invented architectural banners.
  k.sign('РКК «ЭНЕРГИЯ»',-84.3,4.15,311,4.5,.65,-Math.PI/2);
 }
 const metadata={version:SITE254_VERSION,reference:SITE254_REFERENCE,unit:'metre',scale:.14,anchorPreserved:true,
  mainHall:SITE254_HALL,officeFloors:3,roofMonitors:2,roofVents:ventCount,stairCores:4,roadPort:SITE254_ACCESS.road,rail:SITE254_RAIL,views:SITE254_VIEWS,
  reconstruction:'exterior-photo-model; annex dimensions and registration are approximate'};
 root.userData.site254Model=metadata;
 const result=k.finish();
 // Translate the complete exterior inside its unchanged geographic compound.
 for(const child of root.children)child.position.z+=SITE254_OFFSET_Z;
 root.updateWorldMatrix(true,true);return {...result,site254:metadata};
}
