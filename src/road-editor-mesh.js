import * as THREE from 'three';
import {createRoadGroundContact} from './road-ground-contact.js?v=20261114-ground-contact-v1';
import {ROAD_SURFACE_CLEARANCE} from './transport-ground-profile.js?v=20261114-ground-contact-v1';
import {createTransportGroundSupportSampler} from './transport-ground-support.js?v=20261114-ground-contact-v1';
import {subtractRoadPolygon} from './road-surface.js?v=20261103-road-mesh-v2';
import {repairRoadTriangleMesh,ROAD_JUNCTION_REPAIR_VERSION} from './road-junction-repair.js?v=20261103-road-seam-v1';
import {applyEditedRoadEndpointGrades,widthAtEditedRoad,ROAD_EDIT_SHOULDER_EXTRA,ROAD_EDIT_SHOULDER_LIFT,
 ROAD_EDIT_SURFACE_LIFT,ROAD_EDIT_HIGHWAY_LIFT,ROAD_EDIT_PAINT_LIFT,ROAD_EDIT_WHITE_EDGE_WIDTH,
 ROAD_EDIT_WHITE_EDGE_INSET,ROAD_EDIT_CENTER_LINE_WIDTH,ROAD_EDIT_YELLOW_WIDTH,ROAD_EDIT_YELLOW_OFFSET}
 from './road-editor-style.js?v=20261114-ground-contact-v1';

export const ROAD_EDIT_MESH_VERSION='stitched-road-union-welded-v6-terrain-clearance';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const planar=(a,b)=>Math.hypot(b[0]-a[0],b[2]-a[2]);
const lerp=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const signArea=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);

function segmentsLength(points){let n=0;for(let i=1;i<points.length;i++)n+=planar(points[i-1],points[i]);return n;}
function closest(points,p){
 let best={distance:Infinity};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[2]-a[2],den=dx*dx+dz*dz;
  if(den<1e-12)continue;
  const t=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/den,0,1),q=lerp(a,b,t),d=planar(p,q);
  if(d<best.distance)best={distance:d,point:q,segment:i,interior:t>1e-3&&t<1-1e-3};
 }
 return best;
}

// Only join genuinely coincident proposed roads. Never bridge an arbitrary
// gap across a rail line, building or a deliberately separate compound.
export function stitchEditedRoads(input,{tolerance=5.5,existingRoads=[]}={}){
 const roads=input.map(r=>({...r,points:r.points.map(p=>[...p])})),adjustments=[];
 const lengths=roads.map(r=>segmentsLength(r.points));
 for(let i=0;i<roads.length;i++)for(const end of [0,roads[i].points.length-1]){
  const p=roads[i].points[end];let chosen=null;
  // Owner-selected endpoints anchored to an OSM carriageway must never be
  // pulled off that surveyed route merely to align two adjacent overlays.
  let anchored=false;
  for(const source of existingRoads){
   const q=closest(source.points,p);
   if(q.distance<=1.05&&Math.abs(q.point[1]-p[1])<1.2){anchored=true;break;}
  }
  if(anchored)continue;
  for(let j=0;j<roads.length;j++){
   if(i===j||lengths[j]<=lengths[i]+4)continue;
   const q=closest(roads[j].points,p);
   if(q.distance>Math.min(tolerance,(roads[i].width+roads[j].width)*.75)||Math.abs(q.point[1]-p[1])>.8)continue;
   if(!chosen||q.distance<chosen.distance)chosen={...q,id:roads[j].id};
  }
  if(chosen&&chosen.distance>.001){
   const before=[...p];roads[i].points[end]=[...chosen.point];
   adjustments.push({roadId:roads[i].id,endpoint:end===0?'start':'end',targetId:chosen.id,
    distance:chosen.distance,before,after:[...chosen.point]});
  }
 }
 return {roads,adjustments};
}

