import * as THREE from 'three';

export const RAIL_SURFACE_VERSION='shared-rail-curves-v1';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const EPS=1e-10;
const horizontal=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const key=p=>[p.x,p.y,p.z].map(n=>n.toFixed(7)).join(':');
const flatDirection=(a,b)=>b.clone().sub(a).setY(0).normalize();
const clamp=THREE.MathUtils.clamp;

function vector(value){
 const result=Array.isArray(value)?V(...value):value?.clone?.();
 if(!result||!['x','y','z'].every(axis=>Number.isFinite(result[axis]))||Math.hypot(result.x,result.z)<EPS)
  throw new Error('A railway endpoint tangent needs a finite horizontal direction');
 return result;
}

function compatible(a,b){
 const ga=a.tags?.gauge,gb=b.tags?.gauge;
 return !(ga&&gb&&String(ga)!==String(gb))&&Math.abs((a.width??0)-(b.width??0))<1e-6;
}

function cubic(a,b,c,d,t){
 const u=1-t;
 return a.clone().multiplyScalar(u*u*u).addScaledVector(b,3*u*u*t).addScaledVector(c,3*u*t*t).addScaledVector(d,t*t*t);
}
function cubicDirection(a,b,c,d,t){
 const u=1-t;
 return b.clone().sub(a).multiplyScalar(u*u).addScaledVector(c.clone().sub(b),2*u*t).addScaledVector(d.clone().sub(c),t*t).normalize();
}
function pointLineDistance(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
 return length>EPS?Math.abs((p.x-a.x)*dz-(p.z-a.z)*dx)/length:horizontal(p,a);
}

/** Adaptive chords follow curvature, not route length. A kilometre-long
 * straight still has two vertices. Quarter probes also catch symmetric
 * S-curves whose midpoint lies exactly on the endpoint chord. */
function sampleAdaptive(evaluate,{error,angle},from=0,to=1){
 const first=evaluate(from),last=evaluate(to),points=[first],cosine=Math.cos(angle);
 function split(a,b,depth){
  const q1=evaluate(a.t+(b.t-a.t)*.25),mid=evaluate((a.t+b.t)/2),q3=evaluate(a.t+(b.t-a.t)*.75);
  const chord=b.point.clone().sub(a.point),length=chord.length();
  const distance=p=>length>EPS?p.clone().sub(a.point).cross(chord).length()/length:p.distanceTo(a.point);
  const probes=[a,q1,mid,q3,b];
  const turn=a.tangent.dot(b.tangent)<cosine||probes.some((p,i)=>i&&p.tangent.dot(probes[i-1].tangent)<cosine);
  const bend=Math.max(distance(q1.point),distance(mid.point),distance(q3.point))>error;
  if(depth<18&&(turn||bend)){
   split(a,mid,depth+1);split(mid,b,depth+1);
  }else points.push(b);
 }
 split(first,last,0);return points;
}

function hermite(a,b,m0,m1,length,t){
 const t2=t*t,t3=t2*t;
 return (2*t3-3*t2+1)*a+(t3-2*t2+t)*length*m0+(-2*t3+3*t2)*b+(t3-t2)*length*m1;
}
function hermiteGrade(a,b,m0,m1,length,t){
 return (6*t*t-6*t)*(a-b)/length+(3*t*t-4*t+1)*m0+(3*t*t-2*t)*m1;
}

/**
 * Add display geometry to an existing source-node graph. Source coordinates,
 * edge identities, adjacency and routing costs are never edited.
 *
 * sampleStep controls the chord-error/turn tolerance, not a mandatory spacing
 * on straight track. maxLateralShift bounds the entire horizontal Bezier
 * control hull around each original edge, including between samples.
 *
 * pinnedNodeIds: Set/array of node IDs; its incident endpoints retain their
 * own source headings. Useful for already authored model/source seams.
 * endpointTangents: callback (edge,index,node) or Map<edge,[start,end]>.
 * Vectors/arrays are oriented a -> b at BOTH endpoints. An explicit tangent
 * takes precedence over a pin. Its vertical grade is limited only when
 * necessary to prevent a dip/overshoot between fixed endpoint elevations.
 * excludedEdges: Set of edge objects owned by a separate display builder.
 * Those edges, including any existing display fields, remain untouched.
 *
 * Return directionAt(wayId)(point,fallback) to use for the ribbon's exact
 * transverse frames. The lookup is per source way: separate tracks crossing
 * at the same coordinates never acquire each other's orientation/topology.
 */
