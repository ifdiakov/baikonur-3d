import * as THREE from 'three';
// Owner railway corrections. Existing source graph remains authoritative.
export const OWNER_RAIL_CURVES_VERSION='20261108-targeted-rail-connections-v1';
const map=p=>[p.x/3.4+650,p.z/3.4+522.5];
const near=(p,x,y,r)=>Math.hypot(...map(p).map((v,i)=>v-[x,y][i]))<r;
const w=(x,y,ref)=>new THREE.Vector3((x-650)*3.4,ref?.y??-2.755,(y-522.5)*3.4);
/** Shape the Site 5 approach into a long tangent-continuous curve between
 * registered owner endpoints; never alter the train's through source. */
export function shapeOwnerRail(points,wayId){
 if(points.length<4)return points;
 const id=String(wayId??'');
 if(id!=='37548027')return points;
 let first=points.findIndex(p=>near(p,607.2,416.4,.5)),
     last=points.findIndex(p=>near(p,600.35,429.44,.65));
 if(first<0||last<=first+1)return points;
 const a=points[first],b=points[last];
 const controls=[a,w(605.2,420.9,a),w(604.6,425.7,b),b];
 const spline=new THREE.CatmullRomCurve3(controls,false,'centripetal',.45);
 const samples=Array.from({length:37},(_,i)=>{
  const p=spline.getPoint(i/36),y=a.y+(b.y-a.y)*i/36;
  p.y=y;return p;
 });
 return [...points.slice(0,first),...samples,...points.slice(last+1)];
}
/** Does a display rail actually cover all checkpoints in the desired seam? */
export function missingOwnerRailSeam(railPaths){
 const ends=[[579,389],[581.1,387],[583.2,385],[585.3,383],[587.4,380.9]];
 return ends.some(([x,y])=>{
  const p=w(x,y),threshold=3.1;
  for(const line of railPaths){
   const pts=line.points||[];
   // Fast bounding-box prefilter avoids scanning thousands of remote rails.
   if(!pts.some(v=>Math.abs(v.x-p.x)<18&&Math.abs(v.z-p.z)<18))continue;
   for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
    if(!len)continue;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/len));
    if(Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<threshold)return false;
   }
  }
  return true;
 });
}
export function makeOwnerRailSeam(){
 const points=[[579,389],[581.1,387.1],[583.2,385],[585.3,383],[587.4,380.9]];
 const path=new THREE.CatmullRomCurve3(points.map(([x,y])=>w(x,y)),false,'centripetal',.35);
 return Array.from({length:41},(_,i)=>path.getPoint(i/40));
}
