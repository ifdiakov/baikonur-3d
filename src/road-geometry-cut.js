import * as THREE from 'three';
import {subtractRoadPolygon} from './road-surface.js?v=20261103-restored-junctions-v1';

// Physical cutouts for the displayed road geometry, instead of transparent
// mask textures. Original centreline/OSM graph remains unmodified. This module
// clips every surfaced triangle, including white paint and both shoulders.
export const ROAD_GEOMETRY_CUT_VERSION='protected-through-roads-v5';
const EPS=1e-8,CELL=14,TAU=Math.PI*2;
const area=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,
 ...(a.u!=null&&b.u!=null?{u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t}:{})});
const bounds=vertices=>({minX:Math.min(...vertices.map(v=>v.x)),maxX:Math.max(...vertices.map(v=>v.x)),
 minZ:Math.min(...vertices.map(v=>v.z)),maxZ:Math.max(...vertices.map(v=>v.z))});
const overlap=(a,b)=>a.minX<b.maxX-EPS&&a.maxX>b.minX+EPS&&a.minZ<b.maxZ-EPS&&a.maxZ>b.minZ+EPS;
function clean(poly){
 const p=poly.filter((v,i)=>!i||Math.hypot(v.x-poly[i-1].x,v.z-poly[i-1].z)>EPS);
 if(p.length>2&&Math.hypot(p[0].x-p.at(-1).x,p[0].z-p.at(-1).z)<EPS)p.pop();
 return p;
}
function plane(poly,a,b,inside){
 const result=[];
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dp=area(a,b,p),dq=area(a,b,q),
   pi=inside?dp>=-EPS:dp<=EPS,qi=inside?dq>=-EPS:dq<=EPS;
  if(pi)result.push(p);
  if(pi!==qi)result.push(lerp(p,q,dp/(dp-dq)));
 }
 return clean(result);
}
function positive(poly){const p=clean(poly);if(p.length>2&&area(p[0],p[1],p[2])<0)p.reverse();return p;}
function subtractTriangle(subject,clip,gradeTolerance){
 let remaining=positive(subject),outside=[];
 if(remaining.length<3)return [];
 for(let i=0;i<clip.points.length&&remaining.length;i++){
  const a=clip.points[i],b=clip.points[(i+1)%clip.points.length];
  const outer=plane(remaining,a,b,false);
  if(outer.length>=3)outside.push(outer);
  remaining=plane(remaining,a,b,true);
 }
 if(remaining.length>=3){
  // Each source road remains at its grade. A flyover footprint must not
  // punch holes in the lower road beneath it.
  const x=remaining.reduce((sum,p)=>sum+p.x,0)/remaining.length;
  const z=remaining.reduce((sum,p)=>sum+p.z,0)/remaining.length;
  const triangle=subject,den=area(...triangle);
  const u=area(triangle[1],triangle[2],{x,z})/(den||1);
  const v=area(triangle[2],triangle[0],{x,z})/(den||1);
  const w=1-u-v;
  const meshY=triangle[0].y*u+triangle[1].y*v+triangle[2].y*w;
  if(Math.abs(meshY-clip.height(x,z))>(clip.gradeTolerance??gradeTolerance))return [subject];
 }
 return outside;
}
function area2(poly){
 let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p.x*q.z-q.x*p.z;}return a;
}
function rectangularCut(a,b,width){
 const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
 if(len<1e-7)return null;
 const nx=-dz/len*width*.5,nz=dx/len*width*.5;
 const pts=positive([{x:a[0]-nx,y:a[1],z:a[2]-nz},{x:b[0]-nx,y:b[1],z:b[2]-nz},
  {x:b[0]+nx,y:b[1],z:b[2]+nz},{x:a[0]+nx,y:a[1],z:a[2]+nz}]);
 return {points:pts,bounds:bounds(pts),direction:[dx/len,dz/len],
  height:(x,z)=>{const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(len*len)));return a[1]+(b[1]-a[1])*t;}};
}
function circleCut(p,width){
 const poly=Array.from({length:12},(_,i)=>({x:p[0]+Math.cos(i*TAU/12)*width*.5,
  y:p[1],z:p[2]+Math.sin(i*TAU/12)*width*.5}));
 return {points:positive(poly),bounds:bounds(poly),height:()=>p[1]};
}
function gridIndex(clips){
 const map=new Map();
 for(const clip of clips){
  const b=clip.bounds;
  for(let x=Math.floor(b.minX/CELL);x<=Math.floor(b.maxX/CELL);x++)
   for(let z=Math.floor(b.minZ/CELL);z<=Math.floor(b.maxZ/CELL);z++){
    const key=x+':'+z,list=map.get(key)||[];
    list.push(clip);map.set(key,list);
   }
 }
 return {at(b){
  const out=new Set();
  for(let x=Math.floor(b.minX/CELL);x<=Math.floor(b.maxX/CELL);x++)
   for(let z=Math.floor(b.minZ/CELL);z<=Math.floor(b.maxZ/CELL);z++)
    for(const p of map.get(x+':'+z)||[])if(overlap(b,p.bounds))out.add(p);
  return [...out];
 },cells:map.size};
}
function existingRoadSegmentIndex(roads){
 const grid=new Map();
 for(const r of roads)for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i];
  const radius=(r.width||2)*.5+11,entry={a,b,width:r.width||2,id:r.id};
  const loX=Math.floor((Math.min(a[0],b[0])-radius)/CELL),hiX=Math.floor((Math.max(a[0],b[0])+radius)/CELL);
  const loZ=Math.floor((Math.min(a[2],b[2])-radius)/CELL),hiZ=Math.floor((Math.max(a[2],b[2])+radius)/CELL);
  for(let x=loX;x<=hiX;x++)for(let z=loZ;z<=hiZ;z++){
   const key=x+':'+z,list=grid.get(key)||[];list.push(entry);grid.set(key,list);
  }
 }
 const crossingAt=(a,b,sourceId,width)=>{
  const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
  if(len<1e-6)return false;
  const x=(a[0]+b[0])/2,z=(a[2]+b[2])/2,y=(a[1]+b[1])/2;
  for(const other of grid.get(Math.floor(x/CELL)+':'+Math.floor(z/CELL))||[]){
   const way=a=>String(a).match(/^osm-road-(\d+)/)?.[1]||String(a);
   if(other.id===sourceId||way(other.id)===way(sourceId))continue;
   const ox=other.b[0]-other.a[0],oz=other.b[2]-other.a[2],d=ox*ox+oz*oz;
   if(d<1e-8)continue;
   if(Math.abs((dx*ox+dz*oz)/(len*Math.sqrt(d)))>.42)continue;
   const t=Math.max(0,Math.min(1,((x-other.a[0])*ox+(z-other.a[2])*oz)/d));
   const nearX=other.a[0]+ox*t,nearZ=other.a[2]+oz*t;
   if(Math.hypot(x-nearX,z-nearZ)>(width+other.width)*.5+1.4)continue;
   const h=other.a[1]+(other.b[1]-other.a[1])*t;
   if(Math.abs(y-h)<1.05)return true;
  }
  return false;
 };
 const nearAligned=(a,b,width)=>{
  const x=(a[0]+b[0])/2,z=(a[2]+b[2])/2,y=(a[1]+b[1])/2;
  for(const r of grid.get(Math.floor(x/CELL)+':'+Math.floor(z/CELL))||[]){
   const dx=r.b[0]-r.a[0],dz=r.b[2]-r.a[2],den=dx*dx+dz*dz;
   if(den<1e-8)continue;
   const t=Math.max(0,Math.min(1,((x-r.a[0])*dx+(z-r.a[2])*dz)/den));
   const distance=Math.hypot(x-(r.a[0]+dx*t),z-(r.a[2]+dz*t));
   const height=r.a[1]+(r.b[1]-r.a[1])*t;
   // Only replace genuinely overlapping PARALLEL carriageways. A spur
   // hitting a through road at 90 degrees must not punch a rectangle into
   // the through lane and leave a hole alongside the spur's butt end.
   const len=Math.hypot(b[0]-a[0],b[2]-a[2]);
   const oldLen=Math.sqrt(den);
   const parallel=len>1e-6?Math.abs(((b[0]-a[0])*dx+(b[2]-a[2])*dz)/(len*oldLen)):0;
   if(parallel>=.76&&distance<=(width+r.width)*.5+1.2&&Math.abs(height-y)<1.25)return true;
  }
  return false;
 };
 // Preserve the entire physical width of a live intersecting carriageway.
 // A test of just the middle of a deleted road (the previous behaviour) can
 // miss a junction halfway along a sampled segment. Search all intersecting
 // centreline segments and build one short, level-compatible corridor per
 // crossing. This protection is subtracted FROM THE CUTTER POLYGON, never
 // rendered as a separate patch or a coplanar overlay.
 nearAligned.protectorsFor=(a,b,sourceId,width,hiddenCuts=[])=>{
  const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);
  if(len<1e-6)return [];
  const radius=width*.5+7;
  const minX=Math.floor((Math.min(a[0],b[0])-radius)/CELL),
   maxX=Math.floor((Math.max(a[0],b[0])+radius)/CELL),
   minZ=Math.floor((Math.min(a[2],b[2])-radius)/CELL),
   maxZ=Math.floor((Math.max(a[2],b[2])+radius)/CELL);
  const candidates=new Set();
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)
   for(const entry of grid.get(x+':'+z)||[])candidates.add(entry);
  const sourceRoot=id=>String(id||'').match(/^osm-road-(\d+)/)?.[1]||String(id||'');
  const protection=[];
  const protectionsSeen=new Set();
  const cross=(x,z,y,w)=>x*w-z*y;
  for(const host of candidates){
   if(sourceRoot(host.id)===sourceRoot(sourceId))continue;
   const ex=host.b[0]-host.a[0],ez=host.b[2]-host.a[2],elen=Math.hypot(ex,ez);
   if(elen<1e-5)continue;
   const cosine=Math.abs((dx*ex+dz*ez)/(len*elen));
   if(cosine>.80)continue;
   const determinant=cross(dx,dz,ex,ez);
   if(Math.abs(determinant)<1e-7)continue;
   const offsetX=host.a[0]-a[0],offsetZ=host.a[2]-a[2];
   const t=cross(offsetX,offsetZ,ex,ez)/determinant,
    u=cross(offsetX,offsetZ,dx,dz)/determinant;
   const tMargin=(width+host.width)*.5/(len||1),uMargin=(width+host.width)*.5/elen;
   if(t< -tMargin||t>1+tMargin||u< -uMargin||u>1+uMargin)continue;
   const ax=a[0]+dx*t,az=a[2]+dz*t,
    ay=a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,t));
   const hostY=host.a[1]+(host.b[1]-host.a[1])*Math.max(0,Math.min(1,u));
   if(Math.abs(ay-hostY)>1.05)continue; // underpasses remain independent
   const px=(ax+host.a[0]+ex*u)*.5,pz=(az+host.a[2]+ez*u)*.5;
   // Both ways may be targeted for deletion. In that case there is no
   // "live through road" to restore at this exact map location.
   const hostRemoved=hiddenCuts.some(h=>{
    if(sourceRoot(h.sourceId)!==sourceRoot(host.id))return false;
    for(let j=1;j<h.points.length;j++){
     const p=h.points[j-1],q=h.points[j],vx=q[0]-p[0],vz=q[2]-p[2],den=vx*vx+vz*vz;
     if(den<1e-8)continue;
     const ratio=Math.max(0,Math.min(1,((px-p[0])*vx+(pz-p[2])*vz)/den));
     const d=Math.hypot(px-p[0]-vx*ratio,pz-p[2]-vz*ratio);
     if(d<(h.width+host.width)*.5+.3&&Math.abs(hostY-p[1]-(q[1]-p[1])*ratio)<1.05)return true;
    }
    return false;
   });
   if(hostRemoved)continue;
   const key=sourceRoot(host.id)+':'+Math.round(px*2)+':'+Math.round(pz*2);
   if(protectionsSeen.has(key))continue;protectionsSeen.add(key);
   const ux=ex/elen,uz=ez/elen,normalX=-uz,normalZ=ux;
   const crossingSin=Math.max(.25,Math.sqrt(1-cosine*cosine));
   const halfLength=width/(2*crossingSin)+host.width*.55+.85,
    halfWidth=host.width*.5+.6*.5+.15;
   const begin=[px-ux*halfLength,hostY,pz-uz*halfLength],
    end=[px+ux*halfLength,hostY,pz+uz*halfLength];
   const corridor=rectangularCut(begin,end,halfWidth*2);
   if(corridor)protection.push(corridor);
  }
  return protection;
 };
 nearAligned.crossingAt=crossingAt;
 return nearAligned;
}
export function makeRoadSurfaceCutIndex(hidden=[],added=[],{shoulderExtra=.6,edgeMargin=.19,sourceRoads=[]}={}){
 const clips=[],seen=new Set();
 const nearOld=sourceRoads.length?existingRoadSegmentIndex(sourceRoads):null;
 let duplicateCuts=0,sourceCuts=0,replacementCuts=0,skippedOffRoad=0,restoredCrossings=0,protectedClipParts=0;
 for(const [kind,roads]of [['hidden',hidden],['added',added]])for(const r of roads){
  if(r.points?.length<2)continue;
  if(kind==='hidden'){
   const key=r.sourceId+'|'+r.width+'|'+r.points.map(p=>p.map(x=>Math.round(x*1000)).join(',')).join(';');
   if(seen.has(key)){duplicateCuts++;continue;}seen.add(key);
  }
  const widths=r.widths;
  for(let j=1;j<r.points.length;j++){
   const a=r.points[j-1],b=r.points[j],width=(widths?(widths[j-1]+widths[j])*.5:r.width)+shoulderExtra+edgeMargin;
   const section=rectangularCut(a,b,width);
   if(!section)continue;
   if(kind==='added'&&nearOld&&!nearOld(a,b,width)){skippedOffRoad++;continue;}
   section.gradeTolerance=kind==='hidden'?1.9:1.05;
   section.kind=kind;
   section.protectCrossing=kind==='hidden'&&Boolean(nearOld?.crossingAt?.(a,b,r.sourceId,width));
   if(kind==='hidden'&&nearOld?.protectorsFor){
    const originalPoly=section.points;
    let pieces=[originalPoly];
    for(const corridor of nearOld.protectorsFor(a,b,r.sourceId,width,hidden)){
     const next=pieces.flatMap(p=>subtractRoadPolygon(p,corridor.points));
     if(next.length!==pieces.length||next.some((p,i)=>p.length!==pieces[i]?.length))restoredCrossings++;
     pieces=next;
     if(!pieces.length)break;
    }
    for(const points of pieces){
     if(points.length<3)continue;
     clips.push({...section,points,bounds:bounds(points),protectCrossing:false});
     protectedClipParts++;
    }
   }else clips.push(section);
   if(kind==='hidden')sourceCuts++;else replacementCuts++;
  }
  // Only internal bends are rounded; outer butt ends preserve the adjoining
  // road right up to its surveyed / user-selected connecting vertex.
  for(let j=1;j<r.points.length-1;j++){
   const width=(widths?widths[j]:r.width)+shoulderExtra+edgeMargin;
   if(kind==='added'&&nearOld&&!nearOld(r.points[j-1],r.points[j],width)
      &&!nearOld(r.points[j],r.points[j+1],width))continue;
   const corner=circleCut(r.points[j],width);corner.gradeTolerance=kind==='hidden'?1.9:1.05;
   corner.kind=kind;
   const a=r.points[j-1],b=r.points[j+1],dx=b[0]-a[0],dz=b[2]-a[2],d=Math.hypot(dx,dz);
   corner.protectCrossing=kind==='hidden'&&Boolean(nearOld?.crossingAt?.(a,b,r.sourceId,width));
   if(d>1e-6)corner.direction=[dx/d,dz/d];
   if(kind==='hidden'&&nearOld?.protectorsFor){
    let pieces=[corner.points];
    for(const corridor of nearOld.protectorsFor(a,b,r.sourceId,width,hidden)){
     const next=pieces.flatMap(p=>subtractRoadPolygon(p,corridor.points));
     if(next.length!==pieces.length||next.some((p,i)=>p.length!==pieces[i]?.length))restoredCrossings++;
     pieces=next;
     if(!pieces.length)break;
    }
    for(const points of pieces)if(points.length>=3)clips.push({...corner,points,bounds:bounds(points),protectCrossing:false});
   }else clips.push(corner);
  }
 }
 return {...gridIndex(clips),clips:clips.length,sourceCuts,replacementCuts,duplicateCuts,skippedOffRoad,restoredCrossings,protectedClipParts};
}
// Batched OSM surfaces no longer retain an OSM way-id per GPU triangle.
// Preserve an unrelated THROUGH road when the owner hides a crossing way:
// the geometry itself still reveals the strip's longitudinal direction.
function sourceTriangleDirection(tri,surfaceName=''){
 const lengths=[0,1,2].map(i=>{
  const a=tri[i],b=tri[(i+1)%3],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
  return {dx,dz,len};
 }).sort((a,b)=>a.len-b.len);
 const thin=lengths[0].len<.65||/разметка|жёлтая|кромки|dashes|edge-lines|continuation · (white|yellow)/i.test(surfaceName);
 const edge=thin?lengths[2]:lengths[0];
 if(edge.len<1e-6)return null;
 // Nearly equilateral clipped junction faces have no reliable road tangent.
 // Keep the source junction footprint to cover rather than remove a crossing.
 if(!thin&&lengths[2].len/edge.len<1.20)return null;
 return [edge.dx/edge.len,edge.dz/edge.len];
}
function triangleGeom(geo,index){
 const position=geo.getAttribute('position'),uv=geo.getAttribute('uv');
 return Array.from({length:3},(_,k)=>{
  const i=index?index.getX(k):k;
  return {x:position.getX(i),y:position.getY(i),z:position.getZ(i),
   ...(uv?{u:uv.getX(i),v:uv.getY(i)}:{})};
 });
}
export function physicallyCutRoadGeometry(geometry,cutIndex,{gradeTolerance=1.05,surfaceName=''}={}){
 const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),index=geometry.index;
 const output=[],outputUV=uv?[]:null;
 let checked=0,clipped=0,removed=0;
 const emit=(a,b,c)=>{
  if(Math.abs(area(a,b,c))<1e-8)return;
  // Winding is oriented +Y. All OSM road surfaces use top-facing triangles.
  for(const p of area(a,b,c)>0?[a,c,b]:[a,b,c]){
   output.push(p.x,p.y,p.z);if(outputUV)outputUV.push(p.u??0,p.v??0);
  }
 };
 for(let i=0;i<(index?.count??position.count);i+=3){
  const t=triangleGeom(geometry,index?{getX:k=>index.getX(i+k)}:null).map((p,k)=>index?p:{
   x:position.getX(i+k),y:position.getY(i+k),z:position.getZ(i+k),
   ...(uv?{u:uv.getX(i+k),v:uv.getY(i+k)}:{})});
  const b=bounds(t),near=cutIndex.at(b);
  if(!near.length){emit(...t);continue;}checked++;
  const originalArea=Math.abs(area(...t));
  let pieces=[positive(t)];
  const sourceDirection=surfaceName?sourceTriangleDirection(t,surfaceName):null;
  for(const cut of near){
   // Different OSM ways at one junction are geometrically separate even if
   // their triangles overlap in XZ. Hide the requested alignment, not the
   // active perpendicular road passing through that same space.
   if(cut.kind==='hidden'&&cut.protectCrossing&&cut.direction&&sourceDirection){
    const dot=Math.abs(cut.direction[0]*sourceDirection[0]+cut.direction[1]*sourceDirection[1]);
    if(dot<.36)continue;
   }
   pieces=pieces.flatMap(p=>subtractTriangle(p,cut,gradeTolerance));
   if(!pieces.length)break;
  }
  if(pieces.length!==1||pieces[0].length!==3){clipped++;if(!pieces.length)removed++;}
  for(const p of pieces){
   let remainingArea=0;
   for(let k=1;k<p.length-1;k++)remainingArea+=Math.abs(area(p[0],p[k],p[k+1]));
   // Avoid pale islands left by almost fully clipped source triangles.
   if(remainingArea<Math.min(.018,originalArea*.035))continue;
   for(let k=1;k<p.length-1;k++)emit(p[0],p[k],p[k+1]);
  }
 }
 const result=new THREE.BufferGeometry();
 result.setAttribute('position',new THREE.Float32BufferAttribute(output,3));
 if(outputUV)result.setAttribute('uv',new THREE.Float32BufferAttribute(outputUV,2));
 result.computeVertexNormals();result.computeBoundingSphere();
 return {geometry:result,stats:{inputTriangles:(index?.count??position.count)/3,outputTriangles:output.length/9,
  examined:checked,clipped,removed,withUV:Boolean(uv)}};
}
