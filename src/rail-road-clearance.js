import * as THREE from 'three';

// Display corrections only. OSM node/way identities and source GeoJSON are immutable.
export const RAIL_ROAD_CLEARANCE_VERSION='rail-road-clearance-v5-road-junction-caps';
const CELL=24,EPS=1e-8,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const key=(x,z)=>Math.floor(x/CELL)+':'+Math.floor(z/CELL);
const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const coordinates=p=>Array.isArray(p)?{x:p[0],y:p[1],z:p[2]}:p;

export function buildRailRoadIndex(roads,{railHalfWidth=.224}={}){
 const cells=new Map(),segments=[],maxWidth=Math.max(3.6,...roads.map(r=>Number(r.width)||0));
 const padding=1.5*maxWidth+railHalfWidth+2;
 function put(row){
  for(let x=Math.floor((Math.min(row.a.x,row.b.x)-padding)/CELL);x<=Math.floor((Math.max(row.a.x,row.b.x)+padding)/CELL);x++)
   for(let z=Math.floor((Math.min(row.a.z,row.b.z)-padding)/CELL);z<=Math.floor((Math.max(row.a.z,row.b.z)+padding)/CELL);z++){
    const id=x+':'+z;if(!cells.has(id))cells.set(id,[]);cells.get(id).push(row);
   }
 }
 for(const road of roads){
  if(road.abandoned||road.tags?.highway==='proposed')continue;
  const points=road.points||[],width=Math.max(.1,Number(road.width)||2);
  for(let i=1;i<points.length;i++){
   const a=coordinates(points[i-1]),b=coordinates(points[i]),dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
   if(len2<EPS)continue;
   const row={a,b,dx,dz,len2,len:Math.sqrt(len2),width,roadId:String(road.wayId??road.id??'road')};
   segments.push(row);put(row);
  }
 }
 const queryPoint=p=>cells.get(key(p.x,p.z))||[];
 function querySegment(a,b){
  const out=new Set();
  for(let x=Math.floor((Math.min(a.x,b.x)-.1)/CELL);x<=Math.floor((Math.max(a.x,b.x)+.1)/CELL);x++)
   for(let z=Math.floor((Math.min(a.z,b.z)-.1)/CELL);z<=Math.floor((Math.max(a.z,b.z)+.1)/CELL);z++)
    for(const row of cells.get(x+':'+z)||[])out.add(row);
  return out;
 }
 return {cells,segments,padding,railHalfWidth,queryPoint,querySegment};
}

function intersection(a,b,road){
 const dx=b.x-a.x,dz=b.z-a.z,den=dx*road.dz-dz*road.dx;
 const sine=Math.abs(den)/(Math.hypot(dx,dz)*road.len||1);
 if(sine<.20||Math.abs(den)<EPS)return null;
 const ox=road.a.x-a.x,oz=road.a.z-a.z,t=(ox*road.dz-oz*road.dx)/den,u=(ox*dz-oz*dx)/den;
 if(t<-.00001||t>1.00001||u<-.00001||u>1.00001)return null;
 return {x:a.x+clamp(t)*dx,z:a.z+clamp(t)*dz,y:road.a.y+clamp(u)*(road.b.y-road.a.y),
  tangentX:road.dx/road.len,tangentZ:road.dz/road.len,width:road.width,sine,roadId:road.roadId};
}
export function findRailRoadCrossings(paths,index,{deduplicate=7}={}){
 const crossings=[];
 for(const path of paths){
  if(path.abandoned)continue;
  const ps=path.points||[];
  for(let i=1;i<ps.length;i++){
   const a=coordinates(ps[i-1]),b=coordinates(ps[i]);if(near(a,b)<EPS)continue;
   for(const road of index.querySegment(a,b)){
    const hit=intersection(a,b,road);if(!hit)continue;
    const prior=crossings.find(p=>Math.hypot(p.x-hit.x,p.z-hit.z)<Math.max(deduplicate,hit.width*1.6));
    if(prior){prior.width=Math.max(prior.width,hit.width);continue;}
    hit.radius=Math.max(3,(hit.width/2+index.railHalfWidth+.4)/hit.sine+2);
    crossings.push(hit);
   }
  }
 }
 return crossings;
}

