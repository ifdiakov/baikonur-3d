import * as THREE from 'three';
import {HIGHWAY_MARKINGS,HIGHWAY_ASPHALT_LIFT} from './highway-surface.js?v=20261031-road-markings-v1';

export const ROAD_MARKINGS_VERSION='junction-aware-markings-v1';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const MAIN=new Set(['motorway','trunk']),HIGHWAY=new Set(['motorway','trunk','motorway_link','trunk_link']);
const UNPAVED=new Set(['unpaved','gravel','fine_gravel','compacted','ground','dirt','earth','sand','grass','mud']);
const LIFT=HIGHWAY_MARKINGS.lift-HIGHWAY_ASPHALT_LIFT,CELL=20,STEP=.75;
const xzKey=p=>p.x.toFixed(5)+':'+p.z.toFixed(5);
const comparePoint=(a,b)=>a.x-b.x||a.z-b.z||a.y-b.y;
const horizontal=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const normal=d=>V(-d.z,0,d.x).normalize();
function between(a,b,t){
 const p=a.clone().lerp(b,t);
 if(a.markingNormal&&b.markingNormal)p.markingNormal=a.markingNormal.clone().lerp(b.markingNormal,t).normalize();
 return p;
}
function copyPoint(p){const q=p.clone();if(p.markingNormal)q.markingNormal=p.markingNormal.clone();return q;}

export function roadMarkingPolicy(tags={},width=3.6,marked=true){
 const highway=HIGHWAY.has(tags.highway),family=highway?'highway':'local';
 const unpaved=tags.highway==='track'||String(tags.surface||'').toLowerCase().split(/[;,]/).some(surface=>UNPAVED.has(surface.trim()));
 const oneway=['yes','true','1','-1'].includes(String(tags.oneway).toLowerCase())||tags.junction==='roundabout'&&tags.oneway!=='no';
 const count=Number(tags.lanes),lanes=Number.isInteger(count)&&count>0?count:oneway||width<2.4?1:2;
 const eligible=!unpaved&&(marked||highway)&&width>=1.1;
 const center=eligible&&lanes>1&&!oneway?(MAIN.has(tags.highway)?'double-yellow':'dashed-white'):null;
 const divider=eligible&&oneway&&lanes>1;
 return {family,highway,main:MAIN.has(tags.highway),link:tags.highway?.endsWith('_link')||false,unpaved,oneway,lanes,eligible,center,divider,
  edgeWidth:HIGHWAY_MARKINGS.edgeWidth,edgeInset:HIGHWAY_MARKINGS.edgeInset,centerWidth:highway?HIGHWAY_MARKINGS.edgeWidth:.10,
  dashLength:highway?3:4.7,dashPeriod:highway?8:13};
}

class SpatialIndex{
 constructor(){this.cells=new Map();}
 add(item,minX,maxX,minZ,maxZ){for(let x=Math.floor(minX/CELL);x<=Math.floor(maxX/CELL);x++)for(let z=Math.floor(minZ/CELL);z<=Math.floor(maxZ/CELL);z++){
  const key=x+':'+z;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(item);
 }}
 at(p){return this.cells.get(Math.floor(p.x/CELL)+':'+Math.floor(p.z/CELL))||[];}
}
function nearestOnSegment(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
 return {distance:Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t),y:a.y+(b.y-a.y)*t,t};
}
function pathOf(points){
 const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+points[i].distanceTo(points[i-1]));
 const length=distances.at(-1);
 return {points,distances,length,at(distance){
  const s=THREE.MathUtils.clamp(distance,0,length);let lo=0,hi=points.length-1;
  while(hi-lo>1){const middle=(lo+hi)>>1;if(distances[middle]<=s)lo=middle;else hi=middle;}
  return between(points[lo],points[hi],(s-distances[lo])/(distances[hi]-distances[lo]||1));
 }};
}
function resample(points,step=STEP){
 const out=[copyPoint(points[0])];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(a.distanceTo(b)/step));for(let j=1;j<=n;j++)out.push(between(a,b,j/n));}
 return out;
}
function roundedCenters(points,width){
 const out=[points[0].clone()];
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],p=points[i],b=points[i+1],incoming=p.clone().sub(a),outgoing=b.clone().sub(p),la=incoming.length(),lb=outgoing.length();
  incoming.normalize();outgoing.normalize();
  const reach=Math.min(la*.25,lb*.25,width*.24);
  if(reach<.025||incoming.dot(outgoing)>.998){out.push(p.clone());continue;}
  const from=p.clone().addScaledVector(incoming,-reach),to=p.clone().addScaledVector(outgoing,reach),curve=new THREE.QuadraticBezierCurve3(from,p,to);
  out.push(from);for(let j=1;j<=6;j++)out.push(curve.getPoint(j/6));
 }
 out.push(points.at(-1).clone());return out;
}
function intervals(points,visible){
 const result=[];let run=[];
 const flush=()=>{if(run.length>1)result.push(run);run=[];};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],va=visible(a),vb=visible(b);
  if(va&&!run.length)run.push(a);
  if(va!==vb){let lo=0,hi=1;for(let k=0;k<13;k++){const mid=(lo+hi)/2;if(visible(between(a,b,mid))===va)lo=mid;else hi=mid;}
   const cut=between(a,b,(lo+hi)/2);if(va){run.push(cut);flush();}else run.push(cut);
  }
  if(vb)run.push(b);else flush();
 }
 flush();return result;
}

