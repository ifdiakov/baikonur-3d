import * as THREE from 'three';

// One pavement mesh and one shoulder mesh for the whole network. Overlapping
// ribbons are cut in X/Z before triangulation; depth bias is only for paint.
export const ROAD_SURFACE_VERSION='joined-surfaces-v1';
export const ROAD_PROFILE=Object.freeze({sampleStep:2.5,shoulderDrop:.075,paintLift:.055,dashLength:5.5,dashGap:8,paintWidth:.18});
const EPS=1e-7,CELL=24;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const area=p=>p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v.x*n.z-n.x*v.z;},0)/2;
function cleanPolygon(vertices){
 const p=vertices.filter((v,i)=>!i||Math.hypot(v.x-vertices[i-1].x,v.z-vertices[i-1].z)>EPS);
 if(p.length>2&&Math.hypot(p[0].x-p.at(-1).x,p[0].z-p.at(-1).z)<EPS)p.pop();
 // Clipping may leave extra vertices on a straight X/Z edge. Removing them
 // before Float32 conversion prevents near-zero-area, steep normal slivers.
 for(let i=p.length-1;i>=0&&p.length>3;i--){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],length=Math.hypot(c.x-a.x,c.z-a.z);if(length&&Math.abs(cross(a,c,b))/length<1e-5&&(b.x-a.x)*(b.x-c.x)+(b.z-a.z)*(b.z-c.z)<=0)p.splice(i,1);}
 if(p.length<3||Math.abs(area(p))<EPS)return [];
 if(area(p)<0)p.reverse();return p;
}
function halfPlane(poly,a,b,inside){
 const result=[];if(!poly.length)return result;
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q),ip=inside?dp>=-EPS:dp<=EPS,iq=inside?dq>=-EPS:dq<=EPS;
  if(ip)result.push(p);
  if(ip!==iq){const t=dp/(dp-dq);result.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t});}
 }return cleanPolygon(result);
}
// A convex clipping polygon partitions a subject into disjoint convex pieces.
// New intersection vertices interpolate Y, so graded entrances stay smooth.
export function subtractRoadPolygon(subject,clip,overlapAllowed=null){
 const original=cleanPolygon(subject);let inner=original,parts=[];const boundary=cleanPolygon(clip);
 if(!boundary.length)return inner.length?[inner]:[];
 for(let i=0;i<boundary.length&&inner.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],outer=halfPlane(inner,a,b,false);
  if(outer.length)parts.push(outer);inner=halfPlane(inner,a,b,true);
 }
 // Grade compatibility must be evaluated on the actual shared footprint.
 // The centre of overlapping bounding boxes can lie far outside either
 // sloping triangle and extrapolate a completely unrelated height.
 if(overlapAllowed&&(!inner.length||!overlapAllowed(inner)))return original.length?[original]:[];
 return parts;
}
function bounds(poly){return {minX:Math.min(...poly.map(v=>v.x)),maxX:Math.max(...poly.map(v=>v.x)),minZ:Math.min(...poly.map(v=>v.z)),maxZ:Math.max(...poly.map(v=>v.z))};}
function overlaps(a,b){return a.maxX>b.minX+EPS&&a.minX<b.maxX-EPS&&a.maxZ>b.minZ+EPS&&a.minZ<b.maxZ-EPS;}
class PolygonIndex{
 constructor(){
  this.cells=new Map();
  // Each index has its own mark, so nested independent polygon indexes
  // cannot overwrite one another's duplicate-elimination state.
  this.seen=Symbol('polygon-index-visit');
  this.generation=0;
 }
 add(record){
  const b=record.bounds,fromX=Math.floor(b.minX/CELL),toX=Math.floor(b.maxX/CELL),
   fromZ=Math.floor(b.minZ/CELL),toZ=Math.floor(b.maxZ/CELL);
  for(let x=fromX;x<=toX;x++)for(let z=fromZ;z<=toZ;z++){
   const key=x+':'+z;let bucket=this.cells.get(key);
   if(!bucket){bucket=[];this.cells.set(key,bucket);}
   bucket.push(record);
  }
 }
 near(b){
  // The old code allocated an array of cell names AND a new Set for every
  // triangle. Direct cell traversal with generation stamps preserves exactly
  // the same first-seen order while avoiding both allocations.
  const out=[],generation=++this.generation,seen=this.seen;
  for(let x=Math.floor(b.minX/CELL);x<=Math.floor(b.maxX/CELL);x++)
   for(let z=Math.floor(b.minZ/CELL);z<=Math.floor(b.maxZ/CELL);z++){
    const bucket=this.cells.get(x+':'+z);
    if(!bucket)continue;
    for(const polygon of bucket)if(polygon[seen]!==generation&&overlaps(b,polygon.bounds)){
     polygon[seen]=generation;out.push(polygon);
    }
   }
  return out;
 }
}
function sameLevel(a,b,overlap=null){
 const x=overlap?overlap.reduce((sum,p)=>sum+p.x,0)/overlap.length:(Math.max(a.bounds.minX,b.bounds.minX)+Math.min(a.bounds.maxX,b.bounds.maxX))/2;
 const z=overlap?overlap.reduce((sum,p)=>sum+p.z,0)/overlap.length:(Math.max(a.bounds.minZ,b.bounds.minZ)+Math.min(a.bounds.maxZ,b.bounds.maxZ))/2;
 const mergingHighway=a.road==='highway'&&b.road==='highway'&&a.priority!==b.priority;
 const tolerance=a.priority<0||b.priority<0||mergingHighway?1.2:a.gradeTolerance!=null&&b.gradeTolerance!=null&&a.priority===b.priority?Math.min(a.gradeTolerance,b.gradeTolerance):.22;
 return Math.abs(a.height(x,z)-b.height(x,z))<tolerance;
}
function record(poly,road,section){
 poly=cleanPolygon(poly);if(!poly.length)return null;
 const a=section?.[0],b=section?.[1];
 const height=a&&b?(x,z)=>{const dx=b.pos.x-a.pos.x,dz=b.pos.z-a.pos.z,t=THREE.MathUtils.clamp(((x-a.pos.x)*dx+(z-a.pos.z)*dz)/(dx*dx+dz*dz||1),0,1);return THREE.MathUtils.lerp(a.pos.y,b.pos.y,t);}:
 ()=>poly.reduce((n,v)=>n+v.y,0)/poly.length;
 return {poly,bounds:bounds(poly),height,road};
}
function triangulate(polygons){
 const xyz=[];for(const p of polygons)for(let i=1;i<p.length-1;i++){
  const triangle=[p[0],p[i],p[i+1]].map(v=>({x:Math.fround(v.x),y:Math.fround(v.y),z:Math.fround(v.z)}));
  if(cross(...triangle)<1e-6)continue;
  for(const v of [triangle[0],triangle[2],triangle[1]])xyz.push(v.x,v.y,v.z);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function unionRecords(records,occluders=[],indexRecords=true){
 const index=new PolygonIndex(),out=[];for(const r of occluders)index.add(r);
 let clipped=0;
 for(const r of records){
  let pieces=[r.poly];
  for(const previous of index.near(r.bounds)){
   const mergingHighway=r.road==='highway'&&previous.road==='highway'&&r.priority!==previous.priority;
   if(!mergingHighway&&!sameLevel(r,previous))continue;
   pieces=pieces.flatMap(p=>subtractRoadPolygon(p,previous.poly,mergingHighway?overlap=>sameLevel(r,previous,overlap):null));if(!pieces.length)break;
  }
  if(pieces.length!==1||pieces[0]?.length!==r.poly.length)clipped++;
  out.push(...pieces);if(indexRecords)index.add(r);
 }
 return {polygons:out,clipped};
}

// Reuse the same X/Z clipping for already sampled highway ribbons. Each
// input triangle keeps its own grade plane, so a ramp cannot erase a lower
// underpass simply because their map projections overlap.
export function unionRoadSurfacePolygons(polygons,exclusivePolygons=[]){
 const make=poly=>{
  const r=record(poly,'highway');if(!r)return null;r.priority=poly.priority??0;r.gradeTolerance=.008;
  const [a,b,c]=r.poly,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
  r.height=(x,z)=>{const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;return u*a.y+v*b.y+(1-u-v)*c.y;};
  if(Number.isFinite(poly.clipHeight))r.height=()=>poly.clipHeight;
  return r;
 };
 const records=polygons.map(make).filter(Boolean),exclusive=exclusivePolygons.map(poly=>{const r=make(poly);if(r)r.priority=-1;return r;}).filter(Boolean);
 const through=records.filter(r=>r.priority===0),ramps=records.filter(r=>r.priority!==0);
 const main=unionRecords(through,exclusive),merge=unionRecords(ramps,[...through,...exclusive],false);
 // X/Z subtraction alone leaves an open vertical seam where the flat
 // cross-section of a graded ramp meets a differently sloping main road.
 // Share the actual visible owner's plane at that cut edge. The transition
 // width follows the real height difference: small seams stay local, while
 // a larger difference needs enough pavement to avoid a steep crossfall.
 // Smoothstep has a peak derivative of 1.5, so this bounds its added slope
 // to .45 until the maximum local width is reached.
 // The ramp footprint and source points remain untouched; an underpass is
 // excluded by the same local-level band used by pavement ownership.
 const seams=new PolygonIndex(),blendWidth=2.4;
 for(const poly of main.polygons){const owner=make(poly);if(owner)seams.add(owner);}
 const sharedHeights=new Map();
 const weld=p=>{
  // Shared clipped edges must use the same final GPU vertex, including
  // their height. Otherwise two equivalent intersections can round to
  // different sides of a Float32 edge after a nonlinear height adjustment.
  const key=Math.fround(p.x)+':'+Math.round(p.y*1e7)+':'+Math.fround(p.z);if(sharedHeights.has(key))return sharedHeights.get(key);
  p={x:Math.fround(p.x),y:p.y,z:Math.fround(p.z)};
  let result=p,bestDistance=blendWidth,bestHeightDifference=Infinity;
  for(const owner of seams.near({minX:p.x-blendWidth,maxX:p.x+blendWidth,minZ:p.z-blendWidth,maxZ:p.z+blendWidth})){
   const y=owner.height(p.x,p.z),difference=Math.abs(y-p.y);if(difference>=1.2)continue;
   let distance=Infinity,inside=true;
   for(let i=0;i<owner.poly.length;i++){
    const a=owner.poly[i],b=owner.poly[(i+1)%owner.poly.length],dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    distance=Math.min(distance,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz));
    if(cross(a,b,p)<-EPS)inside=false;
   }
   if(inside)distance=0;
   if(distance>bestDistance+EPS||Math.abs(distance-bestDistance)<=EPS&&difference>=bestHeightDifference)continue;
   bestDistance=distance;bestHeightDifference=difference;
   const width=Math.max(.6,Math.min(blendWidth,difference*(1.5/.45))),t=THREE.MathUtils.clamp(distance/width,0,1),weight=1-t*t*(3-2*t);
   result={x:p.x,y:THREE.MathUtils.lerp(p.y,y,weight),z:p.z};
  }
  sharedHeights.set(key,result);return result;
 };
 // Warp a local, conforming grid rather than just the two rims of a wide
 // source ribbon. A rim-only warp spreads the correction across its whole
 // width and opens cracks at T vertices introduced by polygon clipping.
 // The source plane outside the seam strip stays unchanged.
 const gridStep=.2,unchanged=[],pieces=[];
 for(const poly of merge.polygons){
  const box=bounds(poly),near=seams.near({minX:box.minX-blendWidth,maxX:box.maxX+blendWidth,minZ:box.minZ-blendWidth,maxZ:box.maxZ+blendWidth});
  const compatible=near.some(owner=>{
   const differences=poly.map(p=>p.y-owner.height(p.x,p.z));
   return Math.min(...differences)<1.2&&Math.max(...differences)>-1.2;
  });
  if(!compatible){unchanged.push(poly);continue;}
  for(let x=Math.floor(box.minX/gridStep);x<=Math.floor(box.maxX/gridStep);x++)for(let z=Math.floor(box.minZ/gridStep);z<=Math.floor(box.maxZ/gridStep);z++){
   const minX=x*gridStep,maxX=(x+1)*gridStep,minZ=z*gridStep,maxZ=(z+1)*gridStep;
   const cell=[{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}];let part=poly;
   for(let i=0;i<4&&part.length;i++)part=halfPlane(part,cell[i],cell[(i+1)%4],true);
   if(part.length)pieces.push(part);
  }
 }
 // Insert every coincident boundary vertex on both sides of an edge.
 // Their welded heights need not be linear along the unsplit source edge.
 const vertices=new Map(),vertexStep=gridStep,vertexEpsilon=1e-7;
 for(const poly of pieces)for(const p of poly){const key=Math.floor(p.x/vertexStep)+':'+Math.floor(p.z/vertexStep);if(!vertices.has(key))vertices.set(key,[]);vertices.get(key).push(p);}
 const joined=[...unchanged];
 for(const poly of pieces){
  const boundary=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz,along=[{t:0,p:a}];
   for(let x=Math.floor((Math.min(a.x,b.x)-vertexEpsilon)/vertexStep);x<=Math.floor((Math.max(a.x,b.x)+vertexEpsilon)/vertexStep);x++)for(let z=Math.floor((Math.min(a.z,b.z)-vertexEpsilon)/vertexStep);z<=Math.floor((Math.max(a.z,b.z)+vertexEpsilon)/vertexStep);z++)for(const p of vertices.get(x+':'+z)||[]){
    const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/(lengthSquared||1);if(t<=1e-7||t>=1-1e-7)continue;
    if(Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)>vertexEpsilon)continue;
    along.push({t,p:{x:a.x+t*dx,y:a.y+t*(b.y-a.y),z:a.z+t*dz}});
   }
   along.sort((a,b)=>a.t-b.t);let last=-Infinity;
   for(const row of along)if(row.t-last>1e-7){boundary.push(row.p);last=row.t;}
  }
  // Triangulate the convex boundary itself, retaining every clipping T
  // vertex. A newly height-sampled centre inside a very narrow cell would
  // turn longitudinal curvature into a false, steep transverse needle.
  const outline=[...boundary],triangles=[];
  while(outline.length>3){
   let best=-1,score=-Infinity;
   for(let i=0;i<outline.length;i++){
    const a=outline[(i+outline.length-1)%outline.length],b=outline[i],c=outline[(i+1)%outline.length],twiceArea=cross(a,b,c);
    if(twiceArea<=1e-10||area(outline)-twiceArea/2<=1e-10)continue;
    const quality=twiceArea/((a.x-b.x)**2+(a.z-b.z)**2+(c.x-b.x)**2+(c.z-b.z)**2+(a.x-c.x)**2+(a.z-c.z)**2);
    if(quality>score){score=quality;best=i;}
   }
   if(best<0)break;
   triangles.push([outline[(best+outline.length-1)%outline.length],outline[best],outline[(best+1)%outline.length]]);outline.splice(best,1);
  }
  if(outline.length===3)triangles.push(outline);
  for(const triangle of triangles)joined.push(triangle.map(weld));
 }
 return {polygons:[...main.polygons,...joined],clipped:main.clipped+merge.clipped};
}

