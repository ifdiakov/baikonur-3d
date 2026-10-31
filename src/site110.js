import * as THREE from 'three';
import {registerFacilityFloodlights,registerFacilityBeacon} from './facility-light-anchors.js?v=20261031-facilities-rails-lighting-v1';
import {archiveKit} from './archive-kit.js?v=20261031-facilities-rails-lighting-v1';
import {SITE110_PORTS} from './site110-ports.js?v=20261031-facilities-rails-lighting-v1';
export {SITE110_PORTS} from './site110-ports.js?v=20261031-facilities-rails-lighting-v1';

// Physical metres, Y up, X east and Z south. The application applies one
// museum metres-to-world scale to this entire complex and to its rocket.
export const SITE110_VERSION='site110-photo-rebuild-v1';
export const SITE110_REFERENCE=Object.freeze({
 originLonLat:[63.3077,45.9635], axes:{x:'east',y:'up',z:'south'}, units:'metres',
 sources:[
  'https://drive.google.com/drive/folders/1G7BvhrGYZrnXHjuHsDiGsnVBxi7jrnn7',
  'https://drive.google.com/file/d/1eYjF4gq89TBHBkKu_1r8VZt9xRU5EI8F/view',
  'http://www.buran.ru/htm/sk.htm',
  'http://www.buran.ru/htm/ongeck.htm',
  'http://www.buran.ru/htm/safck.htm',
  'http://www.buran.ru/htm/25-3.htm',
  'http://www.buran.ru/htm/table48.htm',
  'https://www.openstreetmap.org/way/169401566',
  'https://www.openstreetmap.org/way/169401625'
 ],
 // Least-squares circles fitted to the saved OSM perimeter vertices.
 pads:[
  {id:'left',centre:[-203.912076924,-136.696646256],radius:149.439871857,lonLat:[63.3050648086,45.9647279612],osmWay:169401566},
  {id:'right',centre:[202.098756586,137.925904838],radius:148.908117565,lonLat:[63.3103117575,45.9622609962],osmWay:169401625}
 ],
 dimensions:{shaftDiameter:20,trenchDepth:23,trenchSeparationDegrees:120,
  fixedServiceTower:60,pivotingServiceTower:100,lightningDiverter:225,
  energiaBuranHeight:58.765,energiaBuranSpan:23.92},
 dimensionSources:{shaftDiameter:'ongeck.htm',trenchDepth:'ongeck.htm',trenchSeparationDegrees:'ongeck.htm',
  fixedServiceTower:'sk.htm / sk-8.jpg',pivotingServiceTower:'sk.htm / sk-2.jpg and sk-21.jpg',
  lightningDiverter:'ongeck.htm',energiaBuranHeight:'table48.htm',energiaBuranSpan:'table48.htm'},
 // Photographs establish the shape, not a fabrication drawing. Widths of
 // steel members, accessory elevations and buried rooms remain estimates.
 estimated:['left service-pylon height inferred from rocket photograph','service-member sections','platform elevations',
  'floodlight-mast heights','hidden foundations','duct-bank profile away from the central shaft','escape-passage diameters'],
 dimensionConfidence:{lightningDiverter:'225m published in the archival narrative; construction drawing not available',
  fixedServiceTower:'60m caption describes the secondary right tower; left pair calibrated against the 58.765m vehicle photograph',
  pivotingServiceTower:'100m explicitly identified in the photo captions',
  shaftAndDucts:'dimensions explicitly described; bank curvature reconstructed from photographs'},
 numberingNote:'The archive uses inconsistent 37/38 labels; the model uses left/right positions.'
});

const YAW=-.53, BASE=5.4;
export const SITE110_ROCKET_MOUNT=Object.freeze({
 position:[SITE110_REFERENCE.pads[0].centre[0],BASE,SITE110_REFERENCE.pads[0].centre[1]],
 rotation:[0,YAW,0],axis:'y',forwardAxis:'z',baseY:BASE,
 vehicle:'energia-buran',heightMetres:58.765,spanMetres:23.92
});
export const SITE110_VIEWS=Object.freeze({
 all:{target:[0,38,0],eye:[690,710,790]},
 left:{target:[-203.912,34,-136.697],eye:[-47,170,68]},
 right:{target:[202.099,47,137.926],eye:[390,210,375]},
 trench:{target:[-203.912,-6,-136.697],eye:[-127,80,-239]},
 top:{target:[0,0,0],eye:[0,1050,.01]}
});

