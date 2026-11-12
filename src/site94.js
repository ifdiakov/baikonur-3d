import {SITE94_STREETS} from './site94-streets.js?v=20261112-site94-94a-photo-v1';
import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {projectOsm} from './osm-geography.js';
import {SITE94_VERSION,SITE94_REFERENCES,SITE94_SOURCE_CENTRES} from './site94-records.js?v=20261112-site94-94a-photo-v1';
function memberOffset(root){
 const members=root.userData.site94Members;
 const a=members?.find(r=>r.id==='pad-94'),b=members?.find(r=>r.id!=='pad-94');
 if(a&&b)return [(b.x-a.x)*3.4/.14,(b.y-a.y)*3.4/.14];
 const p=projectOsm(SITE94_SOURCE_CENTRES['pad-94']),q=projectOsm(SITE94_SOURCE_CENTRES['pad-94а']);return [(q[0]-p[0])*3.4/.14,(q[1]-p[1])*3.4/.14];
}
export function buildSite94(root){
 const k=archiveKit(root),footprints=[],[sx,sz]=memberOffset(root);
 k.mat.wall.color.setHex(0xb9b7a7);k.mat.light.color.setHex(0xd3d0be);k.mat.roof.color.setHex(0x625f56);k.mat.glass.color.setHex(0x252c2a);
 const box=(tag,w,h,d,x,y,z,m='wall')=>k.box(w,h,d,x,y,z,m,'site94-'+tag);
 const rod=(tag,a,b,r=.06,m='steel')=>k.rod(a,b,r,m,'site94-'+tag);
 function building(id,x,z,w,d,h){footprints.push({id,x,z,w,d,h});}
 function window(x,y,z,w=2.4,h=2,m='dark'){
  box('window-recess',w,h,.1,x,y,z,m);box('window-sill',w+.3,.12,.35,x,y-h/2-.08,z+.1,'concrete');
 }
 function walls(id,x,z,w,d,h,gate=0){
  building(id,x,z,w,d,h);box('floor',w,.18,d,x,.09,z,'concrete');
  for(const s of [-1,1])box('side-wall',.5,h,d,x+s*w/2,h/2,z);
  box('rear-wall',w,h,.5,x,h/2,z-d/2);
  if(gate){const side=(w-gate)/2;for(const s of [-1,1])box('gate-side',side,h,.55,x+s*(gate/2+side/2),h/2,z+d/2);box('gate-lintel',gate,h-6.8,.55,x,(h+6.8)/2,z+d/2);}
  else box('front-wall',w,h,.5,x,h/2,z+d/2);
  box('roof-slab',w+1,.45,d+1,x,h+.22,z,'roof');
  for(const side of [-1,1])box('roof-parapet',.35,.65,d+1,x+side*w/2,h+.7,z,'concrete');
  for(let i=0;i<Math.floor(w/4);i++)box('uneven-roof-edge',2.5+(i%2),.15+(i%3)*.08,.7,x-w/2+2+i*4,h+.65,z+d/2,'roof');
 }
 // Panorama: tall stepped hall, two-storey frontage, annexes and separate boiler chimney.
 walls('94-main-hall',34,-24,40,36,18);
 walls('94-front-wing',34,0,60,12,7.7,12);
 for(const x of [8,15,22,46,53,60])for(const y of [2.1,5.5])window(x,y,6.32,3.2,2.1);
 box('main-open-door-interior',11.6,6.4,.12,34,3.3,1.0,'dark');
 for(const x of [18,26,34,42,50])window(x,15.2,-5.68,4,2.2);
 for(let z=-37;z<-8;z+=6)for(const x of [13.7,54.3])box('hall-side-window',.1,3.4,3.7,x,12.5,z,'dark');
 for(const x of [13.5,54.5])for(const z of [-39,-22,-8])box('hall-pier',.8,18,.8,x,9,z,'concrete');
 box('raised-roof-stage',23,2.6,25,34,19.6,-26,'light');
 for(const [x,z]of [[13,-12],[15,-12],[17,-12],[53,-37],[55,-37]]){box('vent-shaft',.75,5.8,.8,x,19,z,'rust');box('vent-head',1.1,.25,1.1,x,22,z,'dark');}
 walls('94-west-service',-57,-8,17,13,5.5);window(-57,2.9,-1.2,3.6,1.7);
 walls('94-north-service',-55,-51,20,11,4.3);window(-55,2.3,-45.2,5.4,1.3);
 walls('94-boiler',76,-1,19,14,5.2);for(const x of [70,76,82])window(x,2.8,6.3,2.8,1.6);
 k.cyl(1.6,32,78,16,-20,'rust','site94-brick-chimney');k.cyl(2.15,1.1,78,.55,-20,'concrete','site94-chimney-foot');
 for(let y=3;y<32;y+=4){const g=new THREE.TorusGeometry(1.65,.055,5,20);g.rotateX(Math.PI/2);g.translate(78,y,-20);k.direct(g,'steel','site94-chimney-band');}
 for(const x of [77.5,78.5])rod('chimney-ladder',[x,0,-18.35],[x,31,-18.35]);for(let y=1;y<31;y+=.65)rod('ladder-rung',[77.5,y,-18.32],[78.5,y,-18.32],.04);
 walls('94-east-shed',84,24,14,11,4.6);k.tank(93,-36,3.2,6.5);
 // Close-up: pale-brick workshop, tall sliding gate, upper four windows,
 // two right-hand service doors, ladders and lattice antenna behind the roof.
 const hx=sx-5,hz=sz-48,front=hz+14.5;
 walls('94a-photo-hall',hx,hz,28,29,10.2,13);
 box('dark-gate-recess',12.6,6.7,.12,hx,3.4,front-5.5,'dark');
 box('sliding-gate-leaf',7.1,6.7,.17,hx-3.0,3.4,front+.18,'light');
 for(const x of [-6.4,-4.1,-1.8,.5])box('gate-vertical-seam',.06,6.5,.06,hx+x,3.4,front+.3,'steel');
 for(const y of [1.2,4.2])box('gate-crossbar',7,.1,.08,hx-3,y,front+.32,'steel');
 box('door-guide',18,.4,.55,hx,7.2,front+.4,'rust');box('door-track-canopy',12,.55,1.15,hx,7.7,front+.7,'steel');
 box('upper-storey',16,3.8,23,hx-1,12.1,hz-2,'wall');box('upper-roof',17,.4,24,hx-1,14.2,hz-2,'roof');
 for(const x of [-7,-3,1,5])window(hx+x,12.4,hz+9.6,2.0,1.7);
 for(const x of [9,12]){box('personnel-door',1.8,2.6,.12,hx+x,1.32,front+.32,'dark');window(hx+x,3.7,front+.32,1.8,1.0);}
 box('service-canopy',7,.18,1.4,hx+10.5,3.1,front+.7,'concrete');window(hx+9,6.6,front+.32,1.5,1.8);
 for(let y=.5;y<10;y+=.32){for(const [x,w]of [[hx-10.3,7.0],[hx+10.3,7.0]])box('masonry-course',w,.018,.012,x,y,front+.282,'concrete');}
 for(const x of [hx-14.6,hx-13.8])rod('external-ladder',[x,.2,front+.1],[x,11.1,front+.1],.045);
 for(let y=.4;y<11;y+=.48)rod('ladder-rung',[hx-14.6,y,front+.1],[hx-13.8,y,front+.1],.035);
 for(const x of [hx+7.6,hx+8.3])rod('roof-ladder',[x,10,hz+9.8],[x,15,hz+9.8],.045);
 for(let y=10;y<15;y+=.48)rod('ladder-rung',[hx+7.6,y,hz+9.8],[hx+8.3,y,hz+9.8],.035);
 for(let i=0;i<9;i++)box('upper-broken-parapet',1.4,.16+(i%3)*.11,.65,hx-8+i*2,14.5,hz+10,'roof');
 k.lattice(hx+13,hz-10,27,1.4,1.4,{levels:12,tag:'site94-antenna'});
 walls('94a-west-service',sx-45,sz-53,17,12,4.8);walls('94a-south-service',sx-45,sz+14,17,12,4.4);
 walls('94a-utility',sx+6,sz+63,9,14,3.6);
 for(const [x,z,w,d]of [[34,8,13,4],[hx,front+3.2,15,6]])k.poly([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]],.035,'concrete','site94-entrance-apron');
 const result=k.finish();
 root.userData.site94Model={version:SITE94_VERSION,refs:SITE94_REFERENCES,members:2,merged:true,southOffset:[sx,sz],footprints,gate:[hx,0,front],ports:[[34,0,10],[hx,0,front+6.2]],views:{
  all:{eye:[280,460,630],target:[0,0,sz/2],framePoints:[[-75,0,-65],[100,34,-65],[-100,0,sz+78],[5,28,sz-80]]},
  hall:{eye:[125,90,155],target:[24,8,-9],framePoints:[[-70,0,-58],[99,34,-38],[-70,0,34],[99,0,34]]},
  gates:{eye:[hx+49,38,front+76],target:[hx,6,hz+3],framePoints:[[hx-16,0,hz-16],[hx+16,28,hz-16],[hx-16,0,front+9],[hx+16,0,front+9]]}
 }};
 return {...result,modelVersion:SITE94_VERSION,members:2};
}
// Source service lanes are one unioned mesh: intersections cannot z-fight.
export function connectSite94(root,roads=[]){
 const data=root.userData.site94Model;if(!data)return;root.updateWorldMatrix(true,true);
 const join=projectOsm(62.8602042,46.0641567),world=new THREE.Vector3((join[0]-650)*3.4,.72,(join[1]-522.5)*3.4),local=root.worldToLocal(world);
 const grade=(x,z)=>{const d=Math.hypot(x-local.x,z-local.z);return .045+(local.y-.045)*(1-THREE.MathUtils.smoothstep(d,0,180));};
 const k=archiveKit(root);
 function area(polygons,material,tag){for(const polygon of polygons){
  const shape=new THREE.Shape(polygon.outer.map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const ring of polygon.holes)shape.holes.push(new THREE.Path(ring.map(([x,z])=>new THREE.Vector2(x,-z))));
  const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);const p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,grade(p.getX(i),p.getZ(i))-(material==='soil'?.008:0));g.computeVertexNormals();k.direct(g,material,tag);
 }}
 area(SITE94_STREETS.roads,'asphalt','site94-service-roads');area(SITE94_STREETS.shoulders,'soil','site94-service-shoulders');
 for(const polygon of SITE94_STREETS.boundary)for(const ring of [polygon.outer,...polygon.holes])for(let i=1;i<ring.length;i++){
  const [x,z]=ring[i-1],[u,v]=ring[i],y=grade(x,z),t=grade(u,v);if(Math.max(y,t)<.1)continue;
  k.quad([x,.01,z],[x,y,z],[u,t,v],[u,.01,v],'soil','site94-road-embankment');
 }
 const result=k.finish();data.serviceRoads={sourceWayCount:SITE94_STREETS.ids.length,meshCount:result.meshCount,unioned:true,source:'existing project OSM snapshot',join:local.toArray()};
}
