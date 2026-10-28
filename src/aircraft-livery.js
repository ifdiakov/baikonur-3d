import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLightField} from './light-field.js';

export const AIRCRAFT_APPEARANCE_VERSION='alrosa-realistic-v1';
export const AIRCRAFT_SCALE=.28;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const SOURCES=Object.freeze([
 'https://aero.alrosa.ru/airline/our-fleet/',
 'https://aero.alrosa.ru/upload/iblock/a65/i8u390pze2nj43m8ig7bd5jswglisyf0.png',
 'https://aero.alrosa.ru/upload/iblock/c58/wiai7alnm3tmcjdrqlz9w3tgea2v7qp1.png'
]);

// A 737-family museum interpretation, not a registration-specific airframe.
// The airline's own photographs establish the white upper fuselage, layered
// blue/cyan cheatline, navy nacelles and diamond/orbit emblem. All artwork is
// local canvas/vector geometry; no remote image is required at runtime.
const bodyKnots=[[-20,.08],[-19,.25],[-17.5,.61],[-15.5,1.08],[-13,1.52],[-10.5,1.80],[-7,1.97],[-3,2],[8.6,2],[12,1.96],[14,1.78],[16,1.49],[17.5,1.12],[18.7,.72],[19.45,.40],[19.85,.17],[20,.025]];
const bodyCurve=new THREE.CatmullRomCurve3(bodyKnots.map(([z,r])=>V(r,z,0)),false,'centripetal',.5);
const bodyProfile=bodyCurve.getSpacedPoints(160).map(p=>({z:p.y,r:Math.max(.02,p.x)}));
export function aircraftRadiusAt(z){
 let lo=0,hi=bodyProfile.length-1;
 if(z<=bodyProfile[0].z)return bodyProfile[0].r;if(z>=bodyProfile[hi].z)return bodyProfile[hi].r;
 while(hi-lo>1){const mid=(hi+lo)>>1;if(bodyProfile[mid].z>z)hi=mid;else lo=mid;}
 const a=bodyProfile[lo],b=bodyProfile[hi];return THREE.MathUtils.lerp(a.r,b.r,(z-a.z)/(b.z-a.z));
}
function texture(canvas){const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];}
function bodySkin(){
 const [c,x]=canvas(2048,1024);
 for(let i=0;i<c.width;i++){
  const y=-Math.cos(i/c.width*Math.PI*2);
  x.fillStyle=y>-.24?'#f1f5f5':y>-.33?'#bce9ed':y>-.45?'#62bce5':y>-.60?'#267bbf':y>-.73?'#164d9e':'#102655';x.fillRect(i,0,1,c.height);
 }
 x.strokeStyle='rgba(48,67,80,.105)';x.lineWidth=.6;
 for(let z=-15;z<18;z+=2.15){const py=(20-z)/40*c.height;x.beginPath();x.moveTo(0,py);x.lineTo(c.width,py);x.stroke();}
 for(let u=64;u<c.width;u+=128){x.beginPath();x.moveTo(u,0);x.lineTo(u,c.height);x.stroke();}
 x.fillStyle='rgba(48,67,80,.13)';for(let py=32;py<1024;py+=55)for(let u=16;u<2048;u+=22)x.fillRect(u,py,1.2,1.2);
 x.strokeStyle='rgba(30,44,63,.23)';x.lineWidth=1.3;const nose=(20-17.6)/40*c.height;x.beginPath();x.moveTo(0,nose);x.lineTo(c.width,nose);x.stroke();
 return texture(c);
}
function titleTexture(text,color='#163b79',font='italic 900 128px Arial'){
 const [c,x]=canvas(1024,192);x.fillStyle=color;x.font=font;x.textAlign='center';x.textBaseline='middle';x.fillText(text,512,101,1000);return texture(c);
}
function diamondTexture(){
 const [c,x]=canvas(512,512);x.translate(256,256);
 // Diamond with the orbital ring used on ALROSA aircraft tails.
 x.strokeStyle='#f4fbff';x.lineWidth=13;x.beginPath();x.arc(0,0,205,-1.34,Math.PI*1.71);x.stroke();
 x.save();x.rotate(-.60);x.lineWidth=12;x.beginPath();x.ellipse(0,0,233,79,0,Math.PI*.90,Math.PI*2.06);x.stroke();x.restore();
 const p=[[-157,-49],[-87,-128],[90,-128],[159,-49],[0,164]];
 x.fillStyle='#57bee8';x.beginPath();p.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fill();
 const facets=[{p:[p[0],p[1],[-46,-49]],c:'#c4efff'},{p:[p[1],p[2],[47,-49],[-46,-49]],c:'#83d8f2'},
  {p:[p[2],p[3],[47,-49]],c:'#d6f7ff'},{p:[p[0],[-46,-49],p[4]],c:'#4097d2'},
  {p:[[-46,-49],[47,-49],p[4]],c:'#78d2ed'},{p:[[47,-49],p[3],p[4]],c:'#2c7bbd'}];
 for(const f of facets){x.fillStyle=f.c;x.beginPath();f.p.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fill();}
 x.strokeStyle='#effbff';x.lineWidth=5;x.lineJoin='round';x.beginPath();p.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.closePath();
 x.moveTo(-157,-49);x.lineTo(159,-49);x.moveTo(-87,-128);x.lineTo(-46,-49);x.lineTo(0,164);x.lineTo(47,-49);x.lineTo(90,-128);x.stroke();
 x.save();x.rotate(-.60);x.lineWidth=12;x.beginPath();x.ellipse(0,0,233,79,0,-.12,Math.PI*.90);x.stroke();x.restore();return texture(c);
}
function tailSkin(){
 const [c,x]=canvas(1024,1024);x.fillStyle='#12285d';x.fillRect(0,0,1024,1024);
 const px=z=>(-10.5-z)/10.5*1024,py=y=>1024-y/8.9*1024;
 for(const [width,color]of [[245,'#20559f'],[169,'#328dcc'],[100,'#79cfeb']]){
  x.strokeStyle=color;x.lineWidth=width;x.beginPath();x.moveTo(px(-11),py(.6));x.bezierCurveTo(px(-16.8),py(1.3),px(-19),py(2.2),px(-18.3),py(4.6));x.bezierCurveTo(px(-17.9),py(6.1),px(-16.8),py(6.8),px(-15.9),py(7.2));x.stroke();
 }return texture(c);
}
function windowTexture(){
 const [c,x]=canvas(160,220),g=x.createLinearGradient(0,0,0,220);g.addColorStop(0,'#fff1cc');g.addColorStop(.45,'#ffe0a3');g.addColorStop(1,'#bd8c56');x.fillStyle=g;x.fillRect(0,0,160,220);
 x.fillStyle='rgba(62,44,26,.22)';x.fillRect(17,133,30,87);x.fillRect(106,133,30,87);x.fillStyle='rgba(255,255,245,.37)';x.fillRect(20,14,120,15);return texture(c);
}
function doorTexture(){
 const [c,x]=canvas(256,512);x.strokeStyle='#637783';x.lineWidth=5;x.beginPath();x.roundRect(24,16,208,476,30);x.stroke();
 x.fillStyle='#284558';x.beginPath();x.roundRect(84,60,88,99,22);x.fill();x.fillStyle='#7b8a8f';x.fillRect(138,256,55,9);x.fillStyle='#9d4543';x.fillRect(59,203,131,5);return texture(c);
}
function roundedWindow(width,height,radius){const s=new THREE.Shape(),x=-width/2,y=-height/2,r=radius;
 s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);const g=new THREE.ShapeGeometry(s,5),uv=g.attributes.uv,p=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,(p.getX(i)+width/2)/width,(p.getY(i)+height/2)/height);return g;
}

