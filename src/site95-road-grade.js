import * as THREE from 'three';
import {ROAD_SURFACE_Y} from './transport-ground-profile.js?v=20261114-ground-contact-v1';
// Absolute upper envelope is idempotent: cached geometry can be conformed
// again without lowering approach ramps a second time. The inherited cache
// version continues to describe Site 113's non-idempotent width adjustment.
export function createSite95RoadGrade(anchor){
 const roadY=ROAD_SURFACE_Y,fade=14,bounds={minX:anchor.x-31,maxX:anchor.x+30,minZ:anchor.z-32,maxZ:anchor.z+25};
 function weightAt(x,z){const d=Math.max(bounds.minX-x,x-bounds.maxX,bounds.minZ-z,z-bounds.maxZ,0),t=THREE.MathUtils.clamp(d/fade,0,1);return 1-t*t*t*(t*(t*6-15)+10);}
 // Retain the old local approach envelope for elevated input paths. This is
 // an upper limit only: paths at the shared ground datum are never raised.
 const legacyApproachY=.72;
 const heightAt=(x,z,y)=>{const w=weightAt(x,z);return w>0?Math.min(y,THREE.MathUtils.lerp(legacyApproachY,roadY,w)):y;};
 function conform(points){const out=[];for(let i=0;i<points.length;i++){
  if(i){const a=points[i-1],b=points[i],near=Math.max(a.x,b.x)>=bounds.minX-fade&&Math.min(a.x,b.x)<=bounds.maxX+fade&&Math.max(a.z,b.z)>=bounds.minZ-fade&&Math.min(a.z,b.z)<=bounds.maxZ+fade;
   const n=near?Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.5):1;for(let j=1;j<n;j++)out.push(a.clone().lerp(b,j/n));}
  out.push(points[i].clone());}for(const p of out)p.y=heightAt(p.x,p.z,p.y);return out;}
 function compose(previous){return {...previous,
  weightAt:(x,z)=>Math.max(previous.weightAt(x,z),weightAt(x,z)),
  roadAt:(x,z)=>weightAt(x,z)>0?heightAt(x,z,previous.roadAt(x,z)??ROAD_SURFACE_Y):previous.roadAt(x,z),
  conform:points=>conform(previous.conform(points)),
  cachedGrade:{...previous.cachedGrade,conform:points=>conform(previous.cachedGrade.conform(points))}};}
 return {roadY,bounds,heightAt,conform,compose,stats:()=>({roadY,bounds,fade,sourceCentrelinesPreserved:true})};
}
