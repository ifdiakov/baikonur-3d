import * as THREE from 'three';
// Absolute upper envelope is idempotent: cached geometry can be conformed
// again without lowering approach ramps a second time. The inherited cache
// version continues to describe Site 113's non-idempotent width adjustment.
export function createSite95RoadGrade(anchor){
 const roadY=-2.73,fade=14,bounds={minX:anchor.x-31,maxX:anchor.x+30,minZ:anchor.z-32,maxZ:anchor.z+25};
 function weightAt(x,z){const d=Math.max(bounds.minX-x,x-bounds.maxX,bounds.minZ-z,z-bounds.maxZ,0),t=THREE.MathUtils.clamp(d/fade,0,1);return 1-t*t*t*(t*(t*6-15)+10);}
 const heightAt=(x,z,y)=>Math.min(y,THREE.MathUtils.lerp(.72,roadY,weightAt(x,z)));
 function conform(points){const out=[];for(let i=0;i<points.length;i++){
  if(i){const a=points[i-1],b=points[i],near=Math.max(a.x,b.x)>=bounds.minX-fade&&Math.min(a.x,b.x)<=bounds.maxX+fade&&Math.max(a.z,b.z)>=bounds.minZ-fade&&Math.min(a.z,b.z)<=bounds.maxZ+fade;
   const n=near?Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.5):1;for(let j=1;j<n;j++)out.push(a.clone().lerp(b,j/n));}
  out.push(points[i].clone());}for(const p of out)p.y=heightAt(p.x,p.z,p.y);return out;}
 function compose(previous){return {...previous,
  weightAt:(x,z)=>Math.max(previous.weightAt(x,z),weightAt(x,z)),
  roadAt:(x,z)=>weightAt(x,z)>0?heightAt(x,z,previous.roadAt(x,z)??.72):previous.roadAt(x,z),
  conform:points=>conform(previous.conform(points)),
  cachedGrade:{...previous.cachedGrade,conform:points=>conform(previous.cachedGrade.conform(points))}};}
 return {roadY,bounds,heightAt,conform,compose,stats:()=>({roadY,bounds,fade,sourceCentrelinesPreserved:true})};
}
