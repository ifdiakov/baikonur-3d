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
export function subtractRoadPolygon(subject,clip){
 let inner=cleanPolygon(subject),parts=[];const boundary=cleanPolygon(clip);
 if(!boundary.length)return inner.length?[inner]:[];
 for(let i=0;i<boundary.length&&inner.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],outer=halfPlane(inner,a,b,false);
  if(outer.length)parts.push(outer);inner=halfPlane(inner,a,b,true);
 }return parts;
}
function bounds(poly){return {minX:Math.min(...poly.map(v=>v.x)),maxX:Math.max(...poly.map(v=>v.x)),minZ:Math.min(...poly.map(v=>v.z)),maxZ:Math.max(...poly.map(v=>v.z))};}
function overlaps(a,b){return a.maxX>b.minX+EPS&&a.minX<b.maxX-EPS&&a.maxZ>b.minZ+EPS&&a.minZ<b.maxZ-EPS;}
class PolygonIndex{
 constructor(){this.cells=new Map();}
 keys(b){const keys=[];for(let x=Math.floor(b.minX/CELL);x<=Math.floor(b.maxX/CELL);x++)for(let z=Math.floor(b.minZ/CELL);z<=Math.floor(b.maxZ/CELL);z++)keys.push(x+':'+z);return keys;}
 add(record){for(const key of this.keys(record.bounds)){const cell=this.cells.get(key)||[];cell.push(record);this.cells.set(key,cell);}}
 near(b){const out=new Set();for(const key of this.keys(b))for(const r of this.cells.get(key)||[])if(overlaps(b,r.bounds))out.add(r);return [...out];}
}
function sameLevel(a,b){
 const x=(Math.max(a.bounds.minX,b.bounds.minX)+Math.min(a.bounds.maxX,b.bounds.maxX))/2,z=(Math.max(a.bounds.minZ,b.bounds.minZ)+Math.min(a.bounds.maxZ,b.bounds.maxZ))/2;
 const tolerance=a.gradeTolerance!=null&&b.gradeTolerance!=null&&a.priority===b.priority?Math.min(a.gradeTolerance,b.gradeTolerance):.22;
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
   if(!sameLevel(r,previous))continue;
   pieces=pieces.flatMap(p=>subtractRoadPolygon(p,previous.poly));if(!pieces.length)break;
  }
  if(pieces.length!==1||pieces[0]?.length!==r.poly.length)clipped++;
  out.push(...pieces);if(indexRecords)index.add(r);
 }
 return {polygons:out,clipped};
}

// Reuse the same X/Z clipping for already sampled highway ribbons. Each
// input triangle keeps its own grade plane, so a ramp cannot erase a lower
// underpass simply because their map projections overlap.
export function unionRoadSurfacePolygons(polygons){
 const records=polygons.map(poly=>{
  const r=record(poly,'highway');if(!r)return null;r.priority=poly.priority??0;r.gradeTolerance=.008;
  const [a,b,c]=r.poly,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
  r.height=(x,z)=>{const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;return u*a.y+v*b.y+(1-u-v)*c.y;};
  return r;
 }).filter(Boolean);
 const through=records.filter(r=>r.priority===0),ramps=records.filter(r=>r.priority!==0);
 const main=unionRecords(through),merge=unionRecords(ramps,through,false);
 return {polygons:[...main.polygons,...merge.polygons],clipped:main.clipped+merge.clipped};
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