// The centreline is moved only beside a road. In the crossing envelope the
// original intersection is fixed and the rail grade is lifted over asphalt.
export function separateRailGraphFromRoads({railGraph,roads,excludedEdges=new Set(),pinnedNodes=[],headY=.077,railHalfWidth=.224}){
 const index=buildRailRoadIndex(roads,{railHalfWidth}),paths=railGraph.edges
  .filter(e=>!e.abandoned&&!excludedEdges.has(e))
  .map(e=>({points:e.surfacePoints??[e.a.position,e.b.position]}));
 const crossings=findRailRoadCrossings(paths,index);
 // Long OSM railway chords can cross a short road between their two endpoints.
 // Insert knots ONLY in railway intervals near road corridors. The same knots
 // feed rendering, the train route and the height/offset solver.
 const movable=railGraph.edges.filter(e=>!e.abandoned&&!excludedEdges.has(e));
 let addedSamples=0;
 for(const edge of movable){
  const source=edge.surfacePoints??[edge.a.position,edge.b.position],sampled=[source[0]];
  for(let i=1;i<source.length;i++){
   const a=source[i-1],b=source[i],length=near(a,b);
   if(length>4&&index.querySegment(a,b).size){
    const parts=Math.ceil(length/4);
    for(let j=1;j<parts;j++)sampled.push(a.clone().lerp(b,j/parts));
    addedSamples+=parts-1;
   }
   sampled.push(b);
  }
  edge.surfacePoints=sampled;
 }
 const pinned=[...pinnedNodes];
 for(const edge of excludedEdges){pinned.push(edge.a.position,edge.b.position);}
 // A level crossing relaxes separation on its own railway edge only.
 // The old global crossing neighbourhood also pulled unrelated nearby rails
 // onto the asphalt.
 const crossingByPoint=new Map(),positions=new Set();
 for(const edge of movable){
  const own=findRailRoadCrossings([{points:edge.surfacePoints}],index);
  for(const p of [edge.a.position,edge.b.position,...edge.surfacePoints]){
   positions.add(p);
   for(const hit of own){
    if(near(p,hit)>hit.radius+7)continue;
    const list=crossingByPoint.get(p)||[];list.push(hit);crossingByPoint.set(p,list);
   }
  }
 }
 const shiftAt=p=>{
  let best=null;
  for(const road of index.queryPoint(p)){
   const t=clamp(((p.x-road.a.x)*road.dx+(p.z-road.a.z)*road.dz)/road.len2);
   const x=road.a.x+t*road.dx,z=road.a.z+t*road.dz;
   const distance=Math.hypot(p.x-x,p.z-z),target=road.width*1.5+railHalfWidth+.12;
   // Crossing exemptions are specific to the intersected road. A crossing
   // of one road at a junction does not waive clearance from the others.
   const exempt=(crossingByPoint.get(p)||[]).some(hit=>
    hit.roadId===road.roadId&&near(p,hit)<hit.radius+7);
   const intrusion=exempt?0:target-distance;
   if(intrusion<=1e-6||best&&intrusion<=best.intrusion)continue;
   // At a road-way seam the nearest point is often the segment endpoint.
   // A fixed segment normal then kicks the rail sideways towards the NEXT
   // segment, producing the sawtooth and asphalt overlaps seen on the map.
   // Use a radial escape at endpoint caps, a normal only on the interior.
   const vx=p.x-x,vz=p.z-z;
   const sign=Math.sign(road.dx*vz-road.dz*vx)||1;
   const radial=Math.hypot(vx,vz),cap=t<.001||t>.999;
   const nx=cap&&radial>1e-6?vx/radial:-road.dz/road.len*sign;
   const nz=cap&&radial>1e-6?vz/radial:road.dx/road.len*sign;
   best={intrusion,dx:nx,dz:nz,roadId:road.roadId};
  }
  let weight=1,y=p.y;
  for(const hit of crossingByPoint.get(p)||[]){
   const d=near(p,hit);
   // Do not suppress the correction for other roads at this intersection.
   // That separate road-specific exemption is handled above.
   const top=hit.y+.014-headY;
   if(top>p.y){
    const span=Math.max(90,1.875*(top-p.y)/.08);
    y=Math.max(y,p.y+(top-p.y)*(1-smooth((d-hit.radius)/span)));
   }
  }
  for(const node of pinned){
   const d=near(p,node);
   if(d<28)weight=Math.min(weight,smooth((d-6)/22));
  }
  return {dx:(best?.dx||0)*(best?.intrusion||0)*weight,
   dz:(best?.dz||0)*(best?.intrusion||0)*weight,y};
 };
 let displaced=0,maxShift=0,raised=0,iterations=0;
 const displacement=new Map(),samples=[...positions];
 // Iterative projection resolves roads on either side of a rail, which a
 // single pass cannot do. All positions move synchronously within each pass.
 for(let pass=0;pass<6;pass++){
  const shifts=samples.map(p=>({p,shift:shiftAt(p)}));let changed=false;
  for(const {p,shift}of shifts){
   const dist=Math.hypot(shift.dx,shift.dz);
   if(dist>1e-6){
    p.x+=shift.dx;p.z+=shift.dz;changed=true;
    if(!displacement.has(p))displaced++;
    displacement.set(p,(displacement.get(p)||0)+dist);
    maxShift=Math.max(maxShift,displacement.get(p));
   }
   if(shift.y>p.y+1e-6){p.y=shift.y;raised++;changed=true;}
  }
  iterations++;
  if(!changed)break;
 }
 const residualIntrusions=samples.filter(p=>{
  const shift=shiftAt(p);return Math.hypot(shift.dx,shift.dz)>.03;
 }).length;
 // Finish each generated rail line with a conservative geometric fairing.
 // The road-clearance projector can leave sawtooth offsets even when every
 // point clears the asphalt. Smooth only ordinary straight-through samples:
 // never touch a switch, crossing, station/model port, or source endpoint.
 const nodePositions=new Set([...railGraph.nodes.values()].map(node=>node.position));
 const crossingNear=p=>(crossingByPoint.get(p)||[]).some(hit=>near(p,hit)<hit.radius+9);
 const clearanceAt=p=>{
  let margin=Infinity;
  for(const road of index.queryPoint(p)){
   const t=clamp(((p.x-road.a.x)*road.dx+(p.z-road.a.z)*road.dz)/road.len2);
   const d=Math.hypot(p.x-(road.a.x+t*road.dx),p.z-(road.a.z+t*road.dz));
   margin=Math.min(margin,d-(road.width*1.5+railHalfWidth+.12));
  }
  return margin;
 };
 let polishedSamples=0;
 for(let pass=0;pass<4;pass++){
  const proposed=new Map();
  for(const edge of movable){
   const points=edge.surfacePoints||[];
   for(let i=1;i<points.length-1;i++){
    const p=points[i],before=points[i-1],after=points[i+1];
    if(nodePositions.has(p)||crossingNear(p)||pinned.some(node=>near(p,node)<28))continue;
    const l=near(before,p),r=near(after,p);
    if(l<.04||r<.04)continue;
    // Arc-length weighted interpolant has no tendency to pull long-short
    // pairs into an artificial bend.
    const t=l/(l+r),tx=before.x+(after.x-before.x)*t,tz=before.z+(after.z-before.z)*t;
    const dx=(tx-p.x)*.45,dz=(tz-p.z)*.45,length=Math.hypot(dx,dz);
    if(length<.015)continue;
    const scale=Math.min(1,1.5/length),q={x:p.x+dx*scale,y:p.y,z:p.z+dz*scale};
    if(clearanceAt(q)<-.025||clearanceAt({x:(p.x+q.x)/2,z:(p.z+q.z)/2})<-.025)continue;
    proposed.set(p,q);
   }
  }
  if(!proposed.size)break;
  for(const [p,q] of proposed){p.x=q.x;p.z=q.z;polishedSamples++;}
 }
 // Keep exact source-node seams, including a way boundary that owns its
 // first/last surface point as a separate cloned Vector3.
 for(const edge of movable)if(edge.surfacePoints?.length){
  edge.surfacePoints[0].copy(edge.a.position);edge.surfacePoints.at(-1).copy(edge.b.position);
 }
 return {version:RAIL_ROAD_CLEARANCE_VERSION,roadSegments:index.segments.length,crossingCount:crossings.length,
  displacedPoints:displaced,raisedPoints:raised,addedSamples,maxLateralShift:maxShift,iterations,residualIntrusions,polishedSamples,
  requiredEdgeClearance:'road width',sourceWayIdsPreserved:true,crossings};
}