// Rounded 3D alignment without rounding away real corners or changing the
// surveyed/owner-authored endpoints. Every ribbon shares the SAME samples.
export function sampleEditedRoad(road,{step=1.35,terrainHeightAt=null,groundContact=null}={}){
 const control=road.points.map(p=>[...p]),width=road.width;
 const out=[control[0]];
 const push=p=>{if(planar(out.at(-1),p)>1e-6)out.push(p);else out[out.length-1]=p;};
 const line=(a,b)=>{const n=Math.max(1,Math.ceil(planar(a,b)/step));for(let j=1;j<=n;j++)push(lerp(a,b,j/n));};
 let cursor=control[0];
 for(let i=1;i<control.length-1;i++){
  const a=control[i-1],b=control[i],c=control[i+1],la=planar(a,b),lb=planar(b,c);
  if(la<1e-6||lb<1e-6)continue;
  const da=[(b[0]-a[0])/la,(b[2]-a[2])/la],db=[(c[0]-b[0])/lb,(c[2]-b[2])/lb];
  const angle=Math.acos(clamp(da[0]*db[0]+da[1]*db[1],-1,1));
  if(angle<.16){line(cursor,b);cursor=b;continue;}
  const reach=Math.min(width*1.45,la*.32,lb*.32,7);
  if(reach<.18){line(cursor,b);cursor=b;continue;}
  const entry=[b[0]-da[0]*reach,b[1]-(b[1]-a[1])*reach/la,b[2]-da[1]*reach];
  const exit=[b[0]+db[0]*reach,b[1]+(c[1]-b[1])*reach/lb,b[2]+db[1]*reach];
  line(cursor,entry);
  const arc=Math.max(3,Math.ceil((2*reach)/step));
  for(let k=1;k<=arc;k++){
   const t=k/arc,u=1-t;
   push([u*u*entry[0]+2*u*t*b[0]+t*t*exit[0],
    u*u*entry[1]+2*u*t*b[1]+t*t*exit[1],
    u*u*entry[2]+2*u*t*b[2]+t*t*exit[2]]);
  }
  cursor=exit;
 }
 line(cursor,control.at(-1));
 // Endpoint-grade matching can pull the newly sampled centreline down again.
 // Apply the ground clearance AFTER it so a steep edited approach (road-31
 // to Saturn) cannot sink into the curved hill between saved anchor points.
 const graded=road.profile?applyEditedRoadEndpointGrades(out,road.profile):out;
 if(groundContact)return groundContact.conform(graded);
 if(terrainHeightAt)for(const p of graded){
  const terrain=terrainHeightAt(p[0],p[2]);
  if(Number.isFinite(terrain))p[1]=Math.max(p[1],terrain+.035);
 }
 return graded;
}

function ribbonQuads(points,width,lift=0,terrainHeightAt=null,groundContact=null){
 const rim=[];
 for(let i=0;i<points.length;i++){
  const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
  const dx=next[0]-prev[0],dz=next[2]-prev[2],len=Math.hypot(dx,dz)||1;
  const actualWidth=typeof width==='function'?width(i):width;
  const nx=-dz/len*actualWidth/2,nz=dx/len*actualWidth/2;
  const left={x:points[i][0]-nx,y:points[i][1]+lift,z:points[i][2]-nz};
  const right={x:points[i][0]+nx,y:points[i][1]+lift,z:points[i][2]+nz};
  // Sample terrain under the two actual edges, not just under the centerline.
  // The road can now cross natural side slopes without burying one shoulder.
  if(groundContact)for(const edge of [left,right])edge.y=groundContact.edgeHeight(edge.x,edge.z,points[i],lift);
  else if(terrainHeightAt)for(const edge of [left,right]){
   const ground=terrainHeightAt(edge.x,edge.z);
   if(Number.isFinite(ground))edge.y=Math.max(edge.y,ground+(lift<0?.008:.013));
  }
  rim.push([left,right]);
 }
 const result=[];
 for(let i=1;i<rim.length;i++){
  const [a,b]=rim[i-1],[c,d]=rim[i];
  // Clipper expects CCW projected X/Z. Geo positions keep the 3D slope.
  const polygon=[a,b,d,c];
  if(signArea(a,b,d)<0)polygon.reverse();
  result.push(polygon);
 }
 return result;
}