export function buildAlrosaAircraft(parent){
 const model=new THREE.Group();model.name='АЛРОСА · самолёт на Крайний';model.scale.setScalar(AIRCRAFT_SCALE);model.userData.pickable=false;parent.add(model);
 const staticParts=new THREE.Group();staticParts.name='Планер · детали';model.add(staticParts);
 const white=new THREE.MeshStandardMaterial({color:0xe8eef0,metalness:.32,roughness:.36});
 const silver=new THREE.MeshStandardMaterial({color:0xb5c1c9,metalness:.72,roughness:.30});
 const navy=new THREE.MeshStandardMaterial({color:0x142e65,metalness:.28,roughness:.37});
 const blue=new THREE.MeshStandardMaterial({color:0x2f99d0,metalness:.23,roughness:.41});
 const dark=new THREE.MeshStandardMaterial({color:0x17212d,metalness:.22,roughness:.64});
 const rubber=new THREE.MeshStandardMaterial({color:0x131a21,roughness:.91});
 const seam=new THREE.MeshStandardMaterial({color:0x647786,metalness:.48,roughness:.48});
 const bodyMat=new THREE.MeshPhysicalMaterial({color:0xffffff,map:bodySkin(),metalness:.28,roughness:.34,clearcoat:.3,clearcoatRoughness:.35});
 const cabin=new THREE.MeshStandardMaterial({color:0xfff0d3,map:windowTexture(),emissive:0xffdfad,emissiveIntensity:1.15,roughness:.24,metalness:.05});cabin.emissiveMap=cabin.map;
 const cockpit=new THREE.MeshPhysicalMaterial({color:0x405864,emissive:0xffd6a0,emissiveIntensity:.32,roughness:.18,metalness:.12,clearcoat:.72,side:THREE.DoubleSide});
 const lensFrame=new THREE.MeshStandardMaterial({color:0x1c2b37,metalness:.35,roughness:.42,side:THREE.DoubleSide});
 const decal=map=>new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:.48,metalness:.15,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide});
 function add(geometry,material,p=V(),group=staticParts,name=''){const m=new THREE.Mesh(geometry,material);m.position.copy(p);m.name=name;group.add(m);return m;}
 function box(w,h,d,p,material,group=staticParts,name=''){return add(new THREE.BoxGeometry(w,h,d),material,p,group,name);}
 function rod(a,b,r,material,group=staticParts){const m=add(new THREE.CylinderGeometry(r,r,a.distanceTo(b),8),material,a.clone().lerp(b,.5),group);m.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());return m;}
 const bodyGeo=new THREE.LatheGeometry(bodyProfile.map(p=>new THREE.Vector2(p.r,p.z)),64),uv=bodyGeo.attributes.uv,pos=bodyGeo.attributes.position;
 for(let i=0;i<uv.count;i++)uv.setY(i,(pos.getY(i)+20)/40);
 const fuselage=add(bodyGeo,bodyMat,V(),model,'Фюзеляж · плавный профиль и ливрея');fuselage.rotation.x=Math.PI/2;

 function surface(side,y,z,offset=.03){const r=aircraftRadiusAt(z),x=side*Math.sqrt(Math.max(.0001,r*r-y*y)),dr=(aircraftRadiusAt(z+.04)-aircraftRadiusAt(z-.04))/.08;
  const normal=V(x/r,y/r,-dr).normalize();return {position:V(x,y,z).addScaledVector(normal,offset),normal};}
 function bodyDecal(side,centerZ,centerY,width,height,mat,name){
  const positions=[],uvs=[],indices=[],nx=32,ny=8;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny,z=centerZ-side*(u-.5)*width,y=centerY+(v-.5)*height;positions.push(...surface(side,y,z,.026).position.toArray());uvs.push(u,v);
   if(i<nx&&j<ny){const k=j*(nx+1)+i;indices.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return add(g,mat,V(),model,name);
 }
 const title=decal(titleTexture('АЛРОСА')),door=decal(doorTexture());
 for(const side of [-1,1]){
  bodyDecal(side,7.1,1.24,9.9,.78,title,'АЛРОСА · читаемая надпись на борту');
  for(const z of [-12.6,14.1])bodyDecal(side,z,-.02,.98,1.88,door,'Пассажирская дверь');
  for(const z of [.4,1.7])bodyDecal(side,z,.24,.68,1.33,door,'Надкрыльевой аварийный выход');
 }

 // Airfoil thickness, dihedral and tapered swept planform give the wings a
 // proper volume; the old one-piece flat extrusion is no longer present.
 function wingPoint(stations,u,v,upper=true){
  const n=u*(stations.length-1),i=Math.min(stations.length-2,Math.floor(n)),t=n-i,a=stations[i],b=stations[i+1];
  const x=THREE.MathUtils.lerp(a.x,b.x,t),y=THREE.MathUtils.lerp(a.y,b.y,t),lead=THREE.MathUtils.lerp(a.lead,b.lead,t),trail=THREE.MathUtils.lerp(a.trail,b.trail,t),thick=THREE.MathUtils.lerp(a.thick,b.thick,t);
  const airfoil=(.2969*Math.sqrt(v)-.126*v-.3516*v*v+.2843*v*v*v-.1036*v*v*v*v)/.1;
  return V(x,y+(upper?1:-.65)*thick*airfoil,THREE.MathUtils.lerp(lead,trail,v));
 }
 function airfoil(stations,material){
  const positions=[],indices=[],nu=32,nv=16;
  for(const upper of [true,false])for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++)positions.push(...wingPoint(stations,i/nu,j/nv,upper).toArray());
  const layer=(nu+1)*(nv+1);
  for(let side=0;side<2;side++)for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=side*layer+i*(nv+1)+j,b=a+1,c=a+nv+1,d=c+1;if(Boolean(side)===(stations.at(-1).x<stations[0].x))indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);}
  for(const i of [0,nu])for(let j=0;j<nv;j++){const a=i*(nv+1)+j,b=a+1;indices.push(a,a+layer,b,b,a+layer,b+layer);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return add(g,material);
 }
 function panelLine(points,r=.018,mat=seam){const curve=new THREE.CatmullRomCurve3(points);return add(new THREE.TubeGeometry(curve,Math.max(8,points.length*3),r,5,false),mat);}
 for(const side of [-1,1]){
  const main=[{x:side*1.5,y:-.35,lead:5.0,trail:-4.8,thick:.22},{x:side*5.0,y:-.21,lead:2.3,trail:-5.2,thick:.18},{x:side*10,y:.08,lead:-.4,trail:-6.0,thick:.12},{x:side*14,y:.36,lead:-2.9,trail:-6.8,thick:.085},{x:side*17.5,y:.67,lead:-4.9,trail:-7.25,thick:.05}];
  airfoil(main,white);panelLine(Array.from({length:25},(_,i)=>wingPoint(main,i/24,.028,true)),.032,silver);
  panelLine(Array.from({length:20},(_,i)=>wingPoint(main,i/22,.76,true)),.018,seam);
  for(const u of [.20,.37,.55,.73]){panelLine([wingPoint(main,u,.50,true),wingPoint(main,u,.97,true)],.016);}
  for(const u of [.22,.40,.57]){const a=wingPoint(main,u,.80,false),b=wingPoint(main,u,.95,false);b.y-=.20;rod(a,b,.10,white);}
  const tail=[{x:0,y:1.0,lead:-11.5,trail:-16.6,thick:.12},{x:side*3.7,y:1.25,lead:-14.5,trail:-17.7,thick:.08},{x:side*7.1,y:1.54,lead:-16.9,trail:-18.8,thick:.035}];airfoil(tail,white);panelLine(Array.from({length:16},(_,i)=>wingPoint(tail,i/15,.74,true)),.016);
  const xyz=[side*17.45,.65,-4.9,side*18.0,3.35,-6.25,side*18.08,3.40,-7.4,side*17.55,.66,-7.25];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();const winglet=add(g,navy.clone(),V(),staticParts,'Винглет');winglet.material.side=THREE.DoubleSide;
  rod(V(side*17.45,.66,-4.9),V(side*18.0,3.35,-6.25),.035,blue);
 }

 const finPoints=[[-10.9,1.35],[-16.6,8.25],[-18.75,8.25],[-19.15,1.12]],finMat=new THREE.MeshStandardMaterial({map:tailSkin(),metalness:.26,roughness:.36,side:THREE.DoubleSide});
 for(const side of [-1,1]){
  const xyz=[],uvs=[];for(const [z,y]of finPoints){xyz.push(side*.135,y,z);uvs.push((-10.5-z)/10.5,y/8.9);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();add(g,finMat,V(),model,'Киль · синие полосы АЛРОСА');
 }
 for(let i=0;i<finPoints.length;i++){const a=finPoints[i],b=finPoints[(i+1)%finPoints.length];rod(V(0,a[1],a[0]),V(0,b[1],b[0]),.135,navy);}
 const logo=decal(diamondTexture());
 for(const side of [-1,1]){const emblem=add(new THREE.PlaneGeometry(3.4,3.4),logo,V(side*.151,4.62,-16.53),model,'Эмблема АЛРОСА · алмаз и орбита');emblem.rotation.y=side*Math.PI/2;}
 panelLine([V(.15,1.35,-18.5),V(.15,7.7,-18.3)],.017,seam);panelLine([V(-.15,1.35,-18.5),V(-.15,7.7,-18.3)],.017,seam);
 add(new THREE.CircleGeometry(.13,16),dark,V(0,0,-20.04)).rotation.y=Math.PI;

 const fanGroups=[];const nacelleProfile=[[-3.5,.43],[-3.0,.67],[-2.5,.83],[-1.1,1.03],[1.8,1.02],[2.45,.94]];
 const engineTitle=decal(titleTexture('alrosa.aero','#f5fbff','bold 118px Arial'));
 for(const side of [-1,1]){
  const center=V(side*6,-1.65,-.5),engine=add(new THREE.LatheGeometry(nacelleProfile.map(([z,r])=>new THREE.Vector2(r,z)),40),navy,center);engine.rotation.x=Math.PI/2;
  const lip=add(new THREE.TorusGeometry(.91,.095,10,40),silver,center.clone().add(V(0,0,2.45)));
  const throatMaterial=dark.clone();throatMaterial.side=THREE.BackSide;const throat=add(new THREE.CylinderGeometry(.82,.72,1.1,32,1,true),throatMaterial,center.clone().add(V(0,0,1.89)));throat.rotation.x=Math.PI/2;
  add(new THREE.CircleGeometry(.79,32),dark,center.clone().add(V(0,0,1.53)),staticParts,'Тёмная глубина воздухозаборника');
  const fan=new THREE.Group();fan.position.copy(center).add(V(0,0,1.67));fan.name='Вентилятор двигателя · 18 лопаток';model.add(fan);fanGroups.push(fan);
  const fanGeometry=new THREE.BufferGeometry(),xyz=[];
  for(let n=0;n<18;n++){const a=n*Math.PI*2/18,points=[[.24,a-.09,.025],[.80,a+.09,0],[.80,a+.19,0],[.24,a+.09,.025]];const p=points.map(([r,q,z])=>[r*Math.cos(q),r*Math.sin(q),z]);for(const i of [0,1,2,0,2,3])xyz.push(...p[i]);}
  fanGeometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));fanGeometry.computeVertexNormals();const blades=add(fanGeometry,silver.clone(),V(),fan);blades.material.side=THREE.DoubleSide;blades.material.color.set(0x657785);blades.material.roughness=.46;
  const spinner=add(new THREE.ConeGeometry(.24,.52,24),dark,center.clone().add(V(0,0,1.96)));spinner.rotation.x=Math.PI/2;
  const exhaust=add(new THREE.TorusGeometry(.48,.065,8,32),silver,center.clone().add(V(0,0,-3.45)));add(new THREE.CircleGeometry(.43,24),dark,center.clone().add(V(0,0,-3.47))).rotation.y=Math.PI;
  const cone=add(new THREE.ConeGeometry(.29,.85,20),dark,center.clone().add(V(0,0,-3.54)));cone.rotation.x=-Math.PI/2;
  box(.55,1.18,2.5,V(side*6,-.58,-1.1),white);rod(V(side*6,-.5,-2.3),V(side*6,-1.25,.2),.20,white);
  for(const z of [-1.9,.8]){const ring=add(new THREE.TorusGeometry(z<0?.91:1.025,.012,5,40),seam,center.clone().add(V(0,0,z)));}
  const lettering=add(new THREE.PlaneGeometry(3.15,.57),engineTitle,center.clone().add(V(side*1.035,.12,-.1)),model,'alrosa.aero · гондола двигателя');lettering.rotation.y=side*Math.PI/2;
 }

 const frames=new THREE.InstancedMesh(roundedWindow(.52,.68,.18),lensFrame,60),windows=new THREE.InstancedMesh(roundedWindow(.425,.575,.145),cabin,60),dummy=new THREE.Object3D(),windowLights=[];
 frames.name='60 рамок иллюминаторов';windows.name='60 освещённых иллюминаторов';frames.instanceMatrix.setUsage(THREE.StaticDrawUsage);windows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
 let n=0;
 for(const side of [-1,1])for(let i=0;i<30;i++){
  const z=-10.7+i*.795,y=.57,frame=surface(side,y,z,.020),pane=surface(side,y,z,.036);
  dummy.position.copy(frame.position);dummy.quaternion.setFromUnitVectors(V(0,0,1),frame.normal);dummy.updateMatrix();frames.setMatrixAt(n,dummy.matrix);
  dummy.position.copy(pane.position);dummy.updateMatrix();windows.setMatrixAt(n,dummy.matrix);windowLights.push({x:pane.position.x,y:pane.position.y,z:pane.position.z,height:0,color:0xffd59a,size:.70});n++;
 }
 frames.instanceMatrix.needsUpdate=windows.instanceMatrix.needsUpdate=true;model.add(frames,windows);
 const cabinGlow=createLightField(model,windowLights,{name:'Самолёт · мягкое свечение салона',minPixels:1.1});

 function cockpitPatch(side,corners,mat,offset){
  const xyz=[],indices=[],nu=7,nv=5;
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
   const u=i/nu,v=j/nv,top=new THREE.Vector2(...corners[0]).lerp(new THREE.Vector2(...corners[1]),u),bottom=new THREE.Vector2(...corners[3]).lerp(new THREE.Vector2(...corners[2]),u),q=bottom.lerp(top,v),theta=q.x,z=q.y,r=aircraftRadiusAt(z),p=V(side*r*Math.sin(theta),r*Math.cos(theta),z),normal=V(p.x/r,p.y/r,0);p.addScaledVector(normal,offset);xyz.push(...p.toArray());
   if(i<nu&&j<nv){const k=j*(nu+1)+i;indices.push(k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setIndex(indices);g.computeVertexNormals();return add(g,mat,V(),model,'Остекление кабины пилотов');
 }
 const cockpitShapes=[[[.045,16.95],[.67,16.77],[.80,17.63],[.045,17.92]],[[.72,16.69],[1.13,15.96],[1.25,16.75],[.85,17.54]],[[1.18,15.90],[1.43,15.13],[1.45,16.08],[1.30,16.67]]];
 for(const side of [-1,1])for(const shape of cockpitShapes){
  cockpitPatch(side,shape,lensFrame,.022);
  const middle=shape.reduce((a,p)=>a.add(new THREE.Vector2(...p)),new THREE.Vector2()).multiplyScalar(.25),inner=shape.map(p=>new THREE.Vector2(...p).lerp(middle,.10).toArray());cockpitPatch(side,inner,cockpit,.036);
 }
 // Small external details remain geometry, without isolated lights or labels.
 box(.06,.51,.48,V(0,2.15,5.6),white);box(.05,.38,.34,V(0,2.09,-6.4),white);
 for(const side of [-1,1])rod(surface(side,.23,17.15,.04).position,surface(side,.23,17.15,.04).position.add(V(side*.35,0,.20)),.025,silver);

 const gear=new THREE.Group();gear.name='Шасси · три отдельные стойки';model.add(gear);const legs=[],gearDoors=[];
 for(const [x,z]of [[0,12],[-3,-3],[3,-3]]){
  const nose=x===0,pivotY=nose?-1.23:-.50,leg=new THREE.Group();leg.position.set(x,pivotY,z);gear.add(leg);legs.push({root:leg,nose,side:Math.sign(x)});
  const wheelY=-2.72-pivotY;
  rod(V(0,0,0),V(0,wheelY+.15,0),.105,silver,leg);rod(V(0,-.08,0),V(0,-.74,0),.165,white,leg);
  rod(V(0,-.10,-.56),V(0,wheelY+.30,0),.065,silver,leg);rod(V(-.37,-.05,-.17),V(0,wheelY+.41,0),.06,silver,leg);
  rod(V(-.39,wheelY,0),V(.39,wheelY,0),.10,dark,leg);
  for(const side of [-1,1]){
   const p=V(side*.26,wheelY,0),tyre=add(new THREE.CylinderGeometry(.46,.46,.27,24),rubber,p,leg,'Колесо шасси');tyre.rotation.z=Math.PI/2;
   const hub=add(new THREE.CylinderGeometry(.235,.235,.278,16),silver,p,leg,'Ступица');hub.rotation.z=Math.PI/2;
   const disc=add(new THREE.CylinderGeometry(.105,.105,.285,12),dark,p,leg);disc.rotation.z=Math.PI/2;
  }
  for(const side of [-1,1]){const d=new THREE.Group();d.position.set(x+side*.49,pivotY+.02,z);model.add(d);const panel=box(.43,.065,nose?1.65:1.25,V(-side*.215,0,0),navy,d,'Створка ниши шасси');gearDoors.push({root:d,side});}
 }
 const nav=createLightField(model,[{x:-17.5,y:.70,z:-5.4,height:0,color:0xff3548,size:6},{x:17.5,y:.70,z:-5.4,height:0,color:0x58ffb1,size:6},{x:0,y:1,z:-20,height:0,color:0xfff6e4,size:5}],{name:'Самолёт · БАНО',minPixels:4});
 const strobes=createLightField(model,[{x:-17.6,y:.76,z:-5.3,height:0,color:0xffffff,size:13},{x:17.6,y:.76,z:-5.3,height:0,color:0xffffff,size:13}],{name:'Самолёт · стробоскопы',minPixels:8});
 const beacon=createLightField(model,[{x:0,y:2.2,z:-2,height:0,color:0xff3f31,size:10},{x:0,y:-2.2,z:1,height:0,color:0xff4d38,size:8}],{name:'Самолёт · проблесковый маяк',minPixels:6});
 const landing=createLightField(model,[{x:-2.8,y:-.35,z:3,height:0,color:0xffedc9,size:12},{x:2.8,y:-.35,z:3,height:0,color:0xffedc9,size:12}],{name:'Самолёт · посадочные фары',minPixels:6});

 // Batch mechanical details by material. The animated landing-gear groups and
 // engine fans remain separate; all 60 cabin panes take one instanced draw.
 const bins=new Map();for(const m of [...staticParts.children])if(m.isMesh){m.updateMatrix();let g=m.geometry.clone().applyMatrix4(m.matrix);if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}
  // Procedural panel geometry does not need UVs with untextured materials.
  if(!m.material.map)g.deleteAttribute('uv');const key=m.material;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(g);staticParts.remove(m);m.geometry.dispose();}
 for(const [mat,geometries]of bins){const merged=mergeGeometries(geometries,false);if(!merged)throw Error('Aircraft detail batch failed');add(merged,mat,V(),staticParts,'Объединённые детали планера');geometries.forEach(g=>g.dispose());}
 let night=true;
 function setEvening(value){night=!!value;cabin.emissiveIntensity=night?1.15:.09;cockpit.emissiveIntensity=night?.32:.035;cabinGlow.setStrength(night?.18:.012);}
 function setGear(progress,time=null){gear.visible=progress>.002;for(const leg of legs){leg.root.rotation.set(leg.nose?-(1-progress)*1.44:0,0,leg.nose?0:-leg.side*(1-progress)*1.34);}for(const d of gearDoors){d.root.rotation.z=d.side*(time===null?Math.sin(progress*Math.PI):THREE.MathUtils.smoothstep(time,73,78)*(1-THREE.MathUtils.smoothstep(time,94,98)))*1.3;}}
 setEvening(true);setGear(0);
 return {model,gear,nav,strobes,beacon,landing,setEvening,setGear,updateGear:setGear,updateDetails(time){fanGroups.forEach((g,i)=>g.rotation.z=time*(12+i*.15));},
  stats:()=>({skin:'panel-seams-and-rivets',litWindows:60,cockpitLit:cockpit.emissiveIntensity>0,gearVisible:gear.visible,gearLegRotations:legs.map(l=>l.root.rotation.toArray().slice(0,3)),gearDoorAngles:gearDoors.map(d=>d.root.rotation.z),version:AIRCRAFT_APPEARANCE_VERSION,livery:'АЛРОСА',night,cabinWindows:60,cockpitPanels:6,fuselageTitles:2,tailEmblems:2,engineCount:2,fanBladesPerEngine:18,
   cabinLightIntensity:cabin.emissiveIntensity,cockpitLightIntensity:cockpit.emissiveIntensity,windowSurfaceOffset:.036,pointLights:0,sourceUrls:[...SOURCES],
   airframe:'737-family museum interpretation',wingProfile:'swept-airfoil',gearLegs:legs.length,gearWheelCount:6,bodyLength:40,wingspan:36.16,scale:AIRCRAFT_SCALE})};
}
