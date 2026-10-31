import * as THREE from 'three';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const horizontal=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const ease=t=>t*t*(3-2*t);
const clamp=THREE.MathUtils.clamp;
const other=(edge,node)=>edge.a===node?edge.b:edge.a;
const direction=(a,b)=>b.clone().sub(a).setY(0).normalize();
const dirt=tags=>tags.highway==='track'||['unpaved','gravel','ground','dirt','sand'].includes(tags.surface);
const highway=tags=>['trunk','motorway','trunk_link','motorway_link'].includes(tags.highway);
const grade=(edge,node)=>(other(edge,node).position.y-node.position.y)/Math.max(1e-8,horizontal(node.position,other(edge,node).position));
const harmonic=(a,b)=>a*b>0?2*a*b/(a+b):0;

function sampleCubic(a,b,da,db,reachA,reachB,step){
 const curve=new THREE.CubicBezierCurve3(a,a.clone().addScaledVector(da,reachA),b.clone().addScaledVector(db,-reachB),b);
 const count=Math.max(4,Math.ceil(curve.getLength()/step));
 return Array.from({length:count+1},(_,i)=>curve.getPoint(i/count));
}

/** Source IDs, source positions and route costs remain unchanged. A compatible
 * degree-two junction has one shared display tangent on both incident edges,
 * including where a road is split into separate OSM ways. */
export function smoothLocalRoadGraph(graph,{sampleStep=.5}={}){
 const endpoints=new Map(),nodes=[];
 for(const node of graph.nodes.values()){
  const edges=node.edges.filter(edge=>!edge.abandoned);
  if(edges.length!==2||edges.some(edge=>highway(edge.tags)))continue;
  const [a,b]=edges;
  if(Math.abs(a.width-b.width)>.01||dirt(a.tags)!==dirt(b.tags)||
    (a.tags.layer||'0')!==(b.tags.layer||'0')||Boolean(a.tags.bridge&&a.tags.bridge!=='no')!==Boolean(b.tags.bridge&&b.tags.bridge!=='no'))continue;
  const da=direction(node.position,other(a,node).position),db=direction(node.position,other(b,node).position);
  if(da.dot(db)>.35)continue;
  const axis=da.clone().sub(db).normalize(),slope=harmonic(grade(a,node),-grade(b,node));
  endpoints.set(node.id,{edges,a,axis,slope,reach:Math.min(horizontal(node.position,other(a,node).position),horizontal(node.position,other(b,node).position))});
  if(da.dot(db)>-.9995)nodes.push(String(node.id));
 }
 let edgeCount=0,sampleCount=0,maxLateralShift=0;
 for(const edge of graph.edges){
  if(highway(edge.tags)||edge.abandoned)continue;
  const start=endpoints.get(edge.a.id),end=endpoints.get(edge.b.id);
  if(!start&&!end)continue;
  const a=edge.a.position,b=edge.b.position,length=horizontal(a,b);if(length<1e-6)continue;
  const chord=direction(a,b),axis=(entry,node)=>{
   if(!entry)return chord.clone();
   const d=entry.axis.clone();if(d.dot(chord)<0)d.negate();return d;
  };
  const da=axis(start,edge.a),db=axis(end,edge.b);
  if(da.dot(chord)>.99995&&db.dot(chord)>.99995)continue;
  // Confine the easing to a few road widths; long straight source intervals
  // keep their exact alignment and do not become large wandering splines.
  const reachA=Math.min(length*.28,edge.width*3,(start?.reach??length)*.32);
  const reachB=Math.min(length*.28,edge.width*3,(end?.reach??length)*.32);
  const a0=a.clone().setY(0),b0=b.clone().setY(0),innerA=a0.clone().addScaledVector(chord,reachA),innerB=b0.clone().addScaledVector(chord,-reachB);
  // Dense source nodes on a bend need distributed curvature. Three short
  // turn/straight/turn pieces can fold the inside pavement and paint back
  // over themselves even when the centre line looks smooth. Keep the exact
  // source endpoints and shared frames, bounded to the source corridor.
  const continuous=length<=edge.width*2.5?sampleCubic(a0,b0,da,db,length/3,length/3,Math.min(sampleStep,length/8)):null;
  const withinCorridor=continuous?.every(p=>Math.abs((p.x-a.x)*chord.z-(p.z-a.z)*chord.x)<edge.width*.15);
  const points=withinCorridor?continuous:sampleCubic(a0,innerA,da,chord,reachA/3,reachA/3,sampleStep);
  if(!withinCorridor){
   const middle=Math.max(1,Math.ceil(innerA.distanceTo(innerB)/1.4));
   for(let i=1;i<=middle;i++)points.push(innerA.clone().lerp(innerB,i/middle));
   points.push(...sampleCubic(innerB,b0,chord,db,reachB/3,reachB/3,sampleStep).slice(1));
  }
  const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative.at(-1)+horizontal(points[i-1],points[i]));
  const total=cumulative.at(-1),secant=(b.y-a.y)/total;
  let m0=start?start.slope*(start.axis.dot(chord)<0?-1:1):secant,m1=end?end.slope*(end.axis.dot(chord)<0?-1:1):secant;
  if(Math.abs(secant)<1e-10)m0=m1=0;
  else {if(m0*secant<0)m0=0;if(m1*secant<0)m1=0;const magnitude=Math.hypot(m0/secant,m1/secant);if(magnitude>3){m0*=3/magnitude;m1*=3/magnitude;}}
  points.forEach((p,i)=>{const t=cumulative[i]/total,t2=t*t,t3=t2*t;
   p.y=(2*t3-3*t2+1)*a.y+(t3-2*t2+t)*total*m0+(-2*t3+3*t2)*b.y+(t3-t2)*total*m1;
   maxLateralShift=Math.max(maxLateralShift,Math.abs((p.x-a.x)*chord.z-(p.z-a.z)*chord.x));
  });
  points[0].copy(a);points.at(-1).copy(b);edge.surfacePoints=points;
  edge.surfaceTangents=[da.clone().add(V(0,m0,0)).normalize(),db.clone().add(V(0,m1,0)).normalize()];
  edgeCount++;sampleCount+=points.length;
 }
 return graph.localRoadSurface={version:'shared-local-road-curves-v1',edgeCount,sampleCount,smoothedNodeIds:nodes,maxLateralShift,sampleStep,sourceTopologyPreserved:true};
}