export function smoothRailGraph(graph,{sampleStep=.6,maxLateralShift=.35,pinnedNodeIds=[],endpointTangents=null,excludedEdges=new Set()}={}){
 if(!(Number.isFinite(sampleStep)&&sampleStep>0&&Number.isFinite(maxLateralShift)&&maxLateralShift>=0))
  throw new Error('Rail sampling and lateral limits must be finite and non-negative');
 const pinned=new Set([...pinnedNodeIds].map(String)),excluded=new Set(excludedEdges),records=new Map(),adjacency=new Map(),groups=[];
 const crossingProfile=graph.railCrossingProfile;
 const tolerance={error:Math.min(.006,sampleStep/32),angle:Math.min(.08,sampleStep*.2)};
 const stats={version:RAIL_SURFACE_VERSION,sourceTopologyPreserved:true,sourcePositionsPreserved:true,
  edges:0,curvedEdges:0,straightEdges:0,nearStraightEdges:0,sampleCount:0,degreeTwoNodes:0,switchNodes:0,crossingNodes:0,
  pinnedNodes:0,explicitEndpoints:0,excludedEdges:excluded.size,unsupportedNodes:0,limitedGrades:0,
  sampleStep,chordError:tolerance.error,turnTolerance:tolerance.angle,maxLateralShift:0,lateralLimit:maxLateralShift,maxChordDeviation:0,nearStraightTolerance:.01,maxGrade:0,ambiguousFrames:0};
 const rawTangent=(edge,index)=>{
  const value=typeof endpointTangents==='function'?endpointTangents(edge,index,index?edge.b:edge.a):endpointTangents?.get?.(edge)?.[index];
  return value==null?null:vector(value);
 };
 for(const edge of graph.edges){
  if(excluded.has(edge)||edge.abandoned||horizontal(edge.a.position,edge.b.position)<EPS)continue;
  const chord=flatDirection(edge.a.position,edge.b.position),length=horizontal(edge.a.position,edge.b.position);
  const ends=[edge.a,edge.b].map((node,index)=>{
   const sign=index?-1:1,explicit=rawTangent(edge,index),direction=explicit?explicit.clone().setY(0).normalize():chord.clone();
   if(direction.dot(chord)<.05)throw new Error('A railway endpoint tangent reverses its source edge '+String(edge.wayId??'')+'/'+String(node.id));
   if(maxLateralShift===0&&direction.dot(chord)<1-1e-12)throw new Error('A non-collinear railway endpoint tangent requires a positive lateral limit');
   if(explicit)stats.explicitEndpoints++;
   const end={edge,node,index,sign,length,direction,outward:direction.clone().multiplyScalar(sign),explicit,group:null,side:1};
   if(!adjacency.has(node))adjacency.set(node,[]);adjacency.get(node).push(end);return end;
  });
  const baseHeights=[edge.a,edge.b].map(node=>crossingProfile?crossingProfile.baselineY(node):node.position.y);
  records.set(edge,{edge,chord,length,ends,baseHeights});
 }
 function share(rows){
  const axis=rows[0].outward.clone().sub(rows[1].outward).normalize();
  const group={axis,rows};groups.push(group);
  for(const row of rows){row.group=group;row.side=Math.sign(row.outward.dot(axis))||1;row.outward=axis.clone().multiplyScalar(row.side);row.direction=row.outward.clone().multiplyScalar(row.sign);}
 }
 for(const [node,rows]of adjacency){
  if(pinned.has(String(node.id))){stats.pinnedNodes++;continue;}
  // Explicit source/model frames are already deliberate. Do not rotate
  // their other incident endpoints as a side effect of an automatic pair.
  if(rows.some(row=>row.explicit)||rows.length<2)continue;
  if(rows.length===2){
   if(maxLateralShift>0&&compatible(rows[0].edge,rows[1].edge)&&rows[0].outward.dot(rows[1].outward)<-.25){share(rows);stats.degreeTwoNodes++;}
   else stats.unsupportedNodes++;
   continue;
  }
  if(maxLateralShift===0||rows.length>4){stats.unsupportedNodes++;continue;}
  let pair=null,dot=-.8;
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   const value=rows[i].outward.dot(rows[j].outward);
   if(compatible(rows[i].edge,rows[j].edge)&&value<dot){dot=value;pair=[rows[i],rows[j]];}
  }
  if(!pair){stats.unsupportedNodes++;continue;}
  const remaining=rows.filter(row=>!pair.includes(row));
  if(rows.length===3){
   const axis=pair[0].outward.clone().sub(pair[1].outward).normalize(),branch=remaining[0];
   if(compatible(pair[0].edge,branch.edge)&&Math.abs(branch.outward.dot(axis))>.82)pair.push(branch);
   share(pair);stats.switchNodes++;
  }else if(compatible(remaining[0].edge,remaining[1].edge)&&remaining[0].outward.dot(remaining[1].outward)<-.8){
   share(pair);share(remaining);stats.crossingNodes++;
  }else stats.unsupportedNodes++;
 }

 // Every control point projects strictly forward onto its source chord.
 // The Bezier is therefore a graph over that chord: it cannot loop, reverse
 // along the source direction or intersect itself, even between samples.
 for(const record of records.values()){
  const {edge,chord,length,ends}=record,a=edge.a.position.clone().setY(0),d=edge.b.position.clone().setY(0);
  const straight=ends.every(end=>end.direction.dot(chord)>1-1e-12);
  const reach=end=>{
   const sine=Math.abs(end.direction.x*chord.z-end.direction.z*chord.x);
   return Math.min(length/3,sine>EPS?maxLateralShift/sine:Infinity);
  };
  const b=a.clone().addScaledVector(ends[0].direction,reach(ends[0])),c=d.clone().addScaledVector(ends[1].direction,-reach(ends[1]));
  const evaluate=t=>({t,point:straight?a.clone().lerp(d,t):cubic(a,b,c,d,t),tangent:straight?chord.clone():cubicDirection(a,b,c,d,t)});
  const samples=straight?[evaluate(0),evaluate(1)]:sampleAdaptive(evaluate,tolerance);
  const distances=[0];for(let i=1;i<samples.length;i++)distances.push(distances.at(-1)+horizontal(samples[i-1].point,samples[i].point));
  record.evaluate=evaluate;record.samples=samples;record.distances=distances;record.run=distances.at(-1);record.horizontalStraight=straight;
  record.secant=(record.baseHeights[1]-record.baseHeights[0])/record.run;
 }
 // Shared monotone grades. At a crest, trough or bridge plateau the grade
 // is zero. At rising/falling joins the harmonic mean cannot create a new
 // extremum; the common cap guarantees monotonicity on every incident edge.
 for(const group of groups){
  const grades=group.rows.map(row=>records.get(row.edge).secant*row.sign*row.side);
  let slope=0;
  if(grades.every(g=>g>EPS)||grades.every(g=>g< -EPS)){
   const harmonic=grades.length/grades.reduce((sum,g)=>sum+1/Math.abs(g),0);
   slope=Math.sign(grades[0])*Math.min(harmonic,1.5*Math.min(...grades.map(Math.abs)));
  }
  group.slope=slope;
 }
 for(const record of records.values()){
  const {edge,ends,secant,run,baseHeights}=record;
  const grades=ends.map(end=>{
   let slope=end.group?end.group.slope*end.side*end.sign:end.explicit?end.explicit.y/Math.hypot(end.explicit.x,end.explicit.z):secant;
   const safe=Math.abs(secant)<EPS||slope*secant<0?0:Math.sign(secant)*Math.min(Math.abs(slope),1.5*Math.abs(secant));
   if(Math.abs(safe-slope)>EPS)stats.limitedGrades++;return safe;
  });
  const [m0,m1]=grades,minY=Math.min(...baseHeights),maxY=Math.max(...baseHeights);
  record.baseSample=s=>({height:clamp(hermite(baseHeights[0],baseHeights[1],m0,m1,run,s),minY,maxY),
   grade:hermiteGrade(baseHeights[0],baseHeights[1],m0,m1,run,s)});
  record.vertical=crossingProfile?.makeEdgeProfile(edge,{run,baseSample:record.baseSample})??null;
  record.displayGrades=record.vertical?[...record.vertical.initialGrades]:grades;
 }
 // Level-crossing profiles can have interior plateaus/valleys on a single
 // sparse OSM edge. Their actual endpoint grades, not the end-to-end secant,
 // give every compatible source junction a common vertical tangent.
 if(crossingProfile){
  for(const group of groups){
   if(!group.rows.some(row=>records.get(row.edge).vertical))continue;
   const grades=group.rows.map(row=>records.get(row.edge).displayGrades[row.index]*row.sign*row.side);
   let slope=0;
   if(grades.every(g=>g>EPS)||grades.every(g=>g< -EPS)){
    const harmonic=grades.length/grades.reduce((sum,g)=>sum+1/Math.abs(g),0);
    const cap=Math.min(...group.rows.map(row=>records.get(row.edge).vertical?.endpointGradeLimits[row.index]??1.5*Math.abs(records.get(row.edge).secant)));
    slope=Math.sign(grades[0])*Math.min(harmonic,cap);
   }
   for(const row of group.rows)records.get(row.edge).displayGrades[row.index]=slope*row.side*row.sign;
  }
  for(const record of records.values())if(record.vertical){
   for(const [i,end]of record.ends.entries())if(end.explicit)
    record.displayGrades[i]=end.explicit.y/Math.hypot(end.explicit.x,end.explicit.z);
   record.vertical.setEndpointGrades(record.displayGrades);
  }
 }
 for(const record of records.values()){
  const {edge,ends,run,evaluate,samples,distances,displayGrades,vertical}=record;
  const station=t=>{
   let lo=0,hi=samples.length-1;
   while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].t>t)hi=mid;else lo=mid;}
   return THREE.MathUtils.lerp(distances[lo],distances[hi],(t-samples[lo].t)/(samples[hi].t-samples[lo].t));
  };
  const elevation=t=>{
   const at=evaluate(t),s=station(t)/run;
   const profile=vertical?vertical.sample(s):record.baseSample(s);
   at.point.y=profile.height;at.tangent.y=profile.grade;at.tangent.normalize();return at;
  };
  // Preserve the horizontal subdivision knots used for arc length; only
  // add samples when the independent height profile needs more resolution.
  let boundaries=samples.map(at=>at.t);
  if(vertical){
   const parameter=s=>{
    const distance=s*run;let lo=0,hi=distances.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(distances[mid]>distance)hi=mid;else lo=mid;}
    return THREE.MathUtils.lerp(samples[lo].t,samples[hi].t,(distance-distances[lo])/(distances[hi]-distances[lo]));
   };
   boundaries=[...boundaries,...vertical.knots.map(parameter)].sort((a,b)=>a-b).filter((t,i,all)=>!i||t-all[i-1]>1e-12);
  }
  const final=[];
  for(let i=1;i<boundaries.length;i++)final.push(...sampleAdaptive(elevation,tolerance,boundaries[i-1],boundaries[i]).slice(i===1?0:1));
  final[0].point.copy(edge.a.position);final.at(-1).point.copy(edge.b.position);
  edge.surfacePoints=final.map(at=>at.point);
  edge.surfaceTangents=ends.map((end,i)=>end.direction.clone().setY(displayGrades[i]).normalize());
  edge.railSurfaceDirections=final.map(at=>at.tangent);
  edge.railSurfaceDirections[0].copy(edge.surfaceTangents[0]);edge.railSurfaceDirections.at(-1).copy(edge.surfaceTangents[1]);
  stats.edges++;stats.sampleCount+=final.length;
  // Report the actual displayed chords. Sub-tolerance analytic curvature
  // still permits exact seam frames without making a straight edge dense.
  if(final.length===2)stats.straightEdges++;else stats.curvedEdges++;
  const chord3=edge.b.position.clone().sub(edge.a.position),chordLength=chord3.length();let deviation=0;
  for(let i=0;i<final.length;i++){
   stats.maxLateralShift=Math.max(stats.maxLateralShift,pointLineDistance(final[i].point,edge.a.position,edge.b.position));
   deviation=Math.max(deviation,final[i].point.clone().sub(edge.a.position).cross(chord3).length()/chordLength);
   if(i)stats.maxGrade=Math.max(stats.maxGrade,Math.abs(final[i].point.y-final[i-1].point.y)/horizontal(final[i].point,final[i-1].point));
  }
  stats.maxChordDeviation=Math.max(stats.maxChordDeviation,deviation);
  if(deviation<stats.nearStraightTolerance)stats.nearStraightEdges++;
 }
 const directions=new Map(),globalDirections=new Map();
 function remember(map,position,tangent){
  const id=key(position),previous=map.get(id);
  if(previous===null)return;
  if(previous&&Math.abs(previous.dot(tangent))<1-1e-6){map.set(id,null);stats.ambiguousFrames++;}
  else if(!previous)map.set(id,tangent.clone());
 }
 for(const {edge}of records.values()){
  const id=String(edge.wayId??'');if(!directions.has(id))directions.set(id,new Map());
  edge.surfacePoints.forEach((p,i)=>{remember(directions.get(id),p,edge.railSurfaceDirections[i]);remember(globalDirections,p,edge.railSurfaceDirections[i]);});
 }
 const directionAt=(wayId=null)=>{
  const map=wayId==null?globalDirections:directions.get(String(wayId));
  return (point,fallback)=>{
   const tangent=map?.get(key(point));if(!tangent)return fallback;
   const result=tangent.clone();if(result.dot(fallback)<0)result.negate();return result;
  };
 };
 graph.railSurface=stats;
 return {stats,directionAt,
  endpointDirection(edge,node){const index=edge.a===node?0:edge.b===node?1:-1;if(index<0)throw new Error('The railway endpoint is not incident to this edge');return (edge.surfaceTangents?.[index]??flatDirection(edge.a.position,edge.b.position)).clone();}};
}

