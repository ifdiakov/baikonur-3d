import {HIGHWAY_ASPHALT_LIFT,isHighwayRoad} from './highway-surface.js?v=20261031-facilities-rails-lighting-v2';

export const RAIL_CROSSING_PROFILE_VERSION='source-level-crossings-v1';
const EPS=1e-9,BLEND=.04;
const CORRIDOR_ROADS=new Set(['motorway','trunk','primary','secondary','tertiary']);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const horizontal=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const other=(edge,node)=>edge.a===node?edge.b:edge.a;
const elevated=tags=>Boolean(tags?.bridge&&tags.bridge!=='no'||tags?.tunnel&&tags.tunnel!=='no');
const layer=tags=>String(tags?.layer??'0');

class Heap{
 constructor(){this.rows=[];}
 push(row){let i=this.rows.length;this.rows.push(row);while(i){const p=(i-1)>>1;if(this.rows[p][0]<=row[0])break;this.rows[i]=this.rows[p];i=p;}this.rows[i]=row;}
 pop(){const first=this.rows[0],last=this.rows.pop();if(this.rows.length){let i=0;while(i*2+1<this.rows.length){let c=i*2+1;if(c+1<this.rows.length&&this.rows[c+1][0]<this.rows[c][0])c++;if(this.rows[c][0]>=last[0])break;this.rows[i]=this.rows[c];i=c;}this.rows[i]=last;}return first;}
 get length(){return this.rows.length;}
}

function outward(edge,node){
 const index=edge.a===node?0:1,frame=edge.surfaceTangents?.[index];
 if(frame){const length=Math.hypot(frame.x,frame.z),sign=index?-1:1;return [sign*frame.x/length,sign*frame.z/length];}
 const end=other(edge,node).position,length=horizontal(node.position,end);
 return [(end.x-node.position.x)/length,(end.z-node.position.z)/length];
}

// Compact C1 maximum. The smoothing width vanishes both at ground and at
// the common upper bound, so combining coincident plateaus cannot overshoot
// that bound or lift a flat, unaffected part of a long source edge.
function maximum(a,b,upper,blend=BLEND,blendGrade=0){
 if(upper<=EPS)return {height:Math.max(a.height,b.height),grade:0};
 const sum=a.height+b.height,room=Math.max(0,sum*(2*upper-sum)/(2*upper));
 const width=blend*room/(blend+room||1),delta=a.height-b.height;
 if(width<EPS||Math.abs(delta)>=width)return a.height>=b.height?a:b;
 const roomGrade=(1-sum/upper)*(a.grade+b.grade);
 const widthGrade=(blend*blend*roomGrade+room*room*blendGrade)/((blend+room)*(blend+room));
 return {height:sum/2+width/4+delta*delta/(4*width),
  grade:(a.grade+b.grade)/2+delta*(a.grade-b.grade)/(2*width)+(1-delta*delta/(width*width))*widthGrade/4};
}

function hermite(a,b,m0,m1,length,t){
 const t2=t*t,t3=t2*t;
 return {height:(2*t3-3*t2+1)*a+(t3-2*t2+t)*length*m0+(-2*t3+3*t2)*b+(t3-t2)*length*m1,
  grade:(6*t2-6*t)*(a-b)/length+(3*t2-4*t+1)*m0+(3*t2-2*t)*m1};
}

