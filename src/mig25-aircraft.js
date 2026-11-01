import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createMig25Surface} from './mig25-surface.js?v=20261101-mig25-single-v2';

export const MIG25_VERSION='20261101-mig25-single-v2';
const V=(...a)=>new THREE.Vector3(...a),clamp=x=>THREE.MathUtils.clamp(x,0,1);
function batch(parent){
 const bins=new Map();
 return {add(g,m){const flat=g.index?g.toNonIndexed():g.clone();g.dispose();flat.deleteAttribute('color');if(!flat.attributes.normal)flat.computeVertexNormals();const uv=[],p=flat.attributes.position,n=flat.attributes.normal;const keepUV=g.userData.parametricUV&&flat.attributes.uv;for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i));uv.push((ax>ay?p.getZ(i):p.getX(i))*.16,(ay>ax?p.getZ(i):p.getY(i))*.16);}if(!keepUV)flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));if(!bins.has(m))bins.set(m,[]);bins.get(m).push(flat);},finish(label){for(const [m,gs]of bins){const g=mergeGeometries(gs);gs.forEach(x=>x.dispose());const mesh=new THREE.Mesh(g,m);mesh.name=label+' · '+m.name;parent.add(mesh);}}};
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
 const p=[],ix=[],uv=[];
 for(const [z,w,h,cy,power=1]of stations)for(let j=0;j<=segments;j++){const a=j/segments*Math.PI*2,c=Math.cos(a),s=Math.sin(a);p.push(w*Math.sign(c)*Math.abs(c)**power,cy+h*Math.sign(s)*Math.abs(s)**power,z);uv.push(z*.16,j/segments*.8);}
 for(let k=0;k<stations.length-1;k++)for(let j=0;j<segments;j++){const a=k*(segments+1)+j,b=a+segments+1;ix.push(a,a+1,b,a+1,b+1,b);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.userData.parametricUV=true;g.computeVertexNormals();return g;
}
function arcPath(cx,cy,z,rx,ry,segments=24){return Array.from({length:segments+1},(_,j)=>{const a=j/segments*Math.PI;return [cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,z];});}
function path(b,points,mat,r=.012){for(let i=1;i<points.length;i++)b.add(rod(points[i-1],points[i],r,4),mat);}
function star(b,center,u,v,r,material,project=p=>p){const p=[center];const rim=[];for(let i=0;i<10;i++){const a=i*Math.PI/5,rr=r*(i%2?.39:1);rim.push(V(...center).addScaledVector(V(...u),Math.sin(a)*rr).addScaledVector(V(...v),Math.cos(a)*rr).toArray());}for(let i=0;i<10;i++)b.add(polygon([p[0],rim[i],rim[(i+1)%10]].map(project)),material);}

/** Single-seat MiG-25, reconstructed anew from the 17 replacement views.
 * Metres, +Y up, +Z nose. */