// A single tightly packed source junction leaves a sub-metre display void
// between its otherwise connected ribbons. Fill only a fully enclosed,
// flat, tiny cavity inside an explicitly supplied source junction window.
// The convex patch also replaces its minute overlap with existing asphalt,
// so the final mesh has one owner and no coplanar paint/shoulder workaround.
export function fillEnclosedRoadSurfaceVoid(mesh,center,{radius=.8,maxArea=.03,maxDiameter=.5}={}){
 if(!mesh)return null;
 const position=mesh.geometry.attributes.position,index=mesh.geometry.index,
  box={minX:center.x-radius,maxX:center.x+radius,minZ:center.z-radius,maxZ:center.z+radius},candidates=[];
 for(let i=0;i<(index?.count??position.count);i+=3){
  const poly=[0,1,2].map(k=>{const j=index?index.getX(i+k):i+k;return{x:position.getX(j),y:position.getY(j),z:position.getZ(j)};});
  if(overlaps(box,bounds(poly))&&poly.every(p=>Math.abs(p.y-center.y)<.002))candidates.push({offset:i,poly});
 }
 if(!candidates.length)return null;
 const level=candidates[0].poly[0].y;
 if(candidates.some(r=>r.poly.some(p=>Math.abs(p.y-level)>1e-6)))return null;
 let gaps=[[{x:box.minX,y:level,z:box.minZ},{x:box.maxX,y:level,z:box.minZ},{x:box.maxX,y:level,z:box.maxZ},{x:box.minX,y:level,z:box.maxZ}]];
 for(const {poly} of candidates){
  const clipBounds=bounds(poly);
  gaps=gaps.flatMap(gap=>overlaps(bounds(gap),clipBounds)?subtractRoadPolygon(gap,poly):[gap]);
  if(!gaps.length)return null;
 }
 const uncoveredArea=gaps.reduce((sum,p)=>sum+Math.abs(area(p)),0);
 if(uncoveredArea>maxArea||gaps.some(p=>p.some(v=>Math.abs(v.x-center.x)>=radius-1e-5||Math.abs(v.z-center.z)>=radius-1e-5)))return null;
 const points=gaps.flat().sort((a,b)=>a.x-b.x||a.z-b.z),unique=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>EPS);
 const half=points=>{const out=[];for(const p of points){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=EPS)out.pop();out.push(p);}return out;};
 const lower=half(unique),upper=half([...unique].reverse()),patch=cleanPolygon([...lower.slice(0,-1),...upper.slice(0,-1)]);
 if(!patch.length||Math.abs(area(patch))>maxArea)return null;
 const patchBounds=bounds(patch);
 if(Math.hypot(patchBounds.maxX-patchBounds.minX,patchBounds.maxZ-patchBounds.minZ)>maxDiameter)return null;
 const affected=new Map(candidates.map(r=>[r.offset,r.poly])),xyz=[];
 const append=(a,b,c)=>{for(const p of [a,b,c])xyz.push(p.x,p.y,p.z);};
 for(let i=0;i<(index?.count??position.count);i+=3){
  const poly=affected.get(i);
  if(!poly||!overlaps(bounds(poly),patchBounds)){
   for(let k=0;k<3;k++){const j=index?index.getX(i+k):i+k;xyz.push(position.getX(j),position.getY(j),position.getZ(j));}
   continue;
  }
  for(const piece of subtractRoadPolygon(poly,patch))for(let j=1;j<piece.length-1;j++){
   const t=[piece[0],piece[j],piece[j+1]].map(p=>({x:Math.fround(p.x),y:Math.fround(p.y),z:Math.fround(p.z)}));
   if(cross(...t)>1e-8)append(t[0],t[2],t[1]);
  }
 }
 for(let i=1;i<patch.length-1;i++)append(patch[0],patch[i+1],patch[i]);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
 geometry.setIndex(Array.from({length:xyz.length/3},(_,i)=>i));geometry.computeVertexNormals();geometry.computeBoundingSphere();
 mesh.geometry.dispose();mesh.geometry=geometry;
 const report={center:center.toArray(),radius,uncoveredArea,patchArea:Math.abs(area(patch)),patch:patch.map(p=>[p.x,p.y,p.z])};
 (mesh.userData.enclosedJunctionVoids??=[]).push(report);return report;
}

