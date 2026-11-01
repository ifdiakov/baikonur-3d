import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Photo-built RU, board 32. Metres, +Z nose, +Y up. This is deliberately
// independent of the historical PU-SOTN / LL22 in the Buran flight sequence.
export const MIG25_RU_VERSION='20261101-mig25ru-v1';
const V=(...a)=>new THREE.Vector3(...a),clamp=x=>THREE.MathUtils.clamp(x,0,1);
function batch(parent){
 const bins=new Map();
 return {add(g,m){const flat=g.index?g.toNonIndexed():g.clone();g.dispose();flat.deleteAttribute('color');if(!flat.attributes.normal)flat.computeVertexNormals();const uv=[],p=flat.attributes.position,n=flat.attributes.normal;for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i));uv.push((ax>ay?p.getZ(i):p.getX(i))*.25,(ay>ax?p.getZ(i):p.getY(i))*.25);}flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));if(!bins.has(m))bins.set(m,[]);bins.get(m).push(flat);},finish(label){for(const [m,gs]of bins){const g=mergeGeometries(gs);gs.forEach(x=>x.dispose());const mesh=new THREE.Mesh(g,m);mesh.name=label+' · '+m.name;parent.add(mesh);}}};
}
function polygon(points){
 const g=new THREE.BufferGeometry(),p=[];
 for(let i=1;i<points.length-1;i++)p.push(...points[0],...points[i],...points[i+1]);
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
function plate(points,thickness=.06,normal=V(0,1,0)){
 let pts=points.map(p=>V(...p));const winding=V();for(let i=0;i<pts.length;i++)winding.add(pts[i].clone().cross(pts[(i+1)%pts.length]));if(winding.dot(normal)<0)pts.reverse();
 const p=[],n=pts.length,a=pts.map(v=>v.clone().addScaledVector(normal,thickness/2)),b=pts.map(v=>v.clone().addScaledVector(normal,-thickness/2));
 const tri=(x,y,z)=>p.push(...x,...y,...z);
 for(let i=1;i<n-1;i++){tri(a[0],a[i],a[i+1]);tri(b[0],b[i+1],b[i]);}
 for(let i=0;i<n;i++){const j=(i+1)%n;tri(a[i],b[i],b[j]);tri(a[i],b[j],a[j]);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
function box(w,h,d,at){return new THREE.BoxGeometry(w,h,d).translate(...at);}
function rod(a,b,r=.018,segments=6){const from=V(...a),to=V(...b),delta=to.clone().sub(from),g=new THREE.CylinderGeometry(r,r,delta.length(),segments);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),delta.normalize()));g.translate(...from.add(to).multiplyScalar(.5));return g;}
function ring(radius,tube,at,axis='z',segments=40){const g=new THREE.TorusGeometry(radius,tube,6,segments);if(axis==='x')g.rotateY(Math.PI/2);g.translate(...at);return g;}
function cylinder(radius,depth,at,axis='z',segments=32){const g=new THREE.CylinderGeometry(radius,radius,depth,segments);if(axis==='z')g.rotateX(Math.PI/2);if(axis==='x')g.rotateZ(Math.PI/2);return g.translate(...at);}
function loft(stations,segments=40){
 // [z, half-width, half-height, centre-y, exponent]; exponent < 1
 // rounds the corners of the almost rectangular centre fuselage.
 const p=[],ix=[];
 for(const [z,w,h,cy,power=1]of stations)for(let j=0;j<=segments;j++){const a=j/segments*Math.PI*2,c=Math.cos(a),s=Math.sin(a);p.push(w*Math.sign(c)*Math.abs(c)**power,cy+h*Math.sign(s)*Math.abs(s)**power,z);}
 for(let k=0;k<stations.length-1;k++)for(let j=0;j<segments;j++){const a=k*(segments+1)+j,b=a+segments+1;ix.push(a,a+1,b,a+1,b+1,b);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
function arcPath(cx,cy,z,rx,ry,segments=24){return Array.from({length:segments+1},(_,j)=>{const a=j/segments*Math.PI;return [cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,z];});}
function path(b,points,mat,r=.012){for(let i=1;i<points.length;i++)b.add(rod(points[i-1],points[i],r,4),mat);}
function star(b,center,u,v,r,material,project=p=>p){const p=[center];const rim=[];for(let i=0;i<10;i++){const a=i*Math.PI/5,rr=r*(i%2?.39:1);rim.push(V(...center).addScaledVector(V(...u),Math.sin(a)*rr).addScaledVector(V(...v),Math.cos(a)*rr).toArray());}for(let i=0;i<10;i++)b.add(polygon([p[0],rim[i],rim[(i+1)%10]].map(project)),material);}

export function createMig25RU(){
 const root=new THREE.Group();root.name='МиГ-25РУ · борт 32';
 const material=(name,color,roughness=.63,metalness=.25,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});m.name=name;return m;};
 const paint=material('светло-серая обшивка',0x9da5a7,.61,.33),panel=material('панели обшивки',0x959c9b,.67,.32),light=material('кромки и створки',0xb3bab9,.57,.34),seam=material('расшивка',0x747d7e,.75,.2),black=material('антибликовое покрытие',0x253035,.91,.06),dark=material('каналы и ниши',0x101719,.92,.1),steel=material('жаропрочная сталь',0x6d6962,.5,.73),burnt=material('лепестки сопел',0x494744,.67,.7),chrome=material('штоки и крепёж',0xb7c2c5,.26,.82),tire=material('резина',0x1c2326,.97,.02),green=material('зелёные диски',0x304c3c,.65,.32),red=material('красные опознавательные знаки',0xa72625,.61,.12,{side:THREE.DoubleSide}),white=material('белая окантовка',0xe0dfcf,.75,.05,{side:THREE.DoubleSide}),seal=material('уплотнения фонарей',0xa47c6f,.72,.06),glass=material('остекление кабин',0x3d6269,.17,.24,{transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide});
 // Deterministic fine grain and broad mottling; no photo downloads or canvas.
 const texels=new Uint8Array(256*256*4);let seed=25132;
 const hash=(x,y)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
 const noise=(x,y,scale)=>{const px=x/scale,py=y/scale,ix=Math.floor(px),iy=Math.floor(py),u=px-ix,v=py-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),n=256/scale;return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix%n,iy%n),hash((ix+1)%n,iy%n),s),THREE.MathUtils.lerp(hash(ix%n,(iy+1)%n),hash((ix+1)%n,(iy+1)%n),s),t);};
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=Math.round(237+9*noise(x,y,32)+5*noise(x,y,8)+(seed/4294967296-.5)*6),i=(y*256+x)*4;texels.set([value,value,value,255],i);}
 const grain=new THREE.DataTexture(texels,256,256);grain.colorSpace=THREE.SRGBColorSpace;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.magFilter=THREE.LinearFilter;grain.minFilter=THREE.LinearMipmapLinearFilter;grain.generateMipmaps=true;grain.needsUpdate=true;grain.name='Неровность окрашенного металла';
 for(const m of [paint,panel,light,steel,burnt])m.map=grain;
 for(const m of [dark,panel,steel])m.side=THREE.DoubleSide;
 const b=batch(root),canopies=[],gearGroups=[];
 const bodyStations=[[-9.45,1.48,.65,-.1,.65],[-9.2,1.86,.9,-.03,.65],[-6.3,1.91,1.04,.02,.55],[-3,.88,1.08,.04,.8],[.8,.86,1.08,.08,.9],[2.9,.87,.89,.11],[4.1,.88,.89,.14],[5.5,.81,.82,.02],[6.5,.72,.69,-.14],[7.8,.58,.54,-.26],[8.9,.39,.36,-.28],[9.8,.14,.16,-.25],[10.32,.018,.026,-.21]];
 b.add(loft(bodyStations,48),paint);
 // The nose pitot is separate from the pointed fuselage, as in the RU photos.
 b.add(rod([0,-.21,10.26],[0,-.21,11.6],.018,8),chrome);
 for(const s of [-1,1])b.add(plate([[s*.02,-.21,10.7],[s*.19,-.21,10.56],[s*.02,-.21,10.54]],.012),chrome);
 // Black upper nose deck. The loft surface is an elliptical cylindrical patch.
 const blackStations=[[10.12,.055,.07,-.22],[9.8,.14,.16,-.25],[8.9,.39,.36,-.28],[7.8,.58,.54,-.26],[6.5,.72,.69,-.14],[5.5,.81,.82,.02]];
 for(let i=1;i<blackStations.length;i++){const rows=[];for(const [z,w,h,cy]of [blackStations[i-1],blackStations[i]])rows.push(Array.from({length:13},(_,j)=>{const a=Math.PI*.19+j/12*Math.PI*.62;return [(w+.007)*Math.cos(a),cy+(h+.009)*Math.sin(a),z];}));for(let j=0;j<12;j++)b.add(polygon([rows[0][j],rows[1][j],rows[1][j+1],rows[0][j+1]]),black);}
 // Two independent low canopies, each with a forward windscreen and rear fairing.
 function cockpit({z,base,width,height,length}){
  const stations=[[-length*.51,.04,.025],[ -length*.36,width*.79,height*.82],[-length*.08,width,height],[length*.26,width*.88,height*.88],[length*.49,width*.54,height*.40],[length*.59,.03,.015]];
  const rings=stations.map(([offset,w,h])=>arcPath(0,base,z+offset,w,h,20));
  const shell=new THREE.BufferGeometry(),shellIndices=[];shell.setAttribute('position',new THREE.Float32BufferAttribute(rings.flat(2),3));
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<20;j++){const a=i*21+j,d=a+21;shellIndices.push(a,a+1,d,a+1,d+1,d);}
  shell.setIndex(shellIndices);shell.computeVertexNormals();b.add(shell,glass);
  for(const i of [1,3,4]){path(b,rings[i],seal,.029);path(b,rings[i].map(p=>[p[0],p[1]+.012,p[2]]),light,.015);}
  for(const side of [-1,1]){path(b,stations.map(([dz,w])=>[side*w,base+.006,z+dz]),seal,.027);path(b,[[side*width*.47,base+height*.79,z+length*.30],[side*width*.26,base+height*.40,z+length*.49]],light,.024);}
  b.add(box(width*1.65,.08,length*.76,[0,base-.035,z]),dark);
  b.add(box(.52,.38,.22,[0,base+.10,z-length*.24]),black);b.add(box(.37,.14,.2,[0,base+.34,z-length*.24]),dark);
  b.add(box(.54,.12,.38,[0,base+.07,z-length*.10]),panel);b.add(box(width*1.55,.16,.25,[0,base+.08,z+length*.33]),black);
  b.add(rod([0,base+.04,z],[0,base+.27,z+.06],.023),black);
  for(const s of [-1,1])path(b,[[s*.16,base+.36,z-length*.23],[s*.19,base+.15,z-length*.12]],light,.024);
  canopies.push({z,base,width,height,length});
 }
 cockpit({z:7.27,base:.26,width:.53,height:.51,length:1.88});
 cockpit({z:4.75,base:.96,width:.58,height:.55,length:2.02});
 b.add(loft([[1.1,.33,.12,1.16],[2.2,.51,.27,1.14],[3.9,.60,.25,1.04],[4.1,.59,.12,1.01]],32),paint);
 // Dorsal service spine and removable access hatches.
 b.add(loft([[-10.03,0,0,.84],[-9.9,.08,.08,.84],[-8.3,.29,.17,1.01],[-3,.35,.18,1.13],[1.4,.37,.13,1.19]],24),panel);
 for(const z of [-8,-6.5,-4.7,-2.9,-1.1,.7]){const t=clamp((z+8.3)/5.3),u=clamp((z+3)/4.4);path(b,arcPath(0,z<-3?1.01+.12*t:1.13+.06*u,z,z<-3?.29+.06*t:.35+.02*u,z<-3?.17+.01*t:.18-.05*u,16),seam,.004);}
 for(const side of [-1,1]){
  // Hollow rectangular intake, including a recessed splitter ramp and four
  // inner walls. The opening is 1.6 m deep, not a black plate on a solid box.
  const inner=.88,outer=2.02,top=1.18,bottom=-1.02;
  const mouth=[[side*inner,-.82,3.22],[side*1.03,bottom,3.16],[side*1.85,bottom,3.16],[side*outer,-.82,3.22],[side*outer,top,3.83],[side*inner,top,3.83]];
  const throat=mouth.map(([x,y,z])=>[x*.91,y*.68,1.45]);
  for(let i=0;i<mouth.length;i++){const j=(i+1)%mouth.length;b.add(polygon([mouth[i],mouth[j],throat[j],throat[i]]),i===4?steel:dark);path(b,[mouth[i],mouth[j]],i===0?chrome:panel,.024);}
  b.add(polygon(throat),dark);
  // Outer duct skin, separate from the inner cavity.
  b.add(plate([[side*outer,-.82,3.22],[side*outer,top,3.83],[side*1.93,1.12,-4.7],[side*1.9,-.83,-4.7]],.055,V(side,0,0)),paint);
  b.add(plate([[side*inner,top,3.83],[side*outer,top,3.83],[side*1.93,1.12,-4.7],[side*.93,1.14,-4.7]],.045),light);
  b.add(plate([[side*1.03,bottom,3.16],[side*1.85,bottom,3.16],[side*1.74,-.98,-4.7],[side*.94,-.98,-4.7]],.035),panel);
  b.add(polygon([[side*1.85,bottom,3.16],[side*outer,-.82,3.22],[side*1.9,-.83,-4.7],[side*1.74,-.98,-4.7]]),panel);
  b.add(plate([[side*.84,-.7,3.51],[side*.84,1.21,4.02],[side*.84,1.17,1.1],[side*.84,-.86,1.1]],.035,V(side,0,0)),panel);
  // Intake movable upper ramp and its visible ribbing.
  b.add(polygon([[side*.93,1.12,3.6],[side*1.96,1.12,3.6],[side*1.81,.32,1.67],[side*.91,.32,1.67]]),panel);
  for(let k=0;k<7;k++){const t=k/7;path(b,[[side*.94,1.09-.72*t,3.52-1.76*t],[side*1.92,1.09-.72*t,3.52-1.76*t]],seam,.011);}
  const ductX=z=>side*(2.02+(1.93-2.02)*(3.83-z)/8.53+.004);
  for(const z of [2.5,1.7,.3,-1.3,-3.2,-4.6])path(b,[[ductX(z),-.78,z],[ductX(z),.97,z]],seam,.004);
  for(const y of [-.65,.03,.92])path(b,[[ductX(2.4),y,2.4],[ductX(-4.5),y,-4.5]],seam,.004);
  // High mounted trapezoid wing. Thin wedge edges and distinct moving surfaces.
  const wing=[[side*1.82,1.08,2.72],[side*6.99,.98,-1.91],[side*6.99,.91,-4.36],[side*1.82,.94,-4.91]];
  b.add(plate(wing,.105),paint);
  const wingPoint=(t,chord)=>{const x=1.83+5.16*t,front=2.71-4.62*t,back=-4.91+.55*t;return [side*x,1.148-.10*t-.14*chord,front+(back-front)*chord];};
  for(const t of [.13,.43,.76])path(b,[wingPoint(t,0),wingPoint(t,1)],seam,.009);
  for(const c of [.14,.72,.91]){const points=Array.from({length:9},(_,i)=>wingPoint(i/8,c));path(b,points,seam,.008);}
  for(const t of [.25,.68]){const a=wingPoint(t,1),d=wingPoint(t+.22,1);b.add(plate([wingPoint(t,.77),wingPoint(t+.22,.77),d,a],.022),panel);}
  // Boundary-layer fences visible both from above and in the frontal photo.
  const fenceX=4.70,front=.15,back=-4.60;
  b.add(plate([[side*fenceX,1.05,front],[side*fenceX,1.27,front-.19],[side*fenceX,1.20,back+.12],[side*fenceX,1.00,back]],.024,V(side,0,0)),light);
  b.add(rod([side*7.006,1.005,-4.44],[side*7.006,1.005,-1.28],.022,8),chrome);
  b.add(rod([side*6.99,1,-2.58],[side*6.99,1,-1.76],.050,10),panel);
  const wingStar=[side*5.7,1.07,-2.92];star(b,wingStar,[side,0,0],[0,0,1],.53,white);star(b,[wingStar[0],wingStar[1]+.004,wingStar[2]],[side,0,0],[0,0,1],.46,red);
  // Fin leans outward by 5 degrees. Tailplane is below the main wing.
  const fx=y=>side*(1.31+(y-.66)*.085);
  const fin=[[fx(.66),.66,-5.78],[fx(4.08),4.08,-8.02],[fx(4.08),4.08,-9.04],[fx(.66),.66,-10.07]];
  b.add(plate(fin,.10,V(side,0,-.025)),paint);
  b.add(plate([[fx(3.57),3.57,-7.69],[fx(4.08),4.08,-8.02],[fx(4.08),4.08,-9.04],[fx(3.57),3.57,-9.19]],.112,V(side,0,0)),black);
  path(b,[[fx(.84)+side*.058,.84,-9.49],[fx(3.54)+side*.058,3.54,-8.72]],seam,.009);
  path(b,[[fx(2.65)+side*.058,2.65,-7.08],[fx(2.65)+side*.058,2.65,-9.49]],seam,.008);
  for(const outward of [-1,1]){const c=[fx(2.31)+outward*.063,2.31,-8.27];star(b,c,[0,0,1],[0,1,0],.56,white,p=>[fx(p[1])+outward*.061,p[1],p[2]]);star(b,c,[0,0,1],[0,1,0],.48,red,p=>[fx(p[1])+outward*.065,p[1],p[2]]);}
  b.add(rod([fx(3.61),3.61,-8.98],[fx(3.61),3.61,-9.48],.07,10),light);
  const tail=[[side*1.1,.01,-6.25],[side*4.35,-.10,-8.30],[side*4.19,-.14,-9.81],[side*1.15,-.03,-9.47]];
  b.add(plate(tail,.095),paint);path(b,[[side*1.32,.035,-8.78],[side*4.2,-.075,-9.30]],seam,.009);
  b.add(plate([[side*1.46,-.72,-6.6],[side*1.55,-1.51,-8.22],[side*1.5,-1.45,-9.91],[side*1.41,-.72,-9.59]],.06,V(side,0,0)),panel);
  // Twin circular exhausts: open nozzles, nested rings and individual petals.
  const ex=side*.98,ey=-.13;
  b.add(loft([[-10.06,.945,.945,0],[-9.40,.97,.97,0]],40).translate(ex,ey,0),steel);
  for(let i=0;i<24;i++){
   const a=i/24*Math.PI*2,da=Math.PI*2/24*.94;
   const p=(r,z,t)=>[ex+r*Math.cos(t),ey+r*Math.sin(t),z];
   b.add(polygon([p(.945,-10.06,a),p(.84,-10.83,a),p(.84,-10.83,a+da),p(.945,-10.06,a+da)]),i%3===0?steel:burnt);
   b.add(polygon([p(.805,-10.82,a),p(.59,-9.55,a),p(.59,-9.55,a+da),p(.805,-10.82,a+da)]),dark);
  }
  b.add(ring(.83,.027,[ex,ey,-10.81]),steel);b.add(ring(.60,.025,[ex,ey,-9.62]),burnt);b.add(cylinder(.59,.025,[ex,ey,-9.54]),dark);
  for(const z of [-9.75,-9.46])b.add(ring(.95,.013,[ex,ey,z]),chrome);
  // Aft access panels, cooling louvres and heat-stained service panels.
  for(const z of [-8.5,-7.5,-6.5]){const t=(z+9.2)/2.9,w=1.86+.05*t,h=.9+.14*t,cy=-.03+.05*t,power=.65-.10*t;path(b,Array.from({length:15},(_,i)=>{const a=-.6+i/14*1.70;return [side*(w*Math.cos(a)**power+.004),cy+h*Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**power,z];}),seam,.004);}
  for(let j=0;j<10;j++)b.add(box(.012,.04,.24,[side*1.94,.42-j*.076,-5.22]),dark);
  for(let j=0;j<9;j++)b.add(box(.016,.018,.15,[side*.78,.67,3.73-j*.11]),dark);
  // Board number faces outward on each side. The digits are triangulated
  // vector outlines, not mirrored text or a platform-dependent canvas font.
  const digits={3:[[0,.40],[.34,.40],[.43,.29],[.40,.08],[.27,0],[.41,-.10],[.42,-.29],[.31,-.41],[0,-.41]],2:[[0,.31],[.10,.41],[.32,.41],[.43,.29],[.40,.13],[0,-.31],[0,-.41],[.44,-.41]]};
  const onNose=(u,y,lift)=>{const z=5.8-side*(u-.5);let i=1;while(i<bodyStations.length-1&&bodyStations[i][0]<z)i++;const a=bodyStations[i-1],c=bodyStations[i],t=(z-a[0])/(c[0]-a[0]),w=THREE.MathUtils.lerp(a[1],c[1],t),h=THREE.MathUtils.lerp(a[2],c[2],t),cy=THREE.MathUtils.lerp(a[3],c[3],t);return [side*(w*Math.sqrt(Math.max(0,1-((y-cy)/h)**2))+lift),y,z];};
  function paintedStroke(points,width,mat,lift){
   for(let i=1;i<points.length;i++){const a=points[i-1],c=points[i],du=c[0]-a[0],dv=c[1]-a[1],length=Math.hypot(du,dv),ox=-dv/length*width/2,oy=du/length*width/2,steps=Math.ceil(length/.055);for(let k=0;k<steps;k++){const u=a[0]+du*k/steps,v=a[1]+dv*k/steps,uu=a[0]+du*(k+1)/steps,vv=a[1]+dv*(k+1)/steps;b.add(polygon([[u+ox,v+oy],[u-ox,v-oy],[uu-ox,vv-oy],[uu+ox,vv+oy]].map(([u,v])=>onNose(u,v,lift))),mat);}}
   for(const [u,v]of points)for(let i=0;i<8;i++){const a=i*Math.PI/4,c=(i+1)*Math.PI/4;b.add(polygon([onNose(u,v,lift),onNose(u+Math.cos(a)*width/2,v+Math.sin(a)*width/2,lift),onNose(u+Math.cos(c)*width/2,v+Math.sin(c)*width/2,lift)]),mat);}
  }
  for(const [d,k]of [['3',0],['2',1]]){const points=digits[d].map(([u,v])=>[u+k*.56,v]);paintedStroke(points,.075,white,.015);paintedStroke(points,.047,red,.019);}
  // Flush hatches on the forward fuselage and a rescue handle below the cockpit.
  for(const z of [8.7,8.1,6.17]){
   const station=bodyStations.reduce((a,p)=>Math.abs(p[0]-z)<Math.abs(a[0]-z)?p:a,bodyStations[0]);
   const p=Array.from({length:25},(_,i)=>{const a=i/24*Math.PI*2;return [(station[1]+.006)*Math.cos(a),station[3]+(station[2]+.006)*Math.sin(a),station[0]];});path(b,p,seam,.006);
  }
  path(b,[[side*.77,-.13,6.62],[side*.78,-.13,6.86],[side*.78,-.24,6.86]],light,.018);
 }
 // Small central brake-parachute fairing between the engine nozzles.
 b.add(loft([[-11.05,0,0,.46],[-11.03,.055,.055,.46],[-10.76,.19,.19,.46],[-9.0,.22,.22,.47],[-8.3,.07,.08,.54]],24),panel);
 // Reusable gear geometry lives in three articulated groups; it is absent
 // from the flight silhouette once retracted. Doors move with their legs.
 function gear({name,x,z,r,w,nose=false}){
  const g=new THREE.Group();g.name=name;g.position.set(x,-.82,z);root.add(g);const gb=batch(g);
  gb.add(rod([0,.04,0],[0,-.74,.12],nose?.065:.09,12),light);gb.add(rod([0,-.43,.07],[0,-.92,.17],.044,12),chrome);
  gb.add(rod([0,-.14,-.40],[0,-.76,.10],.035,8),chrome);gb.add(rod([0,-.17,.08],[nose?0:-Math.sign(x)*.42,.03,-.55],.04,8),light);
  path(gb,[[.09,-.11,0],[.12,-.55,.04],[.09,-.80,.12]],black,.014);
  const wheelY=-1.32+r,centers=nose?[-.23,.23]:[Math.sign(x)*.16];
  for(const wx of centers){
   const t=new THREE.TorusGeometry(r-w*.27,w*.27,10,32);t.rotateY(Math.PI/2);t.scale(1.32,1,1);t.translate(wx,wheelY,.14);gb.add(t,tire);
   gb.add(cylinder(r*.60,w*.73,[wx,wheelY,.14],'x',32),green);
   for(const s of [-1,1]){gb.add(ring(r*.61,.016,[wx+s*w*.38,wheelY,.14],'x',28),chrome);gb.add(cylinder(r*.19,.015,[wx+s*w*.40,wheelY,.14],'x',16),green);for(let j=0;j<8;j++){const a=j*Math.PI/4;gb.add(cylinder(.024,.018,[wx+s*w*.40,wheelY+Math.cos(a)*r*.41,.14+Math.sin(a)*r*.41],'x',6),dark);}}
  }
  if(nose){gb.add(plate([[-.26,.01,-.52],[.26,.01,-.52],[.26,-.31,-.60],[-.26,-.31,-.60]],.032,V(0,0,1)),panel);gb.add(box(.14,.08,.12,[0,-.40,.10]),light);}
  else{const s=Math.sign(x);gb.add(plate([[s*.25,.05,-.55],[s*.25,.07,.53],[s*.41,-.49,.32],[s*.45,-.52,-.38]],.045,V(s,0,0)),paint);gb.add(box(.055,.47,.50,[s*.31,-.30,-.10]),panel);}
  gb.finish(name);gearGroups.push({group:g,nose,side:Math.sign(x)});
 }
 gear({name:'Носовая стойка · два колеса',x:0,z:6.15,r:.31,w:.24,nose:true});
 for(const s of [-1,1])gear({name:'Основная стойка '+s,x:s*1.75,z:-1.35,r:.53,w:.39});
 // Closed wheel-well covers are exchanged for actual open wells, avoiding
 // gear protruding through an unbroken fuselage in the parked configuration.
 const closed=new THREE.Group();closed.name='Закрытые створки шасси';root.add(closed);const cb=batch(closed);
 const wells=new THREE.Group();wells.name='Открытые ниши шасси';root.add(wells);const wb=batch(wells);
 for(const [x,y,z,w,d]of [[0,-.83,6.15,.64,1.36],[-1.66,-1.055,-1.25,.60,1.45],[1.66,-1.055,-1.25,.60,1.45]]){cb.add(box(w,.035,d,[x,y,z]),panel);wb.add(box(w,.018,d,[x,y-.025,z]),dark);}
 cb.finish('Шасси убрано');wb.finish('Ниши');b.finish('МиГ-25РУ');
 let extension=1;
 function setGear(value){extension=clamp(value);const a=extension*extension*(3-2*extension);for(const {group,nose,side}of gearGroups){group.visible=extension>.001;if(nose)group.rotation.x=(1-a)*Math.PI*.48;else group.rotation.z=-side*(1-a)*Math.PI*.48;}closed.visible=extension<.08;wells.visible=extension>=.08;root.userData.gear=extension;}
 root.userData.aircraft={type:'МиГ-25РУ',boardNumber:'32',unit:'metre',forward:'+Z',referenceImageCount:9,photoReconstruction:true,canopies:canopies.map(c=>({...c})),wheels:4,intakes:2,exhausts:2};
 setGear(1);root.updateMatrixWorld(true);
 return {root,setGear,stats:()=>({...root.userData.aircraft,gear:extension,version:MIG25_RU_VERSION})};
}