/** Smooth one bounded museum driveway through deliberate clearance anchors.
 * Horizontal endpoint directions and zero-slope width/height transitions are
 * shared by its rendered pavement, markings metadata and the public path. */
export function createAccessTransition({start,end,startTangent,endTangent,anchors=[],startWidth=1.8,endWidth=1.8,sampleStep=.45,startSlope=0,endSlope=0}){
 const clearanceAnchors=[...anchors],lead=startTangent.clone().setY(0).normalize(),minimumLead=Math.max(startWidth,endWidth)*4;
 // A clearance arc may begin centimetres behind an already valid source
 // attachment. Such a redundant anchor makes a tiny hairpin despite matching
 // mathematical endpoint derivatives. Enter the retained arc farther ahead.
 while(clearanceAnchors.length&&(horizontal(start,clearanceAnchors[0])<minimumLead||clearanceAnchors[0].clone().sub(start).setY(0).dot(lead)<=0))clearanceAnchors.shift();
 const nodes=[start,...clearanceAnchors,end].filter((p,i,all)=>!i||horizontal(p,all[i-1])>1e-5).map(p=>p.clone().setY(0));
 const tangents=nodes.map((p,i)=>i===0?startTangent.clone().setY(0).normalize():i===nodes.length-1?endTangent.clone().setY(0).normalize():direction(nodes[i-1],nodes[i+1]));
 const points=[];
 for(let i=1;i<nodes.length;i++){
  const a=nodes[i-1],b=nodes[i],length=horizontal(a,b),before=i>1?horizontal(nodes[i-2],a):length,after=i<nodes.length-1?horizontal(b,nodes[i+1]):length;
  const reachA=Math.min(24,length*.36,before*.36),reachB=Math.min(24,length*.36,after*.36);
  points.push(...sampleCubic(a,b,tangents[i-1],tangents[i],reachA,reachB,sampleStep).slice(i===1?0:1));
 }
 const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+horizontal(points[i-1],points[i]));
 const length=distances.at(-1),secant=(end.y-start.y)/(length||1);
 let m0=startSlope,m1=endSlope;
 if(Math.abs(secant)<1e-10)m0=m1=0;
 else {if(m0*secant<0)m0=0;if(m1*secant<0)m1=0;const magnitude=Math.hypot(m0/secant,m1/secant);if(magnitude>3){m0*=3/magnitude;m1*=3/magnitude;}}
 points.forEach((p,i)=>{const t=distances[i]/length,t2=t*t,t3=t2*t;
  p.y=(2*t3-3*t2+1)*start.y+(t3-2*t2+t)*length*m0+(-2*t3+3*t2)*end.y+(t3-t2)*length*m1;
 });
 points[0].copy(start);points.at(-1).copy(end);
 function distanceAt(p){let best=Infinity,at=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1),d=(p.x-a.x-dx*t)**2+(p.z-a.z-dz*t)**2;
   if(d<best){best=d;at=distances[i-1]+(distances[i]-distances[i-1])*t;}}
  return at;
 }
 const widthAt=p=>THREE.MathUtils.lerp(startWidth,endWidth,ease(clamp(distanceAt(p)/length,0,1)));
 return {points,length,startWidth,endWidth,widthAt,startTangent:tangents[0],endTangent:tangents.at(-1),
  stats:{version:'c1-museum-access-v1',length,startWidth,endWidth,sourceGap:points[0].distanceTo(start),gateGap:points.at(-1).distanceTo(end),samples:points.length}};
}
