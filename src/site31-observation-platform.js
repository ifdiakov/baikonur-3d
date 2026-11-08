import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MUSEUM_METRE} from './museum-scale.js';
import {registerFacilityFloodlights} from './facility-light-anchors.js';

export const SITE31_NP_VERSION='rockettrip-np-photo-20261108-v2';
export const NP_MAP_POSITION=Object.freeze({x:912.9,y:304.9});
const V=(...p)=>new THREE.Vector3(...p);
// The owner's pin is authoritative. Roads are measured, never moved, and
// topology/LOD changes must not choose another NP position.
export function planSite31Observation({launch,roads=[]}={}){
 const position=V((NP_MAP_POSITION.x-650)*3.4,0,(NP_MAP_POSITION.y-522.5)*3.4);
 const lookAt=launch?.clone?.()??position.clone().add(V(0,0,-1));
 let nearest=null;
 for(const road of roads)for(let i=1;i<(road.points?.length??0);i++){
  const vec=p=>Array.isArray(p)?V(...p):p.clone();
  const a=vec(road.points[i-1]),b=vec(road.points[i]),ab=b.clone().sub(a).setY(0);
  const t=THREE.MathUtils.clamp(position.clone().sub(a).setY(0).dot(ab)/(ab.lengthSq()||1),0,1);
  const p=a.clone().lerp(b,t),distance=Math.hypot(p.x-position.x,p.z-position.z);
  if(!nearest||distance<nearest.distance)nearest={distance,id:road.id,width:road.width??3};
 }
 const toward=lookAt.clone().sub(position).setY(0);
 return {position,lookAt,rotationY:Math.atan2(-toward.x,-toward.z),
  mapCoordinates:{...NP_MAP_POSITION},source:'owner-confirmed-map-coordinates-x912.9-y304.9',
  roadId:nearest?.id??null,connectedToRoad:Boolean(nearest),
  clearanceFromRoad:nearest?nearest.distance-nearest.width/2:null,
  actualDistanceMetres:toward.length()*65/3.4};
}

