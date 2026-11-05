import * as THREE from 'three';
// Local vertical correction only: keep the approved OSM street centrelines.
// The flat museum terrain is at -2.755; use the same 25 mm lift as КПП №7.
export function createSite113RoadGrade(anchor){
 const version='checkpoint7-site113-grade-v1';
 const streets=new Set(['172571693','172571703','172571718','172571743','172571754','172571790','172571792','172571808','172571823','172571852','172571888']);
 const widthScale=id=>String(id).split('-').some(v=>streets.has(v))?.45:1;
 const isBaked=data=>data.displayGradeVersion===version||(!data.displayGradeVersion&&(data.editable||data.levels?.medium?.roads||[]).some(row=>widthScale(row.id)<1&&(row.width??row.w)<=1));
 function adjustWidths(graph){for(const way of graph.ways){const scale=widthScale(way.osmId);way.width*=scale;for(const edge of way.segments)edge.width*=scale;}}
 const baseY=-2.755,roadY=baseY+.025,fade=12;
 const bounds={minX:anchor.x-36,maxX:anchor.x+7,minZ:anchor.z-7,maxZ:anchor.z+36};
 function weightAt(x,z){
  const d=Math.max(bounds.minX-x,x-bounds.maxX,bounds.minZ-z,z-bounds.maxZ,0);
  const t=THREE.MathUtils.clamp(d/fade,0,1);return 1-t*t*t*(t*(t*6-15)+10);
 }
 const heightAt=(x,z,y)=>THREE.MathUtils.lerp(y,roadY,weightAt(x,z));
 function conform(points){
  const out=[];
  for(let i=0;i<points.length;i++){
   if(i){const a=points[i-1],b=points[i];
    const near=Math.max(a.x,b.x)>=bounds.minX-fade&&Math.min(a.x,b.x)<=bounds.maxX+fade&&Math.max(a.z,b.z)>=bounds.minZ-fade&&Math.min(a.z,b.z)<=bounds.maxZ+fade;
    const n=near?Math.ceil(a.distanceTo(b)/.5):1;
    for(let j=1;j<n;j++)out.push(a.clone().lerp(b,j/n));
   }out.push(points[i].clone());
  }
  for(const p of out)p.y=heightAt(p.x,p.z,p.y);return out;
 }
 // Preserve the existing checkpoint's rail and road rules when the source
 // network is built. The cached routes and LOD use this local grade directly.
 function withCheckpoint(checkpoint){return {...checkpoint,version,isBaked,adjustWidths,widthScale,cachedGrade:{conform:checkpoint.conform,widthScale:()=>1},
  weightAt:(x,z)=>Math.max(checkpoint.weightAt(x,z),weightAt(x,z)),
  roadAt:(x,z)=>weightAt(x,z)>0?heightAt(x,z,checkpoint.roadAt(x,z)??.72):checkpoint.roadAt(x,z),
  conform:points=>conform(checkpoint.conform(points))};}
 return {version,isBaked,bounds,baseY,roadY,widthScale,weightAt,heightAt,conform,withCheckpoint,stats:()=>({baseY,roadY,bounds,fade,sourceCentrelinesPreserved:true})};
}
