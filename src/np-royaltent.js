import * as THREE from 'three';

// Original procedural reconstruction from the owner's RoyalTent reference.
// Manufacturer dimensions are exact; tube diameters, fixings and seams are
// visually reconstructed, not fabrication/shop drawings.
export const NP_TENT_VERSION='royaltent-rt100-20261109-v1';
export const NP_TENT_SPEC=Object.freeze({model:'ARCH DUNE RT100/10',width:10,depth:10,height:5.549,entranceHeight:4.413,feet:4,chordsPerTruss:3});
const V=(a)=>new THREE.Vector3(...a);
const HALF=5, EDGE=4.96, FOOT=.35, CUT=8.45;
export function tentRoofHeight(x,z){
 const a=Math.max(0,Math.cos(x*Math.PI/10)),b=Math.max(0,Math.cos(z*Math.PI/10));
 return FOOT+(EDGE-FOOT)*(a+b-a*b)+(NP_TENT_SPEC.height-EDGE)*a*b;
}
const edgeHeight=t=>tentRoofHeight(t,-HALF);
const edgePoint=(side,t,inset=0,y=edgeHeight(t))=>{
 if(side===0)return [t,y,-HALF+inset];
 if(side===1)return [HALF-inset,y,t];
 if(side===2)return [-t,y,HALF-inset];
 return [-HALF+inset,y,-t];
};
function clip(poly,nx,nz,k,inside=true){
 const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=k-nx*a[0]-nz*a[1],db=k-nx*b[0]-nz*b[1],ia=inside?da>=-1e-9:da<=1e-9,ib=inside?db>=-1e-9:db<=1e-9;
  if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }return out;
}
export function appendRoyalTent({cx,cz,door=false,add}){
 const counts={trusses:4,chords:12,diagonalMembers:0,feet:4,anchorBolts:16,cornerClearPanels:4,doorLeaves:door?2:0,openEntrance:!door};
 function emit(g,m,name){g.translate(cx,0,cz);add(g,m,'Шатёр · '+name);}
 function box(name,w,h,d,x,y,z,m='metal'){emit(new THREE.BoxGeometry(w,h,d).translate(x,y,z),m,name);}
 function rod(name,a,b,r=.025,m='metal',sides=6){
  const p=V(a),q=V(b),delta=q.clone().sub(p),len=delta.length();if(len<1e-7)return;
  const g=new THREE.CylinderGeometry(r,r,len,sides,1,true);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.multiplyScalar(1/len)));g.translate(...p.add(q).multiplyScalar(.5).toArray());emit(g,m,name);
 }
 function chain(name,fn,n,r,m='metal',sides=6){for(let i=0;i<n;i++)rod(name,fn(i/n),fn((i+1)/n),r,m,sides);}
 function patch(name,fn,nx,ny,m){
  const p=[],idx=[];for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)p.push(...fn(i/nx,j/ny));
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;idx.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();emit(g,m,name);
 }
 // The roof and clear corner gussets share exact cut vertices, not overlapping
 // coplanar sheets. The white membrane ends at the corner spreader.
 const positions={canopy:[],tentGlass:[]},normals={canopy:[],tentGlass:[]};
 function polygon(poly,m){
  for(let i=1;i+1<poly.length;i++)for(const [x,z]of [poly[0],poly[i],poly[i+1]]){
   positions[m].push(x,tentRoofHeight(x,z),z);
   const e=.001,dx=(tentRoofHeight(x+e,z)-tentRoofHeight(x-e,z))/(2*e),dz=(tentRoofHeight(x,z+e)-tentRoofHeight(x,z-e))/(2*e),n=new THREE.Vector3(-dx,1,-dz).normalize();normals[m].push(n.x,n.y,n.z);
  }
 }
 const steps=40;
 for(let iz=0;iz<steps;iz++)for(let ix=0;ix<steps;ix++){
  const x=-5+ix*10/steps,z=-5+iz*10/steps,h=10/steps;
  for(let poly of [[[x,z],[x,z+h],[x+h,z]],[[x+h,z],[x,z+h],[x+h,z+h]]]){
   for(const [sx,sz]of [[1,1],[1,-1],[-1,1],[-1,-1]]){const corner=clip(poly,sx,sz,CUT,false);if(corner.length>=3)polygon(corner,'tentGlass');poly=clip(poly,sx,sz,CUT,true);if(poly.length<3)break;}
   if(poly.length>=3)polygon(poly,'canopy');
  }
 }
 for(const key of Object.keys(positions)){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions[key],3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals[key],3));emit(g,key,key==='canopy'?'натяжная кровля ПВХ':'прозрачные угловые вставки');}
 // Four genuine triangular-section trusses: two outer chords and an inner
 // lower chord. All structural members remain below the membrane.
 for(let side=0;side<4;side++){
  const chord=(t,c)=>{const top=edgeHeight(t)-.055,depth=Math.min(.437,Math.max(.08,(top-.19)*.54));return edgePoint(side,t,c===0?.025:c===1?.345:.185,top-(c===2?depth:.018*c));};
  for(let c=0;c<3;c++)chain('трёхпоясная арочная ферма · пояс '+(c+1),u=>chord(-5+10*u,c),40,c===2?.055:.047,'metal',8);
  const bays=20;
  for(let j=0;j<bays;j++){
   const a=-5+j*10/bays,b=a+10/bays;
   for(const [c,d]of [[0,2],[1,2],[0,1]]){rod('ферма · диагональ',chord(j%2?a:b,c),chord(j%2?b:a,d),.018);counts.diagonalMembers++;}
   for(const [c,d]of [[0,2],[1,2]])rod('ферма · поперечная связь',chord(a,c),chord(a,d),.018);
  }
  for(const t of [-3.5,0,3.5])for(let c=0;c<3;c++)rod('стыковая муфта',chord(t-.065,c),chord(t+.065,c),c===2?.066:.059,'metal',8);
  // Roof keder is visible above the steel, with a textile valance below it.
  chain('усиленный кант арки',u=>edgePoint(side,-5+10*u,.0,edgeHeight(-5+10*u)+.012),48,.018,'tentSeam');
  const front=side===0,open=front&&!door;
  for(let j=0;j<40;j++){
   const a=-5+j*.25,b=a+.25,mid=(a+b)/2;
   if(front&&door&&Math.abs(mid)<1.125){
    patch('наддверная мембрана',(u,v)=>{const t=a+(b-a)*u,top=edgeHeight(t)-.47;return edgePoint(side,t,.08,2.37+(top-2.37)*v);},1,2,'canopy');continue;
   }
   if(open&&Math.abs(mid)<3.5)continue;
   const corner=Math.abs(mid)>=3.5;
   patch(corner?'прозрачная стенка до опорной лапы':'боковая шторка ПВХ',(u,v)=>{const t=a+(b-a)*u,top=Math.max(.155,edgeHeight(t)-.47),y=.15+(top-.15)*v,inset=.08+.018*Math.sin((t+5)*Math.PI*4)*Math.sin(v*Math.PI);return edgePoint(side,t,inset,y);},1,4,corner?'tentGlass':'canopy');
  }
  // Narrow upper valance never closes the open entry arch.
  patch('верхний мягкий фартук',(u,v)=>{const t=-3.5+7*u,top=edgeHeight(t)-.08;return edgePoint(side,t,.06,top-(.18*v));},28,1,'canopy');
  for(const t of [-3.5,-1.75,0,1.75,3.5]){
   if(front&&(open||door&&Math.abs(t)<1.13))continue;
   const top=Math.max(.2,edgeHeight(t)-.48);
   chain('вертикальный сварной шов шторки',u=>edgePoint(side,t,.055,.16+(top-.16)*u),5,.009,'tentSeam',4);
   const p=edgePoint(side,t,.045,.21);box('карман утяжелителя',.1,.11,.1,...p,'tentSeam');
  }
 }
 // Interior roof ribs connect the middle of each perimeter arch to a bolted
 // four-way crown; their triangular webs are visible through the open entry.
 for(let side=0;side<4;side++){
  const rib=(u,lower=false)=>{const t=5*(1-u),p=edgePoint(side,0,t,tentRoofHeight(0,5-t)-.13-(lower?.2:0));return p;};
  chain('кровельное ребро',u=>rib(u),22,.032,'metal');chain('нижняя связь кровельного ребра',u=>rib(u,true),22,.024,'metal');
  for(let j=0;j<10;j++)rod('кровельное ребро · раскос',rib(j/10),rib((j+1)/10,true),.014);
 }
 box('центральная крестовина',.44,.09,.44,0,NP_TENT_SPEC.height-.14,0);
 for(const x of [-.145,.145])for(const z of [-.145,.145])box('болт крестовины',.04,.04,.04,x,NP_TENT_SPEC.height-.08,z,'trim');
 // Reinforced textile seam strips follow roof curvature, not detached wires.
 for(const fixed of [-2.5,0,2.5])for(let axis=0;axis<2;axis++)patch('сварной шов кровли',(u,v)=>{
  const t=-5+10*u,w=fixed+(v-.5)*.024,x=axis?t:w,z=axis?w:t;return [x,tentRoofHeight(x,z)+.008,z];
 },40,1,'tentSeam');
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const a=[sx*3.45,edgeHeight(3.45)-.06,sz*5],b=[sx*5,edgeHeight(3.45)-.06,sz*3.45];
  rod('угловая распорка под кромкой тента',a,b,.032);
  chain('кант прозрачного угла',u=>{const x=sx*(3.45+1.55*u),z=sz*(5-1.55*u);return [x,tentRoofHeight(x,z)+.012,z];},16,.021,'tentSeam');
  const anchor=[sx*4.89,.2,sz*4.89],hem=[sx*4.225,tentRoofHeight(4.225,4.225)-.025,sz*4.225];
  rod('натяжной трос угла',anchor,hem,.011,'metal');
  const along=t=>V(anchor).lerp(V(hem),t).toArray();rod('винтовой натяжитель',along(.13),along(.30),.027,'metal',8);
  box('опорная лапа с анкерной плитой',.48,.055,.48,sx*4.94,.1775,sz*4.94);
  for(const dx of [-.16,.16])for(const dz of [-.16,.16]){
   const x=sx*4.94+dx,z=sz*4.94+dz;
   emit(new THREE.CylinderGeometry(.035,.035,.016,8).translate(x,.214,z),'trim','анкерная шайба');
   emit(new THREE.CylinderGeometry(.024,.024,.04,6).translate(x,.238,z),'metal','шестигранный анкерный болт');
  }
  rod('вилка опорного узла',[sx*4.94,.21,sz*4.94],[sx*4.87,.5,sz*4.87],.065,'metal',8);
  // Lacing along the corner seam uses small tubes, not per-eyelet meshes.
  for(let j=1;j<10;j++){
   const u=j/10,x=sx*(3.45+1.55*u),z=sz*(5-1.55*u),y=tentRoofHeight(x,z);
   rod('шнуровка угловой вставки',[x-.035*sx,y+.026,z+.015*sz],[x+.035*sx,y+.026,z-.015*sz],.008,'trim',4);
  }
 }
 if(door){
  const z=-5.035;
  // Two actual translucent leaves, not an opaque blue rectangle.
  for(const s of [-1,1]){
   box('прозрачное полотно двери',1.025,2.08,.018,s*.553,1.225,z,'tentGlass');
   for(const x of [s*.04,s*1.08])box('профиль дверной створки',.038,2.16,.052,x,1.23,z-.018,'trim');
   for(const y of [.15,.65,2.31])box('поперечина дверной створки',1.065,.038,.052,s*.56,y,z-.02,'trim');
   rod('вертикальная дверная ручка',[s*.15,.94,z-.10],[s*.15,1.34,z-.10],.019,'metal',8);
   for(const y of [.45,1.85])box('дверная петля',.065,.12,.08,s*1.105,y,z-.01);
  }
  box('верхняя обвязка входа',2.3,.075,.105,0,2.355,z,'trim');box('порог входа',2.3,.035,.16,0,.165,z,'trim');
 }

 return {...NP_TENT_SPEC,...counts,version:NP_TENT_VERSION,centre:[cx,cz]};
}