/**
 * Straighten the uninterrupted southbound main line opposite pad 5.
 * A point-wise road avoidance pass can make the sampled rail zigzag at road
 * joints. Replace ONLY the display samples within this OSM edge by a chord
 * when the complete replacement clears every asphalt corridor. Switches and
 * source-node endpoints remain anchored.
 */
export function straightenPad5Rail({railGraph,roads,railHalfWidth=.224}={}){
 const index=buildRailRoadIndex(roads,{railHalfWidth}),wayIds=new Set(['37543646']);
 const candidates=railGraph.edges.filter(e=>wayIds.has(String(e.wayId))&&!e.abandoned);
 let straightened=0,blocked=0;
 function clearance(p){
  for(const road of index.queryPoint(p)){
   const t=clamp(((p.x-road.a.x)*road.dx+(p.z-road.a.z)*road.dz)/road.len2);
   if(Math.hypot(p.x-road.a.x-t*road.dx,p.z-road.a.z-t*road.dz)<road.width*1.5+railHalfWidth+.12)return false;
  }
  return true;
 }
 for(const edge of candidates){
  const a=edge.a.position,b=edge.b.position;
  // At museum scale, this is the straight southbound track beside the main
  // road (site 5 sits at map x=704, y=550; the track is near map x=621).
  const mapY=p=>p.z/3.4+522.5,mapX=p=>p.x/3.4+650;
  if([a,b].some(p=>mapX(p)<610||mapX(p)>630)||Math.min(mapY(a),mapY(b))<545||Math.max(mapY(a),mapY(b))>605)continue;
  const points=edge.surfacePoints||[];
  if(points.length<3)continue;
  const line=points.map((p,i)=>{if(!i||i===points.length-1)return p;
   const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
   const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(len||1));
   return new THREE.Vector3(a.x+dx*t,p.y,a.z+dz*t);
  });
  // Check the entire new chord at closely spaced points, not only vertices.
  let valid=true;
  const count=Math.max(2,Math.ceil(near(a,b)/.75));
  for(let i=0;i<=count;i++)if(!clearance(a.clone().lerp(b,i/count))){valid=false;break;}
  if(!valid){blocked++;continue;}
  edge.surfacePoints=line;straightened++;
 }
 return {version:'pad5-direct-rail-v1',straightened,blocked,sourceWays:[...wayIds]};
}