// The dark through carriageway owns its footprint at every grade-compatible
// junction. Pale local-road and shoulder sheets must end at that footprint,
// rather than protruding through the ramp or viaduct approach above it.
export function clipOrdinaryRoadMeshes(meshes,highwayMesh,ownershipPolygons=[],{onlyProtruding=false}={}){
 const index=new PolygonIndex(),gradeTolerance=1.2;
 const make=poly=>{
  const r=record(poly,'highway-owner');if(!r)return null;
  const [a,b,c]=r.poly,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
  r.height=(x,z)=>{const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;return u*a.y+v*b.y+(1-u-v)*c.y;};
  if(Number.isFinite(poly.clipHeight))r.height=()=>poly.clipHeight;
  r.priority=0;r.gradeTolerance=gradeTolerance;return r;
 };
 if(ownershipPolygons.length){for(const poly of ownershipPolygons){
  // A bent, graded ribbon quad is not necessarily planar. Preserve the
  // same b-c diagonal as geometryBatch.quad instead of extending one of
  // its two grade planes across the entire footprint.
  const pieces=poly.length===4&&!Number.isFinite(poly.clipHeight)?[[poly[0],poly[3],poly[1]],[poly[1],poly[3],poly[2]]]:[poly];
  for(const piece of pieces){const r=make(piece);if(r)index.add(r);}
 }}
 else{
  const hp=highwayMesh.geometry.attributes.position,hi=highwayMesh.geometry.index;
  for(let i=0;i<(hi?.count??hp.count);i+=3){const poly=[0,1,2].map(k=>{const j=hi?hi.getX(i+k):i+k;return{x:hp.getX(j),y:hp.getY(j),z:hp.getZ(j)};}),r=make(poly);if(r)index.add(r);}
 }
 const reports=[];
 for(const mesh of meshes){
  if(!mesh)continue;const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,positions=[];let clipped=0,removed=0;
  const append=(a,b,c)=>{for(const q of [a,b,c])positions.push(q.x,q.y,q.z);};
  for(let i=0;i<(ix?.count??p.count);i+=3){
   // Most triangles never meet an owning highway/road. Check the exact X/Z
   // bounds from Float32 attributes first, without allocating three vertex
   // objects, an array or a generic polygon just to discard it afterwards.
   const a=ix?ix.getX(i):i,b=ix?ix.getX(i+1):i+1,c=ix?ix.getX(i+2):i+2;
   const ax=p.getX(a),ay=p.getY(a),az=p.getZ(a),
    bx=p.getX(b),by=p.getY(b),bz=p.getZ(b),
    cx=p.getX(c),cy=p.getY(c),cz=p.getZ(c);
   const box={minX:Math.min(ax,bx,cx),maxX:Math.max(ax,bx,cx),
    minZ:Math.min(az,bz,cz),maxZ:Math.max(az,bz,cz)};
   const near=index.near(box);
   if(!near.length){positions.push(ax,ay,az,bx,by,bz,cx,cy,cz);continue;}
   const original=[{x:ax,y:ay,z:az},{x:bx,y:by,z:bz},{x:cx,y:cy,z:cz}];
   const subject=make(original);if(!subject){append(...original);continue;}
   let pieces=[subject.poly];
   for(const host of near){
    // A fully buried shoulder is already invisible. Plane differences are
    // linear on each subject triangle, so its vertex extrema safely bound
    // every possible shared point without a costly polygon subtraction.
    if(onlyProtruding&&subject.poly.every(p=>p.y-host.height(p.x,p.z)<-1e-6))continue;
    pieces=pieces.flatMap(poly=>subtractRoadPolygon(poly,host.poly,overlap=>{
     const x=overlap.reduce((sum,p)=>sum+p.x,0)/overlap.length,z=overlap.reduce((sum,p)=>sum+p.z,0)/overlap.length;
     return Math.abs(subject.height(x,z)-host.height(x,z))<gradeTolerance;
    }));
    if(!pieces.length)break;
   }
   if(!pieces.length){removed++;clipped++;continue;}
   if(pieces.length!==1||pieces[0].length!==3)clipped++;
   for(const poly of pieces)for(let k=1;k<poly.length-1;k++){
    const triangle=[poly[0],poly[k],poly[k+1]].map(q=>({x:Math.fround(q.x),y:Math.fround(q.y),z:Math.fround(q.z)}));
    if(cross(...triangle)>1e-6)append(triangle[0],triangle[2],triangle[1]);
   }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(Array.from({length:positions.length/3},(_,i)=>i));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const inputTriangles=(ix?.count??p.count)/3;mesh.geometry.dispose();mesh.geometry=geometry;
  reports.push({mesh:mesh.name,inputTriangles,outputTriangles:positions.length/9,clipped,removed});
 }
 return {version:'highway-pavement-owner-v1',gradeTolerance,reports};
}

export function sampleRoadCurve(curve,{width=5.2,heightAt=null,step=ROAD_PROFILE.sampleStep,shoulder=3.1}={}){
 curve.arcLengthDivisions=Math.max(2048,Math.ceil(curve.getLength()*1.2));curve.updateArcLengths();
 const length=curve.getLength(),count=Math.max(8,Math.ceil(length/step));
 return Array.from({length:count+1},(_,i)=>{
  const u=i/count,t=curve.getUtoTmapping(u),pos=curve.getPoint(t),tan=curve.getTangent(t),l=Math.hypot(tan.x,tan.z)||1;
  if(heightAt)pos.y=heightAt(pos,t,u);
  return {pos,tan,nx:-tan.z/l,nz:tan.x/l,t,u,distance:u*length,width,shoulderWidth:width+shoulder};
 });
}
// Cubic handles enforce the tangent at both road merges without adding a
// control point on the host road that a Catmull–Rom spline can overshoot.
export function joinedRoadCurve(points,startDirection,endDirection){
 const tangents=points.map((p,i)=>{
  const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)],direction=(i===0?startDirection:i===points.length-1?endDirection:null)?.clone()||after.clone().sub(before);
  const length=Math.min(i?p.distanceTo(before):Infinity,i<points.length-1?p.distanceTo(after):Infinity)*.34;
  return direction.normalize().multiplyScalar(length);
 });
 const curve=new THREE.CurvePath();for(let i=1;i<points.length;i++)curve.add(new THREE.CubicBezierCurve3(points[i-1],points[i-1].clone().add(tangents[i-1]),points[i].clone().sub(tangents[i]),points[i]));return curve;
}
function normalizeRoad(road){
 const samples=road.samples||sampleRoadCurve(road.curve,road);
 let distance=0,previous=null;
 const clean=samples.map((s,i)=>{
  const pos=(s.pos||s.p).clone();if(s.y!==undefined)pos.y=s.y;if(previous)distance+=pos.distanceTo(previous);previous=pos;
  return {...s,pos,width:s.width??road.width,shoulderWidth:s.shoulderWidth??((s.width??road.width)+(road.shoulder??3.1)),distance:s.distance??distance};
 });
 return {...road,samples:clean,length:clean.at(-1).distance};
}
function nearest(road,p){
 let best={distance:Infinity};const samples=road.samples;
 for(let i=1;i<samples.length;i++){
  const a=samples[i-1].pos,b=samples[i].pos,dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1),x=a.x+t*dx,z=a.z+t*dz,d=Math.hypot(p.x-x,p.z-z);
  if(d<best.distance)best={distance:d,pos:new THREE.Vector3(x,THREE.MathUtils.lerp(a.y,b.y,t),z),direction:new THREE.Vector3(dx,0,dz).normalize(),along:THREE.MathUtils.lerp(samples[i-1].distance,samples[i].distance,t),width:THREE.MathUtils.lerp(samples[i-1].width,samples[i].width,t)};
 }return best;
}
function crossingCandidates(roads){
 const index=new PolygonIndex(),crossings=[];
 for(const road of roads)for(let i=1;i<road.samples.length;i++){
  const a=road.samples[i-1].pos,b=road.samples[i].pos,dx=b.x-a.x,dz=b.z-a.z;
  const item={a,b,road:road.id,bounds:{minX:Math.min(a.x,b.x)-.001,maxX:Math.max(a.x,b.x)+.001,minZ:Math.min(a.z,b.z)-.001,maxZ:Math.max(a.z,b.z)+.001}};
  for(const q of index.near(item.bounds)){
   if(q.road===road.id)continue;
   const ux=q.b.x-q.a.x,uz=q.b.z-q.a.z,det=dx*uz-dz*ux;if(Math.abs(det)<1e-8)continue;
   const px=q.a.x-a.x,pz=q.a.z-a.z,t=(px*uz-pz*ux)/det,u=(px*dz-pz*dx)/det;
   if(t<0||t>1||u<0||u>1||Math.abs(THREE.MathUtils.lerp(a.y,b.y,t)-THREE.MathUtils.lerp(q.a.y,q.b.y,u))>.18)continue;
   crossings.push({x:a.x+dx*t,z:a.z+dz*t});
  }index.add(item);
 }return crossings;
}
function junctionLayout(roads,supplied){
 const candidates=[...supplied.map(p=>({x:p.x,z:p.z})),...crossingCandidates(roads)];
 for(const road of roads)for(const s of [road.samples[0],road.samples.at(-1)]){
  if(roads.some(other=>other!==road&&(()=>{const n=nearest(other,s.pos);return n.distance<Math.max(s.width,other.width)*.60&&Math.abs(n.pos.y-s.pos.y)<.18;})()))candidates.push({x:s.pos.x,z:s.pos.z});
 }
 const junctions=[];
 for(const p of candidates){
  if(junctions.some(j=>Math.hypot(j.x-p.x,j.z-p.z)<3))continue;
  const nearby=roads.map(r=>({road:r,...nearest(r,p)})).filter(n=>n.distance<n.width*.72);
  if(nearby.length<2)continue;
  const y=nearby[0].pos.y,arms=[];
  for(const n of nearby.filter(n=>Math.abs(n.pos.y-y)<.22))for(const sign of [1,-1]){
   if(sign===1&&n.along>n.road.length-2||sign===-1&&n.along<2)continue;
   const direction=n.direction.clone().multiplyScalar(sign);
   if(arms.some(a=>a.direction.dot(direction)>.992))continue;
   arms.push({direction,width:n.width,angle:Math.atan2(direction.z,direction.x)});
  }
  const tangentBranch=nearby.some(n=>n.along>2&&n.along<n.road.length-2)&&nearby.some(n=>n.along<=2||n.along>=n.road.length-2);
  if(arms.length<2||arms.length===2&&arms[0].direction.dot(arms[1].direction)<-.985&&!tangentBranch)continue;
  arms.sort((a,b)=>a.angle-b.angle);
  junctions.push({...p,y,arms,radius:Math.max(...arms.map(a=>a.width))*1.45,roadIds:nearby.map(n=>n.road.id)});
 }
 return junctions;
}
function junctionFillets(junction){
 const patches=[];
 for(let i=0;i<junction.arms.length;i++){
  const a=junction.arms[i],b=junction.arms[(i+1)%junction.arms.length];let angle=b.angle-a.angle;if(angle<=0)angle+=Math.PI*2;
  if(angle<.38||angle>Math.PI-.07)continue;
  const u=a.direction,v=b.direction,ap={x:junction.x-u.z*a.width/2,z:junction.z+u.x*a.width/2},bp={x:junction.x+v.z*b.width/2,z:junction.z-v.x*b.width/2};
  const det=u.x*v.z-u.z*v.x;if(Math.abs(det)<.001)continue;
  const t=((bp.x-ap.x)*v.z-(bp.z-ap.z)*v.x)/det;
  const corner={x:ap.x+u.x*t,y:junction.y,z:ap.z+u.z*t},radius=Math.min(4.2,Math.min(a.width,b.width)*.72),start={x:corner.x+u.x*radius,y:junction.y,z:corner.z+u.z*radius},end={x:corner.x+v.x*radius,y:junction.y,z:corner.z+v.z*radius};
  const poly=[corner,start];for(let j=1;j<=12;j++){const k=j/12,l=1-k;poly.push({x:l*l*start.x+2*l*k*corner.x+k*k*end.x,y:junction.y,z:l*l*start.z+2*l*k*corner.z+k*k*end.z});}
  // The curved return is concave as a whole. Partition it into convex fan
  // wedges before using it as a clipping boundary.
  for(let j=1;j<poly.length-1;j++){const r=record([corner,poly[j],poly[j+1]],'junction');if(r){r.filletKey=junction.x+':'+junction.z+':'+i;patches.push(r);}}
 }
 return patches;
}
function paintMaterial(){
 const mat=new THREE.MeshBasicMaterial({color:0xd5d1c2,transparent:true,opacity:.88,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,side:THREE.DoubleSide});
 mat.extensions={derivatives:true};
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='varying float vRoadSide;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvRoadSide = uv.x;');
  // Integrate the actual painted interval [0,1] over a pixel footprint.
  // Subpixel paint keeps proportional coverage instead of fading to zero
  // once fwidth exceeds 1.8 (which hid every dash in the bridge close-up).
  shader.fragmentShader='varying float vRoadSide;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>','#include <alphamap_fragment>\nfloat roadPixel = max(fwidth(vRoadSide), 0.0001);\nfloat roadPixelLo = vRoadSide - 0.5 * roadPixel;\nfloat roadPixelHi = vRoadSide + 0.5 * roadPixel;\nfloat roadCoverage = clamp((min(roadPixelHi, 1.0) - max(roadPixelLo, 0.0)) / roadPixel, 0.0, 1.0);\ndiffuseColor.a *= roadCoverage;');
 };mat.customProgramCacheKey=()=>ROAD_SURFACE_VERSION+'-paint-coverage-v2';mat.userData.roadPaint=true;return mat;
}
function paintGeometry(sections){
 // Transparent padding gives the pixel filter fragments on both sides of a
 // thin stripe. UV 0..1 still spans exactly paintWidth; it does not widen the
 // physical paint or introduce a minimum-width bright line in distant views.
 const padding=2,xyz=[],uv=[],indices=[];for(const section of sections){const start=xyz.length/3;section.forEach((s,i)=>{for(const side of [-1,1]){xyz.push(s.pos.x+s.nx*side*s.paintWidth*(1+2*padding)/2,s.pos.y+ROAD_PROFILE.paintLift,s.pos.z+s.nz*side*s.paintWidth*(1+2*padding)/2);uv.push(side<0?-padding:1+padding,i);}if(i<section.length-1){const k=start+i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}});}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function sampleAt(road,distance,offset=0,paintWidth=ROAD_PROFILE.paintWidth){
 const samples=road.samples,s=THREE.MathUtils.clamp(distance,0,road.length);let lo=0,hi=samples.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m].distance>s)hi=m;else lo=m;}
 const a=samples[lo],b=samples[hi],t=(s-a.distance)/(b.distance-a.distance||1),pos=a.pos.clone().lerp(b.pos,t),nx=THREE.MathUtils.lerp(a.nx,b.nx,t),nz=THREE.MathUtils.lerp(a.nz,b.nz,t),l=Math.hypot(nx,nz)||1;
 pos.x+=nx/l*offset;pos.z+=nz/l*offset;return {pos,nx:nx/l,nz:nz/l,paintWidth};
}