// The capsule is a conservative footprint of one displayed pavement chord.
// It is used only for height clearance, never for railway connectivity.
function corridorInterval(a,b,c,d,radius){
 const dx=d.x-c.x,dz=d.z-c.z,length=Math.hypot(dx,dz);if(length<EPS)return null;
 const ux=dx/length,uz=dz/length,rx=b.x-a.x,rz=b.z-a.z;
 const x=(a.x-c.x)*ux+(a.z-c.z)*uz,z=-(a.x-c.x)*uz+(a.z-c.z)*ux;
 const vx=rx*ux+rz*uz,vz=-rx*uz+rz*ux,intervals=[];
 let lo=0,hi=1;
 for(const [origin,velocity,min,max]of [[x,vx,0,length],[z,vz,-radius,radius]]){
  if(Math.abs(velocity)<EPS){if(origin<min||origin>max){hi=-1;break;}continue;}
  const t0=(min-origin)/velocity,t1=(max-origin)/velocity;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
 }
 if(hi-lo>EPS)intervals.push([lo,hi]);
 const aa=rx*rx+rz*rz;
 if(aa>EPS)for(const center of [c,d]){
  const ex=a.x-center.x,ez=a.z-center.z,bb=2*(ex*rx+ez*rz),cc=ex*ex+ez*ez-radius*radius,disc=bb*bb-4*aa*cc;
  if(disc<=0)continue;const root=Math.sqrt(disc),from=Math.max(0,(-bb-root)/(2*aa)),to=Math.min(1,(-bb+root)/(2*aa));
  if(to-from>EPS)intervals.push([from,to]);
 }
 return intervals.length?[Math.min(...intervals.map(row=>row[0])),Math.max(...intervals.map(row=>row[1]))]:null;
}

function roadCorridorConstraints(railGraph,roadGraph){
 const started=performance.now(),cellSize=24,cells=new Map(),segments=[],intervals=[];
 const railHalf=Math.max(0,...railGraph.edges.map(edge=>(edge.width??0)/2)),curveBudget=.35,extra=.02;
 let eligibleRoadEdges=0,excludedElevatedEdges=0,candidatePairs=0,rawIntervals=0;
 for(const edge of roadGraph.edges){
  if(edge.abandoned||!CORRIDOR_ROADS.has(edge.tags.highway?.replace('_link','')))continue;
  if(elevated(edge.tags)||edge.a.raise>EPS||edge.b.raise>EPS){excludedElevatedEdges++;continue;}
  eligibleRoadEdges++;
  const points=edge.surfacePoints??[edge.a.position,edge.b.position],radius=edge.width/2+railHalf+curveBudget+extra;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];if(horizontal(a,b)<EPS)continue;
   const top=p=>(roadGraph.highwaySurfaceHeight?.(p,edge.width)??p.y)+(isHighwayRoad(edge.tags)?HIGHWAY_ASPHALT_LIFT:0);
   const segment={a,b,radius,roadTopY:Math.max(top(a),top(b)),wayId:String(edge.wayId),layer:layer(edge.tags)};
   segments.push(segment);
   for(let x=Math.floor((Math.min(a.x,b.x)-radius)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+radius)/cellSize);x++)
    for(let z=Math.floor((Math.min(a.z,b.z)-radius)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+radius)/cellSize);z++){
     const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
    }
  }
 }
 for(const edge of railGraph.edges){
  if(edge.abandoned||elevated(edge.tags))continue;
  const a=edge.a.position,b=edge.b.position,candidates=new Set(),hits=[];
  for(let x=Math.floor(Math.min(a.x,b.x)/cellSize);x<=Math.floor(Math.max(a.x,b.x)/cellSize);x++)
   for(let z=Math.floor(Math.min(a.z,b.z)/cellSize);z<=Math.floor(Math.max(a.z,b.z)/cellSize);z++)
    for(const segment of cells.get(x+':'+z)??[])candidates.add(segment);
  for(const segment of candidates){
   if(segment.layer!==layer(edge.tags))continue;candidatePairs++;
   const overlap=corridorInterval(a,b,segment.a,segment.b,segment.radius);if(!overlap)continue;rawIntervals++;
   hits.push({from:overlap[0],to:overlap[1],roadTopY:segment.roadTopY,roadWayIds:new Set([segment.wayId])});
  }
  hits.sort((a,b)=>a.from-b.from||a.to-b.to);const merged=[];
  for(const hit of hits){const previous=merged.at(-1);
   if(previous&&hit.from<=previous.to+EPS){previous.to=Math.max(previous.to,hit.to);previous.roadTopY=Math.max(previous.roadTopY,hit.roadTopY);for(const way of hit.roadWayIds)previous.roadWayIds.add(way);}
   else merged.push({...hit,roadWayIds:new Set(hit.roadWayIds)});
  }
  for(const row of merged)intervals.push({...row,edge,roadWayIds:[...row.roadWayIds]});
 }
 return {intervals,stats:{source:'museum-road-corridor-clearance',policy:'retained-arterial-classes-only',roadClasses:[...CORRIDOR_ROADS],
  sourceTopologyPreserved:true,curveBudget,railHalfWidth:railHalf,margin:extra,cellSize,eligibleRoadEdges,excludedElevatedEdges,
  indexedSegments:segments.length,indexCells:cells.size,candidatePairs,rawIntervals,intervalCount:intervals.length,
  corridorLength:intervals.reduce((sum,row)=>sum+(row.to-row.from)*row.edge.length,0),
  roadWayIds:[...new Set(intervals.flatMap(row=>row.roadWayIds))],railWayIds:[...new Set(intervals.map(row=>String(row.edge.wayId)))],
  intervals:intervals.map(({edge,from,to,roadTopY,roadWayIds})=>({railWayId:String(edge.wayId),fromNodeId:String(edge.a.id),toNodeId:String(edge.b.id),
   fromFraction:from,toFraction:to,length:(to-from)*edge.length,roadTopY,roadWayIds})),milliseconds:performance.now()-started}};
}

