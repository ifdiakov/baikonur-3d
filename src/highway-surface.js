import * as THREE from 'three';

export const HIGHWAY_SURFACE_VERSION='continuous-highway-v1';
export const HIGHWAY_ASPHALT_COLOR=0x42494c;
export const HIGHWAY_ASPHALT_LIFT=.006;
export const HIGHWAY_SAMPLE_STEP=.65;
export const HIGHWAY_MARKINGS=Object.freeze({version:'bridge-continuous-markings-v1',yellowColor:0xe2b746,whiteColor:0xf0eee3,
 centerWidth:.055,centerOffset:.074,edgeWidth:.065,edgeInset:.22,lift:.017});
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const MAIN=new Set(['motorway','trunk']),HIGHWAY=new Set(['motorway','trunk','motorway_link','trunk_link']);

export const isHighwayRoad=tags=>HIGHWAY.has(tags?.highway);
export function createHighwayAsphaltMaterial(){
 const material=new THREE.MeshStandardMaterial({color:HIGHWAY_ASPHALT_COLOR,roughness:.96,metalness:0,side:THREE.DoubleSide});
 material.name='Трасса · асфальт виадука';
 material.userData.highwaySurfaceVersion=HIGHWAY_SURFACE_VERSION;
 return material;
}
export function createHighwayMarkingMaterial(color){
 const material=new THREE.MeshStandardMaterial({color,roughness:.72,metalness:0,side:THREE.DoubleSide,
  polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 material.name='Трасса · разметка виадука';material.userData.highwayMarkings=HIGHWAY_MARKINGS.version;
 return material;
}

// Clip at the exact architectural ownership planes, inserting boundary
// vertices instead of dropping complete sampled segments next to the bridge.
export function highwayRunsOutsideBridge(points,plan,wayId){
 if(!plan||!plan.sourceWayIds.includes(String(wayId)))return [points];
 const runs=[];let run=[];
 const flush=()=>{if(run.length>1)runs.push(run);run=[];};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],az=plan.local(a).z,bz=plan.local(b).z,breaks=[0,1];
  if(Math.abs(bz-az)>1e-10)for(const edge of [-plan.halfLength,plan.halfLength]){const t=(edge-az)/(bz-az);if(t>1e-9&&t<1-1e-9)breaks.push(t);}
  breaks.sort((a,b)=>a-b);
  for(let j=1;j<breaks.length;j++){
   const lo=breaks[j-1],hi=breaks[j],middle=az+(bz-az)*(lo+hi)/2;
   if(Math.abs(middle)<plan.halfLength-1e-9){flush();continue;}
   const start=a.clone().lerp(b,lo),end=a.clone().lerp(b,hi);
   if(!run.length||run.at(-1).distanceTo(start)>1e-8){flush();run.push(start);}
   run.push(end);
  }
 }
 flush();return runs;
}

const other=(edge,node)=>edge.a===node?edge.b:edge.a;
const horizontal=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
function outward(edge,node){return other(edge,node).position.clone().sub(node.position).setY(0).normalize();}
function grade(edge,node){const end=other(edge,node).position;return (end.y-node.position.y)/(horizontal(node.position,end)||1);}
function harmonic(a,b,ha,hb){
 if(a*b<=0)return 0;
 const w1=2*hb+ha,w2=hb+2*ha;
 return (w1+w2)/(w1/a+w2/b);
}

// One axis at a shared through-road node gives both adjacent ways exactly
// the same tangent. A joining ramp inherits that axis rather than cutting
// across the highway at the angle of its last sparse OSM segment.
function throughPair(node){
 const edges=node.edges.filter(e=>MAIN.has(e.tags.highway));
 if(edges.length<2)return null;
 let pair=null,dot=Infinity;
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const d=outward(edges[i],node).dot(outward(edges[j],node));
  if(d<dot){dot=d;pair=[edges[i],edges[j]];}
 }
 return dot<-.2?pair:null;
}
function endpoint(edge,node){
 const direction=outward(edge,node),pair=throughPair(node);
 if(pair&&(MAIN.has(edge.tags.highway)||!node.edges.some(e=>e!==edge&&e.wayId===edge.wayId))){
  const [a,b]=pair,axis=outward(a,node).sub(outward(b,node)).normalize(),sign=axis.dot(direction)<0?-1:1;
  const ha=horizontal(node.position,other(a,node).position),hb=horizontal(node.position,other(b,node).position);
  return {direction:axis.multiplyScalar(sign),slope:harmonic(-grade(b,node),grade(a,node),hb,ha)*sign,
   reach:Math.min(ha,hb),peer:sign>0?b:a};
 }
 const choices=node.edges.filter(e=>e!==edge&&isHighwayRoad(e.tags));
 choices.sort((a,b)=>Number(b.wayId===edge.wayId)-Number(a.wayId===edge.wayId)||outward(a,node).dot(direction)-outward(b,node).dot(direction));
 const peer=choices[0];
 if(!peer)return {direction,slope:grade(edge,node),reach:Infinity,peer:null};
 const hp=horizontal(node.position,other(peer,node).position),he=horizontal(node.position,other(edge,node).position);
 const axis=direction.clone().sub(outward(peer,node)).normalize();
 return {direction:axis.lengthSq()?axis:direction,slope:harmonic(-grade(peer,node),grade(edge,node),hp,he),reach:hp,peer};
}

function curveSegment(a,b,da,db,step){
 const length=horizontal(a,b),curve=new THREE.CubicBezierCurve3(a,a.clone().addScaledVector(da,length/3),b.clone().addScaledVector(db,-length/3),b);
 const count=Math.max(4,Math.ceil(length/step));
 return Array.from({length:count+1},(_,i)=>curve.getPoint(i/count));
}