export function createMig25(){
 const root=new THREE.Group();root.name='МиГ-25 · борт 46';
 const {map,detail}=createMig25Surface();
 const material=(name,color,roughness=.65,metalness=.35,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});m.name=name;return m;};
 const skin={map,bumpMap:detail,bumpScale:.008,roughnessMap:detail};
 const paint=material('панели светлой обшивки',0xc4cecd,.9,.40,skin),panel=material('панели обслуживания',0xc4cccb,.9,.35,skin),light=material('кромки и створки',0xd0d5d1,.68,.4),seam=material('линии сопряжений',0x637274,.83,.15),black=material('противобликовая панель',0x232b2c,.92,.06),dark=material('каналы и ниши',0x11191c,.93,.12,{side:THREE.DoubleSide}),radome=material('серый носовой обтекатель',0x87908d,.80,.12),steel=material('нагретый металл',0x81796a,.69,.62,skin),burnt=material('наружные лепестки сопел',0x595044,.66,.65),ceramic=material('внутренняя поверхность сопел',0x3e452c,.88,.12,{side:THREE.DoubleSide}),chrome=material('крепёж и штоки',0xb3bec1,.31,.76),tire=material('резина',0x1b2021,.97,.02),green=material('зелёные диски',0x31503d,.7,.3),red=material('красные опознавательные знаки',0xab2927,.8,.08,{side:THREE.DoubleSide}),white=material('белая окантовка',0xf0eee6,.8,.02,{side:THREE.DoubleSide}),gold=material('эмблемы',0xd4ad2c,.7,.2,{side:THREE.DoubleSide}),glass=material('остекление одной кабины',0x2c3e42,.15,.28,{transparent:true,opacity:.68,depthWrite:false,side:THREE.DoubleSide});
 const b=batch(root),gearGroups=[];
 // New body stations: a single continuous nose with no training-cockpit step.
 const nose=[[-4.7,.9,.89,.02,.78],[-1.5,.87,.89,.03,.88],[2.8,.83,.81,.02],[4.5,.77,.71,-.02],[5.8,.73,.65,-.06],[7.5,.66,.57,-.10]];
 b.add(loft(nose,64),paint);
 const cone=[[7.5,.662,.572,-.10],[8.1,.58,.51,-.10],[8.65,.48,.42,-.10],[9.2,.34,.30,-.10],[9.7,.19,.17,-.10],[10.14,.065,.059,-.10],[10.30,0,0,-.10]];
 b.add(loft(cone,64),radome);b.add(rod([0,-.10,10.23],[0,-.10,11.35],.014,10),chrome);
 // Split aft fuselage: the front of each nacelle stays hollow for the intakes.
 b.add(loft([[-8.80,1.71,.78,-.02,.72],[-8.4,1.96,.91,.01,.58],[-5.4,1.98,.96,0,.49],[-3.8,1.87,.94,.01,.53]],56),paint);
 // Thin upper anti-glare surface, ending at the radome seam.
 const upper=[[4.8,.75,.69,-.025],[5.8,.73,.65,-.06],[7.5,.66,.57,-.1]];
 for(let k=1;k<upper.length;k++)for(let j=0;j<20;j++){
  const p=([z,w,h,cy],i)=>{const a=.24*Math.PI+i/20*.52*Math.PI;return [(w+.008)*Math.cos(a),cy+(h+.01)*Math.sin(a),z];};
  b.add(polygon([p(upper[k-1],j),p(upper[k-1],j+1),p(upper[k],j+1),p(upper[k],j)]),black);
 }
 // Low single canopy: arched sliding hood plus the separate angular windscreen.
 const canopy={z:4.95,base:.665,width:.44,height:.37,length:1.63};
 const hood=[[-.88,.31,.15],[-.65,.44,.34],[.10,.44,.37],[.38,.39,.30]];
 const rings=hood.map(([z,w,h])=>arcPath(0,canopy.base,canopy.z+z,w,h,24)),positions=rings.flat(2),indices=[];
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<24;j++){const a=i*25+j,c=a+25;indices.push(a,a+1,c,a+1,c+1,c);}
 const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setIndex(indices);shell.computeVertexNormals();b.add(shell,glass);
 for(const i of [0,3])path(b,rings[i],light,.023);
 const crest=[0,1.04,5.34],front=[0,.66,6.03];
 for(const s of [-1,1]){
  b.add(polygon([[s*.39,.665,5.33],crest,front,[s*.30,.626,5.98]]),glass);
  path(b,[[s*.39,.665,5.33],crest,front,[s*.30,.626,5.98]],light,.018);
  path(b,hood.map(([dz,w])=>[s*w,canopy.base-.006,canopy.z+dz]),light,.022);
 }
 b.add(box(.68,.055,1.24,[0,.65,4.8]),dark);b.add(box(.43,.28,.22,[0,.76,4.42]),black);b.add(box(.29,.10,.18,[0,.925,4.42]),black);
 b.add(box(.52,.13,.25,[0,.74,5.25]),black);b.add(rod([0,.68,4.9],[0,.82,4.98],.02),black);
 for(const s of [-1,1])path(b,[[s*.14,.94,4.43],[s*.17,.72,4.64]],panel,.02);
 // Shoulder fairing behind the hood blends into the long, narrow service spine.
 b.add(loft([[-8.95,0,0,.85],[-8.6,.15,.10,.9],[-5,.31,.15,.95],[0,.33,.17,.97],[2.3,.42,.22,.94],[3.6,.49,.24,.86],[4.09,.33,.20,.78]],40),paint);
 // Skin markings are ribbons tessellated onto their actual carrier surface.
 function ribbon(points,width,mat,project){
  for(let i=1;i<points.length;i++){
   const a=points[i-1],c=points[i],dx=c[0]-a[0],dy=c[1]-a[1],len=Math.hypot(dx,dy),ox=-dy/len*width/2,oy=dx/len*width/2,n=Math.max(1,Math.ceil(len/.05));
   for(let k=0;k<n;k++){const x=a[0]+dx*k/n,y=a[1]+dy*k/n,xx=a[0]+dx*(k+1)/n,yy=a[1]+dy*(k+1)/n;b.add(polygon([[x+ox,y+oy],[x-ox,y-oy],[xx-ox,yy-oy],[xx+ox,yy+oy]].map(project)),mat);}
  }
 }
 function noseSurface(z,y,side,lift=.014){let i=1;while(i<nose.length-1&&nose[i][0]<z)i++;const a=nose[i-1],c=nose[i],t=(z-a[0])/(c[0]-a[0]),w=THREE.MathUtils.lerp(a[1],c[1],t),h=THREE.MathUtils.lerp(a[2],c[2],t),cy=THREE.MathUtils.lerp(a[3],c[3],t);return [side*(w*Math.sqrt(Math.max(0,1-((y-cy)/h)**2))+lift),y,z];}
 for(const side of [-1,1]){
  // Six-sided mouth with chamfered lower corners. The floor and internal ramp
  // recede into the duct; no skin surface crosses the opening.
  const mouth=[[side*.89,-.80,3.41],[side*1.04,-.99,3.37],[side*1.83,-.99,3.37],[side*2.02,-.79,3.43],[side*2.02,.94,4.05],[side*.89,.94,4.05]];
  const throat=mouth.map(([x,y])=>[x*.94,y*.74,1.6]);
  for(let i=0;i<mouth.length;i++){const j=(i+1)%mouth.length;b.add(polygon([mouth[i],mouth[j],throat[j],throat[i]]),dark);path(b,[mouth[i],mouth[j]],light,.015);}
  b.add(polygon(throat),dark);
  const ramp=[[side*.93,.90,3.94],[side*1.98,.90,3.94],[side*1.87,.35,1.77],[side*.91,.35,1.77]];
  b.add(plate(ramp,.012,V(0,-1,.3).normalize()),steel);
  for(let k=0;k<8;k++){const t=k/9;path(b,[[side*.94,.881-.52*t,3.89-2.04*t],[side*1.93,.881-.52*t,3.89-2.04*t]],seam,.005);}
  // Wide duct with a curved lower corner and a tapered aft transition.
  const cross=(z)=>{
   const t=clamp((4.05-z)/8.65),x=2.02-.04*t,yt=.94+.01*t,yb=-.99+.035*t;
   return [[side*.88,yt,z],[side*(x-.07),yt,z],[side*x,yt-.08,z],[side*x,yb+.23,z],[side*(x-.18),yb+.04,z],[side*(x-.41),yb,z],[side*.89,yb,z]];
  };
  const ductRings=[4.05,3.43,2.4,.7,-1.5,-3.2,-4.6].map(cross);
  // The upper leading face ends at the forward lip, the lower one is swept back.
  ductRings[0][3][2]=ductRings[0][4][2]=ductRings[0][5][2]=ductRings[0][6][2]=3.38;
  for(let k=1;k<ductRings.length;k++)for(let j=0;j<6;j++)b.add(plate([ductRings[k-1][j],ductRings[k][j],ductRings[k][j+1],ductRings[k-1][j+1]],.018,V(side,0,0)),paint);
  b.add(plate([[side*.855,-.73,3.60],[side*.855,.97,4.23],[side*.855,.96,1.25],[side*.855,-.84,1.25]],.025,V(side,0,0)),panel);
  // Rectangular bleed-air recess on the upper intake, visible in the close-up.
  b.add(box(.68,.012,.93,[side*1.42,.967,1.75]),seam);
  b.add(box(.64,.012,.86,[side*1.42,.971,1.77]),panel);
  for(let j=0;j<8;j++)b.add(box(.60,.006,.012,[side*1.42,.981,1.42+j*.09]),seam);
  // Main wing: one wedge at the root, separately articulated trailing surfaces.
  const wingX=6.69,rootX=1.88,frontZ=1.67,tipFront=-2.52,backZ=-4.72,tipBack=-4.65;
  const wingPoint=(t,c,lift=0)=>{const front=frontZ+(tipFront-frontZ)*t,back=backZ+(tipBack-backZ)*t;return [side*(rootX+(wingX-rootX)*t),.965-.12*t-.028*c+lift,front+(back-front)*c];};
  b.add(plate([wingPoint(0,0),wingPoint(1,0),wingPoint(1,1),wingPoint(0,1)],.075),paint);
  // Panel lines follow the swept edges; the finer fasteners come from the maps.
  for(const c of [.15,.74])ribbon([[0,c],[1,c]],.003,seam,([t,c])=>wingPoint(t,c,.042));
  for(const t of [.18,.50,.82])ribbon([[t,0],[t,.97]],.003,seam,([t,c])=>wingPoint(t,c,.042));
  for(const [start,end]of [[.03,.41],[.44,.72],[.75,.96]]){
   const a=wingPoint(start,1),c=wingPoint(end,1);const flap=[a,c,[c[0],c[1]-.08,c[2]-.35],[a[0],a[1]-.08,a[2]-.35]];b.add(plate(flap,.025),panel);
   const mid=V(...a).add(V(...c)).multiplyScalar(.5);for(let j=0;j<3;j++)b.add(box(.18,.004,.014,[mid.x,mid.y-.008-j*.012,mid.z-.11-j*.04]),red);
  }
  // One tall fence and one lower outer fence per wing.
  for(const [t,h]of [[.49,.17],[.78,.075]]){const a=wingPoint(t,.12),c=wingPoint(t,.91);b.add(plate([a,[a[0],a[1]+h,a[2]-.13],[c[0],c[1]+h*.5,c[2]],c],.018,V(side,0,0)),panel);}
  const pod=loft([[-4.98,0,0,0],[-4.70,.035,.035,0],[-2.25,.055,.055,0],[-1.85,.07,.07,0],[-1.60,0,0,0]],20);pod.translate(side*6.68,.84,0);b.add(pod,light);
  // Upper and lower wing stars are projected onto the thin sloping surface.
  for(const underside of [false,true]){const c=wingPoint(.83,.57),offset=underside?-.043:.043;const project=p=>{const t=(Math.abs(p[0])-rootX)/(wingX-rootX),front=frontZ+(tipFront-frontZ)*t,back=backZ+(tipBack-backZ)*t,cc=(p[2]-front)/(back-front);return [p[0],wingPoint(t,cc,offset)[1],p[2]];};star(b,c,[side,0,0],[0,0,1],.48,white,project);star(b,c,[side,0,0],[0,0,1],.415,red,p=>{const q=project(p);q[1]+=underside?-.003:.003;return q;});}
  // Pylons and empty attachment rails seen beneath the wings in the new views.
  for(const [x,z,l]of [[2.65,-.2,2.05],[4.14,-1.35,1.78]]){
   b.add(plate([[side*x,.80,z+.5],[side*x,.82,z-l*.55],[side*x,.51,z-l*.58],[side*x,.46,z+.2]],.055,V(side,0,0)),panel);
   const rail=loft([[-l*.5,0,0,0],[-l*.38,.062,.06,0],[l*.38,.065,.06,0],[l*.5,0,0,0]],16);rail.translate(side*x,.47,z);b.add(rail,light);
  }
  // Distinct single-seat tail: swept leading edge, a clipped cap and fin-root fillet.
  const fx=y=>side*(1.30+(y-.64)*.075),fin=[[fx(.64),.64,-5.22],[fx(3.40),3.40,-8.02],[fx(3.69),3.69,-8.52],[fx(3.39),3.39,-9.12],[fx(.64),.64,-9.62]];
  b.add(plate(fin,.085,V(side,0,0)),paint);
  b.add(plate([[fx(2.93),2.93,-7.54],[fx(3.40),3.40,-8.02],[fx(3.69),3.69,-8.52],[fx(3.39),3.39,-9.12],[fx(2.99),2.99,-9.20]],.092,V(side,0,0)),radome);
  for(const outward of [-1,1]){
   const f=(z,y,lift=.047)=>[fx(y)+outward*lift,y,z];
   ribbon([[-9.48,.77],[-8.94,2.96]],.012,seam,([z,y])=>f(z,y));
   ribbon([[-7.28,2.46],[-9.21,2.46]],.008,seam,([z,y])=>f(z,y));
   const c=[fx(1.95),1.95,-8.17];star(b,c,[0,0,1],[0,1,0],.53,white,p=>f(p[2],p[1],.050));star(b,c,[0,0,1],[0,1,0],.46,red,p=>f(p[2],p[1],.053));
  }
  for(const y of [1.0,1.65,2.4])b.add(rod([fx(y),y,-9.2],[fx(y),y,-9.36],.036,8),light);
  b.add(loft([[-9.48,0,0,0],[-9.2,.065,.07,0],[-8.68,.075,.08,0],[-8.4,0,0,0]],16).translate(fx(3.42),3.42,0),light);
  b.add(loft([[-9.55,0,0,.67],[-9.0,.21,.20,.67],[-6.4,.21,.20,.67],[-5.1,0,0,.67]],24).translate(side*1.3,0,0),paint);
  const tail=[[side*1.94,-.10,-6.63],[side*4.44,-.20,-8.29],[side*4.30,-.22,-9.65],[side*1.88,-.13,-9.48]];
  b.add(plate(tail,.07),paint);
  b.add(plate([[side*1.44,-.69,-6.35],[side*1.50,-1.42,-8.08],[side*1.47,-1.34,-9.47],[side*1.40,-.72,-9.22]],.038,V(side,0,0)),panel);
  // Open metal nozzles with olive ceramic interiors and recessed burner grids.
  const ex=side*.99,ey=-.08;
  b.add(loft([[-9.58,.88,.88,0],[-9.13,.96,.96,0],[-8.42,.98,.98,0]],48).translate(ex,ey,0),steel);
  for(let i=0;i<28;i++){
   const a=i/28*Math.PI*2,da=Math.PI*2/28*.975,p=(r,z,t)=>[ex+r*Math.cos(t),ey+r*Math.sin(t),z];
   b.add(polygon([p(.88,-9.58,a),p(.85,-10.47,a),p(.85,-10.47,a+da),p(.88,-9.58,a+da)]),i%4===0?steel:burnt);
   b.add(polygon([p(.815,-10.44,a),p(.64,-8.95,a),p(.64,-8.95,a+da),p(.815,-10.44,a+da)]),ceramic);
   path(b,[p(.81,-10.42,a),p(.637,-8.95,a)],burnt,.007);
   if(i%2===0)path(b,[p(.12,-8.91,a),p(.61,-8.91,a+.16)],steel,.012);
  }
  b.add(ring(.847,.017,[ex,ey,-10.46]),steel);for(const [r,z]of [[.64,-8.96],[.46,-8.92],[.22,-8.91]])b.add(ring(r,.014,[ex,ey,z]),burnt);
  b.add(cylinder(.635,.02,[ex,ey,-8.88]),dark);b.add(cylinder(.11,.055,[ex,ey,-8.92]),burnt);
  // Vent holes, dorsal grilles and flush maintenance markings.
  for(let j=0;j<12;j++){const z=3.35-j*.115;b.add(cylinder(.025,.012,[side*.46,.99,z],'x',10),dark);}
  for(let j=0;j<8;j++)b.add(box(.012,.022,.18,[side*1.997,-.30-j*.06,-3.8]),dark);
  for(const z of [-3.25,-1.5,.25])for(let row=0;row<3;row++){
   const x=side*(2.02-.04*(4.05-z)/8.65+.015),y=-.50+row*.045;
   for(let k=0;k<7;k++)b.add(box(.006,.014,.023+(k%3)*.007,[x,y,z-k*.038]),red);
  }
  // Flat, filled block numerals: 46, readable in the outward view on both sides.
  const glyphs={4:[[[.31,.38],[0,-.08],[.44,-.08]],[[.31,.38],[.31,-.38]]],6:[[[.39,.31],[.27,.39],[.09,.31],[0,.08],[0,-.26],[.10,-.38],[.32,-.38],[.42,-.25],[.42,-.08],[.31,.02],[0,.02]]]};
  for(const [digit,k]of [['4',0],['6',1]])for(const stroke of glyphs[digit])ribbon(stroke.map(([u,y])=>[u+k*.56,y]),.09,red,([u,y])=>noseSurface(5.85-side*(u-.5),y-.06,side));
  // Restrained colour badges and the 60th-anniversary marking from the references.
  const six= glyphs[6][0],zero=[[.10,.38],[.32,.38],[.42,.25],[.42,-.25],[.32,-.38],[.10,-.38],[0,-.25],[0,.25],[.10,.38]];
  for(const [stroke,k]of [[six,0],[zero,1]]){const pts=stroke.map(([u,y])=>[(u+k*.57)*.31,y*.31]);ribbon(pts,.031,red,([u,y])=>noseSurface(7.14-side*(u-.15),y+.06,side,.017));ribbon(pts,.018,gold,([u,y])=>noseSurface(7.14-side*(u-.15),y+.06,side,.021));}
  for(let row=0;row<5;row++)for(let col=0;col<8;col++){const z=6.65-side*(col*.044-.15),y=.11-row*.045;b.add(polygon([[z-.013,y-.009],[z+.013,y-.009],[z+.013,y+.009],[z-.013,y+.009]].map(([z,y])=>noseSurface(z,y,side,.017))),red);}
  if(side===-1){
   const font={В:['11110','10001','10001','11110','10001','10001','11110'],А:['01110','10001','10001','11111','10001','10001','10001'],Л:['00111','01001','01001','01001','01001','10001','10001'],Е:['11111','10000','10000','11110','10000','10000','11111'],Н:['10001','10001','10001','11111','10001','10001','10001'],Т:['11111','00100','00100','00100','00100','00100','00100'],И:['10001','10011','10011','10101','11001','11001','10001'],Ф:['00100','01110','10101','10101','10101','01110','00100'],У:['10001','10001','01010','00100','00100','01000','10000'],Р:['11110','10001','10001','11110','10000','10000','10000'],К:['10001','10010','10100','11000','10100','10010','10001']};
   for(const [label,line]of [['ВАЛЕНТИН',0],['ФУТРИК',1]])for(let c=0;c<label.length;c++)for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(font[label[c]][row][col]==='1'){
    const z=-.60+(c*6+col)*.022,y=.28-line*.21-row*.022,project=(zz,yy)=>[-(2.02-.04*(4.05-zz)/8.65+.015),yy,zz];b.add(polygon([project(z,y),project(z+.019,y),project(z+.019,y-.019),project(z,y-.019)]),red);
   }
  }
  // Small exterior aerials, without invented weapons.
  b.add(plate([[side*.50,-.62,5.70],[side*.50,-.94,5.54],[side*.50,-.90,5.42],[side*.50,-.64,5.48]],.015,V(side,0,0)),light);
 }
 // Large centreline external fuel tank, prominent in every lower reference view.
 const tank=new THREE.Group();tank.name='Подвесной топливный бак';root.add(tank);const tb=batch(tank);
 tb.add(loft([[-8.13,0,0,-1.49],[-7.40,.20,.18,-1.51],[-5.6,.43,.38,-1.51],[-2.7,.49,.43,-1.51],[0,.40,.35,-1.51],[1.6,.22,.19,-1.51],[2.65,0,0,-1.51]],48),paint);
 for(const z of [-4.3,.30])tb.add(box(.16,.35,.60,[0,-1.03,z]),panel);
 for(const s of [-1,1])tb.add(plate([[s*.12,-1.56,-6.75],[s*.38,-1.53,-7.25],[s*.33,-1.53,-7.97],[s*.05,-1.56,-7.8]],.018),panel);
 tb.finish('Подвесной бак');
 // Brake-parachute fairing sits above, and between, the two exhausts.
 b.add(loft([[-10.83,0,0,.90],[-10.60,.17,.16,.90],[-9.54,.23,.20,.91],[-8.5,.12,.12,.94],[-8.2,0,0,.94]],28),panel);
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
 // Reference views show the aircraft in flight; gear remains available for inspection.
 for(const {group}of gearGroups)group.position.y-=.34;
 const closed=new THREE.Group();closed.name='Закрытые створки';root.add(closed);const cb=batch(closed);
 const wells=new THREE.Group();wells.name='Ниши шасси';root.add(wells);const wb=batch(wells);
 for(const [x,y,z,w,d]of [[0,-.72,6.15,.58,1.36],[-1.67,-.96,-1.3,.62,1.5],[1.67,-.96,-1.3,.62,1.5]]){cb.add(box(w,.025,d,[x,y,z]),panel);wb.add(box(w,.018,d,[x,y-.025,z]),dark);}
 cb.finish('Створки');wb.finish('Ниши');b.finish('МиГ-25');
 let extension=0;
 function setGear(value){extension=clamp(value);const a=extension*extension*(3-2*extension);for(const {group,nose,side}of gearGroups){group.visible=extension>.001;if(nose)group.rotation.x=(1-a)*Math.PI*.48;else group.rotation.z=-side*(1-a)*Math.PI*.48;}closed.visible=extension<.08;wells.visible=extension>=.08;root.userData.gear=extension;}
 root.userData.aircraft={type:'МиГ-25',boardNumber:'46',unit:'metre',forward:'+Z',referenceImageCount:17,referenceSet:'2026-11-01-single-seat',canopies:[canopy],wheels:4,intakes:2,exhausts:2,externalTank:true};
 setGear(0);root.updateMatrixWorld(true);
 return {root,setGear,initialGear:0,stats:()=>({...root.userData.aircraft,gear:extension,version:MIG25_VERSION})};
}