/**
 * Derive crossing elevations from real shared source-node crossings, plus
 * separately attributed display clearance under enlarged arterial pavement.
 * The source graph's X/Z, IDs, adjacency, edge identities, costs and raise
 * fields stay intact. GeoJSON is read-only. Existing bridge elevations are
 * snapshotted before any node Y changes and remain a lower bound everywhere.
 *
 * Call after road terrain/grade preparation, before model approach plans and
 * smoothRailGraph(). The small railCrossingProfile hook consumed by the latter
 * supplies height, grade and exact vertical breakpoints inside sparse edges;
 * it never inserts a source node or adds a topological connection.
 */
export function createRailCrossingProfile({railGraph,roadGraph,railPoints,groundY,headY,approachLength=90,headClearance=.01}){
 const started=performance.now();
 if(!railGraph?.nodes||!roadGraph?.nodes||![groundY,headY,approachLength,headClearance].every(Number.isFinite)||
   headY<0||approachLength<=0||headClearance<0)throw new Error('Invalid railway crossing profile inputs');
 if(railGraph.railCrossingProfile)throw new Error('The railway crossing profile must be prepared once, before rail smoothing');
 const baseline=new Map([...railGraph.nodes.values()].map(node=>[node,node.position.y]));
 const pointRows=Array.isArray(railPoints)?railPoints:railPoints?.features??[],pointTags=new Map();
 for(const feature of pointRows)if(feature.geometry?.type==='Point')pointTags.set(String(feature.properties?.osmId??feature.id?.replace(/^node\//,'')),feature.properties?.tags??{});
 const constraints=[],skipped=[],influences=new Map(),atNodes=new Map();
 let sharedNodes=0,positionMismatches=0;
 for(const node of railGraph.nodes.values()){
  const roadNode=roadGraph.nodes.get(String(node.id)),railEdges=node.edges.filter(edge=>!edge.abandoned),roadEdges=roadNode?.edges.filter(edge=>!edge.abandoned)??[];
  if(!railEdges.length||!roadEdges.length)continue;sharedNodes++;
  const tag=pointTags.get(String(node.id))?.railway,explicit=tag==='level_crossing';
  const sameLevel=!railEdges.some(edge=>elevated(edge.tags))&&!roadEdges.some(edge=>elevated(edge.tags))&&
   new Set([...railEdges,...roadEdges].map(edge=>layer(edge.tags))).size===1;
  const angles=railEdges.flatMap(rail=>roadEdges.map(road=>{const a=outward(rail,node),b=outward(road,roadNode);return Math.abs(a[0]*b[1]-a[1]*b[0]);}));
  const minimumSine=Math.min(...angles),maximumSine=Math.max(...angles);
  // Missing point tags are permitted only when topology itself declares a
  // same-level, non-parallel intersection. Never infer joins from proximity.
  const inferred=tag==null&&sameLevel&&maximumSine>.12;
  if(!explicit&&!inferred){skipped.push({nodeId:String(node.id),reason:tag?'not-level-crossing-tag':'not-unambiguous-at-grade',railwayTag:tag??null});continue;}
  if(horizontal(node.position,roadNode.position)>1e-5){positionMismatches++;skipped.push({nodeId:String(node.id),reason:'shared-id-position-mismatch'});continue;}
  if(!sameLevel){skipped.push({nodeId:String(node.id),reason:'bridge-tunnel-or-layer-separation',railwayTag:tag??null});continue;}
  const roadTopY=Math.max(...roadEdges.map(edge=>{
   const y=roadGraph.highwaySurfaceHeight?.(roadNode.position,edge.width)??roadNode.position.y;
   return y+(isHighwayRoad(edge.tags)?HIGHWAY_ASPHALT_LIFT:0);
  }));
  if(!Number.isFinite(roadTopY))throw new Error('Non-finite road surface at railway crossing '+node.id);
  const roadWidth=Math.max(...roadEdges.map(edge=>edge.width??0)),railWidth=Math.max(...railEdges.map(edge=>edge.width??0));
  // Include both the actual asphalt width and a small plan-curve budget.
  // An oblique crossing needs a longer plateau than a perpendicular one.
  const plateauHalfLength=Math.max(1.2,(roadWidth/2+railWidth/2+.5)/Math.max(.035,minimumSine));
  const targetHeadY=roadTopY+headClearance,targetY=targetHeadY-headY,rise=Math.max(0,targetY-groundY);
  const approach=Math.max(approachLength,1.875*rise/.08),extent=plateauHalfLength+approach;
  const row={node,nodeId:String(node.id),source:explicit?'osm-level-crossing':'shared-source-node-at-grade',roadTopY,targetHeadY,targetY,rise,
   plateauHalfLength,approachLength:approach,extent,minimumSine,roadWidth,
   sourceLonLat:node.coord?[...node.coord]:null,roadWayIds:[...new Set(roadEdges.map(edge=>String(edge.wayId)))],
   railWayIds:[...new Set(railEdges.map(edge=>String(edge.wayId)))],baselineY:baseline.get(node),
   baselineAlreadyAboveRoad:baseline.get(node)+headY>roadTopY+.05,distances:new Map()};
  constraints.push(row);
 }
 constraints.sort((a,b)=>a.nodeId.localeCompare(b.nodeId));
 const corridor=roadCorridorConstraints(railGraph,roadGraph),corridorGroups=new Map();
 // A continuous road corridor can cover hundreds of tiny source edges.
 // Multi-source distance fields group equal-height intervals, avoiding a
 // separate graph search/profile for every road sample or railway edge.
 for(const interval of corridor.intervals){
  const targetY=interval.roadTopY+headClearance-headY,rise=Math.max(0,targetY-groundY),key=targetY.toFixed(7);
  if(rise<=EPS)continue;
  let seed=corridorGroups.get(key);
  if(!seed){const approach=Math.max(approachLength,1.875*rise/.08);seed={source:'museum-road-corridor-clearance',rise,targetY,
   plateauHalfLength:0,approachLength:approach,extent:approach,distances:new Map(),hostIntervals:new Map(),starts:new Map()};corridorGroups.set(key,seed);}
  const {edge,from,to}=interval;if(!seed.hostIntervals.has(edge))seed.hostIntervals.set(edge,[]);
  seed.hostIntervals.get(edge).push([from*edge.length,to*edge.length]);
  for(const [node,distance]of [[edge.a,from*edge.length],[edge.b,(1-to)*edge.length]])
   if(distance<(seed.starts.get(node)??Infinity))seed.starts.set(node,distance);
 }
 const seeds=[...constraints,...corridorGroups.values()];corridor.stats.profileCount=corridorGroups.size;
 const crossingUpper=Math.max(0,...seeds.map(row=>row.rise));
 const upper=Math.max(crossingUpper,...[...baseline.values()].map(y=>Math.max(0,y-groundY)));
 const seedSample=(seed,distance,derivative=0)=>{
  if(!Number.isFinite(distance)||distance>=seed.extent)return {height:0,grade:0};
  if(distance<=seed.plateauHalfLength)return {height:seed.rise,grade:0};
  const t=(distance-seed.plateauHalfLength)/seed.approachLength,t2=t*t,t3=t2*t;
  const ease=t3*(10-15*t+6*t2),slope=30*t2*(1-t)*(1-t);
  return {height:seed.rise*(1-ease),grade:-seed.rise*slope/seed.approachLength*derivative};
 };
 let visits=0;
 for(const seed of seeds){
  if(seed.rise<=EPS)continue;
  const heap=new Heap(),distances=seed.distances;
  for(const [node,distance]of seed.starts??[[seed.node,0]])if(distance<=seed.extent+EPS){distances.set(node,distance);heap.push([distance,node]);}
  const edges=new Set(seed.hostIntervals?.keys());
  while(heap.length){const [distance,node]=heap.pop();if(distance!==distances.get(node))continue;visits++;
   if(!atNodes.has(node))atNodes.set(node,[]);atNodes.get(node).push(seed);
   for(const edge of node.edges){if(edge.abandoned)continue;edges.add(edge);const end=other(edge,node),next=distance+edge.length;
    if(next<=seed.extent+EPS&&next<(distances.get(end)??Infinity)){distances.set(end,next);heap.push([next,end]);}
   }
  }
  for(const edge of edges){if(!influences.has(edge))influences.set(edge,[]);influences.get(edge).push(seed);}
 }
 const nodeCrossing=node=>{
  let value={height:0,grade:0};for(const seed of atNodes.get(node)??[])value=maximum(value,seedSample(seed,seed.distances.get(node)),crossingUpper);return value;
 };
 let raisedNodes=0,maxLift=0;
 for(const node of railGraph.nodes.values()){
  const old=baseline.get(node),base={height:Math.max(0,old-groundY),grade:0};
  node.position.y=groundY+maximum(base,nodeCrossing(node),upper).height;
  if(node.position.y>old+EPS){raisedNodes++;maxLift=Math.max(maxLift,node.position.y-old);}
 }
 const stats={version:RAIL_CROSSING_PROFILE_VERSION,sourceTopologyPreserved:true,sourceXZPreserved:true,sourceEdgeLengthsPreserved:true,
  groundY,headY,headClearance,approachLength,blendMaximum:BLEND/4,sharedNodes,explicitCrossings:constraints.filter(row=>row.source==='osm-level-crossing').length,
  inferredCrossings:constraints.filter(row=>row.source==='shared-source-node-at-grade').length,crossingCount:constraints.length,
  raisedNodes,affectedEdges:influences.size,maxLift,maximumY:groundY+upper,graphVisits:visits,positionMismatches,skipped,corridorClearance:corridor.stats,
  baselineAlreadyAboveRoad:constraints.filter(row=>row.baselineAlreadyAboveRoad).map(row=>row.nodeId),
  crossings:constraints.map(({node,distances,rise,targetY,extent,...row})=>({...row,position:node.position.toArray(),actualHeadY:node.position.y+headY,
   plateau:{halfLength:row.plateauHalfLength,datumY:targetY},visibility:'source-constraint-renderer-filters-separately'}))};
 const baselineY=node=>baseline.get(node);

 function makeEdgeProfile(edge,{run,baseSample}){
  const seeds=influences.get(edge);if(!seeds?.length)return null;
  const knots=new Set([0,1]),length=edge.length;
  for(const seed of seeds)for(const [node,reverse]of [[edge.a,false],[edge.b,true]]){
   const distance=seed.distances.get(node);if(distance==null)continue;
   for(const at of [seed.plateauHalfLength,...[.25,.5,.75,1].map(t=>seed.plateauHalfLength+seed.approachLength*t)]){
    const u=(at-distance)/length,s=reverse?1-u:u;if(s>EPS&&s<1-EPS)knots.add(s);
   }
  }
  for(const seed of seeds)for(const [from,to]of seed.hostIntervals?.get(edge)??[])
   for(const t of [0,.25,.5,.75,1])for(const distance of [from-t*seed.approachLength,to+t*seed.approachLength]){
    const u=distance/length;if(u>EPS&&u<1-EPS)knots.add(u);
   }
  function raw(u){
   let value={height:0,grade:0};
   for(const seed of seeds){
    const a=seed.distances.get(edge.a)??Infinity,b=seed.distances.get(edge.b)??Infinity;
    const candidates=[];
    if(b>=a+length-EPS)candidates.push(seedSample(seed,a+u*length,length/run));
    else if(a>=b+length-EPS)candidates.push(seedSample(seed,b+(1-u)*length,-length/run));
    else candidates.push(seedSample(seed,a+u*length,length/run),seedSample(seed,b+(1-u)*length,-length/run));
    for(const [from,to]of seed.hostIntervals?.get(edge)??[]){const at=u*length;
     candidates.push(seedSample(seed,Math.max(from-at,0,at-to),at<from?-length/run:at>to?length/run:0));
    }
    let part={height:0,grade:0};
    for(const candidate of candidates){
     if(u<=EPS||u>=1-EPS){
      if(candidate.height>part.height+EPS||Math.abs(candidate.height-part.height)<=EPS&&(u<=EPS?candidate.grade>part.grade:candidate.grade<part.grade))part=candidate;
     }else part=maximum(part,candidate,seed.rise,BLEND*16*u*u*(1-u)*(1-u),BLEND*32*u*(1-u)*(1-2*u)/run);
    }
    value=maximum(value,part,crossingUpper);
   }
   const base=baseSample(u),combined=maximum({height:Math.max(0,base.height-groundY),grade:base.height>=groundY?base.grade:0},value,upper);
   return {height:groundY+combined.height,grade:combined.grade};
  }
  const endpointSamples=[raw(0),raw(1)],patchFraction=Math.min(6/run,.25),patches=[];
  const inner=[raw(patchFraction),raw(1-patchFraction)];
  const limits=inner.map((value,index)=>3*Math.abs(value.height-endpointSamples[index].height)/(patchFraction*run));
  const initialGrades=endpointSamples.map(value=>value.grade);
  function setEndpointGrades(grades){
   for(let index=0;index<2;index++){
    if(Math.abs(grades[index]-initialGrades[index])<1e-9)continue;
    const start=index?1-patchFraction:0,end=index?1:patchFraction,a=index?inner[1]:endpointSamples[0],b=index?endpointSamples[1]:inner[0];
    const m0=index?a.grade:grades[0],m1=index?grades[1]:b.grade;
    patches.push({start,end,a:a.height,b:b.height,m0,m1,length:(end-start)*run});knots.add(start);knots.add(end);
   }
  }
  function sample(u){
   const patch=patches.find(p=>u>=p.start-EPS&&u<=p.end+EPS);
   let result=patch?hermite(patch.a,patch.b,patch.m0,patch.m1,patch.length,clamp((u-patch.start)/(patch.end-patch.start),0,1)):raw(u);
   const base=baseSample(u);
   // Endpoint grade corrections must never cut into an existing bridge.
   if(result.height<base.height)result=base;
   if(result.height>groundY+upper)result={height:groundY+upper,grade:0};
   if(u<=EPS)return {height:edge.a.position.y,grade:patches.some(p=>p.start===0)?patches.find(p=>p.start===0).m0:initialGrades[0]};
   if(u>=1-EPS)return {height:edge.b.position.y,grade:patches.some(p=>p.end===1)?patches.find(p=>p.end===1).m1:initialGrades[1]};
   return result;
  }
  return {sample,initialGrades,endpointGradeLimits:limits,setEndpointGrades,get knots(){return [...knots].sort((a,b)=>a-b);}};
 }
 railGraph.railCrossingProfile={version:RAIL_CROSSING_PROFILE_VERSION,baselineY,makeEdgeProfile,stats};
 stats.preparationMilliseconds=performance.now()-started;
 return {stats};
}
