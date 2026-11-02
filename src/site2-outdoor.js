import * as THREE from 'three';
import {site2Point as P} from './site2-layout.js?v=20261102-site2-photo-v3';

// Photo-derived exhibit silhouettes. The source photographs are not engineering
// drawings; their unknown internal parts and exact mechanical dimensions are omitted.
export function buildSite2Outdoor(k,root,yaw){
 const records=[];
 function group(kind,pixel,rotation=yaw){const g=new THREE.Group(),[x,z]=P(pixel);g.position.set(x,0,z);g.rotation.y=rotation;root.add(g);records.push({kind,position:[x,0,z],yaw:rotation});return g;}
 const box=(g,w,h,d,x,y,z,m='vehicle',tag='exhibit-detail')=>k.box(w,h,d,x,y,z,m,'site2-'+tag,0,g);
 const rod=(g,a,b,r=.06,m='steel',tag='exhibit-pipe')=>k.rod(a,b,r,m,'site2-'+tag,g);
 const cyl=(g,r,l,x,y,z,m='light',axis='z',tag='exhibit-cylinder')=>k.cyl(r,l,x,y,z,m,'site2-'+tag,axis==='z'?Math.PI/2:0,g);
 function ring(g,r,t,x,y,z,m='steel'){const mesh=k.direct(new THREE.TorusGeometry(r,t,6,32),m,'site2-exhibit-ring',g);mesh.position.set(x,y,z);return mesh;}
 function frustum(g,rt,rb,h,x,y,z,m='light',axis='y',open=false){const mesh=k.direct(new THREE.CylinderGeometry(rt,rb,h,24,1,open),m,'site2-exhibit-cone',g);mesh.position.set(x,y,z);if(axis==='z')mesh.rotation.x=Math.PI/2;return mesh;}
 function plinth(g,w,d){box(g,w,.2,d,0,.2,0,'paver','exhibit-plinth');}
 function wheel(g,x,y,z,r=.45){const mesh=k.direct(new THREE.CylinderGeometry(r,r,.3,14),'tires','site2-exhibit-wheel',g);mesh.rotation.z=Math.PI/2;mesh.position.set(x,y,z);const hub=k.direct(new THREE.CylinderGeometry(r*.48,r*.48,.32,10),'steel','site2-exhibit-wheel-hub',g);hub.rotation.z=Math.PI/2;hub.position.set(x,y,z);}
 function cradle(g,r,length,y,material='panelYellow'){
  for(const z of [-length/2+.3,length/2-.3]){
   box(g,r*2+.6,.24,.65,0,.65,z,material);
   for(const side of [-1,1])rod(g,[side*(r+.12),.75,z],[side*r*.82,y-r*.55,z],.16,material,'container-cradle');
  }
  for(const x of [-r,r])box(g,.2,.2,length+.6,x,.6,0,material);
 }
 // Yellow cylindrical assembly: an open end, braced annular frame, panel seams,
 // attachment plates and wheeled cradle, as in 1535026_original.jpg.
 const yellow=group('yellow-open-container',[735,618]);plinth(yellow,4.9,6.5);
 frustum(yellow,1.75,1.75,4.6,0,2.5,-.3,'panelYellow','z',true);
 cyl(yellow,1.72,.12,0,2.5,-2.66,'panelYellow');
 for(const zz of [-2.65,-1.6,.5,2])ring(yellow,1.77,.045,0,2.5,zz,'light');
 ring(yellow,1.51,.23,0,2.5,2.65,'light');
 for(let i=0;i<12;i++){const a=i*Math.PI/6,x=Math.cos(a),y=Math.sin(a);rod(yellow,[x*1.74,2.5+y*1.74,2],[x*1.48,2.5+y*1.48,2.65],.035,'light','container-open-brace');}
 for(const x of [-1.755,1.755])for(const z of [-1.7,-.2,1.3])box(yellow,.035,.5,.5,x,3.05,z,'light','container-access-panel');
 cradle(yellow,1.75,5.1,2.5);for(const x of [-1.9,1.9])for(const z of [-2.2,2.2])wheel(yellow,x,.48,z,.18);

 // Ribbed silver transport container with the large red circular closure.
 const red=group('red-ended-ribbed-container',[810,542],yaw+Math.PI/2);plinth(red,6.3,7.7);
 cyl(red,2.35,6.2,0,3,0,'white');cradle(red,2.35,6.2,3,'panelGrey');
 for(let i=0;i<24;i++){const a=i*Math.PI/12;rod(red,[2.38*Math.cos(a),3+2.38*Math.sin(a),-3.05],[2.38*Math.cos(a),3+2.38*Math.sin(a),3.05],.045,'light','container-longitudinal-rib');}
 for(const z of [-3.12,-1.7,1.7,3.12])ring(red,2.39,.07,0,3,z,'red');
 cyl(red,2.35,.12,0,3,3.17,'red');cyl(red,.2,.25,0,3,3.3,'steel');
 for(let i=0;i<12;i++){const a=i*Math.PI/6;rod(red,[.45*Math.cos(a),3+.45*Math.sin(a),3.25],[2.12*Math.cos(a),3+2.12*Math.sin(a),3.25],.035,'red','container-lid-rib');}

 const stage=group('silver-stage-section',[811,662]);plinth(stage,5.7,5.7);
 cyl(stage,2.3,3.6,0,2.5,0,'light','y');frustum(stage,.95,2.3,1.4,0,5,0,'light');cyl(stage,.95,.55,0,5.96,0,'light','y');
 for(const y of [.75,1.1,3.5,4.28]){const r=ring(stage,2.32,.035,0,y,0,'steel');r.rotation.x=Math.PI/2;}
 for(let i=0;i<16;i++){const a=i*Math.PI/8;rod(stage,[Math.cos(a)*2.3,.7,Math.sin(a)*2.3],[Math.cos(a)*2.3,4.3,Math.sin(a)*2.3],.022,'steel','stage-seam');}
 for(const x of [-1.9,1.9])for(const z of [-1.9,1.9])rod(stage,[x,.32,z],[x*.85,1,z*.85],.08,'steel','stage-support');

 // Launch table and engine are separate exhibits on one circular concrete court.
 const engine=group('launch-table-and-engine',[776,577],0);cyl(engine,6,.18,0,.22,0,'concrete','y');
 frustum(engine,2.5,2.8,2.4,-2,1.6,0,'vehicle','y',true);const table=ring(engine,2.65,.32,-2,2.9,0,'vehicle');table.rotation.x=Math.PI/2;
 for(let i=0;i<12;i++){const a=i*Math.PI/6,x=-2+Math.cos(a)*2.55,z=Math.sin(a)*2.55;rod(engine,[x,.45,z],[x,3.6,z],.10,'vehicle','table-column');box(engine,.35,.4,.3,x,3.4,z,'steel');}
 frustum(engine,.65,1.5,3.25,2.7,1.93,0,'rust','y',true);
 for(let i=0;i<8;i++){const y=.45+i*.4,r=1.5-(y-.3)*.26,hoop=ring(engine,r,.035,2.7,y,0,'steel');hoop.rotation.x=Math.PI/2;}
 cyl(engine,.48,1.6,2.7,4.35,0,'steel','y');
 for(let i=0;i<7;i++){const a=i*Math.PI*2/7,x=2.7+Math.cos(a)*.72,z=Math.sin(a)*.72;cyl(engine,.16,.7,x,4.2+(i%3)*.4,z,'light','y');rod(engine,[x,4.6,z],[2.7+Math.cos(a)*1.25,.7,Math.sin(a)*1.25],.045,i%2?'light':'rust','engine-feed-pipe');}

 // Long transporter/installer: twin girders, raised fork, cable pulleys,
 // stabilizer feet and multi-axle undercarriage (1534543_original.jpg).
 const installer=group('transport-installer',[658,440],-.45);plinth(installer,5.5,19.5);
 for(const x of [-1.45,1.45])box(installer,.35,.65,17,x,2,0);
 for(let z=-8;z<=8;z+=2)box(installer,3.25,.35,.28,0,2,z);
 for(const x of [-1.2,1.2])for(const z of [-5.8,-4.3,3.8,5.3])wheel(installer,x,.95,z,.62);
 for(const z of [-7,7])for(const x of [-1.5,1.5]){rod(installer,[x,2,z],[x,.4,z],.10,'vehicle','installer-jack');box(installer,.8,.12,.8,x,.36,z);}
 for(const x of [-1.55,1.55]){
  rod(installer,[x,2.2,6.9],[x,6.7,7.3],.22,'vehicle','installer-upright');
  box(installer,.6,.55,2,x,6.75,6.7);rod(installer,[x,5.7,5.8],[x,2.3,-4],.035,'dark','installer-cable');
  for(const [y,z]of [[3.1,6.8],[6.5,7.3]]){const pulley=ring(installer,.33,.08,x,y,z,'vehicle');pulley.rotation.y=Math.PI/2;}
 }
 const hoop=ring(installer,2,.12,0,3.9,-5,'vehicle');hoop.scale.y=1.2;
 for(const x of [-1.4,1.4])rod(installer,[x,2.2,-6],[x,4.8,-6],.18,'vehicle','installer-cradle');

 // Small horizontal vessel by the covered stair.
 const tank=group('horizontal-vessel',[638,479],Math.PI/2);plinth(tank,2.9,5.3);cyl(tank,.9,3.7,0,1.5,0,'vehicle');
 for(const z of [-1.85,1.85])k.sphere(.9,0,1.5,z,'vehicle','site2-vessel-end',[1,1,.7],tank);
 for(const z of [-1.5,-.6,.6,1.5])ring(tank,.92,.045,0,1.5,z,'steel');cradle(tank,.9,3.7,1.5,'steel');

 // Slim winged test article on its small transport trolley (1535386).
 const testArticle=group('winged-test-article',[774,635],yaw+Math.PI/2);plinth(testArticle,2.6,9.5);
 cyl(testArticle,.22,7.3,0,1.05,0,'light');frustum(testArticle,0,.22,1.25,0,1.05,4.25,'red','z');
 for(const z of [-2.6,1.6]){box(testArticle,1.3,.13,.4,0,.6,z,'vehicle');for(const x of [-.55,.55])wheel(testArticle,x,.5,z,.19);rod(testArticle,[0,.6,z],[0,1,z],.06);}
 for(const z of [-2.8,.6]){box(testArticle,1.65,.045,.8,0,1.05,z,'light','test-article-fin');box(testArticle,.045,1.2,.8,0,1.4,z,'light','test-article-fin');}

 // Round spacecraft base with instrument boxes and two solar panel wings.
 const satellite=group('spacecraft-with-solar-panels',[673,591],yaw);
 plinth(satellite,6.3,4.6);const frame=new THREE.Group();frame.position.set(0,3.5,0);frame.rotation.x=-.55;satellite.add(frame);
 cyl(frame,1.75,.6,0,0,0,'vehicle');ring(frame,1.78,.13,0,0,.36,'vehicle');cyl(frame,1.23,.06,0,0,.35,'light');
 for(let i=0;i<7;i++){const a=i*Math.PI*2/7;cyl(frame,i===0?.25:.15,.08,Math.cos(a)*.6,Math.sin(a)*.6,.42,'dark');}
 for(const x of [-1.1,1.1]){box(frame,.5,.7,.22,x,.15,.5,'light');for(let y=-.1;y<.5;y+=.12)box(frame,.48,.035,.08,x,y,.64,'steel');}
 for(const x of [-3.3,3.3]){box(frame,3,.09,2.2,x,0,0,'panelGrey','solar-panel');for(let u=-1.4;u<=1.4;u+=.46)box(frame,.025,.12,2.2,x+u,0,0,'steel','solar-grid');for(const z of [-1.1,-.55,0,.55,1.1])box(frame,3,.12,.025,x,0,z,'steel','solar-grid');}
 for(const x of [-1.4,1.4])rod(satellite,[x,.3,0],[x*.7,3,0],.10,'steel','satellite-stand');

 // The new photographs show mesh radio dishes rather than solid discs.
 const antennas=group('mesh-radio-antenna-array',[845,681],yaw);plinth(antennas,7.4,5);
 for(let i=0;i<5;i++){
  const x=(i%3-1)*2.25,z=i<3?-1.1:1.2,y=2.5+(i%2)*.5;box(antennas,1,.85,1,x,.75,z,'vehicle');rod(antennas,[x,1,z],[x,y,z],.12,'vehicle','antenna-pedestal');
  const dish=new THREE.Group();dish.position.set(x,y,z);dish.rotation.set(-.25,i*.4-.8,0);antennas.add(dish);
  for(const [r,zz]of [[.9,0],[.55,.35],[.26,.85]]){
   ring(dish,r,.018,0,0,zz,'yellow');
   for(let n=0;n<12;n++){const a=n*Math.PI/6;rod(dish,[0,0,zz-.1],[Math.cos(a)*r,Math.sin(a)*r,zz],.009,'yellow','antenna-mesh');}
   for(let d=-r+.15;d<r;d+=.18){const h=Math.sqrt(r*r-d*d);rod(dish,[-h,d,zz],[h,d,zz],.006,'yellow','antenna-mesh');}
  }
  rod(dish,[0,0,-.2],[0,0,1],.045,'yellow','antenna-feed');
 }

 const vehicles=[];
 // East-to-west row, with distinct bodies and running gear from the new photos.
 for(let i=0;i<7;i++){
  const kinds=['bus','tracked-fire-engine','tracked-transporter','volga','truck','armoured-car','utility'];
  const v=group(kinds[i],[901-i*6.4,695+i*12.3],yaw+Math.PI/2),length=i===0?8.5:i===4?7.4:6;
  vehicles.push(records.at(-1));plinth(v,3.4,length+1);const tracked=i===1||i===2;
  box(v,2.45,.65,length,0,1.05,0,i===3?'blue':'vehicle','historic-vehicle-body');
  if(i===0){box(v,2.35,1.9,length-.3,0,2.2,0,'cream','bus-cabin');for(let z=-3.4;z<3.5;z+=1.05)for(const x of [-1.19,1.19])box(v,.04,.75,.8,x,2.5,z,'glass','bus-window');box(v,2.4,.3,length,0,1.55,0,'red','bus-band');}
  else if(i===1){box(v,2.35,2,3.7,0,2.4,-.7,'green','fire-engine-cabin');box(v,2.4,.16,4.0,0,3.5,-.7,'red','fire-engine-roof');box(v,2.6,1,.25,0,.9,3.2,'green','fire-engine-blade');rod(v,[0,3.8,1],[0,3.8,3],.14,'light','fire-monitor');for(const x of [-1.19,1.19])box(v,.03,.35,3.7,x,1.9,-.7,'white','fire-engine-stripe');}
  else if(i===2){box(v,2.3,1.45,2,0,2.05,1.6,'vehicle','transporter-cabin');box(v,2.2,.5,3.5,0,1.65,-1.3,'roofRed','transporter-bed');}
  else if(i===3){box(v,1.9,.85,2.9,0,1.8,-.1,'blue','volga-cabin');box(v,1.95,.4,.12,0,1.08,3.05,'light','volga-grille');for(let x=-.9;x<1;x+=.1)box(v,.035,.32,.14,x,1.1,3.12,'dark','grille-slat');}
  else if(i===4){box(v,2.35,1.7,2.2,0,2,2,'vehicle','truck-cabin');box(v,2.35,1.1,3.9,0,1.85,-1.25,'vehicle','truck-bed');for(const x of [-1.19,1.19])for(let z=-3;z<.6;z+=.8)box(v,.1,1.1,.1,x,1.85,z,'steel','truck-bed-rib');}
  else box(v,2.1,1.1,3,0,1.85,0,'vehicle','vehicle-cabin');
  box(v,1.8,.65,.06,0,2,i===4?3.13:i===1?1.18:i===2?2.63:1.43,'glass','vehicle-windscreen');
  const axles=tracked?[-2.2,-1.1,0,1.1,2.2]:i===5?[-2,-.7,.7,2]:[-length*.33,length*.33];
  for(const x of [-1.18,1.18])for(const z of axles)wheel(v,x,tracked?.75:.8,z,tracked?.43:.5);
  if(tracked)for(const x of [-1.23,1.23]){box(v,.45,.14,5.5,x,.35,0,'tires','track-run');box(v,.45,.14,5.5,x,1.18,0,'tires','track-run');for(let z=-2.6;z<=2.6;z+=.23)box(v,.48,.16,.09,x,.33,z,'steel','track-link');}
  for(const x of [-.82,.82])cyl(v,.12,.07,x,1.3,length/2+.05,'light','z','vehicle-headlamp');
 }
 return {exhibits:records,vehicles};
}
