import * as THREE from 'three';
// A below-grade petal with curved shoulders, lined banks and a rising floor.
export function flamePetal(k,{x,z,angle,length=66,width=28,depth=28,tag='petal-flame-channel'}){
 const axis=new THREE.Vector2(Math.cos(angle),Math.sin(angle)),normal=new THREE.Vector2(-axis.y,axis.x),rows=[];
 const at=(u,v,y)=>[x+axis.x*u+normal.x*v,y,z+axis.y*u+normal.y*v];
 for(let i=0;i<=12;i++){const t=i/12,u=12+length*t,w=8+width*Math.sin(Math.PI*t*.90),floorW=5+w*.24,y=-depth*(1-t*t);rows.push({u,w,floorW,y});}
 const polygon=[...rows.map(r=>at(r.u,-r.w,0)),...rows.toReversed().map(r=>at(r.u,r.w,0))].map(p=>[p[0],p[2]]);
 k.cutouts.push({polygon});k.mat.concrete.side=THREE.DoubleSide;k.mat.dark.side=THREE.DoubleSide;
 for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];k.quad(at(a.u,-a.floorW,a.y),at(b.u,-b.floorW,b.y),at(b.u,b.floorW,b.y),at(a.u,a.floorW,a.y),'dark',tag+'-floor');
  for(const s of [-1,1]){k.quad(at(a.u,s*a.floorW,a.y),at(b.u,s*b.floorW,b.y),at(b.u,s*b.w,0),at(a.u,s*a.w,0),'concrete',tag+'-bank');k.rod(at(a.u,s*a.w,.35),at(b.u,s*b.w,.35),.45,'light',tag+'-rim');
   if(i%2===0)k.rod(at(b.u,s*b.floorW,b.y+.08),at(b.u,s*b.w,.08),.07,'steel',tag+'-lining-seam');
   for(const t of [.25,.5,.75])k.rod(at(a.u,s*THREE.MathUtils.lerp(a.floorW,a.w,t),a.y*(1-t)+.07),at(b.u,s*THREE.MathUtils.lerp(b.floorW,b.w,t),b.y*(1-t)+.07),.06,'steel',tag+'-lining-seam');}}
 const e=rows.at(-1);k.quad(at(e.u,-e.w,0),at(e.u,e.w,0),at(e.u+4,e.w,0),at(e.u+4,-e.w,0),'concrete',tag+'-outlet');
 return polygon;
}