export function buildRoadSurfaces({roads,parent,junctions:supplied=[]}){
 const normalized=roads.map(normalizeRoad),junctions=junctionLayout(normalized,supplied),pavements=[],shoulders=[];
 for(const road of normalized)for(let i=1;i<road.samples.length;i++){
  const a=road.samples[i-1],b=road.samples[i],pair=[a,b];
  const vertex=(s,offset,drop=0)=>({x:s.pos.x+s.nx*offset,y:s.pos.y-drop,z:s.pos.z+s.nz*offset});
  const pavement=record([vertex(a,-a.width/2),vertex(a,a.width/2),vertex(b,b.width/2),vertex(b,-b.width/2)],road.id,pair);if(pavement)pavements.push(pavement);
  for(const side of [-1,1]){const poly=[vertex(a,side*a.width/2,ROAD_PROFILE.shoulderDrop),vertex(a,side*a.shoulderWidth/2,ROAD_PROFILE.shoulderDrop),vertex(b,side*b.shoulderWidth/2,ROAD_PROFILE.shoulderDrop),vertex(b,side*b.width/2,ROAD_PROFILE.shoulderDrop)];const shoulder=record(poly,road.id,pair);if(shoulder)shoulders.push(shoulder);}
 }
 const fillets=junctions.flatMap(junctionFillets);pavements.push(...fillets);
 const pavement=unionRecords(pavements),shoulder=unionRecords(shoulders,pavements);
 const asphaltMat=new THREE.MeshStandardMaterial({color:0x555550,roughness:.98}),shoulderMat=new THREE.MeshStandardMaterial({color:0xa69b84,roughness:1});
 for(const [name,result,material]of [['road-pavement-union',pavement,asphaltMat],['road-shoulder-union',shoulder,shoulderMat]]){const mesh=new THREE.Mesh(triangulate(result.polygons),material);mesh.name=name;mesh.receiveShadow=true;mesh.userData.groundSurface=true;mesh.userData.roadSurfaceVersion=ROAD_SURFACE_VERSION;parent.add(mesh);}
 const dashes=[],edgeLines=[];
 const inJunction=p=>junctions.some(j=>Math.abs(p.y-j.y)<.3&&Math.hypot(p.x-j.x,p.z-j.z)<j.radius);
 for(const road of normalized){
  if(road.marked){
   for(let distance=3;distance+ROAD_PROFILE.dashLength<road.length-2;distance+=ROAD_PROFILE.dashLength+ROAD_PROFILE.dashGap){
    const section=Array.from({length:6},(_,i)=>sampleAt(road,distance+i*ROAD_PROFILE.dashLength/5));if(!section.some(s=>inJunction(s.pos)))dashes.push(section);
   }
  }
  if(road.marked||road.edgePaint)for(const side of [-1,1]){
   let run=[];
   for(let d=1;d<road.length;d+=2){const s=sampleAt(road,d,side*(road.width/2-.22),.12);if(inJunction(s.pos)){if(run.length>1)edgeLines.push(run);run=[];}else run.push(s);}
   if(run.length>1)edgeLines.push(run);
  }
 }
 const paint=paintMaterial();
 for(const [name,sections]of [['road-center-dashes',dashes],['road-edge-lines',edgeLines]]){const mesh=new THREE.Mesh(paintGeometry(sections),paint);mesh.name=name;mesh.renderOrder=5;mesh.userData.groundSurface=false;parent.add(mesh);}
 return {version:ROAD_SURFACE_VERSION,markingSegments:dashes.length,junctionCount:junctions.length,fillets:new Set(fillets.map(f=>f.filletKey)).size,clippedPavementSections:pavement.clipped,clippedShoulderSections:shoulder.clipped,
  pavementTriangles:pavement.polygons.reduce((n,p)=>n+p.length-2,0),shoulderTriangles:shoulder.polygons.reduce((n,p)=>n+p.length-2,0),paintLift:ROAD_PROFILE.paintLift,sampleStep:ROAD_PROFILE.sampleStep,
  junctions:junctions.map(({x,z,y,radius,roadIds})=>({x,z,y,radius,roadIds})),roads:normalized.length};
}