/** Marking geometry only: input topology, pavement, routes and lights are
 * immutable. Source-node connectivity authorizes a junction opening; the
 * compatible real pavement then determines its side and exact extent. */
export function buildRoadMarkings({roads=[],graph={nodes:new Map()},surfaceHeightAt,directionAt=(p,d)=>d,extraEdges=[],excludePoint=()=>false}={}){
 if(typeof surfaceHeightAt!=='function')throw new Error('Road markings require an actual pavement-height sampler');
 const quads=[],junctionIndex=new SpatialIndex(),segmentIndex=new SpatialIndex(),nodePositions=new Map(),nodeOccurrences=new Map(),edgeOpenings=new Set(),centerOpenings=new Set(),contourOpenings=new Set();
 const stats={version:ROAD_MARKINGS_VERSION,roadRuns:roads.length,eligibleRoadRuns:0,chains:0,continuationSeams:0,junctionCount:0,junctionSamples:[],seamSamples:[],
  edgeQuads:0,centerQuads:0,dividerQuads:0,projectedVertices:0,projectionMisses:0,projectionRejectedQuads:0,boundaryRejectedQuads:0,
  edgeOpenings:0,centerOpenings:0,replacementContourOpenings:0,suppressedOneWayCenters:0,suppressedSingleLaneCenters:0,suppressedUnpavedRuns:0,regulatoryMarks:0};
 const sourceNodes=graph.nodes instanceof Map?[...graph.nodes.values()]:Array.isArray(graph.nodes)?graph.nodes:Object.values(graph.nodes||{}),sourceNodeById=new Map(sourceNodes.map(n=>[String(n.id),n]));
 for(const n of sourceNodes){if(!n.position)continue;const key=xzKey(n.position);if(!nodePositions.has(key))nodePositions.set(key,[]);nodePositions.get(key).push(n);}
 const prepared=roads.filter(r=>r.points?.length>1).map((r,i)=>{
  const points=r.points.filter((p,j)=>!j||p.distanceTo(r.points[j-1])>1e-8).map(p=>p.clone()),policy=roadMarkingPolicy(r.tags,r.width,r.marked!==false);
  return {...r,id:String(r.id??r.wayId??i),wayId:String(r.wayId??r.id??i),key:i,points,width:r.width||3.6,policy};
 }).filter(r=>r.points.length>1);
 for(const road of prepared){
  const p=road.policy;if(p.eligible)stats.eligibleRoadRuns++;if(p.unpaved)stats.suppressedUnpavedRuns++;
  if(p.eligible&&p.oneway)stats.suppressedOneWayCenters++;if(p.eligible&&p.lanes===1)stats.suppressedSingleLaneCenters++;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],margin=road.width/2+.5;
   segmentIndex.add({a,b,road},Math.min(a.x,b.x)-margin,Math.max(a.x,b.x)+margin,Math.min(a.z,b.z)-margin,Math.max(a.z,b.z)+margin);
  }
  road.nodeAt=new Map();
  for(let i=0;i<road.points.length;i++){
   const p=road.points[i],explicit=i===0?road.startNodeId:i===road.points.length-1?road.endNodeId:null;
   const candidates=nodePositions.get(xzKey(p))||[];
   const source=explicit!=null?sourceNodeById.get(String(explicit)):candidates.find(n=>Math.abs(n.position.y-p.y)<.65&&(n.edges||[]).some(e=>String(e.wayId)===road.wayId));
   const nodeId=explicit!=null?String(explicit):source?String(source.id):null;if(nodeId==null)continue;
   road.nodeAt.set(i,nodeId);if(!nodeOccurrences.has(nodeId))nodeOccurrences.set(nodeId,{nodeId,position:(source?.position||p).clone(),occurrences:[]});
   nodeOccurrences.get(nodeId).occurrences.push({road,index:i,p});
  }
 }
 // Museum gate/airport connectors can intentionally attach in the middle
 // of a source edge. Only explicit connection metadata authorizes these
 // virtual junctions; an arbitrary visual crossing never creates one.
 for(const road of prepared)for(const connection of road.connections||[]){
  if(connection.nodeId==null||connection.hostWayId==null||!connection.position)continue;
  const p=connection.position.clone?connection.position.clone():V(...connection.position),hosts=new Map();
  for(const segment of segmentIndex.at(p)){
   if(segment.road.key===road.key||segment.road.wayId!==String(connection.hostWayId))continue;
   const near=nearestOnSegment(p,segment.a,segment.b);
   if(near.distance<.1&&Math.abs(near.y-p.y)<.65&&(!hosts.has(segment.road.key)||near.distance<hosts.get(segment.road.key).distance))hosts.set(segment.road.key,{segment,distance:near.distance});
  }
  if(!hosts.size)continue;
  const nodeId=String(connection.nodeId),n=nodeOccurrences.get(nodeId)||{nodeId,position:p,occurrences:[],explicit:true};
  for(const {segment} of hosts.values()){
   const d=segment.b.clone().sub(segment.a).setY(0).normalize();
   if(!n.occurrences.some(o=>o.road.key===segment.road.key))n.occurrences.push({road:segment.road,p,directions:[d,d.clone().negate()]});
  }
  if(!n.occurrences.some(o=>o.road.key===road.key)){
   const start=road.points[0].distanceTo(p),end=road.points.at(-1).distanceTo(p),index=start<=end?0:road.points.length-1;
   if(Math.min(start,end)<.15)n.occurrences.push({road,p,index});
   else{
    const own=segmentIndex.at(p).filter(s=>s.road.key===road.key).map(segment=>({segment,near:nearestOnSegment(p,segment.a,segment.b)}))
     .filter(s=>s.near.distance<.1&&Math.abs(s.near.y-p.y)<.65).sort((a,b)=>a.near.distance-b.near.distance)[0];
    if(own){const d=own.segment.b.clone().sub(own.segment.a).setY(0).normalize();n.occurrences.push({road,p,directions:[d,d.clone().negate()]});}
   }
  }
  nodeOccurrences.set(nodeId,n);
 }
 const endpointPorts=new Map(),junctions=[];
 for(const n of nodeOccurrences.values()){
  const arms=[];
  for(const o of n.occurrences){
   const directions=o.directions||[-1,1].flatMap(delta=>{const q=o.road.points[o.index+delta];return q?[q.clone().sub(o.p).setY(0).normalize()]:[];});
   for(const d of directions){
    if(!arms.some(a=>a.road.key===o.road.key&&a.direction.dot(d)>.9999))arms.push({road:o.road,direction:d});
   }
   if(o.index===0||o.index===o.road.points.length-1){if(!endpointPorts.has(n.nodeId))endpointPorts.set(n.nodeId,[]);endpointPorts.get(n.nodeId).push({road:o.road,end:o.index===0?0:1});}
  }
  n.arms=arms;
  if(arms.length<3)continue;
  // A smoothed ramp may share the exact through-road tangent at its end.
  // Prefer the two actual main-road arms over that geometrically tied ramp.
  const mainArms=arms.filter(a=>a.road.policy.main),candidates=mainArms.length>=2?mainArms:arms;
  let pair=null,best=1;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const dot=candidates[i].direction.dot(candidates[j].direction);if(dot<best){best=dot;pair=[candidates[i],candidates[j]];}}
  const axis=pair[0].direction.clone().sub(pair[1].direction).normalize(),branches=arms.filter(a=>!pair.includes(a));
  const merge=best<-.7&&branches.every(a=>a.road.policy.link&&a.road.policy.oneway&&Math.abs(a.direction.dot(axis))>.82);
  const width=Math.max(...arms.map(a=>a.road.width)),sine=Math.min(...branches.map(a=>Math.sqrt(Math.max(0,1-a.direction.dot(axis)**2))));
  const radius=Math.min(36,width*2.2/Math.max(.23,sine)),junction={...n,axis,type:merge?'merge':'crossing',width,radius,roads:new Set(arms.map(a=>a.road.key)),through:new Set(pair.map(a=>a.road.key))};
  junctions.push(junction);junctionIndex.add(junction,n.position.x-radius,n.position.x+radius,n.position.z-radius,n.position.z+radius);
 }
 stats.junctionCount=junctions.length;
 stats.explicitJunctionCount=junctions.filter(j=>j.explicit).length;
 const sampleIds=['687038520','1833284266','3734910059','3734910038','1833284265'],sampleRank=id=>sampleIds.includes(id)?sampleIds.indexOf(id):sampleIds.length;
 stats.junctionSamples=junctions.map(j=>({nodeId:j.nodeId,position:j.position.toArray(),wayIds:[...new Set(j.arms.map(a=>a.road.wayId))],type:j.type})).sort((a,b)=>sampleRank(a.nodeId)-sampleRank(b.nodeId)).slice(0,32);
 const links=new Map(),styleKey=r=>JSON.stringify([r.width,r.policy.family,r.policy.main,r.policy.center,r.policy.oneway,r.policy.lanes,r.policy.eligible]);
 for(const [nodeId,ports] of endpointPorts){
  const node=nodeOccurrences.get(nodeId);if(node.arms.length!==2||ports.length!==2||ports[0].road===ports[1].road)continue;
  const [a,b]=ports;if(styleKey(a.road)!==styleKey(b.road)||Math.abs(a.road.points[a.end?a.road.points.length-1:0].y-b.road.points[b.end?b.road.points.length-1:0].y)>.25)continue;
  links.set(a.road.key+':'+a.end,b);links.set(b.road.key+':'+b.end,a);stats.continuationSeams++;
  stats.seamSamples.push({nodeId,roadIds:[a.road.id,b.road.id],type:'continuation'});
 }
 stats.seamSamples.sort((a,b)=>Number(b.nodeId==='439813528')-Number(a.nodeId==='439813528'));stats.seamSamples=stats.seamSamples.slice(0,32);
 const visited=new Set(),chains=[];
 for(const seed of prepared){
  if(visited.has(seed.key)||!seed.policy.eligible)continue;
  const component=[],queue=[seed],found=new Set([seed.key]);
  for(let k=0;k<queue.length;k++){const road=queue[k];component.push(road);for(const end of [0,1]){const next=links.get(road.key+':'+end);if(next&&!found.has(next.road.key)){found.add(next.road.key);queue.push(next.road);}}}
  let ports=component.flatMap(road=>[0,1].filter(end=>!links.has(road.key+':'+end)).map(end=>({road,end})));
  if(!ports.length)ports=component.flatMap(road=>[0,1].map(end=>({road,end})));
  ports.sort((a,b)=>comparePoint(a.road.points[a.end?a.road.points.length-1:0],b.road.points[b.end?b.road.points.length-1:0])||a.road.id.localeCompare(b.road.id));
  let current=ports[0];const points=[],members=[];
  while(current&&!visited.has(current.road.key)){
   const road=current.road;visited.add(road.key);members.push(road);const ps=current.end?[...road.points].reverse():road.points;
   for(const p of ps)if(!points.length||p.distanceTo(points.at(-1))>1e-8)points.push(p.clone());
   current=links.get(road.key+':'+(current.end?0:1));
  }
  const chain={id:chains.length,points,members,keys:new Set(members.map(r=>r.key)),roadIds:members.map(r=>r.id),road:members[0],policy:members[0].policy,width:members[0].width};chains.push(chain);
 }
 stats.chains=chains.length;
 const compatibleHeight=(p,y)=>Number.isFinite(y)&&Math.abs(y-p.y)<.65;
 const junctionHeight=(p,y)=>Number.isFinite(y)&&Math.abs(y-p.y)<1.2;
 const contourIndex=new SpatialIndex(),contours=extraEdges.filter(edge=>edge.points?.length>1).map((edge,i)=>{
  const points=edge.points,tangent=(at,other)=>{
   const fallback=points[other].clone().sub(points[at]).setY(0).normalize().multiplyScalar(at===0?1:-1);
   return edge.directionAt?edge.directionAt(points[at],fallback).clone().setY(0).normalize():fallback;
  };
  return {id:edge.id??i,points,start:tangent(0,1),end:tangent(points.length-1,points.length-2)};
 });
 for(const contour of contours){const xs=contour.points.map(p=>p.x),zs=contour.points.map(p=>p.z);contourIndex.add(contour,Math.min(...xs)-.4,Math.max(...xs)+.4,Math.min(...zs)-.4,Math.max(...zs)+.4);}
 function insideReplacementContour(p,chain){
  for(const contour of contourIndex.at(p)){
   const first=contour.points[0],last=contour.points.at(-1);
   // A curved replacement edge owns only the interval between its two
   // seam planes. Do not shorten the adjoining exposed straight edges.
   if(p.clone().sub(first).dot(contour.start)<-1e-5||p.clone().sub(last).dot(contour.end)>1e-5)continue;
   for(let i=1;i<contour.points.length;i++){
    const near=nearestOnSegment(p,contour.points[i-1],contour.points[i]);
    if(near.distance<chain.policy.edgeInset+chain.policy.edgeWidth+.05&&junctionHeight(p,near.y)){
     contourOpenings.add(contour.id+':'+chain.id);return true;
    }
   }
  }
  return false;
 }
 function nearbyJunctions(p,chain){return junctionIndex.at(p).filter(j=>j.arms.some(a=>chain.keys.has(a.road.key))&&Math.abs(j.position.y-p.y)<1.2&&horizontal(j.position,p)<j.radius);}
 function foreignPavement(p,j,chain,outward){
  for(const segment of segmentIndex.at(p)){
   if(chain.keys.has(segment.road.key)||!j.roads.has(segment.road.key))continue;
   const near=nearestOnSegment(p,segment.a,segment.b);
   // The real sampler intentionally selects only the level near query Y.
   // Seed it with this explicitly connected arm's grade, then retain the
   // junction-height guard relative to the candidate line. This cannot
   // select a five-unit-higher bridge or an unconnected visual crossing.
   if(near.distance<segment.road.width/2+.025&&junctionHeight(p,near.y)&&junctionHeight(p,surfaceHeightAt(p.clone().setY(near.y))))return true;
  }
  // Rounded junction returns/aprons extend beyond the original narrow
  // branch ribbon. The actual union owns that wider mouth too. Restrict
  // this check to an explicitly connected branch on this side, so the
  // opposite curb and unconnected visual crossings remain continuous.
  return horizontal(p,j.position)<j.width*2&&j.arms.some(a=>!chain.keys.has(a.road.key)&&a.direction.dot(outward)>.01)&&junctionHeight(p,surfaceHeightAt(p));
 }
 function allowed(p,kind,chain,outward=null){
  const road=chain.road,family=chain.policy.family;
  if(excludePoint(p,{kind,road,family}))return {allowed:false,reason:'replacement-surface'};
  if(kind==='edge'&&insideReplacementContour(p,chain))return {allowed:false,reason:'replacement-contour'};
  for(const j of nearbyJunctions(p,chain)){
   if(kind==='edge'){
    if(!outward)continue;const probe=p.clone().addScaledVector(outward,chain.policy.edgeInset+.11);
    if(foreignPavement(probe,j,chain,outward)){edgeOpenings.add(j.nodeId+':'+chain.id+':'+(outward.dot(normal(j.axis))>0?1:-1));return {allowed:false,reason:'junction-mouth',nodeId:j.nodeId};}
   }else{
    if(j.type==='merge'&&chain.policy.main&&j.arms.some(a=>chain.keys.has(a.road.key)&&j.through.has(a.road.key)))continue;
    if(horizontal(p,j.position)<j.width/2+Math.max(.45,chain.width*.2)){centerOpenings.add(j.nodeId+':'+chain.id);return {allowed:false,reason:'junction-center',nodeId:j.nodeId};}
   }
  }
  return {allowed:true,reason:'painted'};
 }
 const project=p=>{const q=p.clone();q.x=Math.fround(q.x);q.z=Math.fround(q.z);const y=surfaceHeightAt(q);return compatibleHeight(q,y)?q.setY(y+LIFT):null;};
 function emit(points,{width,color,kind,chain,directionAt:customDirection}){
  if(points.length<2)return;
  const frames=points.map((p,i)=>{
   let n=p.markingNormal;
   if(!n){let d=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).setY(0).normalize();
    if(customDirection)d=customDirection(p,d,chain.road).clone().setY(0).normalize();n=normal(d);
   }
   return [project(p.clone().addScaledVector(n,-width/2)),project(p.clone().addScaledVector(n,width/2))];
  });
  for(let i=1;i<frames.length;i++){
   const vertices=[...frames[i-1],...frames[i]];
   if(vertices.some(p=>!p)){stats.projectionRejectedQuads++;continue;}
   const probes=[vertices[0].clone().lerp(vertices[2],.5),vertices[1].clone().lerp(vertices[3],.5),vertices.reduce((p,q)=>p.add(q),V()).multiplyScalar(.25)];
   if(probes.some(p=>!compatibleHeight(p,surfaceHeightAt(p)))){stats.projectionRejectedQuads++;continue;}
   quads.push({vertices,width,color,kind,family:chain.policy.family,roadIds:chain.roadIds});stats[kind+'Quads']++;stats.projectedVertices+=4;
  }
 }
 function drawStroke(chain,points,{width,color,kind,offset=0,dashed=false,directionAt:customDirection}){
  // Offset the same source cross-sections used by the pavement first.
  // Recomputing normals after densifying uneven source segments changed
  // those frames and produced tiny hooks on tight, already smooth loops.
  const framed=points.map((p,i)=>{
   let d=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).setY(0).normalize();
   if(customDirection)d=customDirection(p,d,chain.road).clone().setY(0).normalize();
   const n=normal(d),value=typeof offset==='function'?offset(p):offset,q=p.clone().addScaledVector(n,value);q.markingNormal=n;return q;
  }),centers=resample(framed),path=pathOf(centers);
  const outwardAt=p=>{
   let best=Infinity,n=null;for(const segment of segmentIndex.at(p))if(chain.keys.has(segment.road.key)){const near=nearestOnSegment(p,segment.a,segment.b);if(near.distance<best){best=near.distance;const at=segment.a.clone().lerp(segment.b,near.t);n=p.clone().sub(at).setY(0).normalize();}}
   return n||V();
  };
  const visible=p=>allowed(p,kind,chain,kind==='edge'?outwardAt(p):null).allowed;
  const strokes=[];
  if(dashed){let cursor=1;for(let start=2;start<path.length-.15;start+=chain.policy.dashPeriod){const end=Math.min(path.length,start+chain.policy.dashLength);if(end-start<.12)continue;
   while(cursor<centers.length&&path.distances[cursor]<=start)cursor++;
   const ps=[path.at(start)];let j=cursor;while(j<centers.length&&path.distances[j]<end)ps.push(centers[j++]);ps.push(path.at(end));strokes.push(ps);
  }}else strokes.push(centers);
  for(const stroke of strokes)for(const run of intervals(stroke,visible))emit(run,{width,color,kind,chain,directionAt:customDirection});
 }
 for(const chain of chains){
  const {policy:p,width}=chain,edgeDirection=chain.road.directionAt||(p.highway?directionAt:null),widthAt=chain.road.widthAt;
  for(const side of [-1,1])drawStroke(chain,chain.points,{kind:'edge',width:p.edgeWidth,color:'white',offset:point=>side*((typeof widthAt==='function'?widthAt(point):width)/2-p.edgeInset),directionAt:edgeDirection});
  const centerPoints=p.highway||chain.members.every(road=>road.surfaceSmoothed)?chain.points:roundedCenters(chain.points,width);
  if(p.center==='double-yellow')for(const side of [-1,1])drawStroke(chain,centerPoints,{kind:'center',width:HIGHWAY_MARKINGS.centerWidth,color:'yellow',offset:side*HIGHWAY_MARKINGS.centerOffset,directionAt:directionAt});
  else if(p.center)drawStroke(chain,centerPoints,{kind:'center',width:p.centerWidth,color:'white',dashed:true});
  if(p.divider)for(let lane=1;lane<p.lanes;lane++)drawStroke(chain,centerPoints,{kind:'divider',width:p.centerWidth,color:'white',offset:width*(lane/p.lanes-.5),dashed:true,directionAt:edgeDirection});
 }
 for(const [index,edge] of extraEdges.entries()){
  if(edge.points?.length<2)continue;
  const chain={id:'extra-'+index,road:edge,roadIds:[String(edge.id||'apron-edge-'+index)],policy:{family:edge.family||'highway'}};
  const points=edge.points.map((p,i)=>{let d=edge.points[Math.min(i+1,edge.points.length-1)].clone().sub(edge.points[Math.max(i-1,0)]).setY(0).normalize();
   if(edge.directionAt)d=edge.directionAt(p,d).clone().setY(0).normalize();const q=p.clone();q.markingNormal=normal(d);return q;
  });
  emit(resample(points),{width:edge.width||HIGHWAY_MARKINGS.edgeWidth,color:'white',kind:'edge',chain});
 }
 stats.edgeOpenings=edgeOpenings.size;stats.centerOpenings=centerOpenings.size;stats.replacementContourOpenings=contourOpenings.size;stats.boundaryRejectedQuads=stats.projectionRejectedQuads;
 function coveragePolicyAt(p,kind='edge',wayId){
  const mainOnly=['white','yellow','highway-edge','highway-center'].includes(kind),role=['white','highway-edge'].includes(kind)?'edge':['yellow','highway-center'].includes(kind)?'center':kind;
  let selected=null,best=Infinity,nearest=null;
  for(const segment of segmentIndex.at(p)){
   const road=segment.road;if(wayId!=null&&road.wayId!==String(wayId)&&road.id!==String(wayId)||mainOnly&&!road.policy.main)continue;
   const q=nearestOnSegment(p,segment.a,segment.b);if(Math.abs(q.y-p.y)>.65||q.distance>road.width/2+.6)continue;
   // At a divided-road fork an edge can lie closer to the neighbouring
   // carriageway's centre. Query the nearest candidate edge, not that
   // unrelated centreline, when deciding whether an opening is intentional.
   const score=role==='edge'?Math.abs(q.distance-(road.width/2-road.policy.edgeInset)):q.distance;
   if(score<best){best=score;selected=road;nearest=segment.a.clone().lerp(segment.b,q.t);}
  }
  if(!selected)return {allowed:false,reason:'no-marked-road'};
  const policy=selected.policy;
  if(!policy.eligible)return {allowed:false,reason:policy.unpaved?'unpaved':'unmarked-road'};
  if(role==='center'&&!policy.center)return {allowed:false,reason:policy.oneway?'one-way':'single-lane'};
  if(role==='divider'&&!policy.divider)return {allowed:false,reason:'no-lane-divider'};
  const chain=chains.find(c=>c.keys.has(selected.key));if(!chain)return {allowed:false,reason:'unmarked-road'};
  return allowed(p,role,chain,role==='edge'?p.clone().sub(nearest).setY(0).normalize():null);
 }
 return {quads,stats,coveragePolicyAt,policy:coveragePolicyAt};
}
