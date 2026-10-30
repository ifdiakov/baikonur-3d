import * as THREE from 'three';
import {installMriyaExhibit} from './mriya-exhibit.js?v=20261028-mriya-paint-v2';
import {archiveKit} from './archive-kit.js?v=20261028-museum4-osm-live-v2';
import {buildKrayniyTerminal,KRAYNIY_AIRPORT_DISPLAY} from './krayniy-terminal.js?v=krayniy-drive-terminal-v1';
export const AIRPORT_SCALE=.28;
export const AIRPORT_DIMENSIONS={
 // The longest ten-unit display length that keeps the full approach-light
 // axis at least five world units from the exact OSM river-water polygons.
 // The geographic runway centre, direction and source length are unchanged.
 krayniy:{length:1380,referenceLength:3100,longitudinalScale:1380/3100,width:45,heading:2.06},
 yubileiny:{length:2250,referenceLength:4500,longitudinalScale:.5,width:84,heading:1.948}
};
// The source runway length remains explicit; presentation length can be
// reduced for shoreline clearance without moving its geographic centre/axis.
export function airportDisplaySpec(key,overrides={}){
 const base={...AIRPORT_DIMENSIONS[key],...overrides},zScale=base.length/base.referenceLength,H=base.length/2,isY=key==='yubileiny';
 return {...base,key,scale:AIRPORT_SCALE,longitudinalScale:zScale,runwayY:1.75,
  threshold:H-15,touchdown:H-380*zScale,papiSetback:300*zScale,
  approachLength:960*zScale,approachStations:8,apron:isY?[-250,170*zScale]:[KRAYNIY_AIRPORT_DISPLAY.apronX,KRAYNIY_AIRPORT_DISPLAY.apronZ],taxiX:isY?-150:KRAYNIY_AIRPORT_DISPLAY.taxiX,apronWidth:isY?230:KRAYNIY_AIRPORT_DISPLAY.apronWidth,apronLength:400,apronLightRadius:23};
}
export function buildAirport(root,key){
 const spec=airportDisplaySpec(key),k=archiveKit(root),L=spec.length,W=spec.width,H=L/2,isY=key==='yubileiny';
 const zScale=spec.longitudinalScale,apronZ=spec.apron[1];
 root.userData.airport={...spec};
 k.box(W+18,.6,L+120,0,1.1,0,'concrete','runway-shoulder');k.box(W,.4,L,0,1.55,0,'asphalt','runway');
 for(const side of [-1,1]){
  k.box(.9,.04,L-12,side*(W/2-1.5),1.78,0,'white','runway-edge');
  for(let i=0;i<(isY?10:6);i++){const x=4+i*(W/2-7)/(isY?10:6);for(const sign of [-1,1])k.box(1.8,.05,30,sign*x,1.8,side*(H-24),'white','threshold-bars');}
  for(const x of [-W*.29,W*.29]){k.box(6,.05,45,x,1.8,side*(H-320*zScale),'white','aiming-point');for(const d of [150,450,600])k.box(2.2,.05,22,x,1.8,side*(H-d*zScale),'white','touchdown-zone');}
 }
 for(let z=-H+85;z<H-80;z+=60)k.box(.9,.04,30,0,1.8,z,'white','runway-centre-mark');
 // Painted runway designators lie on the surface, not on billboards.
 for(const side of [-1,1]){const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#eeeeea';ctx.font='bold 190px Arial';ctx.textAlign='center';ctx.fillText(isY?(side>0?'24':'06'):(side>0?'23':'05'),128,330);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(13,30),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));m.rotation.x=-Math.PI/2;m.rotation.z=side>0?Math.PI:0;m.position.set(0,1.83,side*(H-75));root.add(m);}
 const taxiX=spec.taxiX,apronX=spec.apron[0];
 k.path([[taxiX,-H+60],[taxiX,H-60]],isY?24:18,1.76,'asphalt','parallel-taxiway');
 for(const z of [-H+80,H-80,apronZ-130,apronZ+130]){const pts=[[0,z],[taxiX*.28,z],[taxiX*.7,z+Math.sign(z)*22],[taxiX,z+Math.sign(z)*22]];const curve=new THREE.CatmullRomCurve3(pts.map(([x,z])=>new THREE.Vector3(x,0,z)));const p=curve.getPoints(30).map(v=>[v.x,v.z]);k.path(p,isY?21:18,1.78,'asphalt','connecting-taxiway');k.path(p,.4,1.81,'yellow','taxi-centre-line');}
 k.path([[taxiX,-H+60],[taxiX,H-60]],.4,1.80,'yellow','taxi-centre-line');
 k.box(spec.apronWidth,.4,spec.apronLength,apronX,1.55,apronZ,'concrete','aircraft-apron');
 for(let z=apronZ-160;z<=apronZ+160;z+=80){k.path([[taxiX,z],[apronX,z]],.4,1.81,'yellow','apron-guideline');k.path([[apronX-10,z],[apronX+10,z]],.4,1.82,'yellow','parking-tee');}
 if(isY){
  k.hall({x:apronX-155,z:apronZ,w:46,d:105,h:13,floors:2,gates:0,tag:'airport-terminal'});
  k.hall({x:apronX-145,z:apronZ+150,w:65,d:70,h:20,gates:2,tag:'maintenance-hangar'});
  const tx=apronX-164;k.box(12,30,12,tx,15,apronZ-90,'concrete','control-tower');k.box(18,5,18,tx,32,apronZ-90,'glass','control-room');k.box(20,.8,20,tx,35,apronZ-90,'light','control-room-roof');
 }else{
  buildKrayniyTerminal(root,apronZ);
  // Keep the service hangar on the terminal side, clear of the glazed hall.
  k.hall({x:apronX-145,z:apronZ+150,w:65,d:70,h:20,gates:2,tag:'maintenance-hangar'});
 }
 // Four PAPI housings and localizer aerials mark the approach without a floating UI cone.
 for(const s of [-1,1]){for(let i=0;i<4;i++){k.box(1.4,1.1,.9,-W/2-18-i*3,2.2,s*(H-300*zScale),'white','papi-housing');k.box(1,.45,.06,-W/2-18-i*3,2.4,s*(H-300*zScale)+s*.5,i<2?'red':'white','papi-lens');}for(let x=-15;x<=15;x+=3){k.rod([x,0,s*(H+90)],[x,3,s*(H+90)],.12,'yellow','localizer-antenna');k.rod([x-1.1,3,s*(H+90)],[x+1.1,3,s*(H+90)],.08,'steel','localizer-dipole');}}
 if(isY)buildMriyaRamp(k,apronX,apronZ);
 const result=k.finish();Object.assign(result.features,root.userData.airport.fallbackFeatures||{});Object.assign(result.features,root.userData.airport.terminal?.features||{});root.userData.airport.features=result.features;delete root.userData.airport.fallbackFeatures;return result;
}
function buildMriyaRamp(k,cx,cz){
 const plane=new THREE.Group();plane.position.set(cx,1.8,cz);plane.name='Ан-225 «Мрия» с «Бураном»';k.root.add(plane);
 const aircraftKit=archiveKit(plane);
 // Local +Z points toward the aircraft's nose; 84 m fuselage, 88.4 m span.
 aircraftKit.sphere(1,0,7,0,'white','mriya-fuselage',[4.5,4.5,42],plane);aircraftKit.sphere(1,0,4.9,0,'light','mriya-lower-fuselage',[4.4,2.5,40],plane);
 aircraftKit.sphere(1,0,8.9,32,'glass','mriya-cockpit',[3.4,1.2,4.5],plane);
 for(const s of [-1,1]){
  aircraftKit.poly([[s*3,19],[s*44.2,-6],[s*43.7,-15],[s*6,-15]],7,'white','mriya-wing',plane);
  aircraftKit.path([[s*5,-14],[s*43.7,-14]],.3,7.03,'steel','mriya-flap-seam',plane);
  aircraftKit.poly([[s*1,-24],[s*16,-31],[s*16,-39],[s*1,-36]],10.5,'white','mriya-tailplane',plane);
  aircraftKit.quad([s*14,10,-29],[s*14,22,-34],[s*14,22,-39],[s*14,10,-39],'white','mriya-twin-tail',plane);
  aircraftKit.quad([s*14.05,17,-32],[s*14.05,20,-33.5],[s*14.05,20,-38.5],[s*14.05,17,-38.5],'red','mriya-tail-stripe',plane);
  for(const [x,z] of [[12,7],[23,1],[33,-5]]){aircraftKit.cyl(1.9,7,s*x,4.5,z,'light','mriya-engine',Math.PI/2,plane);aircraftKit.cyl(1.55,.2,s*x,4.5,z+3.6,'dark','mriya-intake',Math.PI/2,plane);aircraftKit.box(.7,2.8,5,s*x,6.3,z-1,'steel','mriya-engine-pylon',0,plane);}
  for(let i=0;i<7;i++)for(const dx of [-.5,.5])aircraftKit.cyl(.65,.45,s*3.6+dx,1.1,-8+i*2,'dark','mriya-main-wheel',Math.PI/2,plane);
  for(const z of [-7,9])aircraftKit.rod([s*3,10,z],[s*2.6,15,z],.35,'steel','buran-carrying-strut',plane);
 }
 for(const x of [-.8,.8])aircraftKit.cyl(.65,.45,x,1.1,28,'dark','mriya-nose-wheel',Math.PI/2,plane);
 // Buran: black thermal belly, double-delta wings and vertical tail.
 aircraftKit.sphere(1,0,16,-1,'white','buran-fuselage',[2.7,2.7,17.5],plane);aircraftKit.sphere(1,0,14.3,-1,'dark','buran-thermal-belly',[2.7,1,17.2],plane);aircraftKit.sphere(1,0,16,15,'dark','buran-nose-cap',[1.5,1.4,2.2],plane);aircraftKit.sphere(1,0,18,10,'glass','buran-cockpit',[1.8,.6,2],plane);
 for(const s of [-1,1]){const p=[[s*2,5],[s*6,-3],[s*12,-11],[s*11,-15],[s*2,-13]];aircraftKit.poly(p,15.4,'dark','buran-wing-edge',plane);aircraftKit.poly(p.map(([x,z])=>[x*.96,z+.1]),15.5,'white','buran-delta-wing',plane);}
 aircraftKit.quad([0,17,-7],[0,25,-13],[0,25,-17],[0,17,-17],'white','buran-fin',plane);for(const x of [-1.6,0,1.6])aircraftKit.cyl(.7,2,x,16,-18,'dark','buran-engine',Math.PI/2,plane);
 const fallback=aircraftKit.finish();
 k.root.userData.airport.fallbackFeatures=fallback.features;
 installMriyaExhibit(k.root,plane,cx,cz);
 // Loading device: paired braced portal frames, overhead bridge and hoists.
 for(const z of [-18,18]){for(const side of [-1,1]){const x=side*24;for(const foot of [-11,11]){k.rod([cx+x+side*9,1.8,cz+z+foot],[cx+x,47,cz+z],.8,'steel','loading-ramp-raked-leg');k.rod([cx+x,1.8,cz+z+foot],[cx+x,47,cz+z],.65,'steel','loading-ramp-column');}for(let y=6;y<46;y+=6){k.rod([cx+x-2,y,cz+z],[cx+x+2,y,cz+z],.25,'steel','loading-ramp-level');k.rod([cx+x-2,y,cz+z],[cx+x+2,y+6,cz+z],.18,'steel','loading-ramp-brace');}}
  k.box(52,3,4,cx,47,cz+z,'steel','loading-ramp-crosshead');for(const x of [-4,4]){k.box(3,2,3,cx+x,45,cz+z,'yellow','loading-hoist');k.rod([cx+x,44,cz+z],[cx+x,29,cz+z],.07,'dark','loading-cable');}}
 k.path([[cx-45,cz-65],[cx-45,cz+60],[cx+45,cz+60]],5,1.8,'concrete','ramp-service-road');
}
