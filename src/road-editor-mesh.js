import * as THREE from 'three';
import {subtractRoadPolygon} from './road-surface.js?v=20261103-road-mesh-v2';
import {applyEditedRoadEndpointGrades,widthAtEditedRoad,ROAD_EDIT_SHOULDER_EXTRA,ROAD_EDIT_SHOULDER_LIFT,
 ROAD_EDIT_SURFACE_LIFT,ROAD_EDIT_HIGHWAY_LIFT,ROAD_EDIT_PAINT_LIFT,ROAD_EDIT_WHITE_EDGE_WIDTH,
 ROAD_EDIT_WHITE_EDGE_INSET,ROAD_EDIT_CENTER_LINE_WIDTH,ROAD_EDIT_YELLOW_WIDTH,ROAD_EDIT_YELLOW_OFFSET}
 from './road-editor-style.js?v=20261103-road-parity-v3';

export const ROAD_EDIT_MESH_VERSION='stitched-roads-source-materials-v4';
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
export function sampleEditedRoad(road,{step=1.35,terrainHeightAt=null}={}){
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
 if(terrainHeightAt)for(const p of out){const terrain=terrainHeightAt(p[0],p[2]);if(Number.isFinite(terrain))p[1]=Math.max(p[1],terrain+.035);}
 return road.profile?applyEditedRoadEndpointGrades(out,road.profile):out;
}

function ribbonQuads(points,width,lift=0,terrainHeightAt=null){
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
  if(terrainHeightAt)for(const edge of [left,right]){
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
function emitEditedRoadPaint(buckets,road,points,terrainHeightAt){
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
   return [p[0]+n[0]*displacement,p[1],p[2]+n[1]*displacement];
  });
  buckets[color].push(...ribbonQuads(line,lineWidth,ROAD_EDIT_PAINT_LIFT,terrainHeightAt));
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
   for(const key of keys(p)){let group=cells.get(key);if(!group){group=[];cells.set(key,group);}group.push(p);}
  }
 }
 return {polygons:result,overlaps};
}
export function buildEditedRoadMeshes(roads,{terrainHeightAt=null}={}){
 const buckets={asphalt:[],highway:[],ground:[],shoulder:[],paintWhite:[],paintYellow:[]},paths=[];
 const stats={segments:0,joins:0,overlaps:0,markedRoads:0,sourceClasses:{asphalt:0,highway:0,ground:0}};let sourceQuads=0;
 for(const r of roads){
  const points=sampleEditedRoad(r,{terrainHeightAt}),profile=r.profile||{classId:r.surface==='ground'?'ground':'asphalt'};
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+planar(points[i-1],points[i]));
  const widthAt=i=>r.profile?widthAtEditedRoad(profile,lengths[i]):r.width;
  const classId=profile.classId==='highway'?'highway':profile.classId==='ground'?'ground':'asphalt';
  const width=r.profile?profile.widthStart:r.width;
  const widths=points.map((_,i)=>widthAt(i));
  paths.push({id:r.id,width,widths,points,style:classId});
  const shoulder=ribbonQuads(points,i=>widthAt(i)+ROAD_EDIT_SHOULDER_EXTRA,ROAD_EDIT_SHOULDER_LIFT,terrainHeightAt);
  const surface=ribbonQuads(points,widthAt,classId==='highway'?ROAD_EDIT_HIGHWAY_LIFT:ROAD_EDIT_SURFACE_LIFT,terrainHeightAt);
  buckets.shoulder.push(...shoulder);buckets[classId].push(...surface);
  stats.sourceClasses[classId]++;sourceQuads+=surface.length;stats.segments+=points.length-1;
  if(profile.marked&&classId!=='ground'){
   emitEditedRoadPaint(buckets,r,points,terrainHeightAt);stats.markedRoads++;
  }
 }
 const geometries={};
 for(const [kind,quads]of Object.entries(buckets)){
  const union=unionQuads(quads);geometries[kind]=polygonGeometry(union.polygons);stats.overlaps+=union.overlaps;
 }
 return {geometries,paths,stats:{...stats,sourceRoads:roads.length,sourceQuads}};
}