/**
 * Render-only circular corner fillets for continuous rails.
 * The original topology, switches, model ports and true crossings are fixed.
 * A fillet is rejected whenever its new swept chord violates asphalt clearance.
 */
export function roundRailCorners(points,{roads=[],index=null,protectedPoints=[],radius=2.8,radiusAt=null,railHalfWidth=.224}={}){
 if(!Array.isArray(points)||points.length<3)return points;
 const roadIndex=index||buildRailRoadIndex(roads,{railHalfWidth});
 const fixed=p=>protectedPoints.some(q=>near(p,q)<.035);
 const clear=p=>{
  for(const road of roadIndex.queryPoint(p)){
   const t=clamp(((p.x-road.a.x)*road.dx+(p.z-road.a.z)*road.dz)/road.len2);
   if(Math.hypot(p.x-road.a.x-t*road.dx,p.z-road.a.z-t*road.dz)<road.width*1.5+railHalfWidth+.12-.025)return false;
  }
  return true;
 };
 const rounded=[points[0]];
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],p=points[i],b=points[i+1],l=near(a,p),r=near(p,b);
  if(l<.3||r<.3||fixed(p)){rounded.push(p);continue;}
  const ax=(p.x-a.x)/l,az=(p.z-a.z)/l,bx=(b.x-p.x)/r,bz=(b.z-p.z)/r;
  const dot=clamp(ax*bx+az*bz,-1,1),turn=Math.acos(dot);
  if(turn<.065||turn>1.6){rounded.push(p);continue;}
  // Tangent length for a circular turn: R * tan(turn/2). Limit it to
  // adjoining segments, so every fillet is monotone and cannot loop.
  const localRadius=radiusAt?Math.max(.2,radiusAt(p)):radius;
  const tangent=Math.min(localRadius*Math.tan(turn/2),l*.42,r*.42);
  if(tangent<.09){rounded.push(p);continue;}
  const entry=new THREE.Vector3(p.x-ax*tangent,p.y-(p.y-a.y)*tangent/l,p.z-az*tangent);
  const exit=new THREE.Vector3(p.x+bx*tangent,p.y+(b.y-p.y)*tangent/r,p.z+bz*tangent);
  // Exact circular fillet, tangent to both straight segments. A quadratic
  // Bezier through the vertex was not circular and retained a visible kink.
  const side=Math.sign(ax*bz-az*bx)||1,actualRadius=tangent/Math.tan(turn/2);
  const cx=entry.x-az*side*actualRadius,cz=entry.z+ax*side*actualRadius;
  const start=Math.atan2(entry.z-cz,entry.x-cx);
  const count=Math.max(6,Math.ceil(turn/.045));
  const samples=Array.from({length:count+1},(_,j)=>{
   const t=j/count,angle=start+side*turn*t;
   return new THREE.Vector3(cx+Math.cos(angle)*actualRadius,
    THREE.MathUtils.lerp(entry.y,exit.y,t),
    cz+Math.sin(angle)*actualRadius);
  });
  // Include all intervals, not merely sample points: the rail has a width.
  let safe=true;
  for(let j=0;j<samples.length;j++){
   if(!clear(samples[j])||(j&& !clear(samples[j-1].clone().lerp(samples[j],.5)))){safe=false;break;}
  }
  if(!safe){rounded.push(p);continue;}
  rounded.push(...samples);
 }
 rounded.push(points.at(-1));
 return rounded;
}