/** Build the train/source route from the EXACT same display chords as steel.
 * Source route ordering may oppose an individual way's a -> b orientation. */
export function graphRailRoutePoints(route){
 const nodes=route.nodes??route.nodeIds,edges=route.edges;
 if(!Array.isArray(nodes)||!Array.isArray(edges)||nodes.length!==edges.length+1)
  throw new Error('A railway route requires ordered source nodes and edges');
 const id=node=>String(node?.id??node),points=[];
 for(let i=0;i<edges.length;i++){
  const edge=edges[i],from=id(nodes[i]),to=id(nodes[i+1]);
  const forward=String(edge.a.id)===from&&String(edge.b.id)===to,reverse=String(edge.b.id)===from&&String(edge.a.id)===to;
  if(!forward&&!reverse)throw new Error('A railway route contains a disconnected source edge '+from+'/'+to);
  const source=edge.surfacePoints??[edge.a.position,edge.b.position],samples=forward?source:[...source].reverse();
  if(points.length&&points.at(-1).distanceTo(samples[0])>1e-7)throw new Error('A railway display route has an open seam '+from);
  for(const point of samples)if(!points.length||points.at(-1).distanceToSquared(point)>1e-18)points.push(point.clone());
 }
 if(!edges.length&&nodes[0]?.position)points.push(nodes[0].position.clone());
 return points;
}