// All dimensions below are metres. One uniform scale matches the other
// museum exhibits; roof/column heights are not independently exaggerated.
export function buildSite31Observation({plan}={}){
 if(!plan?.position)throw Error('Нужно положение НП');
 const root=new THREE.Group();root.name='НП RocketTrip';
 root.position.copy(plan.position);root.rotation.y=plan.rotationY;root.scale.setScalar(MUSEUM_METRE);
 root.userData.skipGenericSiteLights=true;root.userData.museumComponent='observation-platform';
 const materials={
  earth:new THREE.MeshStandardMaterial({color:0x91836c,roughness:1}),
  gravel:new THREE.MeshStandardMaterial({color:0xb2aaa0,roughness:1}),
  fabric:new THREE.MeshStandardMaterial({color:0xf0eee7,roughness:.91,side:THREE.DoubleSide}),
  trim:new THREE.MeshStandardMaterial({color:0xc1c3bf,roughness:.7}),
  metal:new THREE.MeshStandardMaterial({color:0x7e8587,metalness:.65,roughness:.42}),
  turf:new THREE.MeshStandardMaterial({color:0x607146,roughness:1}),
  dark:new THREE.MeshStandardMaterial({color:0x253b42,roughness:.6}),
  blue:new THREE.MeshStandardMaterial({color:0x4e92ae,roughness:.75}),
  green:new THREE.MeshStandardMaterial({color:0x57967c,roughness:.75}),
  glow:new THREE.MeshStandardMaterial({color:0xfff1ce,emissive:0xffdca0,emissiveIntensity:.65}),
 };
 // Reuse the owner's original mark already shipped with the Sprinter.
 materials.flag=materials.fabric.clone();
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f4ef';ctx.fillRect(0,0,256,160);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  materials.flag.map=texture;
  const logo=new Image();logo.onload=()=>{
   const scale=Math.min(190/logo.width,128/logo.height),w=logo.width*scale,h=logo.height*scale;
   ctx.drawImage(logo,(256-w)/2,(160-h)/2,w,h);texture.needsUpdate=true;
  };
  logo.src=new URL('../assets/models/sprinter/hood-logo-original-v1.png',import.meta.url).href;
 }
 const batches=new Map(),features=[];
 function add(geometry,material,name){
  const g=geometry.index?geometry.toNonIndexed():geometry;
  if(material!=='flag')g.deleteAttribute('uv'); // Solid surfaces share a single material batch.
  if(!batches.has(material))batches.set(material,[]);batches.get(material).push(g);
  if(g!==geometry)geometry.dispose();
  features.push(name);
 }
 function box(name,w,h,d,x,y,z,m){add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),m,name);}
 function rod(name,a,b,r=.04,m='metal'){
  a=V(...a);b=V(...b);const delta=b.clone().sub(a);
  const g=new THREE.CylinderGeometry(r,r,delta.length(),5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),delta.normalize()));
  g.translate(...a.add(b).multiplyScalar(.5).toArray());add(g,m,name);
 }
 function surface(name,fn,nx,nz,m){
  const vertices=[],indices=[],uv=[];
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){vertices.push(...fn(x/nx,z/nz));uv.push(x/nx,1-z/nz);}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
   const a=z*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();add(g,m,name);
 }
 // Plan: 50 m frontage, 35 m total depth, 10 m parking/service strip.
 box('Грунтовая площадка 50 × 35 м',50,.24,35,0,-.12,0,'earth');
 box('Щебёночная парковка · 10 м',49.7,.06,9.8,0,.03,12.5,'gravel');
 for(const cx of [-11.65,11.65]){
  const cz=-5.5;
  box('Шатёр · настил',10,.1,10,cx,.07,cz,'gravel');
  box('Шатёр · зелёное покрытие',9.9,.025,9.9,cx,.135,cz,'turf');
  const height=(x,z)=>{const a=Math.cos(x*Math.PI/10),b=Math.cos(z*Math.PI/10);return .35+4.85*(a+b-a*b)+.7*a*b;};
  surface('Шатёр · арочная мембрана',(u,v)=>{const x=u*10-5,z=v*10-5;return [cx+x,height(x,z),cz+z];},24,24,'fabric');
  // Four bowed edge trusses; triangulated webs remain visible under fabric.
  for(let side=0;side<4;side++){
   const edge=t=>side===0?[t,-5]:side===1?[5,t]:side===2?[t,5]:[-5,t];
   const p=(t,drop=0)=>{const [x,z]=edge(t);return [cx+x,height(x,z)-drop,cz+z];};
   for(let j=0;j<20;j++){
    const a=-5+j*.5,b=a+.5;
    rod('Арочная ферма · пояс',p(a,.055),p(b,.055),.055);
    rod('Арочная ферма · нижний пояс',p(a,.27),p(b,.27),.045);
    rod('Арочная ферма · раскос',p(a,.055),p(b,.27),.025);
   }
   const front=side===0,open=front&&cx<0;
   // Photo: left pavilion has a wide open arch; right has a double door.
   for(let j=0;j<40;j++){
    const a=-5+j*.25,b=a+.25;
    const bottom=t=>open?Math.max(.25,height(...edge(t))*.70):front&&Math.abs((a+b)/2)<1.1?2.3:.18;
    surface('Шатёр · тканевая стенка',(u,v)=>{const t=a+(b-a)*u,[x,z]=edge(t),top=height(x,z)-.30,low=Math.min(top,bottom(t));return [cx+x,low+(top-low)*v,cz+z];},1,3,'fabric');
   }
  }
  // Curved roof seams are real geometry, lifted from the membrane.
  for(const x of [-2.5,0,2.5])for(let j=0;j<24;j++){
   const a=-5+j*10/24,b=a+10/24;rod('Шов тента',[cx+x,height(x,a)+.018,cz+a],[cx+x,height(x,b)+.018,cz+b],.012,'trim');
  }
  for(const x of [-5,5])for(const z of [-5,5])box('Пятка фермы',.48,.12,.48,cx+x,.1,cz+z,'metal');
  if(cx>0){
   box('Шатёр · стеклянные двери',2.05,2.05,.04,cx,1.2,cz-5.035,'dark');
   for(const x of [-1.08,0,1.08])rod('Дверная рама',[cx+x,.15,cz-5.08],[cx+x,2.32,cz-5.08],.035,'trim');
   rod('Перемычка двери',[cx-1.08,2.32,cz-5.08],[cx+1.08,2.32,cz-5.08],.035,'trim');
  }else{
   for(const x of [-3,3]){
    box('Стол под шатром',1.8,.08,.65,cx+x,1.08,cz+2,'fabric');
    for(const dx of [-.65,.65])rod('Ножка стола',[cx+x+dx,.15,cz+2],[cx+x+dx,1.05,cz+2],.035);
   }
  }
 }
 // Portable crowd-control barriers, not opaque walls or a raised grandstand.
 function fence(a,b){
  const p=V(...a),q=V(...b),n=Math.ceil(p.distanceTo(q)/2.5);
  for(let i=0;i<n;i++){
   const start=p.clone().lerp(q,i/n),end=p.clone().lerp(q,(i+1)/n),side=end.clone().sub(start).normalize();
   for(const y of [.25,1.1])rod('Ограждение · перекладина',[start.x,y,start.z],[end.x,y,end.z],.025);
   for(let j=0;j<=5;j++){
    const c=start.clone().lerp(end,j/5);rod('Ограждение · стойка',[c.x,.08,c.z],[c.x,1.1,c.z],j===0||j===5?.028:.018);
    if(j===0||j===5)rod('Ограждение · опорная лапа',[c.x-side.z*.22,.04,c.z+side.x*.22],[c.x+side.z*.22,.04,c.z-side.x*.22],.025);
   }
  }
 }
 fence([-24.7,0,-17.3],[24.7,0,-17.3]);
 fence([-24.7,0,-17.3],[-24.7,0,17.3]);
 fence([24.7,0,-12.3],[24.7,0,17.3]); // 5 m entry gate in top-right corner of owner's plan
 fence([-24.7,0,17.3],[24.7,0,17.3]);
 // Eight flagpoles: four on each side, as in the supplied plan.
 for(const x of [-24,24])for(const z of [-10.5,-7.5,-4.5,-1.5]){
  rod('Флагшток',[x,0,z],[x,6.7,z],.045);
  surface('Флаг',(u,v)=>[x+u*1.55,6.45-v*1.02-.12*u,z+.13*Math.sin(u*8+v*2)*u],10,4,z===-7.5?'blue':'flag');
 }
 // Six compact WC cubicles, with doors, ribs, vents and curved roofs.
 for(let i=0;i<6;i++){
  const x=-22+i*1.25,z=15.3,m=i<3?'blue':'green';
  box('WC · кабина',1.12,2.15,1.18,x,1.13,z,m);
  box('WC · дверь',.84,1.85,.045,x,1.12,z-.61,m);
  box('WC · крыша',1.2,.17,1.27,x,2.29,z,'fabric');
  box('WC · вентиляция',.52,.12,.035,x,2.03,z-.645,'dark');
  box('WC · табличка',.22,.14,.036,x,1.79,z-.645,'fabric');
  box('WC · ручка',.04,.17,.07,x+.34,1.07,z-.66,'dark');
  for(const dx of [-.51,.51])rod('WC · ребро',[x+dx,.08,z-.61],[x+dx,2.17,z-.61],.018,'trim');
 }
 // Five fixtures at the plan's yellow circles, registered with night lighting.
 for(const [i,[x,z]] of [[-24,7.2],[24,7.2],[-24,16.8],[0,16.8],[24,16.8]].entries()){
  rod('Фонарь',[x,0,z],[x,4.5,z],.065);
  box('Фонарь · плафон',.48,.12,.28,x,4.5,z,'glow');
  registerFacilityFloodlights(root,{id:'np-lamp-'+i,lamps:[{position:[x,4.45,z],normal:[0,-1,0],size:[.48,.28]}],target:[x*.86,.08,z-3],source:'owner NP plan · five perimeter lamps'});
 }
 // Parking sign is deliberately small, like a real roadside sign.
 rod('Парковка · стойка',[5,0,8],[5,2.3,8],.04);
 box('Парковка · знак',.65,.65,.045,5,2.3,8,'blue');
 for(const [x,y,w,h] of [[4.85,2.3,.06,.42],[5.02,2.48,.28,.06],[5.15,2.39,.06,.2],[5.02,2.3,.28,.06]])box('Парковка · P',w,h,.01,x,y,7.972,'fabric');
 for(const [key,geometries] of batches){
  const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
  const mesh=new THREE.Mesh(merged,materials[key]);mesh.name='НП · '+key;mesh.receiveShadow=true;mesh.castShadow=true;
  mesh.userData.museumComponent='observation-platform';root.add(mesh);
 }
 const geometry={meshes:root.children.length,triangles:0};root.traverse(o=>{if(o.isMesh)geometry.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
 root.userData.observationPlatform={version:SITE31_NP_VERSION,id:'np-31-1',widthMetres:50,lengthMetres:35,
  shelters:2,shelterAreaM2:100,parkingDepthMetres:10,wcCabins:6,flagpoles:8,lamps:5,
  positionBasis:plan.source,mapCoordinates:{...NP_MAP_POSITION},geometry,features,
  references:['1YyLXppTbBCmUx5q20dN3m_qYSS3RAsAC','1X6ZPCmt5y2xr0dQnyc2rFHyljd8r9eF_','1uCzwbDpp7bdzlLVSkWeHd1T33vX8GcYG']};
 return root;
}
