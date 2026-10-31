import * as THREE from 'three';
import {archiveKit} from './archive-kit.js?v=20261031-rocket-exhibits-v1';
export const SEVEN_WINDS_VERSION='seven-winds-photo-v1';
export const SEVEN_WINDS_REFERENCE=Object.freeze({
 folder:'1P7P9qFCcGwdm4-FG0s_WsdAcrHIfByRf',
 photos:['1j5GB2VX50kPwBZBljKfLtGOvEywBqTyB','1yw2nwUCYBpDNawiQmPgLrQ4_mWY-YL_e','1WwqGOQ1entD9x-R9bVsrAR7HPAUZqNgK'],
 interpretation:'Four-storey exterior, entrance and two garden gazebos from owner photos. Dimensions and courtyard spacing are interpretive; existing named-hotel geographic anchor retained.',
 floors:4,bays:16,scale:.28,yaw:0
});
export function buildSevenWinds(root){
 const k=archiveKit(root),M=(name,color,roughness=.8)=>k.mat[name]=new THREE.MeshStandardMaterial({color,roughness});
 M('roof',0x788581,.92);M('sage',0x86988b);M('deepSage',0x465b53);M('ivory',0xd1d3c4);M('reveal',0x8f9687);M('frame',0xe0dfcf);
 M('pane',0x46616d,.3);M('curtain',0x839da0);M('plinth',0x73483b);M('paver',0x9e9390);M('wood',0x879781);M('tile',0x544044);k.mat.tile.side=THREE.DoubleSide;k.mat.wood.side=THREE.DoubleSide;M('shrub',0x55634a);M('soilBed',0x7f775a);
 const glow=M('warmWindow',0xd6b67b,.4);glow.emissive.setHex(0xffc17a);glow.emissiveIntensity=.40;
 const bulb=M('lampGlobe',0xece5cc,.35);bulb.emissive.setHex(0xffd09a);bulb.emissiveIntensity=.85;
 const W=49.6,D=13.8,H=13.7,bay=W/16,storey=3.2,ww=1.65,wh=1.65,front=D/2;
 k.box(W,.70,D,0,.35,0,'plinth','red-stone-plinth');k.box(W-.4,H-.7,D-.6,0,(H+.7)/2,0,'deepSage','hotel-core');
 const pattern=[
 ['deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','deepSage','sage','ivory'],
 ['sage','sage','deepSage','deepSage','ivory','ivory','deepSage','sage','sage','sage','ivory','ivory','sage','ivory','sage','ivory'],
 ['ivory','sage','sage','deepSage','ivory','ivory','deepSage','sage','sage','sage','ivory','ivory','sage','ivory','sage','ivory'],
 ['ivory','sage','sage','deepSage','ivory','ivory','deepSage','ivory','ivory','ivory','ivory','ivory','sage','ivory','sage','ivory']
 ];
 // Deep window reveals and white mullions remain readable when orbiting close.
 for(const side of [-1,1])for(let f=0;f<4;f++)for(let b=0;b<16;b++){
  const x=-W/2+bay*(b+.5),y=.7+storey*f,center=y+1.6,z=side*(front+.035),material=pattern[f][side>0?b:15-b];
  const pier=(bay-ww)/2;
  for(const sx of [-1,1])k.box(pier,storey,.18,x+sx*(ww/2+pier/2),y+storey/2,z,material,'facade-panel');
  k.box(ww,.8,.18,x,y+.4,z,material,'facade-spandrel');k.box(ww,.75,.18,x,y+2.825,z,material,'facade-spandrel');
  k.box(ww+.12,wh+.12,.08,x,center,z-side*.03,'reveal','window-reveal');
  k.box(ww,wh,.04,x,center,z+side*.025,(f+b*3)%9===0?'warmWindow':'pane','window-glazing');
  if((b+f)%3!==0)k.box(.37,wh-.12,.018,x-.58,center,z+side*.05,'curtain','window-curtain');
  for(const sx of [-1,1])k.box(.065,wh+.12,.10,x+sx*ww/2,center,z+side*.08,'frame','window-frame');
  for(const sy of [-1,1])k.box(ww+.12,.065,.10,x,center+sy*wh/2,z+side*.08,'frame','window-frame');
  k.box(.055,wh,.10,x+.18,center,z+side*.08,'frame','window-mullion');k.box(ww,.05,.10,x,center+.44,z+side*.08,'frame','window-transom');
  k.box(ww+.22,.075,.32,x,center-wh/2-.035,z+side*.12,'frame','window-sill');
  // Fine cladding joints, lifted above the facade to avoid z fighting.
  for(const dy of [.05,.72,1.35,2.05,2.72]){const length=dy>.8&&dy<2.5?pier:bay-.04;for(const sx of (length===pier?[-1,1]:[0]))k.box(length,.012,.012,x+sx*(ww/2+pier/2),y+dy,z+side*.13,'reveal','panel-joint');}
 }
 // Both narrow ends have recessed access balconies, framed by tall piers.
 for(const end of [-1,1]){
  const x=end*(W/2+.20);for(const z of [-5.1,5.1])k.box(.70,H+.45,1.05,x,(H+.45)/2,z,'sage','end-pier');
  k.box(.15,H,8.4,x-end*.22,H/2,0,'ivory','balcony-back');
  for(let f=0;f<4;f++){
   const y=.7+f*storey;
   k.box(1.2,.16,8.6,x+end*.46,y+.04,0,'ivory','balcony-slab');
   k.box(.12,1.14,8.2,x+end*1.0,y+.66,0,'sage','balcony-parapet');
   k.rod([x+end*1.04,y+1.32,-4.2],[x+end*1.04,y+1.32,4.2],.035,'frame','balcony-rail');
   k.box(.04,2.1,1.2,x+end*.09,y+1.18,-2.25,'pane','balcony-door');
   k.box(.04,1.35,1.4,x+end*.09,y+1.85,1.2,'pane','end-window');
  }
 }
 k.box(W+.9,.20,D+1.0,0,H+.07,0,'deepSage','flat-roof-parapet');k.box(W-.4,.06,D-.3,0,H+.20,0,'roof','flat-roof');
 for(const x of [-18,-7,8,19]){k.box(.6,1.0,.6,x,H+.55,-3.5,'concrete','roof-vent');k.box(.9,.12,.9,x,H+1.10,-3.5,'steel','vent-cap');}
 // Broad white cantilever, with the characteristic outward leaning supports.
 k.box(8.6,2.7,.25,2,2.05,front+.16,'dark','entrance-recess');
 for(const x of [0,2,4]){k.box(1.88,2.45,.12,x,1.92,front+.34,'pane','entrance-glass');k.box(.07,2.5,.15,x-.94,1.92,front+.43,'frame','entrance-mullion');}
 for(let s=0;s<5;s++)k.box(10,.13,3.5-s*.45,2,.065+s*.13,front+1.65-s*.2,'ivory','entrance-step');
 k.box(12.0,.70,4.2,2,4.15,front+1.8,'ivory','entrance-canopy');
 for(const x of [-2.4,6.4])k.rod([x,.6,front+3.2],[x+.7,3.85,front+2.1],.18,'ivory','slanted-canopy-column');
 for(const x of [-.8,2,4.8])k.box(.75,.05,.42,x,3.785,front+2.2,'lampGlobe','canopy-downlight');
 // Photo-derived typography is generated at runtime, avoiding a large bitmap asset.
 function lettering(text,x,y,z,w,h,yaw=0){
  if(typeof document==='undefined')return;
  const cv=document.createElement('canvas');cv.width=1024;cv.height=192;const ctx=cv.getContext('2d');ctx.clearRect(0,0,1024,192);ctx.fillStyle='#353d99';ctx.font='900 140px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,102,1000);
  const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshStandardMaterial({map:tx,transparent:true,roughness:.7,depthWrite:false});
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(x,y,z);m.rotation.y=yaw;m.name='Гостиница · '+text;root.add(m);
 }
 lettering('ГОСТИНИЦА',2,4.20,front+3.915,9.6,.58);
 for(const [i,ch]of [...'ЦЭНКИ'].entries())lettering(ch,-W/2-.57,12.15-i*1.5,5.65,1.10,1.28);
 // Courtyard follows the ground photos: drive, white curbs, beds and two gazebos opposite the facade.
 k.box(64,.09,9,0,.04,14.7,'paver','front-walk');
 k.path([[-36,20],[28,20],[32,18]],4.8,.085,'asphalt','hotel-drive');
 for(const z of [17.45,22.55])k.path([[-36,z],[29,z]],.24,.18,'ivory','white-drive-curb');
 k.path([[2,10],[2,17.1]],3.2,.13,'paver','entrance-path');
 k.path([[-30,25],[28,25],[28,38]],2.0,.10,'paver','garden-path');
 for(const [x,z,w,d]of [[-19,13.8,10,4.2],[18,13.8,10,4.2],[-17,29,14,7],[3,34,11,5]]){
  k.box(w,.12,d,x,.06,z,'soilBed','garden-bed');for(const s of [-1,1]){k.box(w+.15,.30,.13,x,.15,z+s*d/2,'plinth','garden-border');k.box(.13,.3,d,x+s*w/2,.15,z,'plinth','garden-border');}
  for(let i=0;i<4;i++)k.sphere(.65+(i%2)*.18,x-w*.34+i*w*.21,.60,z,'shrub','garden-shrub',[1,.75,.85]);
 }
 const gazebos=[{x:18,z:31,r:3.25},{x:28,z:35.5,r:2.65}];
 for(const [index,p]of gazebos.entries()){
  const n=8,h=2.5,verts=Array.from({length:n},(_,i)=>{const a=i*Math.PI*2/n+Math.PI/8;return [p.x+p.r*Math.cos(a),p.z+p.r*Math.sin(a)];});
  k.poly(verts,.14,'paver','gazebo-floor');
  for(let i=0;i<n;i++){
   const a=verts[i],b=verts[(i+1)%n];k.rod([a[0],.15,a[1]],[a[0],h,a[1]],.065,'wood','gazebo-post');
   k.rod([a[0],h,a[1]],[b[0],h,b[1]],.075,'wood','gazebo-upper-rail');
   // Leave the front-facing segment open for access.
   if(i!==5){
    k.quad([a[0],.18,a[1]],[b[0],.18,b[1]],[b[0],.88,b[1]],[a[0],.88,a[1]],'wood','gazebo-low-panel');
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let t=0;t<len;t+=.29)for(const slope of [-1,1]){
     const lo=Math.max(0,t-.70),hi=Math.min(len,t+.70),v=(lo-t)*slope,yy=1.65+v;
     const yy2=1.65+(hi-t)*slope;
     if(yy>=.94&&yy<=2.36&&yy2>=.94&&yy2<=2.36)k.rod([a[0]+(b[0]-a[0])*lo/len,yy,a[1]+(b[1]-a[1])*lo/len],[a[0]+(b[0]-a[0])*hi/len,yy2,a[1]+(b[1]-a[1])*hi/len],.018,'wood','gazebo-lattice');
    }
   }
   const roofR=p.r+.35,aa=i*Math.PI*2/n+Math.PI/8,bb=(i+1)*Math.PI*2/n+Math.PI/8,A=[p.x+roofR*Math.cos(aa),h,p.z+roofR*Math.sin(aa)],B=[p.x+roofR*Math.cos(bb),h,p.z+roofR*Math.sin(bb)],top=[p.x,h+1.20,p.z];
   k.quad(B,A,top,top,'tile','gazebo-roof');k.rod(A,top,.025,'plinth','gazebo-hip-ridge');
   for(let row=1;row<6;row++){const t=row/6,P=A.map((v,j)=>THREE.MathUtils.lerp(v,top[j],t)),Q=B.map((v,j)=>THREE.MathUtils.lerp(v,top[j],t));P[1]+=.015;Q[1]+=.015;k.rod(P,Q,.018,'roof','gazebo-tile-row');}
  }
  k.cyl(.63,.11,p.x,.85,p.z,'wood','gazebo-table');k.cyl(.09,.70,p.x,.45,p.z,'wood','gazebo-table-leg');
  for(const side of [-1,1])k.box(1.8,.12,.45,p.x,.5,p.z+side*1.35,'wood','gazebo-bench');
  k.sphere(.12,p.x,2.2,p.z,'lampGlobe','gazebo-pendant');
 }
 function bench(x,z,yaw=0){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=yaw;root.add(g);for(let i=0;i<5;i++){k.box(2.5,.08,.11,0,.55,-.25+i*.12,'wood','bench-seat',0,g);k.box(2.5,.11,.06,0,.75+i*.12,-.36,'ivory','bench-back',0,g);}for(const side of [-1,1])k.box(.10,.55,.6,side*.95,.275,0,'dark','bench-frame',0,g);}
 for(const [x,z]of [[-23,10.8],[-10,10.8],[14,10.8],[24,27.4]])bench(x,z);
 for(const [x,z]of [[-27,12],[-10,12],[10,12],[27,12],[-27,26],[8,27],[27,39]]){
  k.rod([x,0,z],[x,3.5,z],.055,'dark','garden-lamp-pole');
  const pts=Array.from({length:11},(_,i)=>{const a=Math.PI*i/10;return [x+.36-.36*Math.cos(a),3.5+.36*Math.sin(a),z];});for(let i=1;i<pts.length;i++)k.rod(pts[i-1],pts[i],.03,'dark','garden-lamp-crook');k.sphere(.22,x+.72,3.35,z,'lampGlobe','garden-lamp-globe');
 }
 for(const [a,b]of [[[-33,-10],[34,-10]],[[34,-10],[34,42]],[[-33,42],[34,42]],[[-33,-10],[-33,16]],[[-33,24],[-33,42]]]){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let t=0;t<=len;t+=1.1){const x=a[0]+(b[0]-a[0])*t/len,z=a[1]+(b[1]-a[1])*t/len;k.rod([x,.15,z],[x,2.1,z],.022,'dark','perimeter-picket');}for(const y of [.4,1.8])k.rod([a[0],y,a[1]],[b[0],y,b[1]],.032,'dark','perimeter-rail');
 }
 const result=k.finish();root.userData.setHotelEvening=value=>{glow.emissiveIntensity=value?.65:0;bulb.emissiveIntensity=value?1.15:0;};root.userData.sevenWinds={version:SEVEN_WINDS_VERSION,floors:4,windowBays:16,gazebos:2,reference:SEVEN_WINDS_REFERENCE};return {...result,version:SEVEN_WINDS_VERSION};
}