// One set of instanced meshes for the whole museum, rather than hundreds of
// independent sign meshes. Signs stand on the road approaches, not on tracks.
export function buildRailCrossingSignals({crossings,parent}){
 const count=crossings.length*2,root=new THREE.Group();root.name='ЖД переезды · светофоры и знаки';root.userData.excludeTransportBake=true;
 if(!count){parent.add(root);return {root,count:0};}
 const components=[
  ['post',new THREE.CylinderGeometry(.055,.07,2.25,6),new THREE.MeshStandardMaterial({color:0xbdbdb5,roughness:.8})],
  ['head',new THREE.BoxGeometry(.74,.34,.19),new THREE.MeshStandardMaterial({color:0x272b2c,roughness:.8})],
  ['cross-a',new THREE.BoxGeometry(1.05,.14,.08),new THREE.MeshStandardMaterial({color:0xf5f3e8,roughness:.7})],
  ['cross-b',new THREE.BoxGeometry(1.05,.14,.08),new THREE.MeshStandardMaterial({color:0xf5f3e8,roughness:.7})],
  ['red-left',new THREE.SphereGeometry(.115,8,6),new THREE.MeshStandardMaterial({color:0xe5120d,emissive:0x700500,emissiveIntensity:1.2})],
  ['red-right',new THREE.SphereGeometry(.115,8,6),new THREE.MeshStandardMaterial({color:0xe5120d,emissive:0x700500,emissiveIntensity:1.2})],
  ['warning',new THREE.ConeGeometry(.33,.55,3),new THREE.MeshStandardMaterial({color:0xd62d22,roughness:.7})]
 ];
 const meshes=components.map(([name,g,m])=>{const mesh=new THREE.InstancedMesh(g,m,count);mesh.name='Переезд · '+name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);root.add(mesh);return mesh;});
 const dummy=new THREE.Object3D();
 function set(n,k,x,y,z,yaw,tilt=0){
  dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.rotateZ(tilt);
  dummy.scale.set(1,1,1);dummy.updateMatrix();meshes[n].setMatrixAt(k,dummy.matrix);
 }
 for(let i=0;i<crossings.length;i++){
  const c=crossings[i],normalX=-c.tangentZ,normalZ=c.tangentX;
  for(let side of [-1,1]){
   const k=i*2+(side===1?1:0),along=Math.max(6,c.width*2.6),
    sideways=c.width/2+.95,x=c.x+c.tangentX*along*side+normalX*side*sideways,
    z=c.z+c.tangentZ*along*side+normalZ*side*sideways,y=c.y+.018,yaw=Math.atan2(-c.tangentX*side,-c.tangentZ*side);
   set(0,k,x,y+1.125,z,yaw);
   set(1,k,x,y+1.65,z,yaw);
   set(2,k,x,y+2.05,z,yaw,Math.PI/4);
   set(3,k,x,y+2.05,z,yaw,-Math.PI/4);
   for(const [component,offset]of [[4,-.18],[5,.18]]){
    set(component,k,x+Math.cos(yaw)*offset+Math.sin(yaw)*.13,y+1.65,z-Math.sin(yaw)*offset+Math.cos(yaw)*.13,yaw);
   }
   set(6,k,x,y+2.65,z,yaw);
  }
 }
 for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
 root.userData.crossingCount=crossings.length;root.userData.signCount=count;parent.add(root);
 return {root,count,crossings:crossings.length};
}