/** Display/traffic geometry only. Source node positions, OSM node IDs,
 * source edges, route costs and connected components stay unchanged. */
export function smoothHighwayGraph(graph){
 let edgeCount=0,sampleCount=0,maxLateralShift=0;
 for(const edge of graph.edges){
  if(!isHighwayRoad(edge.tags))continue;
  const a=edge.a.position,b=edge.b.position,h=horizontal(a,b);if(h<1e-7)continue;
  const start=endpoint(edge,edge.a),end=endpoint(edge,edge.b),chord=b.clone().sub(a).setY(0).normalize();
  const reachA=Math.min(h*.3,edge.width*2.5,start.reach*.35),reachB=Math.min(h*.3,edge.width*2.5,end.reach*.35);
  const a0=a.clone().setY(0),b0=b.clone().setY(0),insideA=a0.clone().addScaledVector(chord,reachA),insideB=b0.clone().addScaledVector(chord,-reachB);
  const points=curveSegment(a0,insideA,start.direction,chord,HIGHWAY_SAMPLE_STEP);
  const middle=Math.max(1,Math.ceil(insideA.distanceTo(insideB)/HIGHWAY_SAMPLE_STEP));
  for(let i=1;i<=middle;i++)points.push(insideA.clone().lerp(insideB,i/middle));
  points.push(...curveSegment(insideB,b0,chord,end.direction.clone().negate(),HIGHWAY_SAMPLE_STEP).slice(1));
  const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances[i-1]+points[i].distanceTo(points[i-1]));
  const length=distances.at(-1),secant=(b.y-a.y)/length;
  let m0=start.slope,m1=-end.slope;
  // Shape-preserving grades never dip below either endpoint or overshoot a
  // bridge plateau. This prevents smooth curves from reducing clearance.
  if(Math.abs(secant)<1e-10)m0=m1=0;
  else{
   if(m0*secant<0)m0=0;if(m1*secant<0)m1=0;
   const magnitude=Math.hypot(m0/secant,m1/secant);
   if(magnitude>3){const scale=3/magnitude;m0*=scale;m1*=scale;}
  }
  points.forEach((p,i)=>{
   const t=distances[i]/length,t2=t*t,t3=t2*t;
   p.y=(2*t3-3*t2+1)*a.y+(t3-2*t2+t)*length*m0+(-2*t3+3*t2)*b.y+(t3-t2)*length*m1;
   const shift=Math.abs((p.x-a.x)*chord.z-(p.z-a.z)*chord.x);maxLateralShift=Math.max(maxLateralShift,shift);
  });
  points[0].copy(a);points.at(-1).copy(b);
  edge.surfacePoints=points;edge.surfaceTangents=[start.direction.clone().add(V(0,m0,0)).normalize(),end.direction.clone().negate().add(V(0,m1,0)).normalize()];
  edgeCount++;sampleCount+=points.length;
 }
 graph.highwaySurface={version:HIGHWAY_SURFACE_VERSION,edgeCount,sampleCount,maxLateralShift,sampleStep:HIGHWAY_SAMPLE_STEP,sourceTopologyPreserved:true};
 graph.highwaySurfaceHeight=createHighwayGradeSampler(graph);
 return graph.highwaySurface;
}

/** Blend a merging ramp onto the actual through-lane grade across the entire
 * pavement width. This is a display height only: no source node is rewritten.
 * A spatial index keeps the shared renderer/vehicle sampler inexpensive. */
export function createHighwayGradeSampler(graph){
 const cells=new Map(),cellSize=18,margin=15;
 for(const edge of graph.edges){
  if(!MAIN.has(edge.tags.highway))continue;
  const ps=edge.surfacePoints||[edge.a.position,edge.b.position];
  for(let i=1;i<ps.length;i++){
   const item={a:ps[i-1],b:ps[i],width:edge.width};
   for(let x=Math.floor((Math.min(item.a.x,item.b.x)-margin)/cellSize);x<=Math.floor((Math.max(item.a.x,item.b.x)+margin)/cellSize);x++)
    for(let z=Math.floor((Math.min(item.a.z,item.b.z)-margin)/cellSize);z<=Math.floor((Math.max(item.a.z,item.b.z)+margin)/cellSize);z++){
     const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);
    }
  }
 }
 const nearest=p=>{
  let best=null,distance=Infinity;
  for(const segment of cells.get(Math.floor(p.x/cellSize)+':'+Math.floor(p.z/cellSize))||[]){
   const {a,b}=segment,dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
   const y=a.y+(b.y-a.y)*t,d=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
   if(d<distance){distance=d;best={y,width:segment.width,distance:d};}
  }
  return best;
 };
 const sample=(p,width=3.6)=>{
  const best=nearest(p);
  if(!best)return p.y;
  const core=(best.width+width)/2+.2,outer=core+Math.max(2,width*1.6);
  // Both the distance and the vertical compatibility fade continuously.
  // Rejecting candidates with a hard one-unit height cutoff made the
  // nearest segment jump along the main road on the tight interchange loops.
  const gradeWeight=1-THREE.MathUtils.smoothstep(Math.abs(p.y-best.y),.5,1.4);
  const weight=(1-THREE.MathUtils.smoothstep(best.distance,core,outer))*gradeWeight;
  return THREE.MathUtils.lerp(p.y,best.y,weight);
 };
 sample.nearest=nearest;return sample;
}
