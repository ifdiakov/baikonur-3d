import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261102-site2-photo-v3';
import {registerFacilityFloodlights} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {SITE250A_VERSION,SITE250A_REFERENCE,SITE250A_ACCESS,SITE250A_BUNKER,SITE250A_ROADS,SITE250A_VIEWS,site250aPixel} from './site250a-layout.js?v=20261103-site250a-photo-v1';

export function buildSite250a(root){
 const k=archiveKit(root);
 for(const [key,color] of Object.entries({white:0xdddcd1,wall:0xc8c6b7,roof:0x52696b,blue:0x39768e,glass:0x47797e,soil:0xa49b7c,concrete:0xb6b7a8,asphalt:0x74776e,red:0x824e43}))k.mat[key].color.setHex(color);
 const box=(w,h,d,x,y,z,m='wall',tag='site250a-building')=>k.box(w,h,d,x,y,z,m,tag);
 // Internal roads follow the photographed plan; no opaque site-wide ground tile.
 for(const road of SITE250A_ROADS)k.path(road,6,.12,'asphalt','site250a-internal-road');
 for(const [x,z,w,d] of [[-23,8,40,45],[-81,117,45,48],[-25,116,45,48],[-37,-94,60,42],[104,-35,26,18]])box(w,.12,d,x,.13,z,'concrete','site250a-apron');

 // Sooruzhenie 60: broad concrete-clad earth mound, not an aboveground hall.
 const b=SITE250A_BUNKER;
 const ring=(w,d,y,r)=>{const p=[];for(const [cx,cz,a]of [[w/2-r,-d/2+r,-Math.PI/2],[w/2-r,d/2-r,0],[-w/2+r,d/2-r,Math.PI/2],[-w/2+r,-d/2+r,Math.PI]])for(let j=0;j<=4;j++){const t=a+j*Math.PI/8;p.push([b.x+cx+r*Math.cos(t),y,b.z+cz+r*Math.sin(t)]);}return p;};
 const bottom=ring(b.width,b.depth,.2,6),top=ring(b.width-2*b.topInset,b.depth-2*b.topInset,b.height,4);
 // Outward winding is deliberate: all slopes and the crown are visible above ground.
 for(let i=0;i<bottom.length;i++){const j=(i+1)%bottom.length;k.quad(bottom[i],top[i],top[j],bottom[j],'concrete','site250a-bunker-slope');}
 k.poly(top.map(p=>[p[0],p[2]]),b.height,'concrete','site250a-bunker-crown');
 // Panel joints conform to each slope instead of cutting horizontally through it.
 for(let i=0;i<bottom.length;i++){
  const j=(i+1)%bottom.length,A=new THREE.Vector3(...bottom[i]),B=new THREE.Vector3(...bottom[j]),C=new THREE.Vector3(...top[i]),D=new THREE.Vector3(...top[j]);
  for(const t of [.22,.44,.66,.88]){const a=A.clone().lerp(C,t),d=B.clone().lerp(D,t);a.y+=.035;d.y+=.035;k.rod(a.toArray(),d.toArray(),.035,'soil','site250a-mound-joint');}
  const n=Math.ceil(A.distanceTo(B)/2.8);for(let v=0;v<n;v++){const a=A.clone().lerp(B,v/n),c=C.clone().lerp(D,v/n);a.y+=.035;c.y+=.035;k.rod(a.toArray(),c.toArray(),.035,'soil','site250a-mound-joint');}
 }
 for(const [x,z,h]of [[45,-8,2.1],[53,7,2.6],[45,26,2.1],[53,29,1.7]]){
  box(2.4,h,2.4,x,b.height+h/2,z,'white','site250a-bunker-vent');box(2.8,.22,2.8,x,b.height+h+.12,z,'roof','site250a-vent-cap');
  for(const dx of [-1.22,1.22])for(let y=b.height+.7;y<b.height+h;y+=.3)box(.06,.08,1.6,x+dx,y,z,'dark','site250a-vent-louvre');
 }
 k.lattice(50,17,19,1.2,1.2,{y:b.height,levels:8,tag:'site250a-antenna'});
 for(const z of [-14,31])k.rod([47,b.height,z],[47,14,z],.07,'steel','site250a-roof-aerial');

 const hall=(x,z,w,d,h,{wall='wall',roof='roof',floors=1,windows=true,tag='site250a-service-building'}={})=>{
  box(w,h,d,x,h/2,z,wall,tag);box(w+.6,.3,d+.6,x,h+.15,z,roof,'site250a-roof');
  for(let xx=x-w/2+2.5;xx<x+w/2-1.5;xx+=4.6){
   if(windows)for(let f=0;f<floors;f++)for(const s of [-1,1]){
    box(2.3,1.65,.1,xx,2.2+f*3.3,z+s*(d/2+.06),'glass','site250a-window');
    box(.075,1.7,.16,xx,2.2+f*3.3,z+s*(d/2+.09),'white','site250a-window-frame');
   }
   box(.07,.045,d+.5,xx,h+.33,z,'steel','site250a-roof-seam');
  }
  return {x,z,w,d,h};
 };
 // The entrance block on the west side: pale brick, blue glass blocks and canopy.
 hall(22,16,12,24,7.2,{wall:'white',floors:2,tag:'site250a-command-entrance-61'});
 hall(27,33,9,10,4,{wall:'white',tag:'site250a-command-link'});
 hall(49,58,42,15,7,{wall:'white',floors:2,tag:'site250a-building-20'});
 for(const z of [8,14,20,26])for(const y of [2.3,5.5]){
  box(.12,2,2.8,15.94,y,z,'glass','site250a-blue-glass-block');
  for(let zz=z-1.25;zz<z+1.4;zz+=.35)box(.16,2,.035,15.87,y,zz,'white','site250a-glass-grid');
  for(let yy=y-.85;yy<y+1;yy+=.35)box(.16,.035,2.8,15.87,yy,z,'white','site250a-glass-grid');
 }
 box(3.7,3.2,5.3,14.3,1.6,21,'glass','site250a-vestibule');
 box(5,.35,6.7,13.6,3.55,21,'blue','site250a-entry-canopy');
 for(const z of [18.5,21,23.5])box(.16,3.2,.12,12.35,1.6,z,'white','site250a-entry-frame');
 box(5,.18,8,11.6,.22,21,'concrete','site250a-entry-terrace');
 k.path([[8,21],[13,21]],3,.15,'concrete','site250a-entrance-path');
 for(const z of [9,27])box(.8,.6,1.1,15.4,4.3,z,'white','site250a-air-conditioner');
 hall(24,-7,10,10,3.7,{tag:'site250a-building-62'});
 // Low ancillary buildings and the central L-shaped process building.
 hall(-7,52,61,14,8.5,{floors:2,tag:'site250a-building-15'});
 hall(-72,3,36,16,9,{floors:2,tag:'site250a-building-33'});
 hall(-28,-10,38,10,6.7,{roof:'red',tag:'site250a-central-process'});
 hall(-11,3,11,32,6.7,{roof:'red',tag:'site250a-central-process-wing'});
 hall(-34,8,9,16,4,{roof:'white',tag:'site250a-process-annex'});
 hall(-25,-49,32,12,5,{tag:'site250a-north-control'});
 hall(-63,59,19,16,4.6);hall(-103,60,13,10,4,{roof:'red'});
 hall(16,113,18,57,9,{wall:'rust',roof:'wall',tag:'site250a-south-industrial-hall'});
 hall(133,12,24,20,7,{floors:2,tag:'site250a-building-65'});
 hall(103,-35,22,9,5,{tag:'site250a-electrical-control'});
 // Twin narrow structures in the northern fenced utility area, traced overhead.
 for(const z of [-106,-88])hall(-37,z,45,8,4.2,{wall:'white',roof:'white',windows:false,tag:'site250a-north-utility-row'});
 hall(-3,-97,7,27,5,{windows:false});

 // Aboveground utilities. The large pale corridor is visible in the satellite
 // and ground photographs; keep it enclosed instead of inventing a bare pipe.
 const galleryPixels=[[1128,765],[1374,411],[1410,404],[1772,650]];
 const gallery=galleryPixels.map(site250aPixel);
 for(let i=1;i<gallery.length;i++){
  const [a,c]=[gallery[i-1],gallery[i]],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
  k.box(2.8,2.2,len,(a[0]+c[0])/2,5.1,(a[1]+c[1])/2,'white','site250a-raised-gallery',yaw);
  for(let d=2;d<len;d+=10){const t=d/len;box(1,4,1,a[0]+dx*t,2,c[1]*t+a[1]*(1-t),'concrete','site250a-gallery-pier');}
 }
 const pipe=(points,y=2.6)=>{for(let i=1;i<points.length;i++)for(const offset of [-.55,.55])k.rod([points[i-1][0],y+offset,points[i-1][1]],[points[i][0],y+offset,points[i][1]],.22,'steel','site250a-utility-pipe');};
 pipe([[-66,-100],[-66,38],[4,38],[4,65],[31,65]]);
 pipe([[-42,-96],[-18,-96],[-18,-35],[-42,-35],[-42,25]]);
 for(let z=-96;z<=33;z+=12){box(.45,3.7,2,-66,1.85,z,'concrete','site250a-pipe-rack');}
 // Repeated compact vessels in the process yard, following the two rows on the
 // photographed site plan. Their detailed equipment type is intentionally unset.
 for(const x of [-28,-23,-18])for(const z of [13,20]){
  k.cyl(1.5,3.8,x,2.4,z,'white','site250a-process-vessel');k.sphere(1.5,x,4.3,z,'white','site250a-vessel-head',[1,.35,1]);
  box(3.7,.3,3.7,x,.3,z,'concrete','site250a-vessel-plinth');
 }
 // Southern equipment slabs with the remaining low cabinets visible overhead.
 for(const [cx,cz] of [[-81,117],[-25,116]]){
  for(let x=cx-21;x<=cx+21;x+=5.5)box(.045,.025,47,x,.205,cz,'soil','site250a-slab-joint');
  for(let z=cz-22;z<=cz+22;z+=5.5)box(44,.025,.045,cx,.205,z,'soil','site250a-slab-joint');
 }
 for(const z of [111,121]){hall(-82,z,24,4.5,2.6,{windows:false,tag:'site250a-equipment-row'});}
 for(const x of [17,25]){
  box(3.5,2.4,3,x,1.5,-21,'steel','site250a-transformer');
  for(let j=-2;j<=2;j++)box(.15,2.2,3.4,x+j*.6,1.5,-21,'concrete','site250a-transformer-fin');
  for(const z of [-22,-21,-20])k.cyl(.17,.9,x,3.1,z,'dark','site250a-insulator');
 }
 const fence=points=>{for(let i=1;i<points.length;i++){const [a,b]=[points[i-1],points[i]],len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(const y of [.8,1.7])k.rod([a[0],y,a[1]],[b[0],y,b[1]],.035,'steel','site250a-fence-wire');for(let d=0;d<len;d+=5){const t=d/len;k.rod([a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t],[a[0]+(b[0]-a[0])*t,2.2,a[1]+(b[1]-a[1])*t],.09,'concrete','site250a-fence-post');}}};
 fence([[-136,94],[-136,-28],[-80,-28],[-80,-137],[12,-137],[12,-30]]);
 fence([[-136,94],[-60,159],[40,159],[160,85],[160,-9]]);
 fence([[-73,-121],[-9,-121],[-9,-70],[-73,-70],[-73,-121]]);
 fence([[10,-26],[31,-26],[31,-16],[10,-16],[10,-26]]);
 for(const [i,[x,z]]of [[-119,-12],[-52,-12],[6,72],[84,73],[84,-12],[146,-10],[-43,95],[-40,-70]].entries()){
  k.rod([x,0,z],[x,7,z],.075,'steel','site250a-lamp');k.rod([x,7,z],[x+1.7,7.5,z],.06,'steel','site250a-lamp-arm');box(.8,.2,.35,x+1.7,7.5,z,'light','site250a-lamp-head');
  registerFacilityFloodlights(root,{id:'site250a-lamp-'+i,target:[x+1.7,.1,z],lamps:[{position:[x+1.7,7.4,z],normal:[0,-1,0],size:[.7,.3]}]});
 }
 if(typeof document!=='undefined'){
  k.sign('КОМАНДНЫЙ ПУНКТ РН «ЭНЕРГИЯ»',15.84,6.6,21,9,.85,-Math.PI/2);
  k.sign('250А · КРИОГЕННЫЙ ЦЕНТР',156,2.6,-20,7,1.1,Math.PI/2);
 }
 const metadata={version:SITE250A_VERSION,reference:SITE250A_REFERENCE,unit:'metre',scale:.14,anchorPreserved:true,
  bunker:b,views:SITE250A_VIEWS,roadPort:SITE250A_ACCESS.road,
  reconstruction:'satellite and photographed site-plan exterior; approximate dimensions; no interior reconstruction'};
 root.userData.site250aModel=metadata;return {...k.finish(),site250a:metadata};
}
