import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const PROTON_VERSION='proton-reference-v2';
export const PROTON_DIMENSIONS=Object.freeze({height:58.2,coreDiameter:4.1,fairingDiameter:4.1,tankCount:6,nozzleCount:6,referenceImages:22});
// Metres, Y up. Silhouette, fairing and markings follow the owner's 22 views.
// Small surface fittings and engine plumbing are visual reconstructions.
function surface(){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=1024;c.height=2048;const x=c.getContext('2d');x.fillStyle='#e1e3df';x.fillRect(0,0,1024,2048);
 let seed=22471;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<36000;i++){x.fillStyle=`rgba(${rnd()>.5?'255,255,255':'61,70,72'},${.025+rnd()*.025})`;x.fillRect(rnd()*1024,rnd()*2048,1+rnd()*3,1+rnd()*3);}
 const yy=m=>2048-m/58.2*2048;
 x.strokeStyle='#bfc5c5';x.lineWidth=.7;
 for(let y=0;y<58;y+=2){x.beginPath();x.moveTo(0,yy(y));x.lineTo(1024,yy(y));x.stroke();}
 for(let i=0;i<16;i++){x.beginPath();x.moveTo(i*64,0);x.lineTo(i*64,2048);x.stroke();}
 for(const u of [100,612]){
  x.fillStyle='#bd2c26';x.font='bold 66px Arial';x.textAlign='center';
  [...'ПРОТОН'].forEach((s,i)=>x.fillText(s,u,yy(34.2)+i*58));x.fillText('М',u,yy(24.2));
  x.fillStyle='#164393';x.font='bold 13px Arial';x.save();x.translate(u-48,yy(23.65));x.rotate(-Math.PI/2);x.fillText('ЦЕНТР ХРУНИЧЕВА',0,0);x.restore();
  const fy=yy(38.5);x.fillStyle='#fff';x.fillRect(u-24,fy,48,10);x.fillStyle='#215ca0';x.fillRect(u-24,fy+10,48,10);x.fillStyle='#cb3b32';x.fillRect(u-24,fy+20,48,10);
  x.strokeStyle='#aeb5b5';x.lineWidth=1.5;x.beginPath();x.ellipse(u,yy(40.6),27,17,0,0,Math.PI*2);x.stroke();x.fillStyle='#b5362f';x.beginPath();x.moveTo(u-16,yy(40.6)+6);x.lineTo(u+19,yy(40.6)-10);x.lineTo(u-3,yy(40.6)+2);x.closePath();x.fill();x.fillStyle='#526067';x.font='9px Arial';x.fillText('РОСКОСМОС',u,yy(39.9));
  x.fillStyle='#124b8d';x.font='bold 53px Arial';x.fillText('esa',u,yy(47.0));x.font='bold 12px Arial';x.fillText('EXOMARS',u,yy(46.0));
 }
 for(let i=0;i<110;i++){const u=(i%10)*102.4+20,y=yy(36.5+(Math.floor(i/10)%8)*.48);x.strokeStyle='#a2aaaa';x.strokeRect(u,y,17,10);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
export function createProtonRocket({detail='high'}={}){
 const root=new THREE.Group();root.name='Протон-М · по референсам';const texture=surface(),segments=detail==='map'?32:64;
 const materials={body:new THREE.MeshStandardMaterial({color:texture?'#fff':'#e1e3df',map:texture,roughness:.58,metalness:.2}),tank:new THREE.MeshStandardMaterial({color:'#d4d9d6',roughness:.48,metalness:.28}),steel:new THREE.MeshStandardMaterial({color:'#a5afb2',roughness:.38,metalness:.73}),dark:new THREE.MeshStandardMaterial({color:'#242c30',roughness:.6,metalness:.55}),black:new THREE.MeshStandardMaterial({color:'#11191d',roughness:.73,metalness:.2}),red:new THREE.MeshStandardMaterial({color:'#b74134',roughness:.58})};
 const stages=Array.from({length:4},(_,i)=>{const g=new THREE.Group();g.name=['Первая ступень · шесть баков и двигателей','Межступенчатая ферма и вторая ступень','Третья ступень','Головной обтекатель'][i];root.add(g);return g;}),buckets=new Map(),components={};
 function add(geometry,material,tag,stage=0,position=[0,0,0],rotation=[0,0,0]){
  const m=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1));geometry.applyMatrix4(m);
  if(material==='body'){const uv=geometry.attributes.uv,p=geometry.attributes.position;for(let i=0;i<uv.count;i++)uv.setY(i,p.getY(i)/58.2);}
  const key=stage+':'+material;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(geometry);components[tag]=(components[tag]||0)+1;
 }
 function cylinder(rt,rb,h,y,mat,tag,stage=0,x=0,z=0,n=segments){add(new THREE.CylinderGeometry(rt,rb,h,n,1,false),mat,tag,stage,[x,y,z]);}
 function lathe(profile,mat,tag,stage=0,x=0,z=0,n=segments){add(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),n),mat,tag,stage,[x,0,z]);}
 function torus(r,t,y,mat,tag,stage=0,x=0,z=0){add(new THREE.TorusGeometry(r,t,6,segments),mat,tag,stage,[x,y,z],[Math.PI/2,0,0]);}
 function rod(a,b,r,mat,tag,stage=0){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av),g=new THREE.CylinderGeometry(r,r,d.length(),7);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));add(g,mat,tag,stage,av.add(bv).multiplyScalar(.5).toArray());}
 cylinder(2.05,2.05,19.2,11.3,'tank','central-oxidizer-tank');cylinder(2.0,2.0,.15,1.52,'black','engine-bay-base');
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3,x=Math.cos(a)*2.75,z=Math.sin(a)*2.75;
  lathe([[0,2.1],[.65,2.1],[.81,2.35],[.81,17.45],[.77,18.3],[.64,19.2],[.40,20.1],[.07,21.15],[0,21.2]],'tank','side-tank',0,x,z);
  cylinder(.815,.815,1.55,3.3,'black','tank-black-band',0,x,z);
  for(const y of [2.4,4.1,8,12,16.8])torus(.812,.017,y,'steel','tank-seam',0,x,z);
  // Revolved shell has an open throat and a visible inner bell, not a solid cone.
  lathe([[.76,.05],[.79,.08],[.73,.30],[.59,.70],[.42,1.10],[.29,1.46],[.26,1.57],[.23,1.57],[.26,1.44],[.39,1.09],[.56,.69],[.70,.28],[.73,.08],[.76,.05]],'dark','rd276-open-nozzle',0,x,z,40);
  torus(.76,.035,.08,'steel','nozzle-lip',0,x,z);
  cylinder(.24,.25,.55,1.81,'steel','engine-throat',0,x,z,16);
  const dx=Math.cos(a+.56),dz=Math.sin(a+.56);
  rod([x+.52*dx,1.0,z+.52*dz],[x+.86*dx,1.65,z+.86*dz],.10,'steel','engine-feed-pipe');rod([x+.86*dx,1.65,z+.86*dz],[x+.50*dx,2.4,z+.50*dz],.10,'steel','engine-feed-return');
  add(new THREE.BoxGeometry(.08,.23,.018),'red','tank-service-mark',0,[x+Math.cos(a)*.815,4.4,z+Math.sin(a)*.815],[0,Math.PI/2-a,0]);
  rod([x*1.29,4.2,z*1.29],[x*1.29,17.3,z*1.29],.035,'steel','tank-cable-duct');
  for(const y of [5.8,11.2,16.4])rod([x*1.28,y,z*1.28],[x*1.34,y+.08,z*1.34],.045,'tank','tank-duct-clamp');
  rod([x*.73,20.3,z*.73],[x*.45,22.9,z*.45],.055,'steel','upper-tank-brace',1);
 }
 for(const y of [21.1,23.5])torus(2.05,.07,y,'steel','interstage-ring',1);
 for(let i=0;i<24;i++){
  const a=i*Math.PI/12,b=(i+1)*Math.PI/12;for(const sign of [-1,1])rod([2.05*Math.cos(a),21.13,2.05*Math.sin(a)],[2.05*Math.cos(a+sign*Math.PI/12),23.47,2.05*Math.sin(a+sign*Math.PI/12)],.048,'tank','open-lattice-brace',1);
  if(i%3===0)rod([1.98*Math.cos(a),21.15,1.98*Math.sin(a)],[1.98*Math.cos(a),23.45,1.98*Math.sin(a)],.04,'steel','lattice-post',1);
 }
 cylinder(2.05,2.05,12.1,29.55,'body','second-stage',1);cylinder(2.05,2.05,7.6,39.4,'body','third-stage',2);
 for(const [y,stage]of [[23.55,1],[35.55,1],[35.65,2],[42.95,2]])torus(2.06,.045,y,'steel','stage-seam',stage);
 for(const [y,stage]of [[25.0,1],[33.8,1],[37.8,2],[40.9,2]])for(let i=0;i<8;i++){
  const a=i*Math.PI/4,x=2.07*Math.sin(a),z=2.07*Math.cos(a);add(new THREE.BoxGeometry(.16,.55,.13),'tank','equipment-cover',stage,[x,y,z],[0,a,0]);
 }
 for(const a of [Math.PI/2,-Math.PI/2]){const x=2.10*Math.sin(a),z=2.10*Math.cos(a);rod([x,23.6,z],[x,35.4,z],.085,'tank','external-cable-duct',1);rod([x,35.7,z],[x,42.9,z],.07,'tank','upper-cable-duct',2);}
 lathe([[0,43.2],[2.05,43.2],[2.05,50.6],[2.01,51.8],[1.86,53.2],[1.56,54.6],[1.14,56],[.62,57.25],[.035,58.2],[0,58.2]],'body','payload-fairing',3);
 torus(2.055,.045,43.25,'steel','fairing-separation',3);
 for(let i=0;i<16;i++){const a=i*Math.PI/8;add(new THREE.BoxGeometry(.12,.25,.045),'tank','fairing-latch',3,[2.07*Math.sin(a),43.5,2.07*Math.cos(a)],[0,a,0]);}
 for(const [key,parts]of buckets){const [stage,mat]=key.split(':'),geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,materials[mat]);mesh.name=stages[stage].name+' · '+mat;mesh.castShadow=true;mesh.receiveShadow=true;stages[stage].add(mesh);}
 root.userData.proton={version:PROTON_VERSION,dimensions:PROTON_DIMENSIONS,components};
 let exploded=false;return {root,setExploded(value){exploded=!!value;stages.forEach((g,i)=>g.position.y=exploded?i*5:0);},stats:()=>({version:PROTON_VERSION,...PROTON_DIMENSIONS,components,exploded}),dispose(){root.traverse(o=>o.geometry?.dispose());Object.values(materials).forEach(m=>m.dispose());texture?.dispose();}};
}