const V=(...p)=>new THREE.Vector3(...p);
const transform=(x,y,z,cx,cz,yaw)=>[cx+Math.cos(yaw)*x+Math.sin(yaw)*z,y,cz-Math.sin(yaw)*x+Math.cos(yaw)*z];

export function buildSite110(root){
 const k=archiveKit(root), padMetadata=[], floodlights=[];
 root.name='Площадка 110 · стартовый комплекс «Энергия — Буран»';
 k.mat.concrete.color.set(0xb4b0a2);k.mat.steel.color.set(0x727c79);
 k.mat.light.color.set(0xd7d7cc);k.mat.rust.color.set(0x8f6450);
 k.mat.red.color.set(0x9d574b);k.mat.dark.color.set(0x363c3b);
 k.mat.concrete.side=THREE.DoubleSide;k.mat.dark.side=THREE.DoubleSide;

 const localGroup=(x,z,yaw=0)=>{const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=yaw;root.add(g);return g;};
 const quad=(a,b,c,d,m,tag,parent=root)=>k.quad(a,b,c,d,m,tag,parent);
 function railings(points,y,{h=1.2,parent=root,colour='light',tag='service-railing'}={}){
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/3));
   for(const dh of [h*.5,h])k.rod([a[0],y+dh,a[1]],[b[0],y+dh,b[1]],.055,colour,tag,parent);
   for(let j=0;j<=n;j++){const t=j/n,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);k.rod([x,y,z],[x,y+h,z],.065,colour,tag,parent);}
  }
 }
 function frame(parent,{x=0,z=0,y=0,w=8,d=9,h=60,bays=12,colour='steel',taper=1,tag='service-tower',decks=true}){
  for(let i=0;i<bays;i++){
   const ya=y+h*i/bays,yb=y+h*(i+1)/bays,fa=1-(1-taper)*i/bays,fb=1-(1-taper)*(i+1)/bays;
   for(const sx of [-1,1])for(const sz of [-1,1])k.rod([x+sx*w*fa/2,ya,z+sz*d*fa/2],[x+sx*w*fb/2,yb,z+sz*d*fb/2],.22,colour,tag+'-upright',parent);
   for(const s of [-1,1]){
    k.rod([x-w*fa/2,ya,z+s*d*fa/2],[x+w*fb/2,yb,z+s*d*fb/2],.12,colour,tag+'-brace',parent);
    k.rod([x+w*fa/2,ya,z+s*d*fa/2],[x-w*fb/2,yb,z+s*d*fb/2],.12,colour,tag+'-brace',parent);
    k.rod([x+s*w*fa/2,ya,z-d*fa/2],[x+s*w*fb/2,yb,z+d*fb/2],.12,colour,tag+'-brace',parent);
    k.rod([x+s*w*fa/2,ya,z+d*fa/2],[x+s*w*fb/2,yb,z-d*fb/2],.12,colour,tag+'-brace',parent);
    k.rod([x-w*fa/2,ya,z+s*d*fa/2],[x+w*fa/2,ya,z+s*d*fa/2],.15,colour,tag+'-crossbeam',parent);
    k.rod([x+s*w*fa/2,ya,z-d*fa/2],[x+s*w*fa/2,ya,z+d*fa/2],.15,colour,tag+'-crossbeam',parent);
   }
   if(decks){k.box(w*fa,.25,d*fa,x,ya,z,'dark',tag+'-deck',0,parent);if(i%3===0)railings([[x-w*fa/2,z-d*fa/2],[x+w*fa/2,z-d*fa/2],[x+w*fa/2,z+d*fa/2]],ya,{parent});}
  }
 }
 function platform(parent,{x,z,y,w,d,colour='light',tag='service-platform',rail=true}){
  k.box(w,.38,d,x,y,z,colour,tag,0,parent);
  for(let xx=-w/2;xx<=w/2+.1;xx+=Math.max(1.8,w/7))k.box(.15,1.0,d,x+xx,y-.55,z,'steel',tag+'-underside-rib',0,parent);
  for(const dz of [-d/2,d/2])k.box(w,1.0,.18,x,y-.55,z+dz,'steel',tag+'-edge-girder',0,parent);
  if(rail)railings([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2],[x-w/2,z-d/2]],y+.2,{parent});
 }
 function gallery(parent,a,b,y,w=3.8,tag='access-gallery'){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
  k.path([a,b],w,y,'dark',tag+'-floor',parent);
  for(const s of [-1,1]){
   const pa=[a[0]+nx*s*w/2,a[1]+nz*s*w/2],pb=[b[0]+nx*s*w/2,b[1]+nz*s*w/2];
   k.rod([pa[0],y-.5,pa[1]],[pb[0],y-.5,pb[1]],.2,'steel',tag+'-chord',parent);
   railings([pa,pb],y,{parent});
   const n=Math.ceil(length/4);for(let i=0;i<n;i++){const t=i/n,u=(i+1)/n;k.rod([THREE.MathUtils.lerp(pa[0],pb[0],t),y-.6,THREE.MathUtils.lerp(pa[1],pb[1],t)],[THREE.MathUtils.lerp(pa[0],pb[0],u),y+1.2,THREE.MathUtils.lerp(pa[1],pb[1],u)],.1,'steel',tag+'-brace',parent);}
  }
 }
 function pipe(parent,points,r=1,colour='light',tag='process-duct'){
  for(let i=1;i<points.length;i++){
   k.rod(points[i-1],points[i],r,colour,tag,parent);
   const a=V(...points[i-1]),b=V(...points[i]),dir=b.clone().sub(a).normalize(),len=a.distanceTo(b),n=Math.max(1,Math.ceil(len/5));
   for(let j=0;j<n;j++){
    const p=a.clone().lerp(b,(j+.5)/n);
    k.rod(p.clone().addScaledVector(dir,-.075).toArray(),p.clone().addScaledVector(dir,.075).toArray(),r+.065,'steel',tag+'-joint',parent);
   }
  }
 }
 function ladder(parent,x,z,y0,y1,w=.85){
  for(const s of [-1,1])k.rod([x+s*w/2,y0,z],[x+s*w/2,y1,z],.06,'light','access-ladder',parent);
  for(let y=y0;y<y1;y+=.65)k.rod([x-w/2,y,z],[x+w/2,y,z],.045,'steel','ladder-rung',parent);
 }
 function servicePylon(parent,{x,z,h=60,sign=1,mobile=false}){
  const w=mobile?10:8.4,d=mobile?12:10.5,stem=mobile?h*.72:h;
  k.box(w+3,2.2,d+3,x,1.1,z,'concrete','service-tower-foundation',0,parent);
  frame(parent,{x,z,y:2.2,w,d,h:stem-2.2,bays:Math.round(stem/5),tag:mobile?'pivoting-tower':'fixed-service-pylon'});
  // Recessed lift shaft and large perforated service plates are the legible
  // vertical features in IMG_6397 and sk-3; no tapered generic radio mast.
  k.box(w*.45,stem-8,d*.43,x,stem/2+1,z+d*.21,'dark','recessed-lift-shaft',0,parent);
  for(let y=8;y<stem-5;y+=9){
   k.box(w*.52,3.4,.16,x,y,z+d/2+.06,'light','service-pylon-panelling',0,parent);
   for(const dx of [-1.25,1.25]){
    k.cyl(.58,.05,x+dx,y,z+d/2+.16,'dark','service-pylon-inspection-port',Math.PI/2,parent);
   }
  }
  const levels=mobile?[h*.66,h*.77,h*.88,h*.95]:[18,29,40.5,49.5,56];
  for(let n=0;n<levels.length;n++){
   const y=levels[n],extension=mobile?(n===3?23:20):(n===2?11:8.2),px=x-sign*(w/2+extension/2-1.1),pz=z+(n%2?1.4:-1.4);
   platform(parent,{x:px,z:pz,y,w:extension,d:mobile?17:10.2,colour:n===levels.length-1?'rust':'light',tag:mobile?'pivoting-cantilever':'fixed-pylon-platform'});
   for(const dz of [-3.8,3.8])k.rod([x,y-4.5,z+dz],[px-sign*(extension/2-1),y-.8,pz+dz],.28,'steel','cantilever-diagonal',parent);
  }
  if(mobile){
   frame(parent,{x:x-sign*7,z,y:stem,w:12,d:10,h:h-stem,bays:5,colour:'rust',tag:'pivoting-upper-head',decks:false});
   // Two open-ended forks leave the centre open, as the sk-2 underside view.
   for(const dz of [-9,9]){
    gallery(parent,[x-sign*2,z+dz],[x-sign*26,z+dz],h-5,4.2,'pivoting-fork');
    k.rod([x+sign*9,12,z-dz*.7],[x,h*.71,z+dz*.5],.7,'light','tower-backstay',parent);
   }
   k.cyl(6.1,1.4,x,2.8,z,'steel','pivot-bearing',0,parent);
  }else{
   for(const y of [24,46])k.rod([x+sign*23,2,z-4],[x,y,z+3.7],.38,'light','pylon-raking-brace',parent);
   platform(parent,{x:x+sign*4.4,z:z+8,y:12,w:9,d:7,tag:'service-pylon-lower-balcony'});
  }
  ladder(parent,x+sign*(w/2+.5),z-d/2,3,Math.min(h-2,stem));
  registerFacilityBeacon(parent,{id:`site110-service-${x}-${z}`,position:[mobile?x-sign*7+6:x+w/2,h,z+(mobile?5:d/2)],kind:'service-tower'});
 }
 function lightning(parent,x,z){
  k.box(25,1.1,25,x,.55,z,'concrete','diverter-foundation',0,parent);
  // Height225m is explicitly published by buran.ru/htm/ongeck.htm. The
  // segmented taper and white/red truss follow sk-22, not a floodlight pole.
  const sections=[[0,65,23,12],[65,120,12,5.6],[120,210,5.6,3.2],[210,219,3.2,1.2]];
  for(const [a,b,wa,wb] of sections){
   const n=Math.ceil((b-a)/10);for(let i=0;i<n;i++){
    const y=a+(b-a)*i/n,h=(b-a)/n,w=THREE.MathUtils.lerp(wa,wb,i/n),end=THREE.MathUtils.lerp(wa,wb,(i+1)/n),colour=(Math.floor(y/25)%2)?'red':'light';
    frame(parent,{x,z,y,w,d:w,h,bays:1,colour,taper:end/w,tag:'lightning-diverter',decks:false});
   }
  }
  for(const y of [65,120])platform(parent,{x,z,y,w:y===65?13:7,d:y===65?13:7,tag:'diverter-maintenance-deck'});
  k.rod([x,219,z],[x,225,z],.08,'steel','lightning-air-terminal',parent);
  k.rod([x-6,217,z],[x+6,217,z],.1,'red','diverter-top-crossarm',parent);
  registerFacilityBeacon(parent,{id:`site110-diverter-${x}-${z}`,position:[x,225,z],kind:'lightning-diverter'});
 }
 function floodlightBoard(parent,x,z,yaw,count=17){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=yaw;parent.add(g);
  const lamps=[];
  frame(g,{w:5.5,d:3.8,h:47,bays:9,taper:.8,tag:'floodlight-mast',decks:false});
  frame(g,{y:47,w:10.8,d:2.8,h:15,bays:5,tag:'floodlight-board',decks:false});
  for(let i=0;i<count;i++){
   const row=Math.floor(i/4),col=i%4,xx=(col-1.5)*2.5,yy=49+row*2.5;
   k.box(1.35,1.05,.8,xx,yy,-.35,'dark','projector-body',0,g);
   k.box(1.1,.82,.04,xx,yy,.08,'white','projector-reflector',0,g);
   floodlights.push({position:transform(xx,yy,.08,x,z,yaw),kind:'projector'});
   lamps.push({position:[xx,yy,.10],normal:[0,0,1],size:[1.1,.82]});
  }
  registerFacilityFloodlights(g,{id:'site110-projector-board',lamps,target:[0,0,32],beacon:[5.4,62,1.4]});
 }

 function makeTrenches(cx,cz,radius){
  const holes=[],ducts=[],angles=[Math.PI/3,Math.PI,5*Math.PI/3];
  const circle=Array.from({length:48},(_,i)=>[cx+10*Math.cos(i/48*2*Math.PI),cz+10*Math.sin(i/48*2*Math.PI)]);
  holes.push(circle);k.cutouts.push({x:cx,z:cz,rx:10,rz:10,yaw:0,shape:'ellipse'});
  for(const angle of angles){
   const axis=[Math.cos(angle),Math.sin(angle)],normal=[-axis[1],axis[0]];
   const at=(u,v,y)=>[cx+axis[0]*u+normal[0]*v,y,cz+axis[1]*u+normal[1]*v];
   const rows=Array.from({length:17},(_,i)=>{const t=i/16;return{u:8+126*t,rim:6+25*Math.sin(Math.PI*t*.87),floor:4.8+9*Math.sin(Math.PI*t*.94),y:-23*(1-t*t*t)};});
   const polygon=[...rows.map(r=>at(r.u,-r.rim,0)),...rows.slice().reverse().map(r=>at(r.u,r.rim,0))].map(p=>[p[0],p[2]]);
   holes.push(polygon);k.cutouts.push({polygon});
   for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];quad(at(a.u,-a.floor,a.y),at(b.u,-b.floor,b.y),at(b.u,b.floor,b.y),at(a.u,a.floor,a.y),'dark','flame-duct-floor');
    for(const s of [-1,1]){
     quad(at(a.u,s*a.floor,a.y),at(b.u,s*b.floor,b.y),at(b.u,s*b.rim,0),at(a.u,s*a.rim,0),'concrete','flame-duct-concrete-bank');
     k.rod(at(a.u,s*a.rim,.16),at(b.u,s*b.rim,.16),.22,'concrete','flame-duct-rim');
     if(i%2===0)k.rod(at(b.u,s*b.floor,b.y+.025),at(b.u,s*b.rim,.025),.045,'steel','concrete-expansion-joint');
    }
   }
   ducts.push({angle,depth:23,length:126,polygon,rows});
  }
  // Circular apron and the voids are a single triangulated surface. The
  // intersecting shaft/duct holes are unioned by using three apron sectors.
  for(let sector=0;sector<3;sector++){
   const a=angles[sector],b=a+2*Math.PI/3,points=[];
   // Apron sectors stop at each bank. The short inner circular arc joins the
   // adjacent duct lips and leaves the central shaft physically open.
   const firstPositive=ducts[sector].polygon.slice(17).reverse();
   const nextNegative=ducts[(sector+1)%3].polygon.slice(0,17);
   points.push(...firstPositive);
   const rows=ducts[sector].rows,outerAngle=Math.atan2(rows.at(-1).rim,rows.at(-1).u),innerAngle=Math.atan2(rows[0].rim,rows[0].u);
   for(let j=0;j<=24;j++){const ang=a+outerAngle+(b-a-2*outerAngle)*j/24;points.push([cx+radius*Math.cos(ang),cz+radius*Math.sin(ang)]);}
   points.push(...nextNegative.slice().reverse());
   for(let j=0;j<=7;j++){const ang=b-innerAngle-(b-a-2*innerAngle)*j/7;points.push([cx+10*Math.cos(ang),cz+10*Math.sin(ang)]);}
   k.poly(points,.025,'concrete','circular-launch-apron-sector');
  }
  // Only the retained cheeks of the central shaft are vertical walls;
  // the three open mouths continue down into the exhaust channels.
  for(let i=0;i<72;i++){
   const a=i/72*Math.PI*2,b=(i+1)/72*Math.PI*2,mid=(a+b)/2;
   if(angles.some(d=>Math.abs(Math.atan2(Math.sin(mid-d),Math.cos(mid-d)))<.65))continue;
   quad([cx+10*Math.cos(a),0,cz+10*Math.sin(a)],[cx+10*Math.cos(b),0,cz+10*Math.sin(b)],[cx+10*Math.cos(b),-23,cz+10*Math.sin(b)],[cx+10*Math.cos(a),-23,cz+10*Math.sin(a)],'concrete','central-shaft-cheek');
  }
  k.poly(circle,-23,'dark','central-shaft-floor');
  const pyramid=k.direct(new THREE.CylinderGeometry(.35,7.5,10,8,1,false),'dark','octagonal-flame-divider');pyramid.position.set(cx,-18,cz);pyramid.rotation.y=Math.PI/8;
  return ducts;
 }

 function launchTable(parent){
  // Three concrete bridge sectors leave three exhaust channels open.
  for(let i=0;i<3;i++){
   const angle=i*2*Math.PI/3+.53+Math.PI/2,g=new THREE.Group();g.rotation.y=angle;parent.add(g);
   k.box(8,23,8,0,-11.5,15.6,'concrete','launch-table-pier',0,g);
   k.box(9,3.2,19,0,1.6,13.5,'concrete','launch-bridge-sector',0,g);
   railings([[-4.8,12],[-4.8,23],[4.8,23],[4.8,12]],3.3,{parent:g});
  }
  const annulus=new THREE.Shape();annulus.absarc(0,0,13,0,2*Math.PI,false);const hole=new THREE.Path();hole.absarc(0,0,8.2,0,2*Math.PI,true);annulus.holes.push(hole);
  const plate=k.direct(new THREE.ExtrudeGeometry(annulus,{depth:1.35,bevelEnabled:false,curveSegments:36}),'steel','open-launch-support-table',parent);plate.rotation.x=-Math.PI/2;plate.position.y=3.9;
  for(let i=0;i<8;i++){const a=i/8*2*Math.PI;k.box(2.1,1.45,2.1,10.4*Math.cos(a),4.675,10.4*Math.sin(a),'light','vehicle-hold-down',0,parent);}
  for(const s of [-1,1]){
   k.box(5.4,1.8,32,s*8.4,2.9,26,'concrete','delivery-bridge-cheek',0,parent);
   k.box(2.8,1.0,5,s*8.4,4.3,12,'rust','hold-down-transfer-frame',0,parent);
   pipe(parent,[[s*39,2,-18],[s*26,3,-12],[s*17,3.4,-8]],.65,'rust','ground-ventilation-duct');
  }
 }

 for(const pad of SITE110_REFERENCE.pads){
  const [cx,cz]=pad.centre,isLeft=pad.id==='left',ducts=makeTrenches(cx,cz,pad.radius),g=localGroup(cx,cz,YAW);
  g.name=isLeft?'Левая позиция · «Энергия — Буран»':'Правая позиция · незавершённое переоборудование';
  launchTable(g);
  if(isLeft){
   servicePylon(g,{x:-20,z:-9,h:60,sign:-1});servicePylon(g,{x:20,z:-9,h:60,sign:1});
   // Large duct routes, folding access galleries and the narrow rear mast
   // are separate from the rocket, whose volume remains a clear mounting slot.
   frame(g,{x:0,z:-21,w:4.6,d:5.6,h:52,bays:10,tag:'rear-umbilical-mast',decks:true});
   registerFacilityBeacon(g,{id:'site110-rear-umbilical-mast',position:[2.3,52,-18.2],kind:'service-mast'});
   gallery(g,[-20,-9],[-9,-8],43,3.6,'left-umbilical-walkway');
   gallery(g,[20,-9],[9,-8],50,3.6,'right-umbilical-walkway');
   // safck.htm distinguishes two inclined enclosed passages: the regular
   // lift and the emergency slide. Both lead from the cabin-access platform
   // to the same ground refuge; they are not mirrored fuel pipes.
   gallery(g,[-20,-7],[-20,14],43,4.5,'crew-access-gallery');
   gallery(g,[-20,14],[-12,14],43,5.0,'crew-access-gallery');
   for(const [i,dx] of [-1.7,1.7].entries())pipe(g,[[-12+dx,42,14],[-16+dx,40,26],[-33+dx,3,77],[-35+dx,3,80]],1.0,'light',i?'emergency-escape-slide':'inclined-crew-lift');
   k.box(15,4.8,17,-35,2.4,80,'concrete','crew-refuge-bunker',0,g);
   k.box(2.5,2.8,.18,-35,1.4,88.6,'dark','crew-refuge-door',0,g);
   k.box(8,3.6,6,-15,43.8,14,'light','crew-transfer-cabin',0,g);
   for(const side of [-1,1])for(let i=0;i<3;i++)pipe(g,[[side*(30+i*.65),2,-31],[side*(23+i*.65),34,-18],[side*12,34,-7+i*.7]],.21,'steel','feed-line-bundle');
  }else{
   servicePylon(g,{x:-27,z:-10,h:100,sign:-1,mobile:true});
   servicePylon(g,{x:24,z:-9,h:60,sign:1});
   gallery(g,[-25,35],[-27,-5],9,5.2,'folded-emergency-evacuation-bridge');
   k.box(7.5,5.2,12,-25,11.5,29,'light','evacuation-cabin',0,g);
   for(let x=-27.5;x<-22;x+=1.5)k.box(1.05,1.6,.12,x,12.1,35.08,'glass','evacuation-cabin-window',0,g);
  }
  for(const [x,z] of [[-96,-73],[96,-73],[-92,98],[92,98]])lightning(g,x,z);
  for(const [i,[x,z]] of [[-82,-15],[82,-15],[-50,85],[50,85]].entries())floodlightBoard(g,x,z,Math.atan2(-x,-z),isLeft?(i===3?16:17):12);
  // Dual transporter tracks, each with standard Russian rail gauge. Their
  // 20m centre spacing is explicit, so a calibrated TUA can be seated on them.
  const delivery=[[0,35],[0,90],[0,180],[0,260]];
  for(const side of [-1,1])k.rail(delivery.map(([x,z])=>[x+side*10,z]),{gauge:1.52,bed:true,y:.28,tag:'transporter-running-rail',parent:g});
  for(let z=48;z<245;z+=16)k.box(23,.11,.45,0,.11,z,'concrete','transporter-cross-drain',0,g);
  for(const side of [-1,1]){
   k.box(28,4.5,13,side*55,2.25,-37,'concrete','buried-equipment-house',0,g);
   k.box(2.3,2.7,.2,side*55,1.35,-30.4,'dark','equipment-house-door',0,g);
   for(let n=0;n<5;n++)k.cyl(.5,3.8,side*(47+n*3),6.1,-37,'green','buried-services-vent',0,g);
   pipe(g,[[side*55,2,-30],[side*43,2,-20],[side*32,2,-8]],.7,'light','ground-service-pipe');
  }
  padMetadata.push({id:pad.id,centre:[cx,0,cz],apronRadius:pad.radius,shafts:1,ducts:ducts.map(d=>({angle:d.angle,depth:d.depth,length:d.length})),
   serviceConfiguration:isLeft?'paired-60m-energia-service-pylons':'100m-pivot-and-60m-secondary',
   serviceTowerHeights:isLeft?[60,60]:[100,60],lightningDiverterHeight:225,
   physicalTransporterRailGauge:1.52,transporterTrackCentres:20,yaw:YAW,
   rocketMount:isLeft?{...SITE110_ROCKET_MOUNT}:null});
 }

 // Source-traced northern technical area and the few through connections.
 // No speculative web of local roads is added around the complex.
 const buildings=[[-122,-392,52,125,14],[-18,-462,52,118,14],[90,-290,45,147,8],[-2,-55,36,92,6],[113,-25,34,88,6],[-99,131,36,85,6],[-212,265,45,110,6],[-260,350,27,87,5]];
 for(const [x,z,w,d,h] of buildings)k.hall({x,z,w,d,h,yaw:YAW,roof:'roof',windows:false,gates:1,tag:'source-traced-technical-house'});
 k.path([[-350,415],[-240,265],[-74,77],[65,-102],[219,-310]],8,.12,'asphalt','main-complex-access');
 k.path([[-390,-280],[-380,300],[-350,415]],6,.10,'asphalt','perimeter-service-access');
 for(const [pad,x] of [[SITE110_REFERENCE.pads[0],-410],[SITE110_REFERENCE.pads[1],10]])for(const s of [-1,1]){
  const entry=transform(s*10,0,260,...pad.centre,YAW);
  k.rail([[x+s*10,485],[entry[0],entry[2]]],{gauge:1.52,y:.28,tag:'transporter-incoming-rail'});
 }
 const features=k.finish();
 root.userData.flamePetals={perLaunch:3,launches:2,belowGrade:true};
 root.userData.tracedPads=SITE110_REFERENCE.pads.map(p=>p.centre.slice());
 root.userData.site110Model={version:SITE110_VERSION,units:'metres',originLonLat:SITE110_REFERENCE.originLonLat,
  commonScaleRequired:true,physicalPadSeparation:490.165627616,pads:padMetadata,
  rocketMount:{...SITE110_ROCKET_MOUNT},views:SITE110_VIEWS,sourceUrls:SITE110_REFERENCE.sources,
  ports:SITE110_PORTS,
  cutoutCount:k.cutouts.length,projectorCountLeft:67,detailPolicy:'instanced primary members; fine fasteners omitted',
  dimensionSources:SITE110_REFERENCE.dimensionSources,estimated:SITE110_REFERENCE.estimated,
  dimensionConfidence:SITE110_REFERENCE.dimensionConfidence,
  ...features};
 return features;
}