// Sample station-aware painted stripes on the exact same road alignment as
// the asphalt. Dash policy/widths match the OSM road-marking implementation;
// the first/last few metres stay unpainted at legacy road junction mouths.
function emitEditedRoadPaint(buckets,road,points,terrainHeightAt,groundContact){
 const profile=road.profile;
 if(!profile?.marked||profile.classId==='ground'||points.length<2)return;
 let length=0;
 const stations=[0];
 for(let i=1;i<points.length;i++){length+=planar(points[i-1],points[i]);stations.push(length);}
 if(length<4)return;
 const widthAt=d=>widthAtEditedRoad(profile,profile.length?(d/length)*profile.length:d);
 function at(d){
  let j=1;
  while(j<stations.length-1&&stations[j]<d)j++;
  const delta=stations[j]-stations[j-1]||1,t=clamp((d-stations[j-1])/delta,0,1);
  const p=lerp(points[j-1],points[j],t),a=points[Math.max(0,j-2)],b=points[Math.min(points.length-1,j+1)];
  const dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1;
  return {p,n:[-dz/l,dx/l],width:widthAt(d)};
 }
 function stripe(start,end,offset,lineWidth,color){
  if(end-start<.18)return;
  const stops=[start];
  for(let i=1;i<stations.length-1;i++)if(stations[i]>start+1e-4&&stations[i]<end-1e-4)stops.push(stations[i]);
  stops.push(end);
  const line=stops.map(d=>{
   const {p,n,width}=at(d),displacement=offset(width);
   const x=p[0]+n[0]*displacement,z=p[2]+n[1]*displacement;
   return [x,groundContact?groundContact.edgeHeight(x,z,p):p[1],z];
  });
  buckets[color].push(...ribbonQuads(line,lineWidth,ROAD_EDIT_PAINT_LIFT,terrainHeightAt,groundContact));
 }
 const entrance=Math.min(2.5,length*.16),exit=length-entrance;
 // White roadside paint on 2+ lane asphalt follows the original OSM inset.
 for(const side of [-1,1])stripe(entrance,exit,w=>side*Math.max(.1,w/2-ROAD_EDIT_WHITE_EDGE_INSET),ROAD_EDIT_WHITE_EDGE_WIDTH,'paintWhite');
 if(profile.marking==='double-yellow'){
  for(const side of [-1,1])stripe(entrance,exit,()=>side*ROAD_EDIT_YELLOW_OFFSET,ROAD_EDIT_YELLOW_WIDTH,'paintYellow');
 }else if(profile.marking==='dashed-white'){
  const period=13,dash=4.7;
  for(let from=2;from<exit-.2;from+=period)stripe(Math.max(entrance,from),Math.min(exit,from+dash),()=>0,ROAD_EDIT_CENTER_LINE_WIDTH,'paintWhite');
 }
}
function polygonGeometry(polygons){
 const positions=[];
 for(const polygon of polygons)for(let i=1;i<polygon.length-1;i++){
  const tri=[polygon[0],polygon[i],polygon[i+1]];
  if(Math.abs(signArea(...tri))<1e-7)continue;
  if(signArea(...tri)>0)tri.reverse();
  // X/Z clockwise gives +Y normals in Three's right-handed X/Y/Z frame.
  for(const v of tri)positions.push(v.x,v.y,v.z);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();
 return geometry;
}
function unionQuads(quads){
 const result=[],cells=new Map(),size=8;
 const keys=p=>{const minX=Math.min(...p.map(v=>v.x)),maxX=Math.max(...p.map(v=>v.x)),
  minZ=Math.min(...p.map(v=>v.z)),maxZ=Math.max(...p.map(v=>v.z)),rows=[];
  for(let x=Math.floor(minX/size);x<=Math.floor(maxX/size);x++)for(let z=Math.floor(minZ/size);z<=Math.floor(maxZ/size);z++)rows.push(x+':'+z);
  return rows;
 };
 let overlaps=0;
 for(const polygon of quads){
  const cellKeys=keys(polygon),previous=[...new Set(cellKeys.flatMap(k=>cells.get(k)||[]))];
  let pieces=[polygon];
  for(const p of previous){
   if(pieces.length===0)break;
   const a=p.reduce((sum,v)=>sum+v.y,0)/p.length,b=polygon.reduce((sum,v)=>sum+v.y,0)/polygon.length;
   if(Math.abs(a-b)>.7)continue; // bridge crossing, not a junction
   const next=pieces.flatMap(q=>subtractRoadPolygon(q,p));
   if(next.length!==pieces.length||next.some((q,i)=>q.length!==(pieces[i]?.length||0)))overlaps++;
   pieces=next;
  }
  for(const p of pieces){
   result.push(p);
  }
  // Subtract each original ribbon once. Re-indexing clipped fragments makes
  // nearly coincident strip edges multiply tolerance slivers exponentially.
  // Their union is still exactly the union of the original accepted ribbons.
  for(const key of cellKeys){let group=cells.get(key);if(!group){group=[];cells.set(key,group);}group.push(polygon);}
 }
 return {polygons:result,overlaps};
}
function terminusConnected(road,point,roads){
 for(const other of roads){
  if(other.id===road.id)continue;
  for(let i=1;i<other.points.length;i++){
   const a=other.points[i-1],b=other.points[i],dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz;
   if(d<1e-8)continue;
   const t=clamp(((point[0]-a[0])*dx+(point[2]-a[2])*dz)/d,0,1);
   if(Math.hypot(point[0]-a[0]-dx*t,point[2]-a[2]-dz*t)<Math.max(1.5,other.width*.5)
      &&Math.abs(point[1]-(a[1]+(b[1]-a[1])*t))<1.1)return true;
  }
 }
 return false;
}
function terminusCap(point,width,lift,terrainHeightAt,groundContact){
 const p=Array.from({length:14},(_,i)=>{
  const rad=i*Math.PI*2/14,x=point[0]+Math.cos(rad)*width*.5,z=point[2]+Math.sin(rad)*width*.5;
  const minY=terrainHeightAt?.(x,z);
   const y=groundContact?groundContact.edgeHeight(x,z,point,lift):Number.isFinite(minY)?Math.max(point[1]+lift,minY+(lift<0?.008:.013)):point[1]+lift;
   return {x,y,z};
 });
 return signArea(p[0],p[1],p[2])>0?p:p.reverse();
}
function appendJunctionAprons(roads,paths,buckets,terrainHeightAt,groundContact){
 let joined=0;
 // Only actual close contacts are filled. Roads at different heights remain
 // independent and keep proper clearance at flyovers / rail bridges.
 const contacts=new Set();
 for(const path of paths){
  const owner=roads.find(r=>r.id===path.id),profile=owner?.profile||{};
  if(!owner)continue;
  if(['road-3','road-4','road-8'].includes(owner.id))continue; // Shared-axis butt joins, no protruding discs.
  for(const [index,ordinal]of [[0,0],[path.points.length-1,1]]){
   const p=path.points[index],width=path.widths?.[index]??path.width;
   let best=null;
   for(const host of paths){
    if(host.id===path.id)continue;
    const q=closest(host.points,p);
    const hostWidth=host.widths?.[q.segment]??host.width;
    if(q.distance>Math.max(.85,(width+hostWidth)*.43)||Math.abs(q.point[1]-p[1])>.60)continue;
    if(!best||q.distance<best.distance)best={...q,width:hostWidth,kind:host.style,source:host.id};
   }
   // Also preserve T-junctions where a new road ends on the original OSM
   // road, which is cut by the source layer rather than in these buckets.
   const oldMatch=ordinal?profile.matching?.end:profile.matching?.start;
   if(!best&&oldMatch&&oldMatch.distance<=Math.max(.85,(width+oldMatch.width)*.42)){
    best={point:p,distance:oldMatch.distance,width:oldMatch.width,kind:profile.classId,source:oldMatch.id};
   }
   if(!best)continue;
   const classId=profile.classId==='highway'?'highway':profile.classId==='ground'?'ground':'asphalt';
   if(best.kind&&best.kind!==classId&&best.source?.startsWith('road-'))continue;
   const x=(p[0]+best.point[0])*.5,z=(p[2]+best.point[2])*.5,y=(p[1]+best.point[1])*.5;
   const radius=Math.max(width,best.width)*.5+Math.min(.55,best.distance*.47)+.13;
   const key=classId+':'+Math.round(x/.6)+':'+Math.round(z/.6);
   if(contacts.has(key))continue;contacts.add(key);
   const point=[x,y,z],lift=classId==='highway'?ROAD_EDIT_HIGHWAY_LIFT:ROAD_EDIT_SURFACE_LIFT;
    buckets[classId].push(terminusCap(point,radius*2,lift,terrainHeightAt,groundContact));
    buckets.shoulder.push(terminusCap(point,radius*2+ROAD_EDIT_SHOULDER_EXTRA,ROAD_EDIT_SHOULDER_LIFT,terrainHeightAt,groundContact));
   joined++;
  }
 }
 return joined;
}
// Raised model joins need earth under the final unioned shoulder, including
// rounded ends and junction aprons. A body inferred from centreline samples
// alone misses those pieces and leaves their asphalt suspended over a slope.
function groundSupportGeometry(shoulder,contact){
 const p=shoulder.attributes.position,index=shoulder.index,positions=[],edges=new Map();
 const emit=(a,b,c)=>positions.push(...a,...b,...c);
 const key=p=>p.join(':');
 for(let i=0;i<(index?.count??p.count);i+=3){
  const tri=[0,1,2].map(k=>{const n=index?index.getX(i+k):i+k;return [p.getX(n),p.getY(n),p.getZ(n)];});
  if(tri.some(v=>contact.elevatedY(v)!==null))continue;
  const ground=tri.map(v=>contact.ground(v));
  if(!tri.some((v,j)=>v[1]-ground[j]>ROAD_SURFACE_CLEARANCE+ROAD_EDIT_SHOULDER_LIFT+.002))continue;
  const top=tri.map(v=>[v[0],v[1]-.001,v[2]]),bottom=tri.map((v,j)=>[v[0],Math.min(ground[j],top[j][1])-.001,v[2]]);
  emit(...top);emit(bottom[2],bottom[1],bottom[0]);
  for(let j=0;j<3;j++){
   const k=(j+1)%3,a=key(top[j]),b=key(top[k]),id=a<b?a+'|'+b:b+'|'+a,existing=edges.get(id);
   if(existing)existing.count++;else edges.set(id,{a:top[j],b:top[k],lowA:bottom[j],lowB:bottom[k],count:1});
  }
 }
 for(const {a,b,lowA,lowB,count}of edges.values())if(count===1){emit(a,lowA,b);emit(b,lowA,lowB);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

// Surface triangles can cross a visible terrain facet even when all of their
// original vertices touch it. Subdivide only those triangles; X/Z boundaries
// and the approved road silhouette stay fixed.
function refineGroundTriangles(geometry,contact,minimumClearance){
 const p=geometry.attributes.position,index=geometry.index,out=[],heightCache=new Map();let splits=0;
 const earth=(x,z)=>{const key=x+':'+z;if(!heightCache.has(key))heightCache.set(key,contact.ground([x,0,z]));return heightCache.get(key);};
 const vertex=(x,y,z)=>{const ground=earth(x,z);return {x,y:Math.max(y,ground+minimumClearance),z,ground};};
 const middle=(a,b)=>{const x=Math.fround((a.x+b.x)/2),z=Math.fround((a.z+b.z)/2),ground=earth(x,z);return {x,y:ground+((a.y-a.ground)+(b.y-b.ground))/2,z,ground};};
 const emit=(a,b,c,depth=0)=>{
  const vertices=[a,b,c],mid=vertices.map((v,i)=>middle(v,vertices[(i+1)%3]));
  const errors=mid.map((v,i)=>Math.abs(v.ground-(vertices[i].ground+vertices[(i+1)%3].ground)/2));
  const x=Math.fround((a.x+b.x+c.x)/3),z=Math.fround((a.z+b.z+c.z)/3),ground=earth(x,z),centerError=Math.abs(ground-(a.ground+b.ground+c.ground)/3);
  if(depth<10&&Math.max(...errors,centerError)>.004){
   splits++;
   emit(a,mid[0],mid[2],depth+1);emit(mid[0],b,mid[1],depth+1);
   emit(mid[2],mid[1],c,depth+1);emit(mid[0],mid[1],mid[2],depth+1);
   return;
  }
  for(const v of vertices)out.push(v.x,v.y,v.z);
 };
 for(let i=0;i<(index?.count??p.count);i+=3){
  const tri=[0,1,2].map(k=>{const n=index?index.getX(i+k):i+k;return [p.getX(n),p.getY(n),p.getZ(n)];});
  if(tri.some(v=>contact.elevatedY(v)!==null)){for(const v of tri)out.push(...v);continue;}
  emit(...tri.map(v=>vertex(...v)));
 }
 const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(out,3));result.computeVertexNormals();result.computeBoundingSphere();
 geometry.dispose();return {geometry:result,splits};
}
// A low railway bed can meet an owner road, but a tall model approach is a
// separate level. Follow the exact low roof inside its footprint and make a
// short transition outside its real edge. The final shoulder supplies the
// physical earth under that transition; the railway footprint is unchanged.
function roadFoundationHeight(sampler,terrainHeightAt){
 const reach=ROAD_EDIT_SHOULDER_EXTRA/2,eligible=new Map();
 const compatible=row=>{
  if(!eligible.has(row))eligible.set(row,[row.a,row.b,row.c].every(p=>p[1]-terrainHeightAt(p[0],p[2])<=.12));
  return eligible.get(row);
 };
 return (x,z)=>{
  const earth=terrainHeightAt(x,z);let exact=null,transition=earth;
  for(const row of sampler.trianglesInBounds({minX:x-reach,maxX:x+reach,minZ:z-reach,maxZ:z+reach})){
   if(!compatible(row))continue;
   const {a,b,c,den}=row,u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,
    v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
   if(Math.min(u,v,w)>=-1e-7){const y=u*a[1]+v*b[1]+w*c[1];exact=exact===null?y:Math.max(exact,y);continue;}
   let nearest=null;
   for(const [p,q]of [[a,b],[b,c],[c,a]]){
    const dx=q[0]-p[0],dz=q[2]-p[2],length=dx*dx+dz*dz;
    const t=length?clamp(((x-p[0])*dx+(z-p[2])*dz)/length,0,1):0;
    const xx=p[0]+dx*t,zz=p[2]+dz*t,distance=Math.hypot(x-xx,z-zz);
    if(distance<=reach&&(!nearest||distance<nearest.distance))nearest={x:xx,z:zz,y:p[1]+(q[1]-p[1])*t,distance};
   }
   if(nearest){const t=nearest.distance/reach,weight=1-t*t*(3-2*t),rise=nearest.y-terrainHeightAt(nearest.x,nearest.z);
    transition=Math.max(transition,earth+rise*weight);
   }
  }
  return exact===null?transition:Math.max(earth,exact);
 };
}
// A high retained railway bed can touch only the edge of a nearby road.
// Remove precisely the pavement hidden inside that actual solid footprint;
// never lift the road onto the railway or enlarge the cut with a radius.
function trimHighFoundationOverlaps(geometry,sampler){
 const p=geometry.attributes.position,index=geometry.index,polygons=[];let changed=0,removedArea=0;
 const area=poly=>Math.abs(poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a.x*b.z-a.z*b.x;},0))/2;
 for(let i=0;i<(index?.count??p.count);i+=3){
  const tri=[0,1,2].map(k=>{const n=index?index.getX(i+k):i+k;return{x:p.getX(n),y:p.getY(n),z:p.getZ(n)};});
  const originalArea=area(tri),minY=Math.min(...tri.map(v=>v.y));let pieces=[tri];
  const bounds={minX:Math.min(...tri.map(v=>v.x)),maxX:Math.max(...tri.map(v=>v.x)),minZ:Math.min(...tri.map(v=>v.z)),maxZ:Math.max(...tri.map(v=>v.z))};
  for(const roof of sampler.trianglesInBounds(bounds)){
   if(Math.max(roof.a[1],roof.b[1],roof.c[1])-minY<=.12)continue;
   const {a,b,c,den}=roof,clip=[a,b,c].map(v=>({x:v[0],y:v[1],z:v[2]}));
   pieces=pieces.flatMap(piece=>subtractRoadPolygon(piece,clip,overlap=>overlap.every(v=>{
    const u=((b[2]-c[2])*(v.x-c[0])+(c[0]-b[0])*(v.z-c[2]))/den,
     t=((c[2]-a[2])*(v.x-c[0])+(a[0]-c[0])*(v.z-c[2]))/den;
    return u*a[1]+t*b[1]+(1-u-t)*c[1]-v.y>.12;
   })));
   if(!pieces.length)break;
  }
  const removed=originalArea-pieces.reduce((sum,poly)=>sum+area(poly),0);
  if(removed>1e-8){changed++;removedArea+=removed;}
  polygons.push(...pieces);
 }
 if(!changed)return {geometry,triangles:0,area:0};
 const result=polygonGeometry(polygons);geometry.dispose();return {geometry:result,triangles:changed,area:removedArea};
}
export function buildEditedRoadMeshes(roads,{terrainHeightAt=null,existingRoads=[],groundSupports=[],followTerrain=false}={}){
 const supportSampler=followTerrain&&terrainHeightAt&&groundSupports.length?createTransportGroundSupportSampler({profiles:groundSupports,heightAt:terrainHeightAt}):null;
 const roadTerrain=supportSampler?roadFoundationHeight(supportSampler,terrainHeightAt):terrainHeightAt;
 const groundContact=followTerrain&&terrainHeightAt?createRoadGroundContact(existingRoads,roadTerrain):null;
 const supportContact=supportSampler?{...groundContact,ground:p=>Math.max(terrainHeightAt(p[0],p[2]),supportSampler.heightAt(p[0],p[2])??-Infinity)}:groundContact;
 const buckets={asphalt:[],highway:[],ground:[],shoulder:[],paintWhite:[],paintYellow:[]},paths=[];
 const stats={segments:0,joins:0,overlaps:0,endCaps:0,markedRoads:0,
  junctionRepairVersion:ROAD_JUNCTION_REPAIR_VERSION,seamWelds:0,gradeAligned:0,smallHolesSealed:0,
  sourceClasses:{asphalt:0,highway:0,ground:0}};let sourceQuads=0;
 for(const r of roads){
   const points=sampleEditedRoad(r,{terrainHeightAt,groundContact}),profile=r.profile||{classId:r.surface==='ground'?'ground':'asphalt'};
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+planar(points[i-1],points[i]));
  const widthAt=i=>r.profile?widthAtEditedRoad(profile,lengths[i]):r.width;
  const classId=profile.classId==='highway'?'highway':profile.classId==='ground'?'ground':'asphalt';
  const width=r.profile?profile.widthStart:r.width;
  const widths=points.map((_,i)=>widthAt(i));
  paths.push({id:r.id,width,widths,points,style:classId});
   const shoulder=ribbonQuads(points,i=>widthAt(i)+ROAD_EDIT_SHOULDER_EXTRA,ROAD_EDIT_SHOULDER_LIFT,terrainHeightAt,groundContact);
   const surface=ribbonQuads(points,widthAt,classId==='highway'?ROAD_EDIT_HIGHWAY_LIFT:ROAD_EDIT_SURFACE_LIFT,terrainHeightAt,groundContact);
   buckets.shoulder.push(...shoulder);buckets[classId].push(...surface);
  // Square-ended strips leave arrow-like spikes after tiny clipped triangles
  // at isolated termini. Only truly unconnected ends receive rounded caps;
  // surveyed and owner-to-owner junctions keep their exact original shape.
  for(const [end,ordinal] of [[points[0],0],[points.at(-1),1]]){
   const matched=ordinal?profile.matching?.end:profile.matching?.start;
   if(matched||terminusConnected(r,end,roads))continue;
   const actualWidth=ordinal?widths.at(-1):widths[0];
    buckets.shoulder.push(terminusCap(end,actualWidth+ROAD_EDIT_SHOULDER_EXTRA,ROAD_EDIT_SHOULDER_LIFT,terrainHeightAt,groundContact));
    buckets[classId].push(terminusCap(end,actualWidth,classId==='highway'?ROAD_EDIT_HIGHWAY_LIFT:ROAD_EDIT_SURFACE_LIFT,terrainHeightAt,groundContact));
   stats.endCaps++;
  }
  stats.sourceClasses[classId]++;sourceQuads+=surface.length;stats.segments+=points.length-1;
  if(profile.marked&&classId!=='ground'){
    emitEditedRoadPaint(buckets,r,points,terrainHeightAt,groundContact);stats.markedRoads++;
  }
 }
  stats.joins=appendJunctionAprons(roads,paths,buckets,terrainHeightAt,groundContact);
 const geometries={};
 for(const [kind,quads]of Object.entries(buckets)){
  const union=unionQuads(quads),raw=polygonGeometry(union.polygons);
  const finished=repairRoadTriangleMesh(raw);
  raw.dispose();
   if(groundContact){
    const lift=kind==='shoulder'?ROAD_EDIT_SHOULDER_LIFT:kind==='paintWhite'||kind==='paintYellow'?ROAD_EDIT_PAINT_LIFT:ROAD_EDIT_SURFACE_LIFT;
    // Keep legitimate low model thresholds too; the normal .025 datum is
    // already in the sampled geometry and must not become a global floor.
    const refined=refineGroundTriangles(finished.geometry,groundContact,Math.max(.008,.008+lift));
    geometries[kind]=refined.geometry;stats.terrainTriangleSplits=(stats.terrainTriangleSplits||0)+refined.splits;
   }else geometries[kind]=finished.geometry;
  if(supportSampler){const trimmed=trimHighFoundationOverlaps(geometries[kind],supportSampler);geometries[kind]=trimmed.geometry;
   if(trimmed.triangles)(stats.highFoundationTrim??={})[kind]={triangles:trimmed.triangles,area:trimmed.area};
  }
  stats.overlaps+=union.overlaps;
  stats.seamWelds+=finished.stats.welded;
  stats.gradeAligned+=finished.stats.gradeAligned;
  stats.smallHolesSealed+=finished.stats.holesSealed;
 }
 if(groundContact){geometries.support=groundSupportGeometry(geometries.shoulder,supportContact);stats.groundSupportTriangles=geometries.support.attributes.position.count/3;}
 return {geometries,paths,stats:{...stats,sourceRoads:roads.length,sourceQuads}};
}
