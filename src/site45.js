import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {registerFacilityBeacon,registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {createZenitRocket} from './zenit-rocket.js?v=20261101-model-inspector-v1';
export const SITE45_VERSION='site45-photo-v2';
export const SITE45_VIEWS={
 all:{target:[0,16,30],eye:[135,125,-170]},rocket:{target:[0,30,0],eye:[62,48,-80]},
 trench:{target:[0,-5,-22],eye:[28,21,-86]},tower:{target:[0,25,110],eye:[65,50,160]},top:{target:[0,0,30],eye:[0,220,30.01]}
};
export function buildSite45(root,{rocket=true}={}){
 const k=archiveKit(root);k.mat.green.color.set('#4c9180');k.mat.red.color.set('#bc7376');k.mat.white.color.set('#e8e8dd');k.mat.concrete.color.set('#b0a99b');
 for(const m of ['green','concrete','dark'])k.mat[m].side=THREE.DoubleSide;
 const deck=4.2,half=7.2,depth=16;
 k.cutouts.push({x:0,z:-29,rx:half,rz:41,yaw:0,shape:'rectangle'});
 // Open channel, not a black decal: vertical walls, recessed floor and a
 // curved steel deflector beneath the launch aperture. Heights are inferred.
 k.poly([[-half,-70],[half,-70],[half,12],[-half,12]],-depth,'dark','zenit-channel-floor');
 for(const side of [-1,1]){
  const x=side*half;k.quad([x,deck,12],[x,0,-70],[x,-depth,-70],[x,-depth,12],'concrete','zenit-channel-wall');
  k.quad([x-side*.025,deck,12],[x-side*.025,deck,-14],[x-side*.025,-6,-14],[x-side*.025,-6,12],'green','painted-inner-wall');
  k.box(8,10.2,28,side*11.2,-.9,0,'green','launch-bunker');
  for(let z=-12;z<14;z+=3.5)for(let y=-5.5;y<4;y+=2.2){k.box(.045,.035,3.3,side*7.17,y,z,'steel','wall-plate-seam');}
  k.box(2.0,3.0,.14,side*11.1,-4.2,-14.1,'steel','bunker-service-door');
  for(let y=-5.4;y<-2.9;y+=.5)k.box(1.65,.07,.15,side*11.1,y,-14.2,'light','door-stiffener');
  k.box(14,.22,139,side*22,.02,67,'concrete','approach-apron');
  for(let z=-1;z<135;z+=5)k.box(13.7,.018,.025,side*22,.142,z,'steel','apron-slab-joint');
  // Bank slopes outside the tall green sides of the launch structure.
  k.quad([side*15.2,4.2,-14],[side*15.2,4.2,14],[side*29,0,24],[side*29,0,-27],'concrete','bunker-bank-slope');
  for(let z=-14;z<=14;z+=2){k.rod([side*7.8,4.2,z],[side*7.8,5.3,z],.035,'red','deck-railing-post');}
  for(const y of [4.75,5.3])k.rod([side*7.8,y,-14],[side*7.8,y,14],.038,'red','deck-railing');
  for(let z=-68;z<-16;z+=2.5){k.rod([side*7.7,0,z],[side*7.7,1.05,z],.032,'red','channel-railing-post');}
  for(const y of [.55,1.05])k.rod([side*7.7,y,-69],[side*7.7,y,-16],.035,'red','channel-railing');
  // Exterior maintenance rails run along the channel coping.
  k.box(.12,.14,54,side*7.5,.03,-42,'rust','channel-maintenance-rail');
 }
 for(let i=0;i<24;i++){
  const a=i/24*Math.PI/2,b=(i+1)/24*Math.PI/2;
  const p=t=>[1.0-17*(1-Math.cos(t)),2-18*Math.sin(t)];
  const [za,ya]=p(a),[zb,yb]=p(b);
  k.quad([-6.8,ya,za],[6.8,ya,za],[6.8,yb,zb],[-6.8,yb,zb],'steel','curved-steel-deflector');
 }
 // Channel terminates in a gradual concrete ramp, visible in ref-10.
 k.quad([-7.1,-16,-31],[7.1,-16,-31],[7.1,-.15,-70],[-7.1,-.15,-70],'concrete','channel-outlet-ramp');
 for(let i=1;i<12;i++){const z=-31-i*39/12,y=-16+i*15.85/12;k.rod([-7.08,y+.015,z],[7.08,y+.015,z],.025,'steel','ramp-slab-seam');}
 // Launch deck with a real round opening under the four engine chambers.
 const shape=new THREE.Shape();shape.moveTo(-15.2,-14);shape.lineTo(15.2,-14);shape.lineTo(15.2,14);shape.lineTo(-15.2,14);shape.closePath();
 const aperture=new THREE.Path();aperture.absarc(0,0,3.15,0,Math.PI*2,true);shape.holes.push(aperture);
 const deckGeo=new THREE.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:false,curveSegments:48});deckGeo.rotateX(-Math.PI/2);deckGeo.translate(0,deck-.65,0);k.direct(deckGeo,'green','deck-with-open-launch-aperture');
 for(const z of [-12.5,11.5])k.box(14.4,2.0,1.1,0,deck-1,z,'green','deep-launch-deck-beam');
 k.rod([-7.1,deck-.3,-12],[7.1,deck-.3,-12],.32,'green','bridge-process-pipe');
 for(const x of [-2.5,2.5])for(const z of [-2.5,2.5]){k.box(1.0,.6,1,x,deck+.3,z,'steel','rocket-support');k.box(.7,.22,.7,x,deck+.7,z,'green','rocket-hold-down');}
 const ring=k.direct(new THREE.TorusGeometry(3.2,.16,8,64),'steel','launch-aperture-rim');ring.rotation.x=Math.PI/2;ring.position.y=deck+.08;
 // Rail approach and the remote payload access tower, as seen behind the arm.
 k.quad([-15,deck+.02,14],[15,deck+.02,14],[15,.02,145],[-15,.02,145],'concrete','rail-approach-apron');
 const railRamp=new THREE.Group();railRamp.position.set(0,0,145);railRamp.rotation.x=Math.atan(deck/128);root.add(railRamp);k.rail([[0,0],[0,-Math.hypot(128,deck)]],{y:.30,parent:railRamp});
 k.path([[78,128],[43,128],[34,94],[31,24]],9,.1,'asphalt','site45-access-road');
 const towerZ=110;
 for(const side of [-1,1])for(const z of [towerZ-5,towerZ+5]){
  k.rod([side*7,0,z],[side*4,40,z],.7,'concrete','access-tower-tapered-leg');
  k.box(3,.65,3,side*7,.2,z,'concrete','access-tower-footing');
 }
 for(const y of [8,17,26,35,40]){
  for(const z of [towerZ-5,towerZ+5])k.box(12,.9,1.2,0,y,z,'concrete','access-tower-crossbeam');
  for(const x of [-5.2,5.2])k.box(1.3,.35,11,x,y+.7,towerZ,'steel','access-tower-gallery');
 }
 k.box(8.5,20,10,0,49.6,towerZ,'light','payload-access-enclosure');
 for(let y=40;y<59;y+=4)for(const x of [-4.3,4.3])k.box(.09,.05,10.1,x,y,towerZ,'steel','enclosure-panel-seam');
 k.box(2.3,52,3,-8.2,27,towerZ+1,'concrete','tower-lift-shaft');
 for(let y=4;y<57;y+=4)k.box(3.6,.25,3,-6.5,y,towerZ+1,'steel','tower-lift-landing');
 k.box(9,.4,10.4,0,59.9,towerZ,'roof','tower-roof');
 k.rod([3.6,60.1,towerZ+4.4],[3.6,60.6,towerZ+4.4],.12,'steel','tower-beacon-support');
 registerFacilityBeacon(root,{id:'zenit-access-tower',position:[3.6,60.6,towerZ+4.4],kind:'service-tower'});
 k.hall({x:15,z:117,w:8,d:15,h:9,wall:'steel',roof:'dark',gates:1,windows:false,tag:'access-tower-service-building'});
 // Long elevated cable gallery on repeating steel trestles.
 for(let z=17;z<=130;z+=10){for(const x of [17.8,20.2])k.rod([x,0,z],[x,10.3,z],.12,'steel','cable-gallery-column');k.rod([17.8,0,z],[20.2,10,z],.085,'steel','cable-gallery-brace');k.rod([20.2,0,z],[17.8,10,z],.085,'steel','cable-gallery-brace');}
 k.box(3,.6,117,19,10.2,73.5,'green','overhead-cable-gallery');
 for(let z=17;z<132;z+=3)k.rod([17.5,10.7,z],[20.5,10.7,z],.07,'steel','gallery-crossmember');
 // Folded white installation arm and its green hydraulic cradle.
 k.box(5.2,.5,7,-8.2,4.55,27,'green','erector-base');
 for(const z of [24.8,29.2]){k.box(4,3.4,.7,-8.2,6.3,z,'green','erector-pivot-cheek');k.rod([-10.3,7.7,z],[-6.1,7.7,z],.42,'steel','erector-pivot');}
 const arm=new THREE.BoxGeometry(1.65,1.9,29);arm.rotateX(-.035);arm.translate(-8.2,7.5,12.5);k.direct(arm,'white','folded-white-erector-arm');
 k.box(2.4,3.9,2.4,-8.2,6.0,-1.9,'white','erector-curved-toe');
 for(const x of [-8.8,-7.6]){k.rod([x,4.8,29],[x,7.4,19],.16,'steel','erector-hydraulic-rod');k.rod([x,4.8,29],[x,6.1,24],.27,'green','erector-hydraulic-cylinder');}
 for(const z of [-6,15])for(const side of [-1,1]){
  k.box(5.2,1.7,1.5,side*11,5.05,z,'green','hinged-service-cover');
  for(let x=-2;x<=2;x+=.65)k.box(.10,1.5,.16,side*11+x,5,z+.8,'green','cover-stiffener');
 }
 for(const [x,z]of [[-45,-35],[45,-35],[-45,85],[45,85]]){
  k.lattice(x,z,72,4.8,4.8,{levels:15,tag:'zenit-lightning-tower',material:'light'});
  for(let y=0;y<72;y+=12)for(const side of [-1,1])k.rod([x+side*2.4*(1-.55*y/72),y,z+2.4*(1-.55*y/72)],[x+side*2.4*(1-.55*(y+5)/72),y+5,z+2.4*(1-.55*(y+5)/72)],.27,'red','lightning-red-band');
 }
 for(const [x,z]of [[-32,-26],[32,-26],[-32,57],[32,57]]){
  k.lattice(x,z,27,2.7,2.7,{levels:9,material:'steel',tag:'zenit-floodlight-mast'});
  const target=new THREE.Vector3(0,12,0),lamps=[];
  for(let row=0;row<4;row++)for(let col=0;col<5;col++){
   const pos=[x+(col-2)*1.05,27+row*.95,z],normal=target.clone().sub(new THREE.Vector3(...pos)).normalize().toArray();
   const aim=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...normal));
   const housing=k.direct(new THREE.BoxGeometry(.75,.65,.23),'dark','floodlight-housing');housing.position.set(...pos).addScaledVector(new THREE.Vector3(...normal),-.14);housing.quaternion.copy(aim);
   const lens=k.direct(new THREE.CircleGeometry(.27,12),'light','floodlight-lens');lens.position.set(...pos);lens.quaternion.copy(aim);
   lamps.push({position:pos,normal,size:[.54,.54]});
  }
  for(let row=0;row<5;row++)k.rod([x-2.8,26.5+row*.95,z],[x+2.8,26.5+row*.95,z],.075,'steel','floodlight-board-frame');
  k.rod([x,27,z],[x,31.5,z],.14,'steel','floodlight-beacon-support');
  registerFacilityFloodlights(root,{id:`zenit-board-${x}-${z}`,lamps,target:target.toArray(),beacon:[x,31.5,z]});
 }
 k.hall({x:45,z:102,w:21,d:35,h:5.5,roof:'concrete',gates:1,tag:'zenit-utility-building'});
 for(const x of [-28,29])for(const z of [12,52,92]){k.box(1.6,2.1,1.1,x,1.05,z,'green','utility-cabinet');k.rod([x,2,z],[x,2,z+4],.09,'green','utility-pipe');}
 const structural=k.finish();
 let vehicle=null;
 if(rocket){vehicle=createZenitRocket({detail:'far',variant:'land'});vehicle.root.position.y=deck+.8;vehicle.root.name='Зенит-3SLБ · экспонат пл.45';root.add(vehicle.root);}
 const physical={units:'metres',localScale:1,railGaugeMetres:1.52,heightsSurveyed:false,planSurveyed:false,interpretation:'Photo-guided historical Zenit launch position 45/1, not the modern Soyuz-5 configuration.',referenceVehicle:{name:'Zenit-3SLБ',heightMetres:58.7,diameterMetres:3.9,source:'https://yuzhmash.com/en/products/launch-vehicles/zenit-3slb/'}};
 root.userData.physicalUnits=physical;root.userData.site45Model={version:SITE45_VERSION,period:'Исторический комплекс «Зенит»',referenceFolder:'1UD2cFm-qIJjWK6CcjF7V7zGnjVpS5H3i',referenceImageCount:10,deckY:deck,rocketMount:[0,deck+.8,0],channel:{halfWidth:half,minZ:-70,maxZ:12,floorY:-depth},roadPort:[78,.1,128],railPort:[0,.65,145],views:SITE45_VIEWS,physical,components:structural.features,rocket:vehicle?.stats()??null};
 return {...structural,physical,rocket:vehicle?.root};
}
