import {SITE254_ACCESS,SITE254_MASK} from './site254-layout.js?v=20261103-site254-e10s5';
import {CYCLONE_PAD_ORIGINS,CYCLONE_YAW} from './cyclone-profile.js?v=20261101-cyclone-v1';
import * as THREE from 'three';
import {pruneTerminalBranches} from './transport-pruning.js?v=20261029-transport-cleanup-v2';
import {pruneUnassignedRailTermini} from './rail-terminal-cleanup.js?v=20261106-site-matched-rail-ends-v1';
import {buildExhibitRoadFilter,EXHIBIT_ACCESS_NODE_IDS,EXHIBIT_ROAD_AREAS,rectangleSegmentInterval,clipRoadOutsideRectangle,airportPerimeterBypass} from './exhibit-road-filter.js?v=20261030-river-roads-signs-v1';
import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
import {RAIL_PROFILE,GAGARIN_RAIL_PORT} from './gagarin-rail-approach.js?v=20261102-site2-photo-v3';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {FACILITY_PORTS,portWorld} from './facility-ports.js?v=20261103-site250a-photo-v1';
import {planSite250aThroughRoad,SITE250A_THROUGH_WAY_ID,SITE250A_THROUGH_PROFILE} from './site250a-through-road.js?v=20261105-smooth-ukss-road-v2';
import {distancePath} from './traffic-paths.js?v=20261102-site2-photo-v3';
import {SATURN_ACCESS,SATURN_TERRAIN_BOUNDS,saturnTerrainHeight,saturnTerrainSample} from './saturn-access.js?v=20261101-saturn-terrain-v5';
import {KRAYNIY_AIRPORT_DISPLAY,krayniyTerminalLayout} from './krayniy-terminal.js?v=20261031-facilities-rails-lighting-v1';
import {createInterchangeBridgePlan,buildInterchangeBridge,INTERCHANGE_BRIDGE_WAY} from './interchange-bridge.js?v=20261102-site2-photo-v3';
import {createHighwayAsphaltMaterial,createHighwayMarkingMaterial,isHighwayRoad,smoothHighwayGraph,HIGHWAY_ASPHALT_COLOR,HIGHWAY_ASPHALT_LIFT,HIGHWAY_MARKINGS,highwayRunsOutsideBridge} from './highway-surface.js?v=20261031-facilities-rails-lighting-v2';
import {unionRoadSurfacePolygons,clipOrdinaryRoadMeshes,fillEnclosedRoadSurfaceVoid} from './road-surface.js?v=20261103-shoulder-clip-v2';
import {createInterchangeAprons,INTERCHANGE_APRON_VERSION} from './interchange-aprons.js?v=20261031-facilities-rails-lighting-v2';
import {buildRoadMarkings} from './road-markings.js?v=20261031-facilities-rails-lighting-v6';
import {smoothLocalRoadGraph,createAccessTransition} from './access-transitions.js?v=20261031-facilities-rails-lighting-v3';
import {planGagarinSite2Road,GAGARIN_APPROACH_WAY_ID,GAGARIN_NORTH_FORK_WAY_ID} from './gagarin-site2-road.js?v=20261103-site2-road-v5';
import {createMik112RailSourcePlan,createMik112RailApproaches} from './mik112-rail-plan.js?v=20261031-facilities-rails-lighting-v4';
import {createSite41RoadReplacement} from './site41-road-clearance.js?v=20261031-facilities-rails-lighting-v1';
import {railApproachSleeperDistances} from './paired-rail-approach.js?v=20261031-facilities-rails-lighting-v4';
import {createSite110RailFan} from './site110-rail-fan.js?v=20261031-facilities-rails-lighting-v4';
import {buildHighwayDisplay} from './highway-display.js?v=20261102-site2-photo-v3';
import {smoothRailGraph,graphRailRoutePoints} from './rail-surface.js?v=20261102-rail-scheme-v1';
import {createRailSchemePlan,RAIL_SCHEME_REFERENCE} from './rail-scheme.js?v=20261102-rail-scheme-v1';
import {createRailSiteClearancePlan} from './rail-site-clearance.js?v=20261102-rail-scheme-v1';
import {createRailCrossingProfile} from './rail-crossing-profile.js?v=20261102-rail-scheme-v1';
import {separateRailGraphFromRoads,straightenPad5Rail,roundRailCorners,buildRailRoadIndex,findRailRoadCrossings,buildRailCrossingSignals} from './rail-road-clearance.js?v=20261105-rail-road-clearance-v1';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const BBOX=[62.78,45.57,64.12,46.135];
// The protected railway terrain is level at this world datum. The physical
// rail profile supplies ballast, sleepers and rail-head height above it.
export const RAIL_NETWORK_GROUND_Y=-2.755;
const MAIN=new Set(['motorway','trunk','primary','secondary','tertiary']);
const CAR_WEIGHTS={motorway:.8,trunk:.8,primary:.85,secondary:.9,tertiary:1,unclassified:1.15,residential:1.5,service:2.1,living_street:2.5,track:5};
const ROAD_STYLE=Object.freeze({asphaltColor:'#555751',shoulderColor:'#c5c1b4',paintWidth:.10,shoulderExtra:.6,
 widths:Object.freeze({motorway:3.6,trunk:3.6,primary:3.6,secondary:3.1,tertiary:3.1,unclassified:2.4,residential:2,living_street:2,service:1.6,track:1.2})});
// This existing through-road passes outside the actual 112/112A/110 buildings.
// Their conservative circular model masks used to cut three gaps into it.
// Preserve its source centreline once, while still hiding internal service webs.
const INDUSTRIAL_THROUGH_ROAD='183464610';
// The actual primary road runs along the west boundary of the Site 2 museum.
const SITE2_PRIMARY_WAY_ID='173082916';
const INDUSTRIAL_THROUGH_SITES=new Set(['pad-112','pad-112a','pad-110']);
const keyFor=f=>String(f.properties.osmId);
const tagsFor=f=>f.properties.tags||{};

function roadWidth(tags){
 const kind=tags.highway?.replace('_link','');
 return ROAD_STYLE.widths[kind]||2;
}

class Heap{
 constructor(){this.a=[];}
 push(item){const a=this.a;let i=a.length;a.push(item);while(i){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
 pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
 get length(){return this.a.length;}
}

function clipSegment(a,b){
 let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-BBOX[0]],[dx,BBOX[2]-a[0]],[-dy,a[1]-BBOX[1]],[dy,BBOX[3]-a[1]]]){
  if(Math.abs(p)<1e-14){if(q<0)return null;continue;}
  const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi)return null;
 }
 return {lo,hi,a:[a[0]+dx*lo,a[1]+dy*lo],b:[a[0]+dx*hi,a[1]+dy*hi]};
}

/** Topology comes exclusively from common OSM node IDs, never visual crossings. */
export function buildOsmGraph(features,{geography,point,rail=false}){
 const nodes=new Map(),edges=[],ways=[];
 function node(id,coord){
  if(!nodes.has(id)){const p=geography.project(...coord);nodes.set(id,{id,coord,position:point(p[0],p[1],rail?RAIL_NETWORK_GROUND_Y:.72),edges:[],component:-1,raise:0});}
  return nodes.get(id);
 }
 for(const f of features){
  if(f.geometry.type!=='LineString')continue;
  const tags=tagsFor(f),abandoned=['abandoned','disused','razed'].includes(tags.railway);
  const coords=f.geometry.coordinates,ids=f.properties.sourceNodeIds;
  if(!ids||ids.length!==coords.length)continue;
  const segments=[];
  for(let i=1;i<coords.length;i++){
   const cut=clipSegment(coords[i-1],coords[i]);if(!cut)continue;
   const idA=cut.lo===0?String(ids[i-1]):`clip:${f.id}:${i}:a`,idB=cut.hi===1?String(ids[i]):`clip:${f.id}:${i}:b`;
   const a=node(idA,cut.a),b=node(idB,cut.b),length=a.position.distanceTo(b.position);if(length<1e-6)continue;
   const edge={a,b,length,tags,wayId:keyFor(f),osmUrl:f.properties.osmUrl,width:rail?RAIL_PROFILE.ballastWidth:roadWidth(tags),abandoned};
   edges.push(edge);segments.push(edge);
   if(!abandoned){a.edges.push(edge);b.edges.push(edge);}
  }
  if(segments.length)ways.push({id:f.id,osmId:keyFor(f),tags,segments,width:rail?RAIL_PROFILE.ballastWidth:roadWidth(tags),abandoned});
 }
 const components=[];
 for(const n of nodes.values())if(n.component<0&&n.edges.length){
  const id=components.length,list=[],queue=[n];n.component=id;
  for(let i=0;i<queue.length;i++){const a=queue[i];list.push(a);for(const e of a.edges){const b=e.a===a?e.b:e.a;if(b.component<0){b.component=id;queue.push(b);}}}
  components.push(list);
 }
 const largest=components.reduce((best,c,i)=>c.length>(components[best]?.length||0)?i:best,0);
 // Bridge plateaus and approaches use shared graph-node elevations. This
 // keeps every incident segment at exactly the same height at its junction.
 const bridgeSeeds=[];
 for(const e of edges)if(e.tags.bridge&&e.tags.bridge!=='no')for(const n of [e.a,e.b])bridgeSeeds.push(n);
 const q=new Heap(),distance=new Map();
 for(const n of bridgeSeeds){distance.set(n.id,0);q.push([0,n]);}
 while(q.length){const [d,n]=q.pop();if(d!==distance.get(n.id)||d>70)continue;n.raise=Math.max(n.raise,5.8*(1-d/70)**2);
  for(const e of n.edges){const b=e.a===n?e.b:e.a,nd=d+e.length;if(nd<70&&nd<(distance.get(b.id)??Infinity)){distance.set(b.id,nd);q.push([nd,b]);}}
 }
 for(const n of nodes.values())n.position.y+=n.raise;
 function nearest(position,{component=largest,filter=()=>true}={}){
  let best=null,d=Infinity;for(const n of nodes.values()){if(n.component!==component||!filter(n))continue;const dd=(n.position.x-position.x)**2+(n.position.z-position.z)**2;if(dd<d){d=dd;best=n;}}
  return best;
 }
 function route(start,end){
  if(!start||!end||start.component!==end.component)throw Error('OSM route endpoints are not connected');
  const heap=new Heap(),cost=new Map([[start.id,0]]),prev=new Map();heap.push([0,start]);
  while(heap.length){const [d,a]=heap.pop();if(d!==cost.get(a.id))continue;if(a===end)break;
   for(const e of a.edges){const b=e.a===a?e.b:e.a;const weight=rail?(e.tags.service==='siding'||e.tags.service==='yard'?1.35:1):(CAR_WEIGHTS[e.tags.highway?.replace('_link','')]||1.6);const nd=d+e.length*weight;
    if(nd<(cost.get(b.id)??Infinity)){cost.set(b.id,nd);prev.set(b.id,{from:a,edge:e});heap.push([nd,b]);}
   }
  }
  if(!cost.has(end.id))throw Error('No connected OSM route');
  const routeEdges=[],routeNodes=[end];let cursor=end;
  while(cursor!==start){const p=prev.get(cursor.id);routeEdges.push(p.edge);cursor=p.from;routeNodes.push(cursor);}
  routeEdges.reverse();routeNodes.reverse();return {nodes:routeNodes,edges:routeEdges};
 }
 const graph={nodes,edges,ways,components,largest,nearest,route,bridgeSeeds};
 if(!rail){smoothHighwayGraph(graph);smoothLocalRoadGraph(graph);}
 return graph;
}

function geometryBatch(parent,name,material,{joined=false,solid=false}={}){
 const positions=[],normals=[],indices=[],pending=[],ownershipPolygons=[],exclusivePolygons=[];let mesh=null,clippedSections=0,currentPriority=0;
 function tri(a,b,c){
  // The visible side of every road/rail sheet is its top. Float32 rounding
  // happens before the area test, so tiny source segments cannot turn into
  // inverted slivers on the GPU. Winding and lighting normals must agree:
  // DoubleSide otherwise flips an explicitly upward normal downwards.
  let ax=Math.fround(a.x),ay=Math.fround(a.y),az=Math.fround(a.z),bx=Math.fround(b.x),by=Math.fround(b.y),bz=Math.fround(b.z),cx=Math.fround(c.x),cy=Math.fround(c.y),cz=Math.fround(c.z);
  const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  if(solid?Math.hypot(nx,ny,nz)<1e-8:Math.abs(ny)<1e-8)return;
  if(ny<0&&(!solid||Math.abs(ny)>1e-6*Math.hypot(nx,ny,nz))){[bx,cx]=[cx,bx];[by,cy]=[cy,by];[bz,cz]=[cz,bz];nx=-nx;ny=-ny;nz=-nz;}
  const length=Math.hypot(nx,ny,nz),n=positions.length/3;nx/=length;ny/=length;nz/=length;
  positions.push(ax,ay,az,bx,by,bz,cx,cy,cz);normals.push(nx,ny,nz,nx,ny,nz,nx,ny,nz);indices.push(n,n+1,n+2);
 }
 function quad(a,b,c,d){if(joined){ownershipPolygons.push([a,b,d,c]);for(const p of [[a,c,b],[b,c,d]]){p.priority=currentPriority;pending.push(p);}}else{tri(a,c,b);tri(b,c,d);}}
 function patch(triangles,mask){for(const p of triangles)tri(...p);exclusivePolygons.push(...mask);ownershipPolygons.push(...mask);}
 function disc(center,radius,y=0){for(let i=0;i<14;i++){const a=i*Math.PI/7,b=(i+1)*Math.PI/7;tri(V(center.x,center.y+y,center.z),V(center.x+Math.cos(a)*radius,center.y+y,center.z+Math.sin(a)*radius),V(center.x+Math.cos(b)*radius,center.y+y,center.z+Math.sin(b)*radius));}}
 function ribbon(points,width,lift=0,offset=0,priority=0,directionAt=null,heightAt=null,thickness=0){
  currentPriority=priority;
  if(points.length<2)return;const rims=[];
  for(let i=0;i<points.length;i++){
   const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
   let d=next.clone().sub(prev).setY(0).normalize();if(directionAt)d=directionAt(points[i],d).clone().setY(0).normalize();
   const normal=V(-d.z,0,d.x);
   const w=typeof width==='function'?width(points[i]):width,o=typeof offset==='function'?offset(points[i]):offset;
   rims.push([-1,1].map(side=>{const p=points[i].clone().addScaledVector(normal,o+side*w/2).add(V(0,lift,0));if(heightAt){const y=heightAt(p);if(y===null)return null;p.y=y;}return p;}));
  }
  const lower=p=>p.clone().add(V(0,-thickness,0));
  for(let i=1;i<rims.length;i++)if([...rims[i-1],...rims[i]].every(Boolean)){
   const [a,b]=rims[i-1],[c,d]=rims[i];quad(a,b,c,d);
   if(thickness>0){quad(a,c,lower(a),lower(c));quad(d,b,lower(d),lower(b));}
  }
  if(thickness>0)for(const rim of [rims[0],rims.at(-1)])if(rim.every(Boolean))quad(rim[0],rim[1],lower(rim[0]),lower(rim[1]));
 }
 function flush(){
  if(pending.length){const result=unionRoadSurfacePolygons(pending.sort((a,b)=>a.priority-b.priority),exclusivePolygons);clippedSections=result.clipped;for(const p of result.polygons)for(let i=1;i<p.length-1;i++)tri(p[0],p[i],p[i+1]);pending.length=0;}
  if(mesh){parent.remove(mesh);mesh.geometry.dispose();}if(!positions.length)return null;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices);g.computeBoundingSphere();
  mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.userData.groundSurface=true;mesh.userData.osmSource=true;if(solid)mesh.userData.osmRailVolume=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 return {ribbon,disc,quad,patch,flush,ownershipPolygons,get clippedSections(){return clippedSections;},get triangles(){return mesh?(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3:indices.length/3;},get mesh(){return mesh;}};
}

function pavementHeightSampler(meshes){
 const cells=new Map(),cellSize=12;
 for(const mesh of meshes){
 if(!mesh)continue;mesh.updateWorldMatrix(true,false);
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
 // Transform straight into the temporary numerical triangle buffer. Three
 // THREE.Vector3 allocations and one flatMap closure per triangle made the
 // startup surface-height index unnecessarily expensive on slower devices.
 const m=mesh.matrixWorld.elements;
 for(let i=0;i<(index?.count??p.count);i+=3){
  const t=[];
  for(let k=0;k<3;k++){
   const j=index?index.getX(i+k):i+k,x=p.getX(j),y=p.getY(j),z=p.getZ(j);
   t.push(m[0]*x+m[4]*y+m[8]*z+m[12],
    m[1]*x+m[5]*y+m[9]*z+m[13],
    m[2]*x+m[6]*y+m[10]*z+m[14]);
  }
  const [ax,,az,bx,,bz,cx,,cz]=t,den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-12)continue;t.push(den);
  t.bounds={minX:Math.min(ax,bx,cx),maxX:Math.max(ax,bx,cx),minZ:Math.min(az,bz,cz),maxZ:Math.max(az,bz,cz)};
  // Both the Float32 edge tolerance and its conservative X/Z bounds depend
  // only on this fixed triangle, not on the paint or vehicle query point.
  const maxEdge=Math.max(Math.hypot(bx-ax,bz-az),Math.hypot(cx-ax,cz-az),Math.hypot(cx-bx,cz-bz));
  t.epsilon=.00035*maxEdge/Math.abs(den);
  // u,v,w >= -epsilon enlarges each vertex by epsilon*(2A-B-C).
  // Twice the longest edge bounds that displacement on either axis. Keep
  // an additional arithmetic margin and the original cell membership/order.
  t.boundsMargin=2*t.epsilon*maxEdge+1e-7;
  for(let x=Math.floor(Math.min(ax,bx,cx)/cellSize);x<=Math.floor(Math.max(ax,bx,cx)/cellSize);x++)for(let z=Math.floor(Math.min(az,bz,cz)/cellSize);z<=Math.floor(Math.max(az,bz,cz)/cellSize);z++){
   const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);
  }
 }
 }
 const sample=q=>{
  let top=-Infinity,nearbyTop=-Infinity;
  for(const triangle of cells.get(Math.floor(q.x/cellSize)+':'+Math.floor(q.z/cellSize))||[]){
   const box=triangle.bounds,margin=triangle.boundsMargin;
   if(q.x<box.minX-margin||q.x>box.maxX+margin||q.z<box.minZ-margin||q.z>box.maxZ+margin)continue;
   const [ax,ay,az,bx,by,bz,cx,cy,cz,den]=triangle;
   const u=((bz-cz)*(q.x-cx)+(cx-bx)*(q.z-cz))/den,v=((cz-az)*(q.x-cx)+(ax-cx)*(q.z-cz))/den;
   // At far map coordinates Float32 rounds a shared section by up to 0.00025
   // world units. Use a physical edge tolerance, not a fixed barycentric one
   // that rejects perfectly adjoining, very short triangles at way nodes.
   const epsilon=triangle.epsilon;
   if(u< -epsilon||v< -epsilon||u+v>1+epsilon)continue;
   const y=u*ay+v*by+(1-u-v)*cy;if(Math.abs(y-q.y)<.6){nearbyTop=Math.max(nearbyTop,y);if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)top=Math.max(top,y);}
  }
  return Number.isFinite(top)?top:Number.isFinite(nearbyTop)?nearbyTop:null;
 };
 sample.trianglesAt=box=>{
  const selected=new Set();
  for(let x=Math.floor(box.minX/cellSize);x<=Math.floor(box.maxX/cellSize);x++)for(let z=Math.floor(box.minZ/cellSize);z<=Math.floor(box.maxZ/cellSize);z++)for(const t of cells.get(x+':'+z)||[]){
   const b=t.bounds;if(b.maxX>=box.minX&&b.minX<=box.maxX&&b.maxZ>=box.minZ&&b.minZ<=box.maxZ)selected.add(t);
  }
  return [...selected].map(t=>t.vertices??=(Array.from({length:3},(_,i)=>V(t[i*3],t[i*3+1],t[i*3+2]))));
 };
 return sample;
}

function sampleCurve(curve,step=1.4){const n=Math.max(4,Math.ceil(curve.getLength()/step));return Array.from({length:n+1},(_,i)=>curve.getPointAt(i/n));}
function simplifyPath(points){return points.filter((p,i)=>!i||p.distanceTo(points[i-1])>1e-6).map(p=>p.clone());}
function samplesWithVertices(points,step){const out=[points[0].clone()];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(a.distanceTo(b)/step));for(let j=1;j<=n;j++)out.push(a.clone().lerp(b,j/n));}return out;}

function makeVehicleRoute(id,label,graphRoute,conform=points=>points){
 const original=graphRoute.nodes.map(n=>n.position.clone()),corners=original.map(p=>[p.clone()]);
 for(let i=1;i<original.length-1;i++){
  // The same sampled highway edges feed rendering, light placement, bridge
  // construction and traffic. Do not round their source nodes a second time.
  if(graphRoute.edges[i-1].surfacePoints||graphRoute.edges[i].surfacePoints)continue;
  const p=original[i],incoming=p.clone().sub(original[i-1]),outgoing=original[i+1].clone().sub(p),lengthA=incoming.length(),lengthB=outgoing.length();
  incoming.normalize();outgoing.normalize();const width=Math.min(graphRoute.edges[i-1].width,graphRoute.edges[i].width),reach=Math.min(lengthA*.28,lengthB*.28,width*.3,3);
  if(reach<.03||incoming.dot(outgoing)>.9995)continue;
  const entry=p.clone().addScaledVector(incoming,-reach),exit=p.clone().addScaledVector(outgoing,reach),turn=new THREE.QuadraticBezierCurve3(entry,p,exit);
  corners[i]=Array.from({length:7},(_,j)=>turn.getPoint(j/6));
 }
 const points=[...corners[0]];
 graphRoute.edges.forEach((edge,i)=>{
  if(edge.surfacePoints){const samples=edge.a===graphRoute.nodes[i]?edge.surfacePoints:[...edge.surfacePoints].reverse();points.push(...samples.slice(1).map(p=>p.clone()));}
  else points.push(...corners[i+1]);
 });
 const path=distancePath(conform(points,Math.max(...graphRoute.edges.map(e=>e.width)))),boundaries=[];let at=0;
 for(const e of graphRoute.edges){boundaries.push({at,width:e.width});at+=e.length;}boundaries.push({at,width:boundaries.at(-1)?.width||4.8});
 return {...path,id,label,source:'OpenStreetMap',vehicleScale:.64,osmWayIds:[...new Set(graphRoute.edges.map(e=>e.wayId))],nodeIds:graphRoute.nodes.map(n=>n.id),width:Math.min(...graphRoute.edges.map(e=>e.width)),
  widthAt(distance){distance*=at/path.length;let lo=0,hi=boundaries.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(boundaries[mid].at<=distance)lo=mid;else hi=mid;}return boundaries[lo]?.width||4.8;}};
}

export function buildOsmTransportNetwork({data,legacyData,geography,point,layers,siteRecords,checkpoint7RoadGrade=null}){
 const started=Date.now(),roadGraph=buildOsmGraph(data.roads.features,{geography,point}),railGraph=buildOsmGraph(data.railways.features,{geography,point,rail:true});
 checkpoint7RoadGrade?.adjustWidths?.(roadGraph);
 const buildPhases=[],checkpoint=name=>{
  const elapsed=Date.now()-started;buildPhases.push({name,elapsedMs:elapsed});
  if(typeof performance!=='undefined'&&performance.mark)performance.mark('museum:transport-'+name);
 };
 checkpoint('graphs');
 const saturnSite=siteRecords.find(s=>s.id==='pad-23'),saturnCenter=saturnSite?point(saturnSite.x,saturnSite.y,0):null;
 function terrainAt(x,z){
  if(!saturnCenter)return -Infinity;
  const localX=(x-saturnCenter.x)/SATURN_ACCESS.scale,localZ=(z-saturnCenter.z)/SATURN_ACCESS.scale;
  const b=SATURN_TERRAIN_BOUNDS;
  return localX>=b.minX&&localX<=b.maxX&&localZ>=b.minZ&&localZ<=b.maxZ?SATURN_ACCESS.elevation+SATURN_ACCESS.scale*saturnTerrainHeight(localX,localZ):-Infinity;
 }
 function terrainDatum(p,width){
  if(!saturnCenter)return p.y;
  const r=width/2+ROAD_STYLE.shoulderExtra/2,b=SATURN_TERRAIN_BOUNDS,s=SATURN_ACCESS.scale;
  if(p.x+r<saturnCenter.x+b.minX*s||p.x-r>saturnCenter.x+b.maxX*s||
     p.z+r<saturnCenter.z+b.minZ*s||p.z-r>saturnCenter.z+b.maxZ*s)return p.y;
  let top=terrainAt(p.x,p.z);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;top=Math.max(top,terrainAt(p.x+r*Math.cos(a),p.z+r*Math.sin(a)));}
  return Math.max(p.y,top+.38);
 }
 // Source nodes alone are too sparse on Saturn's nonlinear slopes. The
 // entire road width and every intermediate section must clear the hill.
 function conformPath(points,width){
  const samples=samplesWithVertices(points,1.4);
  for(const p of samples)p.y=terrainDatum(p,width);
  return samples;
 }
 function railTerrainDatum(p,width){
  if(!saturnCenter)return p.y;
  const scale=SATURN_ACCESS.scale,b=SATURN_TERRAIN_BOUNDS,r=width/2;
  if(p.x+r<saturnCenter.x+b.minX*scale||p.x-r>saturnCenter.x+b.maxX*scale||
     p.z+r<saturnCenter.z+b.minZ*scale||p.z-r>saturnCenter.z+b.maxZ*scale)return p.y;
  // The transparent, level skirt of the hill is not a physical railway
  // embankment. Applying the road's +.38 clearance to its whole rectangle
  // made a step at the rectangle boundary. Only the visible relief blends
  // into the railway's ground datum; bridge elevations remain above it.
  let top=p.y;
  for(let i=0;i<9;i++){
   const angle=i*Math.PI/4,x=p.x+(i===8?0:r*Math.cos(angle)),z=p.z+(i===8?0:r*Math.sin(angle));
   const sample=saturnTerrainSample((x-saturnCenter.x)/scale,(z-saturnCenter.z)/scale);
   const height=RAIL_NETWORK_GROUND_Y+sample.opacity*(SATURN_ACCESS.elevation+scale*sample.height+.01-RAIL_NETWORK_GROUND_Y);
   top=Math.max(top,height);
  }
  return top;
 }
 function conformRailPath(points,width){
  const samples=samplesWithVertices(points,1.4);for(const p of samples)p.y=railTerrainDatum(p,width);return checkpoint7RoadGrade?checkpoint7RoadGrade.conformRails(samples):samples;
 }
 for(const graph of [roadGraph,railGraph])for(const n of graph.nodes.values()){
  const width=Math.max(1,...n.edges.map(e=>e.width));
  n.position.y=(graph===railGraph?railTerrainDatum:terrainDatum)(n.position.clone().add(V(0,-n.raise,0)),width)+n.raise;
  // Junction discs and every connected branch share the lowered road datum.
  // Grading only ribbon samples would leave an old raised disc at a junction.
  if(graph===roadGraph&&checkpoint7RoadGrade){const y=checkpoint7RoadGrade.roadAt(n.position.x,n.position.z);if(y!==null)n.position.y=y;}
 }
 smoothHighwayGraph(roadGraph);
 smoothLocalRoadGraph(roadGraph);
 const railCrossings=createRailCrossingProfile({railGraph,roadGraph,railPoints:data.railPoints,groundY:RAIL_NETWORK_GROUND_Y,headY:RAIL_PROFILE.headY});
 // These measured model approaches own their short source intervals. Build
 // them before the network curves, so their exact rail-head seams can pin
 // the adjacent source frames without resampling their node-indexed plans.
 const mikRailSourcePlan=createMik112RailSourcePlan(railGraph);
 const site110Site=siteRecords.find(site=>site.id==='pad-110'),site110Spec=site110Site?{...FACILITY_PORTS['pad-110'],yaw:site110Site.runtimeYaw??FACILITY_PORTS['pad-110'].yaw}:null;
 const site110Fan=site110Spec?createSite110RailFan({railGraph,sourcePlan:mikRailSourcePlan,ports:site110Spec.railConnections.map(port=>({id:port.id,
  end:portWorld(site110Spec,port.position,site110Site,point).add(V(0,-RAIL_PROFILE.headY,0)),inward:V(...port.outward).negate().applyAxisAngle(V(0,1,0),site110Spec.yaw)}))}):null;
 const replacedRailEdges=new Set([...mikRailSourcePlan.replacedEdges,...(site110Fan?.replacedEdges??[])]),railSeams=new Map();
 for(const gate of mikRailSourcePlan.gates)railSeams.set(gate.sourceNodeId,gate.outwardTangent);
 for(const track of site110Fan?.tracks??[])railSeams.set(track.displaySourceNodeId,V(...track.sourceTangent));
 for(const link of site110Fan?.joinedLinks??[])if(!site110Fan.mappedNodes.some(node=>node.sourceNodeId===link.from))railSeams.set(link.from,link.startTangent);
 const railSurface=smoothRailGraph(railGraph,{excludedEdges:replacedRailEdges,endpointTangents:(edge,index,node)=>{
  const frame=railSeams.get(node.id);if(!frame)return null;
  const direction=frame.clone();if(direction.dot(edge.b.position.clone().sub(edge.a.position))<0)direction.negate();return direction;
 }});
 const railScheme=createRailSchemePlan(railGraph);
 function conformRoadPath(points,width){
  const samples=conformPath(points,width);
  for(const p of samples)p.y=roadGraph.highwaySurfaceHeight(p,width);
  return checkpoint7RoadGrade?checkpoint7RoadGrade.conform(samples):samples;
 }
 const interchangeBridgePlan=createInterchangeBridgePlan({roadGraph,railGraph});
 const highwayDirections=new Map(),wayDirections=new Map(),directionPriorities=new Map(),directionKey=p=>[p.x,p.y,p.z].map(n=>n.toFixed(7)).join(':');
 for(const edge of roadGraph.edges)if(edge.surfaceTangents){
  let map=wayDirections.get(String(edge.wayId));if(!map){map=new Map();wayDirections.set(String(edge.wayId),map);}
  const priority=['trunk','motorway'].includes(edge.tags.highway)?3:isHighwayRoad(edge.tags)?2:1;
  [edge.a,edge.b].forEach((node,i)=>{
   const key=directionKey(node.position);map.set(key,edge.surfaceTangents[i]);
   if(priority>=(directionPriorities.get(key)??0)){highwayDirections.set(key,edge.surfaceTangents[i]);directionPriorities.set(key,priority);}
  });
 }
 function highwayDirectionAt(p,fallback){
  let tangent=highwayDirections.get(directionKey(p));
  if(interchangeBridgePlan){const q=interchangeBridgePlan.local(p);if(Math.abs(Math.abs(q.z)-interchangeBridgePlan.halfLength)<1e-6){
   const at=interchangeBridgePlan.sample(q.z);
   if(Math.abs(q.y-at.p.y)<.05)tangent=interchangeBridgePlan.direction.clone().multiplyScalar(at.tangent.z).addScaledVector(interchangeBridgePlan.right,at.tangent.x);
  }}
  if(!tangent)return fallback;
  const result=tangent.clone();if(result.dot(fallback)<0)result.negate();return result;
 }
 function roadDirectionAt(wayId,highway){
  const map=wayDirections.get(String(wayId));
  return (p,fallback)=>{
   const tangent=map?.get(directionKey(p));
   if(!tangent)return highway?highwayDirectionAt(p,fallback):fallback;
   const result=tangent.clone();if(result.dot(fallback)<0)result.negate();return result;
  };
 }
 const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0,side:THREE.DoubleSide,...extra});
 const mat={shoulder:material(ROAD_STYLE.shoulderColor),asphalt:material(ROAD_STYLE.asphaltColor),highway:createHighwayAsphaltMaterial(),track:material(0xb2a58d),paint:material(0xf2f0e4,{polygonOffset:true,polygonOffsetFactor:-1}),ballast:material(0x988b78),ties:material(0x766c5c),steel:material(0x707773,{metalness:.62,roughness:.51}),abandoned:material(0x786f5e)};
 const roadRoot=new THREE.Group(),railRoot=new THREE.Group();roadRoot.name='OpenStreetMap · автодороги';railRoot.name='OpenStreetMap · железнодорожные пути';layers.roads.add(roadRoot);layers.rails.add(railRoot);
 const shoulder=geometryBatch(roadRoot,'OSM · единые обочины',mat.shoulder),asphalt=geometryBatch(roadRoot,'OSM · единое дорожное полотно',mat.asphalt),highwayAsphalt=geometryBatch(roadRoot,'OSM · асфальт трассы',mat.highway,{joined:true}),unpaved=geometryBatch(roadRoot,'OSM · грунтовые проезды',mat.track),paint=geometryBatch(roadRoot,'OSM · разметка',mat.paint);
 const highwayYellow=geometryBatch(roadRoot,'Трасса · двойная жёлтая',createHighwayMarkingMaterial(HIGHWAY_MARKINGS.yellowColor));
 const highwayWhite=geometryBatch(roadRoot,'Трасса · белые кромки',createHighwayMarkingMaterial(HIGHWAY_MARKINGS.whiteColor));
 const ballast=geometryBatch(railRoot,'OSM · балласт',mat.ballast),ties=geometryBatch(railRoot,'OSM · шпалы',mat.ties,{solid:true}),steel=geometryBatch(railRoot,'OSM · рельсы',mat.steel,{solid:true}),abandoned=geometryBatch(railRoot,'OSM · бывшие пути',mat.abandoned);
 const batches=[shoulder,asphalt,highwayAsphalt,unpaved,paint,ballast,ties,steel,abandoned],roadPaths=[],editableRoadPaths=[],railPaths=[],terrainRailPaths=[],stationLabels=[];
 const markingRoads=[],highwayMarkedWays=new Set();let highwayMarkingRuns=0,rampMarkingRuns=0;
 let markingSegments=0,railTies=0,connections=0;const accessReports=[],railPortReports=[],renderedRoadWays=new Set(),renderedRailWays=new Set(),hiddenCityWays=new Set();
 let roadPruning=null,railPruning=null,exhibitRoadFilter=null;
 const edgeKept=(graph,e)=>!(graph===roadGraph?roadPruning:railPruning)?.removed.has(e)&&!(graph===roadGraph&&exhibitRoadFilter?.removed.has(e));
 // The enlarged Yubileiny exhibit occupies more land than the source runway.
 // Clear its displayed runway, taxiway, apron and terminal. A single
 // synthetic perimeter route reconnects through roads; intersecting railway
 // fragments are omitted only from the display, leaving source routing intact.
 const yubileinySite=siteRecords.find(s=>s.id==='pad-251');
 const airportClearance=yubileinySite?{
  id:'yubileiny',siteId:'pad-251',origin:point(yubileinySite.x,yubileinySite.y,0),
  yaw:yubileinySite.runtimeYaw??1.948,scale:.28,
  rectangle:{minX:-65,maxX:555,minZ:-1265,maxZ:1265},cuts:[],sourceWays:new Set(),hiddenServiceWays:new Set(),
 }:null;
 const airportLocal=p=>p.clone().sub(airportClearance.origin).applyAxisAngle(V(0,1,0),-airportClearance.yaw).divideScalar(airportClearance.scale).toArray();
 const airportWorld=p=>V(...p).multiplyScalar(airportClearance.scale).applyAxisAngle(V(0,1,0),airportClearance.yaw).add(airportClearance.origin);
 const inAirportClearance=p=>{if(!airportClearance)return false;const [x,,z]=airportLocal(p),r=airportClearance.rectangle;return x>r.minX+1e-6&&x<r.maxX-1e-6&&z>r.minZ+1e-6&&z<r.maxZ-1e-6;};
 const airportPortSourceAllowed=(id,e)=>id!=='pad-251'||!airportClearance||
  [e.a,e.b].every(n=>airportLocal(n.position)[0]>airportClearance.rectangle.maxX+1);
 // The photo-based Krayniy terminal occupies the opposite side of the runway.
 // Only displayed roads are clipped to the enlarged campus. Its one landside
 // driveway is built with the terminal and meets the retained source junction.
 const krayniySite=siteRecords.find(s=>s.id==='airfield'),krayniyLayout=krayniyTerminalLayout(KRAYNIY_AIRPORT_DISPLAY.apronZ);
 const krayniyClearance=krayniySite?{
  origin:point(krayniySite.x,krayniySite.y,0),yaw:krayniySite.runtimeYaw??2.06,scale:.28,
  margin:(Math.max(...Object.values(ROAD_STYLE.widths))+ROAD_STYLE.shoulderExtra)/(.28*2)+.5,
  footprints:[
   {id:'runway',minX:-40,maxX:40,minZ:-855,maxZ:855},
   {id:'apron',minX:KRAYNIY_AIRPORT_DISPLAY.apronX-KRAYNIY_AIRPORT_DISPLAY.apronWidth/2,maxX:KRAYNIY_AIRPORT_DISPLAY.apronX+KRAYNIY_AIRPORT_DISPLAY.apronWidth/2,
    minZ:KRAYNIY_AIRPORT_DISPLAY.apronZ-KRAYNIY_AIRPORT_DISPLAY.apronLength/2,maxZ:KRAYNIY_AIRPORT_DISPLAY.apronZ+KRAYNIY_AIRPORT_DISPLAY.apronLength/2},
   {id:'parallel-taxiway',minX:KRAYNIY_AIRPORT_DISPLAY.taxiX-9,maxX:KRAYNIY_AIRPORT_DISPLAY.taxiX+9,minZ:-630,maxZ:630},
   ...[-610,610,KRAYNIY_AIRPORT_DISPLAY.apronZ-130,KRAYNIY_AIRPORT_DISPLAY.apronZ+130].map((z,i)=>({id:'connecting-taxiway-'+i,
    minX:KRAYNIY_AIRPORT_DISPLAY.taxiX-9,maxX:9,minZ:Math.min(z,z+Math.sign(z)*22)-9,maxZ:Math.max(z,z+Math.sign(z)*22)+9})),
   {id:'terminal',minX:krayniyLayout.center[0]-41,maxX:krayniyLayout.center[0]+41,minZ:krayniyLayout.center[2]-55,maxZ:krayniyLayout.center[2]+55},
   {id:'garden',...krayniyLayout.grounds.garden},{id:'parking',...krayniyLayout.grounds.parking},
   {id:'hangar',minX:KRAYNIY_AIRPORT_DISPLAY.apronX-177.5,maxX:KRAYNIY_AIRPORT_DISPLAY.apronX-112.5,
    minZ:KRAYNIY_AIRPORT_DISPLAY.apronZ+115,maxZ:KRAYNIY_AIRPORT_DISPLAY.apronZ+185}
  ],sourceWays:new Set(),protectedConflicts:new Set(),cuts:[]
 }:null;
 if(krayniyClearance)krayniyClearance.rectangles=krayniyClearance.footprints.map(r=>({id:r.id,
  minX:r.minX-krayniyClearance.margin,maxX:r.maxX+krayniyClearance.margin,minZ:r.minZ-krayniyClearance.margin,maxZ:r.maxZ+krayniyClearance.margin}));
 const krayniyLocal=p=>p.clone().sub(krayniyClearance.origin).applyAxisAngle(V(0,1,0),-krayniyClearance.yaw).divideScalar(krayniyClearance.scale).toArray();
 const krayniyWorld=p=>V(...p).multiplyScalar(krayniyClearance.scale).applyAxisAngle(V(0,1,0),krayniyClearance.yaw).add(krayniyClearance.origin);
 const inKrayniyClearance=p=>{if(!krayniyClearance)return false;const [x,,z]=krayniyLocal(p);return krayniyClearance.rectangles.some(r=>x>r.minX+1e-6&&x<r.maxX-1e-6&&z>r.minZ+1e-6&&z<r.maxZ-1e-6);};
 const settlementSpecs=[{id:'baikonur',name:'Байконур',osmId:39209179,profile:'main-streets-only'},
  {id:'akai',name:'Акай',osmId:16783113,profile:'minimum-through-routes'},
  {id:'tyuratam',name:'Тюратам',osmId:15005695,profile:'minimum-through-routes'}];
 function insideRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }return inside;}
 const settlements=settlementSpecs.map(spec=>{
  const feature=data.places?.features.find(f=>f.properties.osmId===spec.osmId&&['Polygon','MultiPolygon'].includes(f.geometry.type));
  const polygons=(feature?(feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates):[]).map(poly=>poly.map(ring=>ring.map(coord=>point(...geography.project(...coord),0))));
  return {...spec,feature,polygons,sourceWays:new Set(),hiddenWays:new Set(),keptWays:new Set(),trafficWays:new Set(),
   contains:p=>polygons.some(rings=>insideRing(p,rings[0])&&!rings.slice(1).some(ring=>insideRing(p,ring)))};
 });
 const cityRegion=settlements[0],cityFeature=cityRegion.feature;
 const inCity=p=>cityRegion.contains(p);
 const streetAllowed=(region,tags)=>MAIN.has(tags.highway?.replace('_link',''))||region.id==='baikonur'&&tags.highway==='unclassified';
 const cityMinor=tags=>!streetAllowed(cityRegion,tags);
 function settlementHidden(p,tags,wayId){return !protectedTrafficWays.has(wayId)&&settlements.some(region=>region.contains(p)&&!streetAllowed(region,tags));}
 const masks=new Map();
 for(const [id,radius] of Object.entries({'pad-110':72,'pad-250':43,'pad-250a':22,'pad-31':60,'pad-45':35,'pad-42':22,'pad-112':35,'pad-112a':40,'pad-92':25,'pad-3':24,'pad-2':21.5,'pad-1':16})){
  const s=siteRecords.find(s=>s.id===id);if(s)masks.set(id,{center:point(s.x,s.y,0),radius});
 }
 // Preserve the through AD between the twin 106/109 silos. Their small
 // exhibition clearance envelopes must not interrupt a public road.
 const TWIN_SILO_IDS=new Set(['pad-106','pad-109']);
 const site250a=siteRecords.find(s=>s.id==='pad-250a');if(site250a){const s=FACILITY_PORTS['pad-250a'];masks.set('pad-250a',{center:point(site250a.x,site250a.y,0),yaw:s.yaw,rectangle:{halfX:160*s.scale,minZ:-138*s.scale,maxZ:160*s.scale}});}
 const site254=siteRecords.find(s=>s.id==='pad-254');if(site254){const s=SITE254_ACCESS,m=SITE254_MASK;masks.set('pad-254',{center:portWorld(s,m.center,site254,point),yaw:s.yaw,rectangle:{halfX:m.halfX*s.scale,minZ:m.minZ*s.scale,maxZ:m.maxZ*s.scale}});}
 const hotelSite=siteRecords.find(s=>s.id==='pad-75');if(hotelSite)masks.set('pad-75',{center:portWorld(FACILITY_PORTS['pad-75'],FACILITY_PORTS['pad-75'].modelOffset,hotelSite,point),yaw:FACILITY_PORTS['pad-75'].yaw,rectangle:{halfX:10.8,minZ:-3.4,maxZ:12.4}});
 const site41=siteRecords.find(s=>s.id==='pad-41');if(site41){const s=FACILITY_PORTS['pad-41'],[minX,maxX,minZ,maxZ]=s.modelBoundsMetres;
  masks.set('pad-41',{center:point(site41.x,site41.y,0),rectangle:{halfX:Math.max(Math.abs(minX),Math.abs(maxX))*s.scale,minZ:minZ*s.scale,maxZ:maxZ*s.scale}});
 }
 const cycloneSite=siteRecords.find(s=>s.id==='pad-90');if(cycloneSite)for(const [i,[x,z]]of CYCLONE_PAD_ORIGINS.entries()){const center=V(x,0,z).multiplyScalar(MUSEUM_METRE).applyAxisAngle(V(0,1,0),CYCLONE_YAW).add(point(cycloneSite.x,cycloneSite.y,0));masks.set('pad-90-'+i,{center,yaw:CYCLONE_YAW,rectangle:{halfX:39*MUSEUM_METRE,minZ:-30*MUSEUM_METRE,maxZ:116*MUSEUM_METRE}});}
 const site41Replacement=createSite41RoadReplacement(roadGraph);
 // Reserve the same compact museum footprint as each detailed shaft model.
 for(const id of SILO_SITE_IDS){const site=siteRecords.find(s=>s.id===id);if(site)masks.set(id,{center:point(site.x,site.y,0),radius:10.5});}
 const railSiteClearance=createRailSiteClearancePlan({siteRecords,point}),railFootprintSites=new Set(railSiteClearance.siteIds);
 function masked(p,tags,margin=0,sourceWayId=null){for(const [id,m] of masks){if(id==='pad-2'&&sourceWayId===SITE2_PRIMARY_WAY_ID)continue;if(TWIN_SILO_IDS.has(id)&&['trunk','primary','secondary','tertiary','unclassified'].includes(tags.highway?.replace('_link','')))continue;if(sourceWayId===INDUSTRIAL_THROUGH_ROAD&&INDUSTRIAL_THROUGH_SITES.has(id))continue;const dx=p.x-m.center.x,dz=p.z-m.center.z,c=Math.cos(m.yaw||0),s=Math.sin(m.yaw||0),x=dx*c-dz*s,z=dx*s+dz*c;if(m.rectangle){if(['trunk','primary','secondary','tertiary','unclassified'].includes(tags.highway?.replace('_link','')))continue;const r=m.rectangle;if(Math.abs(x)<r.halfX+margin&&z>r.minZ-margin&&z<r.maxZ+margin)return true;}else if(x*x+z*z<(m.radius+margin)**2)return true;}return false;}
 function railMasked(p,margin=0){
  if(railSiteClearance.contains(p))return true;
  for(const [id,m]of masks){
   if(railFootprintSites.has(id))continue;
   const dx=p.x-m.center.x,dz=p.z-m.center.z,c=Math.cos(m.yaw||0),s=Math.sin(m.yaw||0),x=dx*c-dz*s,z=dx*s+dz*c;
   if(m.rectangle){const r=m.rectangle;if(Math.abs(x)<r.halfX+margin&&z>r.minZ-margin&&z<r.maxZ+margin)return true;}
   else if(x*x+z*z<(m.radius+margin)**2)return true;
  }
  return false;
 }
 function drawRoad(points,width,tags={},marked=false,force=false,wayId=null,renderedRuns=null,connections=[],surface={}){
  if(points.length<2)return false;const samples=conformRoadPath(points,width),path=distancePath(samples);if(path.length<.001)return false;
  const dirt=tags.highway==='track'||['unpaved','ground','dirt','sand'].includes(tags.surface),pavement=dirt?unpaved:isHighwayRoad(tags)?highwayAsphalt:asphalt;
  let run=[],rendered=false;
  const flush=()=>{if(run.length>1){
   const highway=isHighwayRoad(tags),directions=surface.directionAt??(wayId?roadDirectionAt(wayId,highway):highwayDirectionAt),widthAt=surface.widthAt??width;
   const pavingRuns=highway?highwayRunsOutsideBridge(run,interchangeBridgePlan,wayId):[run];
   for(const ps of pavingRuns){
    if(highway)for(const side of [-1,1])shoulder.ribbon(ps,ROAD_STYLE.shoulderExtra/2,-.055,side*(width/2+ROAD_STYLE.shoulderExtra/4),0,directions);
    else shoulder.ribbon(ps,typeof widthAt==='function'?p=>widthAt(p)+ROAD_STYLE.shoulderExtra:width+ROAD_STYLE.shoulderExtra,-.055,0,0,directions,checkpoint7RoadGrade?p=>p.y+.043*checkpoint7RoadGrade.weightAt(p.x,p.z):null);
    pavement.ribbon(ps,widthAt,highway?HIGHWAY_ASPHALT_LIFT:0,0,tags.highway?.endsWith('_link')?1:0,directions);
    markingRoads.push({id:'marking-road-'+(wayId??'display')+'-'+markingRoads.length,wayId,points:ps.map(p=>p.clone()),width,tags,marked:marked||highway,connections,
     directionAt:directions,widthAt,surfaceSmoothed:true});
   }
   if(highway&&!dirt){
    const ramp=tags.highway.endsWith('_link');highwayMarkedWays.add(wayId);
    if(ramp)rampMarkingRuns+=pavingRuns.length;else highwayMarkingRuns+=pavingRuns.length;
   }
   rendered=true;if(renderedRuns)renderedRuns.push(run.map(p=>p.clone()));
  }run=[];};
  const hidden=p=>!force&&(inGagarinAccessZone(p)&&localAccessMinor(tags)||masked(p,tags,width/2+ROAD_STYLE.shoulderExtra/2,wayId)||settlementHidden(p,tags,wayId));
  for(const p of samples){if(hidden(p)){flush();continue;}run.push(p);}flush();
  return rendered;
 }
 // Only the local display is simplified. The source road graph remains untouched.
 const gagarinAccessCentre=siteRecords.find(s=>s.id==='pad-1');
 const site2AccessCentre=siteRecords.find(s=>s.id==='pad-2');
 const gagarinZonePoint=gagarinAccessCentre?point(gagarinAccessCentre.x,gagarinAccessCentre.y,0):null;
 const inGagarinAccessZone=p=>gagarinZonePoint&&Math.hypot(p.x-gagarinZonePoint.x,p.z-gagarinZonePoint.z)<138;
 function isRedundantGagarinWay(way){
  // Remove short local service webs as whole source ways, not broken stubs.
  if(!gagarinZonePoint||[GAGARIN_APPROACH_WAY_ID,GAGARIN_NORTH_FORK_WAY_ID].includes(way.osmId)
   ||protectedTrafficWays.has(way.osmId)||way.tags.name||way.tags.ref
   ||way.tags.bridge||way.tags.tunnel||way.tags.destination)return false;
  if(!['service','track','residential','living_street','unclassified'].includes(way.tags.highway))return false;
  const distance=node=>Math.hypot(node.position.x-gagarinZonePoint.x,node.position.z-gagarinZonePoint.z);
  if(!way.segments.some(edge=>distance(edge.a)<155||distance(edge.b)<155))return false;
  const total=way.segments.reduce((sum,edge)=>sum+edge.length,0);
  return total<225&&way.segments.every(edge=>distance(edge.a)<275&&distance(edge.b)<275);
 }
 const localAccessMinor=tags=>['service','track','residential','living_street'].includes(tags.highway);
 const sitePoint=id=>{const s=siteRecords.find(s=>s.id===id);return point(s.x,s.y,.72);};
 const majorNode=n=>n.edges.some(e=>MAIN.has(e.tags.highway?.replace('_link','')));
 const trunkNodes=[...roadGraph.nodes.values()].filter(n=>n.component===roadGraph.largest&&n.edges.some(e=>['trunk','primary'].includes(e.tags.highway))&&n.coord[1]<45.83);
 if(!trunkNodes.length)throw Error('No OSM highway in the Baikonur region');
 const west=trunkNodes.reduce((a,b)=>a.position.x<b.position.x?a:b),east=trunkNodes.reduce((a,b)=>a.position.x>b.position.x?a:b),city=roadGraph.nearest(sitePoint('city'),{filter:majorNode}),northwest=roadGraph.nearest(sitePoint('pad-81'),{filter:majorNode});
 const highway=makeVehicleRoute('highway','Трасса Аральск — Кызылорда',roadGraph.route(west,east),conformRoadPath);
 const cityRoute=makeVehicleRoute('city-cosmodrome','Байконур ↔ космодром',roadGraph.route(city,northwest),conformRoadPath);
 let bridgeDistance=0,best=Infinity,along=0;const crossing=geography.project(63.322,45.679),crossPoint=point(...crossing,.72);
 for(let i=1;i<highway.points.length;i++){const a=highway.points[i-1],b=highway.points[i],near=new THREE.Line3(a,b).closestPointToPoint(crossPoint,true,V()),d=near.distanceToSquared(crossPoint);if(d<best){best=d;bridgeDistance=along+a.distanceTo(near);}along+=a.distanceTo(b);}
 highway.bridgeDistance=bridgeDistance;highway.routeIds=['osm-e38'];highway.joinGap=0;
 const westCity=makeVehicleRoute('highway-city--1','Аральск ↔ Байконур',roadGraph.route(west,city),conformRoadPath),eastCity=makeVehicleRoute('highway-city-1','Кызылорда ↔ Байконур',roadGraph.route(east,city),conformRoadPath);
 for(const r of [westCity,eastCity]){r.rampStart=r.length*.7;r.rampEnd=r.length*.75;}
 const roadPlan={routes:[highway,cityRoute,westCity,eastCity],highway,joins:[],extensions:[],source:'OpenStreetMap'};
 const protectedTrafficWays=new Set(roadPlan.routes.flatMap(r=>r.osmWayIds));
 const gagarin=siteRecords.find(s=>s.id==='pad-1'),padCenter=point(gagarin.x,gagarin.y,0),gate=padCenter.clone().add(V(-GAGARIN_RAIL_PORT[2]*MUSEUM_METRE,-2.755,0));
 const railStart=railGraph.nearest(gate.clone().add(V(-60,0,0))),stationFeature=data.railPoints?.features.find(f=>f.properties.osmId===4031286685),stationCoord=stationFeature?.geometry.coordinates||[63.3161095,45.651523],stationMap=geography.project(...stationCoord),railEnd=railGraph.nearest(point(...stationMap,.75));
 const graphTrain=railGraph.route(railStart,railEnd),railTangent=railSurface.endpointDirection(graphTrain.edges[0],railStart).multiplyScalar(graphTrain.edges[0].a===railStart?1:-1),straight=gate.clone().add(V(-18,0,0));
 // Keep physical destinations and the exact attachment edges of model ports.
 // Named roads, bridges, parking/driveways and operational station sidings
 // have a purpose even when their endpoint is not a catalogue marker.
 const roadProtected=new Set([...roadGraph.edges.filter(e=>protectedTrafficWays.has(e.wayId)),...site41Replacement.protectedEdges]);
 const railProtected=new Set([...graphTrain.edges,...mikRailSourcePlan.protectedEdges,...replacedRailEdges,...railScheme.protectedEdges]);
 // Deliberate joins retain their source way while display-only museum curves
 // skirt the enlarged launch structures. They must not snap across a pad.
 for(const spec of Object.values(FACILITY_PORTS))for(const port of spec.railConnections??[])if(port.sourceWayId)for(const edge of railGraph.edges)if(edge.wayId===port.sourceWayId)railProtected.add(edge);
 for(const [id,spec] of Object.entries(FACILITY_PORTS)){
  if(TWIN_SILO_IDS.has(id))continue; // One planned gate approach per site, not automatic loops.
  const site=siteRecords.find(s=>s.id===id);if(!site)continue;
  const effective={...spec,yaw:site.runtimeYaw??spec.yaw},gate=portWorld(effective,spec.road,site,point),out=V(...(spec.roadOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),effective.yaw);
  const near=nearestSegment(roadGraph,gate.clone().addScaledVector(out,30),e=>e.tags.highway!=='track'&&airportPortSourceAllowed(id,e)&&!masked(e.a.position.clone().lerp(e.b.position,.5),e.tags));
  if(near&&near.distance<=300**2)roadProtected.add(near.edge);
  const railOut=V(...(spec.railOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),effective.yaw);
  for(const local of spec.rail||[]){const end=portWorld(effective,local,site,point).add(V(0,-RAIL_PROFILE.headY,0)),rr=nearestSegment(railGraph,end.addScaledVector(railOut,35),e=>!railMasked(e.a.position.clone().lerp(e.b.position,.5)));if(rr&&rr.distance<=250**2)railProtected.add(rr.edge);}
 }
 const destinations=siteRecords.map(s=>({position:point(s.x,s.y,0),radius:Math.max(25,(masks.get(s.id)?.radius||0)+12)}));
 for(const f of data.railPoints?.features||[])if(['station','halt'].includes(tagsFor(f).railway)&&f.geometry.type==='Point')destinations.push({position:point(...geography.project(...f.geometry.coordinates),0),radius:45});
 const protectedNode=n=>n.id.startsWith('clip:')||destinations.some(d=>Math.hypot(n.position.x-d.position.x,n.position.z-d.position.z)<d.radius);
 const inCosmodrome=e=>[e.a,e.b].every(n=>n.coord[1]>=45.70&&!settlements.some(region=>region.contains(n.position)));
 const infrastructure=e=>e.tags.name||e.tags.ref||e.tags.destination||e.tags.bridge&&e.tags.bridge!=='no'||e.tags.tunnel&&e.tags.tunnel!=='no';
 roadPruning=pruneTerminalBranches(roadGraph,{maxLength:160,protectedEdges:roadProtected,protectedNode:n=>protectedNode(n)||EXHIBIT_ACCESS_NODE_IDS.includes(n.id)||krayniyClearance&&n.id===krayniyLayout.access.sourceNodeId,
  eligible:e=>inCosmodrome(e)&&!infrastructure(e)&&!MAIN.has(e.tags.highway?.replace('_link',''))&&!['driveway','parking_aisle'].includes(e.tags.service)});
 railPruning=pruneUnassignedRailTermini({graph:railGraph,maxLength:85,protectedEdges:railProtected,
  siteRecords,railPoints:data.railPoints?.features??[],schemeStations:railScheme.stations,
  geography,point,eligible:e=>inCosmodrome(e)&&!infrastructure(e)});
 // Simplify the displayed road webs only. Source-node graphs continue to
 // define vehicle routes; the later airport rail clearance is display-only.
 const excludedAirportEdges=new Set();
 let krayniyClearanceReport=null;
 if(krayniySite){
  const origin=point(krayniySite.x,krayniySite.y,0),yaw=krayniySite.runtimeYaw??2.06,
   local=p=>p.clone().sub(origin).applyAxisAngle(V(0,1,0),-yaw).divideScalar(.28).toArray(),
   rectangle={minX:-40,maxX:40,minZ:-855,maxZ:855},hiddenWayIds=[],protectedPortWays=new Set([...roadProtected].map(e=>e.wayId));
  for(const way of roadGraph.ways){
   if(MAIN.has(way.tags.highway?.replace('_link',''))||way.tags.name||way.tags.ref||protectedTrafficWays.has(way.osmId)||protectedPortWays.has(way.osmId))continue;
   const terminal=way.segments[0].a.edges.length===1||way.segments.at(-1).b.edges.length===1;
   if(!terminal||!way.segments.some(e=>rectangleSegmentInterval(local(e.a.position),local(e.b.position),rectangle)))continue;
   hiddenWayIds.push(way.osmId);way.segments.forEach(e=>excludedAirportEdges.add(e));
  }
  krayniyClearanceReport={id:'krayniy',source:'enlarged-museum-runway-clearance',profile:'remove-unneeded-terminal-roads',hiddenWayIds,rectangle,origin:origin.toArray(),yaw,scale:.28};
 }
 if(airportClearance){
  const protectedPortWays=new Set([...roadProtected].map(e=>e.wayId));
  for(const way of roadGraph.ways){
   if(MAIN.has(way.tags.highway?.replace('_link',''))||way.tags.highway==='unclassified'||protectedTrafficWays.has(way.osmId)||protectedPortWays.has(way.osmId))continue;
   if(way.segments.some(e=>rectangleSegmentInterval(airportLocal(e.a.position),airportLocal(e.b.position),airportClearance.rectangle))){
    airportClearance.hiddenServiceWays.add(way.osmId);way.segments.forEach(e=>excludedAirportEdges.add(e));
   }
  }
 }
 // The geographic terminal node lies inside the enlarged display apron.
 // Retain access to the actual exterior junction used by the new driveway,
 // without changing either the archived source node or the shared area spec.
 const exhibitAreas=EXHIBIT_ROAD_AREAS.map(area=>area.id==='krayniy'&&krayniyClearance?{...area,
  destinationNode:krayniyLayout.access.sourceNodeId,destinationSource:'way/'+krayniyLayout.access.sourceWayId}:area);
 // The 250A museum reconstruction is deliberately registered independently
 // of the obsolete OSM alias. Thin the OSM service-road spiderweb only around
 // the actual 250A model; preserve main roads and physical access source ways.
 const cryoRoadSite=siteRecords.find(s=>s.id==='pad-250a');
 if(cryoRoadSite)exhibitAreas.push({id:'pad-250a',name:'Площадка 250А',source:'museum-display-anchor',
  center:geography.inverseProject(cryoRoadSite.x,cryoRoadSite.y),radiusMeters:1600});
 // Remove short unnamed service webs on the left flank after protecting
 // traffic routes and every facility access. Source OSM topology stays intact.
 const leftWebEdges=new Set();
 for(const way of roadGraph.ways){
  if(way.tags.name||way.tags.ref||protectedTrafficWays.has(way.osmId)||way.segments.some(e=>roadProtected.has(e)))continue;
  if(!['service','track'].includes(way.tags.highway))continue;
  const length=way.segments.reduce((sum,e)=>sum+e.length,0);
  const left=way.segments.every(e=>(e.a.position.x+e.b.position.x)/2<-380);
  if(left&&length<260)for(const edge of way.segments)leftWebEdges.add(edge);
 }
 // At the bridge, remove only short terminal service-road leftovers.
 // A separate OSM way can otherwise leave a tiny detached asphalt strip
 // after adjacent branches have been hidden. Keep the full carriageway,
 // the bridge itself, all traffic routes, and every facility driveway.
 const bridgeRoadCleanupEdges=new Set(),bridgeRoadCleanupWays=[];
 if(interchangeBridgePlan){
  const bridgeCenter=interchangeBridgePlan.origin;
  for(const way of roadGraph.ways){
   if(!['service','track','residential','living_street'].includes(way.tags.highway)||
     way.tags.name||way.tags.ref||way.tags.destination||
     way.tags.bridge||way.tags.tunnel||
     protectedTrafficWays.has(way.osmId)||way.segments.some(e=>roadProtected.has(e)))continue;
   const length=way.segments.reduce((sum,e)=>sum+e.length,0);
   if(length>65||!way.segments.length)continue;
   const first=way.segments[0].a,last=way.segments.at(-1).b;
   if(first.edges.length!==1&&last.edges.length!==1)continue;
   if(!way.segments.some(e=>[e.a,e.b].some(node=>
     Math.hypot(node.position.x-bridgeCenter.x,node.position.z-bridgeCenter.z)<160)))continue;
   for(const edge of way.segments)bridgeRoadCleanupEdges.add(edge);
   bridgeRoadCleanupWays.push(way.osmId);
  }
 }
 // Remove short dead-end service-road webbing around the 106/109 pair.
 // A connected through road, arterial or destination-bearing access is never
 // eligible. The original OSM graph remains intact for routing.
 const twinSites=['pad-106','pad-109'].map(id=>siteRecords.find(s=>s.id===id)).filter(Boolean);
 const twinCentres=twinSites.map(s=>point(s.x,s.y,0));
 const twinRoadRemoved=new Set(),twinRoadRemovedWays=[];
 for(const way of roadGraph.ways){
  if(!['service','track','living_street'].includes(way.tags.highway)||
     way.tags.name||way.tags.ref||way.tags.destination||way.tags.bridge||
     protectedTrafficWays.has(way.osmId)||way.segments.some(e=>roadProtected.has(e)))continue;
  const length=way.segments.reduce((sum,e)=>sum+e.length,0);
  if(length>100||!way.segments.length)continue;
  const ends=[way.segments[0].a,way.segments.at(-1).b];
  if(!ends.some(n=>n.edges.length===1))continue;
  if(!twinCentres.some(center=>way.segments.some(e=>[e.a,e.b].some(n=>
    Math.hypot(n.position.x-center.x,n.position.z-center.z)<108))))continue;
  for(const edge of way.segments)twinRoadRemoved.add(edge);
  twinRoadRemovedWays.push(way.osmId);
 }
 exhibitRoadFilter=buildExhibitRoadFilter(roadGraph,{protectedEdges:roadProtected,protectedTrafficWays,areas:exhibitAreas,
  available:e=>!roadPruning.removed.has(e)&&!leftWebEdges.has(e),excludedEdges:excludedAirportEdges,geography,point});
 // The enlarged runway can extend beyond the source airport cleanup box.
 for(const edge of excludedAirportEdges)exhibitRoadFilter.removed.add(edge);
 for(const edge of leftWebEdges)exhibitRoadFilter.removed.add(edge);
 for(const edge of bridgeRoadCleanupEdges)exhibitRoadFilter.removed.add(edge);
 for(const edge of twinRoadRemoved)exhibitRoadFilter.removed.add(edge);
 for(const edge of site41Replacement.removed)exhibitRoadFilter.removed.add(edge);
 exhibitRoadFilter.stats.removedEdgeCount=exhibitRoadFilter.removed.size;
 exhibitRoadFilter.stats.bridgeCleanup={removedSegments:bridgeRoadCleanupEdges.size,removedWayIds:bridgeRoadCleanupWays};
 exhibitRoadFilter.stats.twinSiloRoadCleanup={removedSegments:twinRoadRemoved.size,removedWayIds:twinRoadRemovedWays};
 // Junction surfaces follow only retained source roads. Paint is planned
 // after all paving is assembled, using the same retained road corridors.
 checkpoint('pruned');
 const junctionWidths=new Map();
 const protectedRoadWays=new Set([...roadProtected].map(e=>e.wayId));
 function clipKrayniyCampus(points,wayId){
  if(!krayniyClearance)return [points];
  const local=points.map(krayniyLocal),touches=(run,r)=>run.some((p,i)=>i&&rectangleSegmentInterval(run[i-1],p,r));
  if(!krayniyClearance.rectangles.some(r=>touches(local,r)))return [points];
  // A future traffic/port change must remain visible and be reported, rather
  // than silently erasing the physical surface underneath a protected route.
  if(protectedTrafficWays.has(wayId)||protectedRoadWays.has(wayId)){krayniyClearance.protectedConflicts.add(wayId);return [points];}
  let runs=[local];krayniyClearance.sourceWays.add(wayId);
  for(const rectangle of krayniyClearance.rectangles){
   const next=[];
   for(const run of runs){
    if(!touches(run,rectangle)){next.push(run);continue;}
    const clipped=clipRoadOutsideRectangle(run,rectangle);next.push(...clipped.runs);
    krayniyClearance.cuts.push(...clipped.cuts.map(point=>({point,wayId,footprint:rectangle.id})));
   }
   runs=next;if(!runs.length)break;
  }
  return runs.map(run=>run.map(krayniyWorld));
 }
 // Site 2 borders the real primary road. Use that one short perpendicular
 // driveway instead of sending a new road around Gagarin's northern fork.
 const site2PrimaryWay=roadGraph.ways.find(way=>way.osmId===SITE2_PRIMARY_WAY_ID);
 const site2Spec=site2AccessCentre?{...FACILITY_PORTS['pad-2'],yaw:site2AccessCentre.runtimeYaw??FACILITY_PORTS['pad-2'].yaw}:null;
 const site2PrimaryGate=site2Spec?portWorld(site2Spec,site2Spec.road,site2AccessCentre,point):null;
 const site2PrimaryNearby=!!(site2PrimaryWay&&site2PrimaryGate&&site2PrimaryWay.segments.some(edge=>{
  const closest=new THREE.Line3(edge.a.position,edge.b.position).closestPointToPoint(site2PrimaryGate,true,V());
  return Math.hypot(closest.x-site2PrimaryGate.x,closest.z-site2PrimaryGate.z)<18;
 }));
 // Main access to Site 1 retains its real OSM road. The older Site 2 link
 // remains a fallback only if the museum is ever relocated off the primary.
 let gagarinApproach=null,gagarinRoadReport={status:site2PrimaryNearby?'site2-adjacent-primary':'unavailable'};
 const sourceGagarinWay=roadGraph.ways.find(way=>way.osmId===GAGARIN_APPROACH_WAY_ID);
 if(sourceGagarinWay&&gagarinAccessCentre&&site2AccessCentre&&!site2PrimaryNearby){
  try{
   const spec=FACILITY_PORTS['pad-2'],yaw=site2AccessCentre.runtimeYaw??spec.yaw;
   const gate=portWorld({...spec,yaw},spec.road,site2AccessCentre,point);
   gagarinApproach=planGagarinSite2Road({
    sourcePoints:[sourceGagarinWay.segments[0].a.position,...sourceGagarinWay.segments.map(edge=>edge.b.position)],
    gagarin:point(gagarinAccessCentre.x,gagarinAccessCentre.y,0),
    site2:point(site2AccessCentre.x,site2AccessCentre.y,0),
    site2Gate:gate,metre:MUSEUM_METRE
   });
  }catch(error){
   gagarinRoadReport={status:'fallback',error:String(error?.message||error)};
   console.warn('Gagarin access reverts to OSM source:',error);
  }
 }
 const site250aThroughWay=roadGraph.ways.find(w=>String(w.osmId)===SITE250A_THROUGH_WAY_ID);
 const use250aBypass=Boolean(site250aThroughWay&&siteRecords.some(s=>s.id==='pad-250a')&&siteRecords.some(s=>s.id==='pad-250'));
 for(const way of roadGraph.ways){
  // The source 54568055 road passes through the enlarged 250A footprint.
  // Its entire rendered ribbon is replaced by one offset, connected ribbon.
  if(use250aBypass&&way===site250aThroughWay)continue;
  if((gagarinApproach&&way.osmId===GAGARIN_APPROACH_WAY_ID)||isRedundantGagarinWay(way))continue;
  const major=MAIN.has(way.tags.highway?.replace('_link',''))||way.tags.highway==='unclassified',points=[];
  const visibleRuns=[];
  for(const region of settlements)if(way.segments.some(e=>region.contains(e.a.position)||region.contains(e.b.position)||region.contains(e.a.position.clone().lerp(e.b.position,.5)))){
   region.sourceWays.add(way.osmId);
   if(streetAllowed(region,way.tags)||protectedTrafficWays.has(way.osmId)){region.keptWays.add(way.osmId);if(protectedTrafficWays.has(way.osmId))region.trafficWays.add(way.osmId);}
   else{region.hiddenWays.add(way.osmId);if(region.id==='baikonur')hiddenCityWays.add(way.osmId);}
  }
  const render=()=>{
   if(points.length<2)return;
   let runs=[points];
   if(airportClearance&&!protectedTrafficWays.has(way.osmId)){
    const clipped=clipRoadOutsideRectangle(points.map(airportLocal),airportClearance.rectangle);
    runs=clipped.runs.map(run=>run.map(airportWorld));
    if(clipped.cuts.length){airportClearance.sourceWays.add(way.osmId);airportClearance.cuts.push(...clipped.cuts.map(p=>({point:p,wayId:way.osmId,width:way.width})));}
   }
   runs=runs.flatMap(run=>clipKrayniyCampus(run,way.osmId));
   for(const run of runs)if(drawRoad(run,way.width,way.tags,major,false,way.osmId,visibleRuns))renderedRoadWays.add(way.osmId);
  };
  for(const e of way.segments){
   if(!edgeKept(roadGraph,e)){render();points.length=0;continue;}
   if(points.length&&points.at(-1).distanceTo(e.a.position)>1e-5){render();points.length=0;}
   if(!points.length)points.push(e.a.position);points.push(...(e.surfacePoints?e.surfacePoints.slice(1):[e.b.position]));
   for(const n of [e.a,e.b])junctionWidths.set(n.id,Math.max(junctionWidths.get(n.id)||0,way.width));
  }
  render();
  // Keep compact centre-lines for the interactive editor, including visible
  // minor roads that are intentionally omitted from active vehicle routes.
  // No extra road meshes are allocated: only sampled pickable coordinates.
  visibleRuns.forEach((run,i)=>editableRoadPaths.push({id:'osm-road-'+way.osmId+(i?'-'+i:''),
   label:'Автодорога',width:way.width,points:run,osmWayIds:[way.osmId],source:'OpenStreetMap',
   tags:{...way.tags},marked:major,highway:isHighwayRoad(way.tags),
   surface:way.tags.highway==='track'||['ground','unpaved','dirt','sand'].includes(way.tags.surface)?'ground':'asphalt'}));
  if(major)visibleRuns.forEach((run,i)=>roadPaths.push({id:'osm-road-'+way.osmId+(i?'-'+i:''),label:'Автодорога',width:way.width,points:run,osmWayIds:[way.osmId],source:'OpenStreetMap',highway:isHighwayRoad(way.tags),
    tags:{...way.tags},marked:true,surface:way.tags.highway==='track'||['ground','unpaved','dirt','sand'].includes(way.tags.surface)?'ground':'asphalt'}));
 }
 checkpoint('roads');
 let junctionCount=0;
 for(const n of roadGraph.nodes.values())if(n.edges.filter(e=>edgeKept(roadGraph,e)&&renderedRoadWays.has(e.wayId)&&!settlementHidden(n.position,e.tags,e.wayId)).length>2){
  const width=junctionWidths.get(n.id)||1.6;
  if(masked(n.position,{},width/2+.3)||inAirportClearance(n.position)&&!n.edges.some(e=>protectedTrafficWays.has(e.wayId))||inKrayniyClearance(n.position)&&!n.edges.some(e=>protectedTrafficWays.has(e.wayId)||roadProtected.has(e)))continue;
  // Highway strips already share an exact centre and a common merge tangent.
  // A horizontal junction disc would protrude through their graded approaches.
  if(!n.edges.some(e=>isHighwayRoad(e.tags))){shoulder.disc(n.position,width/2+.3,-.055);asphalt.disc(n.position,width*.51);}
  junctionCount++;
 }
 // Exactly one Gagarin road and one branch to Site 2; these share
 // precise endpoints rather than overlapping guessed centre lines.
 if(gagarinApproach){
  const sourceId=GAGARIN_APPROACH_WAY_ID;
  const mainPoints=gagarinApproach.main.map(p=>V(...p)),mainRuns=[];
  drawRoad(mainPoints,3.2,{highway:'unclassified',surface:'asphalt'},true,true,sourceId,mainRuns);
  renderedRoadWays.add(sourceId);
  // The OSM way may be stored in either direction. Seal the fork at the
  // displayed road's true main-road end, not blindly at segment[0].a.
  const sourceEnds=[sourceGagarinWay.segments[0].a,sourceGagarinWay.segments.at(-1).b];
  const startNode=sourceEnds.reduce((a,b)=>Math.hypot(a.position.x-mainPoints[0].x,a.position.z-mainPoints[0].z)
   <=Math.hypot(b.position.x-mainPoints[0].x,b.position.z-mainPoints[0].z)?a:b);
  const mainRoadJoinGap=Math.hypot(startNode.position.x-mainPoints[0].x,startNode.position.z-mainPoints[0].z);
  if(mainRoadJoinGap>1e-4)throw Error('Gagarin access road lost its OSM main-road junction');
  const mainRoadHostWays=[...new Set(startNode.edges.filter(edge=>edge.wayId!==sourceId&&edgeKept(roadGraph,edge)).map(edge=>edge.wayId))];
  shoulder.disc(startNode.position,2.25,-.055);
  asphalt.disc(startNode.position,1.9);
  junctionWidths.set(startNode.id,Math.max(3.2,junctionWidths.get(startNode.id)||0));
  roadPaths.push({id:'gagarin-approach-road',label:'Дорога на Гагаринский старт',width:3.2,
   points:mainRuns.flat(),source:'osm-guided-museum-correction',osmWayIds:[sourceId]});
  const site=site2AccessCentre,spec={...FACILITY_PORTS['pad-2'],yaw:site.runtimeYaw??FACILITY_PORTS['pad-2'].yaw};
  const gate=portWorld(spec,spec.road,site,point),junction=V(...gagarinApproach.branchStart);
  const towardsSite=gate.clone().sub(junction).setY(0).normalize();
  const tangent=V(...gagarinApproach.branchTangent).setY(0).normalize().multiplyScalar(.22)
   .addScaledVector(towardsSite,.78).normalize();
  const inward=V(...spec.roadOutward).negate().applyAxisAngle(V(0,1,0),spec.yaw).normalize();
  const endWidth=(spec.roadWidth??6)*spec.scale;
  const transition=createAccessTransition({start:junction,end:gate,startTangent:tangent,endTangent:inward,
   startWidth:3.2,endWidth,sampleStep:.3});
  const spurRuns=[];
  drawRoad(transition.points,3.2,{highway:'service',surface:'asphalt'},false,true,null,spurRuns,
   [{nodeId:'museum-port:pad-2',position:junction.clone(),hostWayId:sourceId}],{widthAt:transition.widthAt});
  shoulder.disc(junction,2.2,-.055);asphalt.disc(junction,1.88);
  roadPaths.push({id:'gagarin-site2-turnoff',label:'Съезд на площадку № 2',
   points:spurRuns.flat(),width:3.2,widthAt:transition.widthAt,
   source:'museum-port-to-OSM-main',osmWayIds:[sourceId]});
  accessReports.push({id:'pad-2',sourceWayId:sourceId,roadGap:transition.points.at(-1).distanceTo(gate),
   gate:gate.toArray(),sourcePoint:junction.toArray(),sourceTangent:tangent.toArray(),
   gateInward:inward.toArray(),...transition.stats,profile:'one-turnoff-on-Gagarin-road'});
  connections++;
  gagarinRoadReport={status:'connected',...gagarinApproach.metrics,
   branchEndGap:transition.points.at(-1).distanceTo(gate),
   branchStartGap:transition.points[0].distanceTo(junction),
   branchLength:transition.length,sourceJunction:startNode.id,
   mainRoadJoinGap,mainRoadHostWays,
   mainRuns:mainRuns.length,spurRuns:spurRuns.length,
   forecourt:mainPoints.at(-1).toArray()};
 }
 if(krayniyClearanceReport){
  const access=krayniyLayout.access,source=roadGraph.nodes.get(access.sourceNodeId),sourcePoint=source?.position,
   sourceRendered=!!sourcePoint&&roadPaths.some(r=>r.source==='OpenStreetMap'&&r.osmWayIds?.includes(access.sourceWayId)&&r.points.some(p=>p.distanceTo(sourcePoint)<1e-5)),
   sourceGap=sourcePoint?krayniyWorld(access.anchors[0]).distanceTo(sourcePoint):null;
  krayniyClearanceReport.campus={source:'synthetic-museum-display-clearance',profile:'clip-displayed-roads-to-terminal-campus',
   footprints:krayniyClearance.footprints,rectangles:krayniyClearance.rectangles,shoulderMargin:krayniyClearance.margin,
   clippedWayIds:[...krayniyClearance.sourceWays],hiddenWayIds:[...krayniyClearance.sourceWays].filter(id=>!renderedRoadWays.has(id)),
   protectedConflicts:[...krayniyClearance.protectedConflicts],cuts:krayniyClearance.cuts,bypassCount:0,
   gateAccess:{profile:'landside-terminal-access',sourceWayId:access.sourceWayId,sourceNodeId:access.sourceNodeId,
    sourcePoint:sourcePoint?.toArray()??null,sourceGap,sourceRendered,gatePoint:krayniyWorld(access.anchors.at(-1)).toArray(),modelConnector:'krayniy-terminal'}};
  const region=exhibitRoadFilter.stats.regions.find(r=>r.id==='krayniy');
  if(region?.access)Object.assign(region.access,{sourceGraphConnected:region.access.connected,displayConnected:sourceRendered&&sourceGap<1e-5,
   connected:region.access.connected&&sourceRendered&&sourceGap<1e-5,displayDestination:'landside-parking-via-terminal-connector'});
 }
 let airportClearanceReport=null;
 if(airportClearance){
  const raw=airportPerimeterBypass(airportClearance.cuts.map(c=>c.point),airportClearance.rectangle),rounded=[];
  // Round only perimeter corners, leaving every source-road join exact.
  for(let i=0;i<raw.length;i++){
   const p=raw[i],r=airportClearance.rectangle,corner=(Math.abs(p[0]-r.minX)<1e-6||Math.abs(p[0]-r.maxX)<1e-6)&&(Math.abs(p[2]-r.minZ)<1e-6||Math.abs(p[2]-r.maxZ)<1e-6);
   if(!i||i===raw.length-1||!corner){rounded.push(airportWorld(p));continue;}
   const a=V(...raw[i-1]),b=V(...p),c=V(...raw[i+1]),reach=Math.min(28,a.distanceTo(b)*.22,b.distanceTo(c)*.22),entry=b.clone().lerp(a,reach/a.distanceTo(b)),exit=b.clone().lerp(c,reach/b.distanceTo(c));
   const curve=new THREE.QuadraticBezierCurve3(entry,b,exit);
   for(let j=0;j<=10;j++)rounded.push(airportWorld(curve.getPoint(j/10).toArray()));
  }
  if(rounded.length>1){
   const markingConnections=airportClearance.cuts.map((cut,i)=>({nodeId:'airport-bypass:'+cut.wayId+':'+i,position:airportWorld(cut.point),hostWayId:cut.wayId}));
   drawRoad(rounded,2.4,{},false,true,null,null,markingConnections);
   roadPaths.push({id:'airport-clearance-yubileiny',label:'Юбилейный · обход музейной ВПП',points:rounded,width:2.4,source:'museum-airport-display-clearance',osmWayIds:[...airportClearance.sourceWays]});
   for(const cut of airportClearance.cuts){const p=airportWorld(cut.point);shoulder.disc(p,Math.max(cut.width,2.4)/2+.3,-.055);asphalt.disc(p,Math.max(cut.width,2.4)*.51);}
  }
  const bypass=rounded.length>1?distancePath(rounded):null;
  const joinGaps=airportClearance.cuts.map(cut=>{
   const p=airportWorld(cut.point);let gap=Infinity;
   for(let i=1;i<rounded.length;i++)gap=Math.min(gap,new THREE.Line3(rounded[i-1],rounded[i]).closestPointToPoint(p,true,V()).distanceTo(p));
   return {sourceWayId:cut.wayId,position:p.toArray(),gap};
  });
  airportClearanceReport={id:'yubileiny',source:'synthetic-museum-display-clearance',reason:'enlarged-airport-model',
   envelope:{...airportClearance.rectangle},scale:airportClearance.scale,yaw:airportClearance.yaw,origin:airportClearance.origin.toArray(),
   sourceWayIds:[...airportClearance.sourceWays],hiddenServiceWayIds:[...airportClearance.hiddenServiceWays],
   bypassCount:rounded.length>1?1:0,bypassLength:bypass?.length||0,bypassWidth:2.4,joinGaps,
   additionalAirports:krayniyClearanceReport?[krayniyClearanceReport]:[],
   preservedTrafficWayIds:[...airportClearance.sourceWays].filter(id=>protectedTrafficWays.has(id))};
 }
 // The source airport railway lies beyond the real runway end, but crosses
 // the enlarged museum runway. Clip all displayed railway components to the
 // same campus envelope, with room for the complete ballast / sleeper width.
 const railHalfWidth=Math.max(RAIL_PROFILE.ballastWidth/2,Math.hypot(RAIL_PROFILE.sleeperLength,RAIL_PROFILE.sleeperWidth)/2,
  (RAIL_PROFILE.gauge+RAIL_PROFILE.bodyWidth)/2);
 const railClearanceReport=airportClearance?{version:'airport-rail-display-clearance-v1',sourceGraphUnchanged:true,
  envelope:{...airportClearance.rectangle},marginWorld:railHalfWidth+.02,clippedWayIds:[],clippedSourceRuns:0,displayedFragments:0,cuts:[]}:null;
 if(airportClearanceReport)airportClearanceReport.rail=railClearanceReport;
 function clipAirportRails(points,wayId,endGauge){
  if(!airportClearance)return [points];
  const margin=(railHalfWidth*Math.max(1,endGauge/RAIL_PROFILE.gauge)+.02)/airportClearance.scale,r=airportClearance.rectangle,
   rectangle={minX:r.minX-margin,maxX:r.maxX+margin,minZ:r.minZ-margin,maxZ:r.maxZ+margin},local=points.map(airportLocal);
  if(!local.some((p,i)=>i&&rectangleSegmentInterval(local[i-1],p,rectangle)))return [points];
  const clipped=clipRoadOutsideRectangle(local,rectangle),runs=clipped.runs.map(run=>run.map(airportWorld));
  if(wayId&&!railClearanceReport.clippedWayIds.includes(wayId))railClearanceReport.clippedWayIds.push(wayId);
  railClearanceReport.clippedSourceRuns++;railClearanceReport.displayedFragments+=runs.length;
  railClearanceReport.cuts.push(...clipped.cuts.map(p=>({sourceWayId:wayId,position:airportWorld(p).toArray()})));
  return runs;
 }
 function drawRail(points,isAbandoned=false,force=false,endGauge=RAIL_PROFILE.gauge,wayId=null,directionAt=null,sleeperAnchor=null){
  if(points.length<2)return [];
  const airportRuns=clipAirportRails(points,wayId,RAIL_PROFILE.gauge),displayed=force?airportRuns:airportRuns.flatMap(run=>railSiteClearance.clipPath(run,{sourceWayId:wayId}).runs),renderedRuns=[];
  for(const visible of displayed){
   const samples=conformRailPath(visible,RAIL_PROFILE.ballastWidth),path=distancePath(samples);if(path.length<.01)continue;
   const runs=[];let run=[];
   const isVisible=p=>force||!railMasked(p),flush=()=>{if(run.length>1)runs.push(run);run=[];};
   for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i],va=isVisible(a),vb=isVisible(b);
    if(va&&!run.length)run.push(a);
    if(va!==vb){let lo=0,hi=1;for(let j=0;j<30;j++){const mid=(lo+hi)/2;if(isVisible(a.clone().lerp(b,mid))===va)lo=mid;else hi=mid;}
     const cut=a.clone().lerp(b,(lo+hi)/2);if(va){run.push(cut);flush();}else run.push(cut);
    }
    if(vb)run.push(b);else flush();
   }flush();renderedRuns.push(...runs);
   for(const ps of runs){
    terrainRailPaths.push({points:ps,width:isAbandoned?.8:RAIL_PROFILE.ballastWidth,abandoned:isAbandoned,sourceWayId:wayId});
    if(isAbandoned){abandoned.ribbon(ps,.8,.01);continue;}
    ballast.ribbon(ps,RAIL_PROFILE.ballastWidth,RAIL_PROFILE.ballastY,0,0,directionAt);
    for(const side of [-1,1])steel.ribbon(ps,RAIL_PROFILE.headWidth,RAIL_PROFILE.headY,side*RAIL_PROFILE.gauge/2,0,directionAt,null,RAIL_PROFILE.railHeight);
   }
   if(isAbandoned)continue;
   const sleeperDistances=sleeperAnchor?railApproachSleeperDistances(path.length,{step:RAIL_PROFILE.sleeperStep,anchor:sleeperAnchor}):[];
   if(!sleeperAnchor)for(let d=.4;d<path.length;d+=1.45)sleeperDistances.push(d);
   for(const d of sleeperDistances){const at=path.sample(d,sleeperAnchor ? .035 : .3);if(!force&&railMasked(at.position))continue;const normal=V(-at.tangent.z,0,at.tangent.x).normalize(),half=RAIL_PROFILE.sleeperLength/2,a=at.position.clone().addScaledVector(normal,-half),b=at.position.clone().addScaledVector(normal,half);ties.ribbon([a,b],RAIL_PROFILE.sleeperWidth,RAIL_PROFILE.sleeperY+RAIL_PROFILE.sleeperHeight/2,0,0,null,null,RAIL_PROFILE.sleeperHeight);railTies++;}
  }
  return renderedRuns;
 }
 // Preserve source-level crossings; move parallel displayed rails away from
 // every retained road by a full roadway width, measured edge-to-edge.
 const railRoadClearance=separateRailGraphFromRoads({railGraph,roads:markingRoads,excludedEdges:replacedRailEdges,
  pinnedNodes:[railStart.position,railEnd.position,...[...railSeams.keys()].map(id=>railGraph.nodes.get(String(id))?.position).filter(Boolean)],
  headY:RAIL_PROFILE.headY,railHalfWidth:RAIL_PROFILE.ballastWidth/2});
 const pad5RailStraightening=straightenPad5Rail({railGraph,roads:markingRoads,railHalfWidth:RAIL_PROFILE.ballastWidth/2});
 const railCornerIndex=buildRailRoadIndex(markingRoads,{railHalfWidth:RAIL_PROFILE.ballastWidth/2});
 const railCornerProtected=[...railGraph.nodes.values()].filter(node=>node.edges.length!==2).map(node=>node.position).concat([railStart.position,railEnd.position,...[...railSeams.keys()].map(id=>railGraph.nodes.get(String(id))?.position).filter(Boolean),railRoadClearance.crossings.map(hit=>V(hit.x,hit.y,hit.z))]);
 const site5HiddenRailWays=new Set(['172458462','172458465']);
 for(const way of railGraph.ways){
  if(site5HiddenRailWays.has(String(way.osmId)))continue;
  const points=[];let run=0;
  const render=()=>{if(points.length<2)return;
   let display=points;
   if(['37543646','37547653'].includes(String(way.osmId))){
    const x0=(620.85-650)*3.4,lo=525,hi=565;
    display=points.map(p=>{
     const my=p.z/3.4+522.5;
     if(my<lo||my>hi)return p;
     const weight=THREE.MathUtils.smoothstep(my,lo,lo+7)*(1-THREE.MathUtils.smoothstep(my,hi-7,hi));
     const q=p.clone();q.x=THREE.MathUtils.lerp(p.x,x0,weight);return q;
    });
   }
   for(const visible of drawRail(way.abandoned?display:roundRailCorners(display,{index:railCornerIndex,protectedPoints:railCornerProtected,railHalfWidth:RAIL_PROFILE.ballastWidth/2}),way.abandoned,false,RAIL_PROFILE.gauge,way.osmId,null)){
   renderedRailWays.add(way.osmId);railPaths.push({id:'osm-rail-'+way.osmId+(run?'-'+run:''),points:[...visible],width:RAIL_PROFILE.ballastWidth,source:'OpenStreetMap',osmWayIds:[way.osmId]});run++;
  }};
  for(const e of way.segments){
   if(!edgeKept(railGraph,e)||replacedRailEdges.has(e)){render();points.length=0;continue;}
   if(points.length&&points.at(-1).distanceTo(e.a.position)>1e-5){render();points.length=0;}
   const surface=e.surfacePoints??[e.a.position,e.b.position];if(!points.length)points.push(surface[0]);points.push(...surface.slice(1));
  }render();
 }
 // Nearest physical segment, used only for the short museum-scale apron
 // transition. Every long-distance route remains a path of shared OSM nodes.
 function nearestSegment(graph,target,filter=()=>true){
  let best=null;
  for(const e of graph.edges){
   if(e.abandoned||!edgeKept(graph,e)||graph===railGraph&&replacedRailEdges.has(e)||!filter(e))continue;
   const samples=e.surfacePoints??[e.a.position,e.b.position];
   const bounds=e.approachBounds??=(samples.reduce((box,p)=>[Math.min(box[0],p.x),Math.max(box[1],p.x),Math.min(box[2],p.z),Math.max(box[3],p.z)],[Infinity,-Infinity,Infinity,-Infinity]));
   const dx=Math.max(bounds[0]-target.x,0,target.x-bounds[1]),dz=Math.max(bounds[2]-target.z,0,target.z-bounds[3]);
   if(best&&dx*dx+dz*dz>best.distance)continue;
   for(let i=1;i<samples.length;i++){
    const p=new THREE.Line3(samples[i-1],samples[i]).closestPointToPoint(target,true,V());
    if((graph===railGraph?railMasked(p,e.width/2+.3):masked(p,{},e.width/2+.3,e.wayId))||graph===roadGraph&&inAirportClearance(p))continue;
    p.y=(graph===railGraph?railTerrainDatum:terrainDatum)(p,e.width);
    if(graph===roadGraph)p.y=roadGraph.highwaySurfaceHeight(p,e.width)+(isHighwayRoad(e.tags)?HIGHWAY_ASPHALT_LIFT:0);
    const distance=p.distanceToSquared(target);
    if(!best||distance<best.distance){
     const chord=samples[i].clone().sub(samples[i-1]).normalize(),tangent=graph===railGraph?railSurface.directionAt(e.wayId)(p,chord):chord;
     best={edge:e,point:p,distance,tangent};
    }
   }
  }
  return best;
 }
 function assignedRailJoin(port){
  const route=mikRailSourcePlan.destinationRoutes.find(route=>route.id===port.sourceRouteId);if(!route)return null;
  for(let i=route.edges.length-1;i>=0;i--){
   const edge=route.edges[i];if(replacedRailEdges.has(edge)||!edgeKept(railGraph,edge))continue;
   const points=graphRailRoutePoints({nodeIds:route.nodeIds.slice(i,i+2),edges:[edge]});
   for(let j=points.length-1;j>0;j--){
    const a=points[j-1],b=points[j],va=!railMasked(a),vb=!railMasked(b);if(!va)continue;
    let p=b.clone();
    if(!vb){let lo=0,hi=1;for(let k=0;k<36;k++){const mid=(lo+hi)/2;if(railMasked(a.clone().lerp(b,mid)))hi=mid;else lo=mid;}p=a.clone().lerp(b,(lo+hi)/2);}
    const tangent=railSurface.directionAt(edge.wayId)(p,b.clone().sub(a).normalize());
    return {edge,point:p,tangent,distance:0,sourceRouteId:route.id,sourceNodeId:port.sourceNodeId};
   }
  }
  return null;
 }
 // The cryogenic centre already has a dedicated through-route toward UKSS.
 // Resolve that route BEFORE generic gate approaches so the museum never draws
 // a second overlapping driveway into the same entrance.
 const cryoThroughSite=siteRecords.find(s=>s.id==='pad-250a');
 const ukssThroughSite=siteRecords.find(s=>s.id==='pad-250');
 let cryoThrough=null;
 if(use250aBypass){
  const cryoSpec={...FACILITY_PORTS['pad-250a'],yaw:cryoThroughSite.runtimeYaw??FACILITY_PORTS['pad-250a'].yaw};
  const ukssSpec={...FACILITY_PORTS['pad-250'],yaw:ukssThroughSite.runtimeYaw??FACILITY_PORTS['pad-250'].yaw};
  const cryoGate=portWorld(cryoSpec,cryoSpec.road,cryoThroughSite,point);
  const ukssGate=portWorld(ukssSpec,ukssSpec.road,ukssThroughSite,point);
  const siteCenter=point(cryoThroughSite.x,cryoThroughSite.y,cryoSpec.elevation??-2.72);
  const nodes=[site250aThroughWay.segments[0].a.position,...site250aThroughWay.segments.map(e=>e.b.position)];
  const plan=planSite250aThroughRoad({sourcePoints:nodes.map(p=>p.toArray()),siteCenter:siteCenter.toArray(),
   siteYaw:cryoSpec.yaw,cryoGate:cryoGate.toArray(),ukssGate:ukssGate.toArray()});
  cryoThrough={cryoGate,ukssGate,cryoSpec,ukssSpec,sourceWay:site250aThroughWay,plan};
 }
 for(const [id,baseSpec] of Object.entries(FACILITY_PORTS)){
  if(TWIN_SILO_IDS.has(id))continue;
  if(id==='pad-2'&&gagarinApproach)continue; // Site 2 already has its only road connection.
  if(id==='pad-250a'&&cryoThrough)continue; // 250A itself has no rail sockets.
  const bypassRoad=Boolean(cryoThrough&&id==='pad-250'); // Only the UKSS car driveway is superseded.
  const site=siteRecords.find(s=>s.id===id);if(!site)continue;const spec={...baseSpec,yaw:site.runtimeYaw??baseSpec.yaw},gate=portWorld(spec,spec.road,site,point),out=V(...(spec.roadOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),spec.yaw),target=id==='pad-2'&&site2PrimaryNearby?gate.clone():gate.clone().addScaledVector(out,30);
  const near=id==='pad-41'&&site41Replacement.attachmentEdge?{
   edge:site41Replacement.attachmentEdge,point:site41Replacement.attachmentEdge.b.position.clone(),distance:0,
   tangent:(site41Replacement.attachmentEdge.surfaceTangents?.[1]??site41Replacement.attachmentEdge.b.position.clone().sub(site41Replacement.attachmentEdge.a.position).normalize()).clone()
  }:bypassRoad?null:nearestSegment(roadGraph,target,e=>id==='pad-2'&&site2PrimaryNearby?e.wayId===SITE2_PRIMARY_WAY_ID:e.tags.highway!=='track'&&airportPortSourceAllowed(id,e)&&!masked(e.a.position.clone().lerp(e.b.position,.5),e.tags));
  if(!bypassRoad&&(!near||near.distance>300**2))continue;
  if(!bypassRoad){
  const tangent=id==='pad-2'&&site2PrimaryNearby?gate.clone().sub(near.point).setY(0).normalize():near.tangent.clone();if(tangent.dot(gate.clone().sub(near.point))<0)tangent.negate();
  let anchors=(spec.roadApproach??[]).map(local=>portWorld(spec,local,site,point));
  if(id==='pad-251'&&airportClearance){
   const start=airportLocal(near.point),end=airportLocal(gate),laneX=airportClearance.rectangle.maxX;
   anchors=simplifyPath([[Math.max(start[0],laneX),start[1],end[2]],[laneX,end[1],end[2]]].map(airportWorld));
  }
  if(spec.silo){
   // Keep the entry outside the fence, then descend smoothly to its front gate.
   const center=point(site.x,site.y,0),radius=13,angle=Math.atan2(near.point.x-center.x,near.point.z-center.z),endAngle=Math.atan2(out.x,out.z);let sweep=endAngle-angle;
   while(sweep>Math.PI)sweep-=Math.PI*2;while(sweep<-Math.PI)sweep+=Math.PI*2;
   anchors=[];for(let j=0;j<=12;j++){const a=angle+sweep*j/12;anchors.push(V(center.x+Math.sin(a)*radius,near.point.y,center.z+Math.cos(a)*radius));}
   anchors.push(gate.clone().addScaledVector(out,2.5));
  }
  const endWidth=(spec.roadWidth??1.8/spec.scale)*spec.scale;
  const transition=createAccessTransition({start:near.point,end:gate,startTangent:tangent,endTangent:out.clone().negate(),anchors,startWidth:near.edge.width,endWidth,startSlope:tangent.y/Math.hypot(tangent.x,tangent.z)});
  const points=transition.points,visibleRuns=[],width=Math.max(near.edge.width,endWidth);
  const accessDirection=(p,fallback)=>p.distanceToSquared(gate)<1e-10?out.clone().negate():p.distanceToSquared(near.point)<1e-10?tangent:highwayDirectionAt(p,fallback);
  drawRoad(points,width,{},false,true,null,visibleRuns,[{nodeId:'museum-port:'+id,position:near.point.clone(),hostWayId:near.edge.wayId}],{widthAt:transition.widthAt,directionAt:accessDirection});
  const renderedPoints=visibleRuns.flat();
  roadPaths.push({id:'osm-access-'+id,label:site.titleShort||site.name,points:renderedPoints,width:1.8,widthAt:transition.widthAt,source:'museum-model-port',osmWayIds:[near.edge.wayId]});
  const mainRoadCorner=id==='pad-2'&&site2PrimaryNearby;
  accessReports.push({id,sourceWayId:near.edge.wayId,roadGap:points.at(-1).distanceTo(gate),gate:gate.toArray(),sourcePoint:near.point.toArray(),sourceTangent:tangent.toArray(),gateInward:out.clone().negate().toArray(),...transition.stats,
   ...(mainRoadCorner?{profile:'single-primary-road-to-site2-corner',junctionAngleDegrees:Math.acos(Math.min(1,Math.abs(near.tangent.clone().setY(0).normalize().dot(tangent))))*180/Math.PI,parallelRoadsAdded:0}:{} )});connections++;
  if(mainRoadCorner)gagarinRoadReport={status:'site2-connected-to-primary',sourceWayId:near.edge.wayId,
   sourceGap:transition.points[0].distanceTo(near.point),gateGap:transition.points.at(-1).distanceTo(gate),length:transition.length,
   sourceJunction:near.point.toArray(),museumCorner:gate.toArray(),parallelRoadsAdded:0};
  if(id==='pad-251'&&airportClearanceReport)airportClearanceReport.gateAccess={sourceWayId:near.edge.wayId,sourcePoint:near.point.toArray(),gatePoint:gate.toArray(),
   profile:'landside-terminal-access',sampleCount:points.length,sourceGap:points[0].distanceTo(near.point),gateGap:points.at(-1).distanceTo(gate),
   airsideHits:points.filter(p=>{const [x,,z]=airportLocal(p);return x>-36&&x<36&&Math.abs(z)<1250;}).length};
  }
  // Model rail sockets are independent of the optional museum car driveway.
  const railPorts=spec.railConnections??(spec.rail||[]).map((position,i)=>({id:id+'-rail-'+i,position,outward:spec.railOutward??[0,0,1]}));
  for(const port of railPorts){
   const railOut=V(...(port.outward||spec.railOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),spec.yaw);
   const headCenter=portWorld(spec,port.position,site,point),end=headCenter.clone().add(V(0,-RAIL_PROFILE.headY,0)),fanTrack=id==='pad-110'?site110Fan?.tracks.find(track=>track.id===port.id):null;
   const rr=fanTrack?{edge:{wayId:fanTrack.sourceWayId},point:V(...fanTrack.sourcePoint),tangent:V(...fanTrack.sourceTangent),distance:0}:port.sourceRouteId?assignedRailJoin(port):nearestSegment(railGraph,port.sourceTarget?portWorld(spec,port.sourceTarget,site,point):end.clone().addScaledVector(railOut,35),e=>(!port.sourceWayId||e.wayId===port.sourceWayId)&&!railMasked(e.a.position.clone().lerp(e.b.position,.5)));if(!rr||rr.distance>250**2)continue;
   const tangent=rr.tangent.clone();if(tangent.dot(end.clone().sub(rr.point))<0)tangent.negate();
   const transition=fanTrack??createAccessTransition({start:rr.point,end,startTangent:tangent,endTangent:railOut.clone().negate(),anchors:(port.approach??[]).map(p=>portWorld(spec,p,site,point)),startWidth:RAIL_PROFILE.ballastWidth,endWidth:RAIL_PROFILE.ballastWidth,sampleStep:.4,startSlope:tangent.y/Math.hypot(tangent.x,tangent.z)}),points=transition.points,endGauge=RAIL_PROFILE.gauge;
   const frame=(p,fallback)=>p.distanceToSquared(end)<1e-10?railOut.clone().negate():p.distanceToSquared(rr.point)<1e-10?tangent:fallback;
   drawRail(points,false,true,endGauge,null,frame,'end');connections++;
   const renderedHeadCenter=points.at(-1).clone().add(V(0,RAIL_PROFILE.headY,0));railPortReports.push({id,portId:port.id,sourceWayId:rr.edge.wayId,sourceNodeId:port.sourceNodeId??null,sourceRouteId:port.sourceRouteId??null,sourcePoint:rr.point.toArray(),sourceTangent:tangent.toArray(),gateInward:railOut.clone().negate().toArray(),points:points.map(p=>p.toArray()),headCenter:headCenter.toArray(),renderedHeadCenter:renderedHeadCenter.toArray(),headCenterGap:renderedHeadCenter.distanceTo(headCenter),networkDatumGap:points[0].distanceTo(rr.point),networkGauge:RAIL_PROFILE.gauge,portGauge:endGauge,physicalGaugeMetres:spec.physicalRailGauge??null,
    ...(fanTrack?{displaySourceNodeId:fanTrack.displaySourceNodeId,displayLayout:site110Fan.version,sourceDestination:fanTrack.originalDestination,metrics:fanTrack.metrics}:{} )});
  }
 }
 // A broken carriageway near the twin silos is joined only when two
 // exposed main-road ends face one another, with no existing asphalt between
 // them. This does not touch source OSM geometry or unrelated intersections.
 const twinThroughRepair={status:'not-needed',gap:0,roadIds:[]};
 const loose=[];
 for(const road of roadPaths){
  const kind=road.tags?.highway?.replace('_link','');
  if(!['primary','secondary','tertiary','unclassified'].includes(kind)||road.points?.length<2)continue;
  for(const end of [0,road.points.length-1]){
   const p=road.points[end],q=road.points[end?end-1:1];
   if(!twinCentres.some(center=>Math.hypot(p.x-center.x,p.z-center.z)<145))continue;
   const direction=p.clone().sub(q).setY(0).normalize();
   loose.push({road,p,direction,end});
  }
 }
 let repair=null;
 for(let i=0;i<loose.length;i++)for(let j=i+1;j<loose.length;j++){
  const a=loose[i],b=loose[j];if(a.road===b.road)continue;
  const dx=b.p.x-a.p.x,dz=b.p.z-a.p.z,gap=Math.hypot(dx,dz);
  if(gap<3||gap>62)continue;
  const axis=V(dx/gap,0,dz/gap);
  if(a.direction.dot(axis)<.82||b.direction.dot(axis)>-.82)continue;
  // Do not lay a second carriageway across an already connected intersection.
  const mid=a.p.clone().lerp(b.p,.5);
  const covered=roadPaths.some(road=>{
   if(road===a.road||road===b.road||road.points?.length<2)return false;
   for(let k=1;k<road.points.length;k++){
    const q=new THREE.Line3(road.points[k-1],road.points[k]).closestPointToPoint(mid,true,V());
    if(Math.hypot(q.x-mid.x,q.z-mid.z)<Math.max(2,road.width/2))return true;
   }return false;
  });
  if(covered)continue;
  if(!repair||gap<repair.gap)repair={a,b,gap};
 }
 if(repair){
  const {a,b,gap}=repair;
  const points=[a.p,a.p.clone().addScaledVector(a.direction,gap*.23),
   b.p.clone().addScaledVector(b.direction,gap*.23),b.p];
  const smooth=new THREE.CatmullRomCurve3(points,false,'centripetal',.3);
  const sampleCount=Math.max(8,Math.ceil(gap));
  const samples=Array.from({length:sampleCount},(_,i)=>smooth.getPoint(i/(sampleCount-1)));
  const width=Math.max(a.road.width,b.road.width),runs=[];
  drawRoad(samples,width,{highway:'unclassified',surface:'asphalt'},true,true,null,runs);
  roadPaths.push({id:'twin-silo-through-ad-repair',label:'Восстановленная основная АД 106/109',
   width,points:runs.flat(),source:'museum-continuity-repair',tags:{highway:'unclassified',surface:'asphalt'}});
  Object.assign(twinThroughRepair,{status:'connected',gap,roadIds:[a.road.id,b.road.id]});
 }
 // Two independent, direct gate spurs from the surviving through AD.
 // The old automatic silo access wrapped around the models and duplicated
 // short source branches. Use only the nearest retained major road here.
 const twinSiloConnections=[];
 for(const id of ['pad-106','pad-109']){
  const site=siteRecords.find(s=>s.id===id),spec=FACILITY_PORTS[id];
  if(!site||!spec)continue;
  const gate=portWorld(spec,spec.road,site,point);
  const near=nearestSegment(roadGraph,gate,e=>edgeKept(roadGraph,e)&&
   ['primary','secondary','tertiary','unclassified'].includes(e.tags.highway)&&
   !e.tags.bridge&&!e.tags.tunnel);
  if(!near||near.distance>180**2){
   twinSiloConnections.push({id,status:'no-retained-through-road'});continue;
  }
  const direction=gate.clone().sub(near.point).setY(0).normalize();
  const tangent=near.tangent.clone().setY(0).normalize();
  if(tangent.dot(direction)<0)tangent.negate();
  const entry=gate.clone().lerp(near.point,.28);
  entry.y=THREE.MathUtils.lerp(gate.y,near.point.y,.28);
  const transition=createAccessTransition({start:near.point,end:gate,
   startTangent:tangent,endTangent:direction,
   anchors:[entry],startWidth:near.edge.width,endWidth:2.7,sampleStep:.7});
  const visibleRuns=[];
  drawRoad(transition.points,2.7,{highway:'service',surface:'asphalt'},false,true,null,visibleRuns,
   [{nodeId:'museum-port:'+id,position:near.point.clone(),hostWayId:near.edge.wayId}],
   {widthAt:transition.widthAt,directionAt:(_p,t)=>t});
  roadPaths.push({id:'silo-single-driveway-'+id,label:'АД к площадке '+id.slice(4),
   width:2.7,points:visibleRuns.flat(),source:'museum-model-port',osmWayIds:[near.edge.wayId],
   tags:{highway:'service',surface:'asphalt'}});
  const report={id,status:'connected',sourceWayId:near.edge.wayId,
   sourceGap:transition.points[0].distanceTo(near.point),
   gateGap:transition.points.at(-1).distanceTo(gate),samples:transition.points.length};
  twinSiloConnections.push(report);accessReports.push({...report,sourcePoint:near.point.toArray(),gate:gate.toArray()});
  connections++;
 }
 // One deliberate continuous service road: road to Yubileiny -> 250A
 // cryogenic centre -> UKSS. It is display geometry only; OSM topology is
 // not rewritten and all three endpoints retain their own source metadata.
 if(cryoThrough){
  const {cryoGate,ukssGate,sourceWay,plan,cryoSpec}=cryoThrough,wayId=String(sourceWay.osmId);
  const throughRuns=[],gateRuns=[];
  drawRoad(plan.main.map(p=>V(...p)),SITE250A_THROUGH_PROFILE.width,
   {highway:'unclassified',lanes:'2'},true,true,wayId,throughRuns,[],{directionAt:(_p,geometricTangent)=>geometricTangent});
  drawRoad(plan.spur.map(p=>V(...p)),SITE250A_THROUGH_PROFILE.spurWidth,
   {highway:'service'},false,true,null,gateRuns,[],{directionAt:(_p,geometricTangent)=>geometricTangent});
  roadPaths.push({id:'museum-yubileiny-250a-ukss',label:'Юбилейный · мимо 250А · УКСС',
   points:throughRuns.flat(),width:SITE250A_THROUGH_PROFILE.width,source:'owner-directed-museum-road',
   tags:{highway:'unclassified',lanes:'2'},marked:true,osmWayIds:[wayId]});
  roadPaths.push({id:'museum-pad-250a-gate-spur',label:'Подъезд к криогенному центру · 250А',
   points:gateRuns.flat(),width:SITE250A_THROUGH_PROFILE.spurWidth,
   source:'museum-model-port',osmWayIds:[wayId]});
  const outward=V(...(cryoSpec.roadOutward||[1,0,0])).normalize().applyAxisAngle(V(0,1,0),cryoSpec.yaw);
  accessReports.push({id:'pad-250a',sourceWayId:wayId,profile:'perimeter-bypass-with-gate-spur',
   roadGap:V(...plan.spur.at(-1)).distanceTo(cryoGate),gate:cryoGate.toArray(),
   sourcePoint:plan.report.junction,gateInward:outward.negate().toArray(),
   spurLength:plan.report.spurLength,minimumSiteClearance:plan.report.minimumSiteClearance});
  accessReports.push({id:'pad-250',sourceWayId:wayId,profile:'single-through-road-to-ukss',
   roadGap:V(...plan.main.at(-1)).distanceTo(ukssGate),gate:ukssGate.toArray(),
   sourcePoint:plan.main.at(-2)});
  accessReports.push({id:'pad-250a-to-pad-250',sourceWayId:wayId,profile:'osm-centreline-perimeter-bypass',
   roadGap:V(...plan.main.at(-1)).distanceTo(ukssGate),length:plan.report.mainLength,
   minimumSiteClearance:plan.report.minimumSiteClearance,maxGrade:plan.report.maxGrade,
   throughVersion:plan.report.version});
  connections+=2;
 }
 if(site110Fan)for(const link of site110Fan.joinedLinks){
  const first=link.points[0],last=link.points.at(-1),frame=(p,fallback)=>p.distanceToSquared(first)<1e-10?link.startTangent:p.distanceToSquared(last)<1e-10?link.endTangent:fallback;
  drawRail(link.points,false,true,RAIL_PROFILE.gauge,link.wayId,frame,'end');renderedRailWays.add(link.wayId);
  railPaths.push({id:link.id,points:link.points,width:RAIL_PROFILE.ballastWidth,source:'museum-source-display-link',osmWayIds:[link.wayId]});
 }
 // The restored Saturn access is one smoothly graded driveway from the
 // western main AD to the existing north-west gate. Do not add the former
 // isolated straight ribbon or a second parallel spur.
 let saturnAccessReport={status:'unavailable'};
 if(saturnSite&&saturnCenter){
  const s=SATURN_ACCESS,gate=saturnCenter.clone().add(V(s.gate.x*s.scale,s.gate.y*s.scale,s.gate.z*s.scale));
  gate.y=s.elevation+s.gate.y*s.scale;
  const outward=V(-1,0,-.26).normalize(),target=gate.clone().addScaledVector(outward,95);
  const near=nearestSegment(roadGraph,target,e=>e.tags.highway!=='track'&&
   !e.abandoned&&edgeKept(roadGraph,e)&&!masked(e.a.position.clone().lerp(e.b.position,.5),e.tags));
  if(near&&near.distance<300**2){
   const direction=gate.clone().sub(near.point).setY(0).normalize();
   const tangent=near.tangent.clone().setY(0).normalize();
   if(tangent.dot(direction)<0)tangent.negate();
   const approach=gate.clone().addScaledVector(outward,43);
   approach.y=terrainDatum(approach.clone(),3.4);
   const softBend=near.point.clone().lerp(approach,.48);
   softBend.addScaledVector(V(-direction.z,0,direction.x),Math.min(12,near.point.distanceTo(gate)*.06));
   softBend.y=terrainDatum(softBend.clone(),3.4);
   const width=3.4;
   const transition=createAccessTransition({start:near.point,end:gate,
    startTangent:tangent,endTangent:outward.clone().negate(),
    anchors:[softBend,approach],startWidth:near.edge.width,endWidth:width,
    sampleStep:1.1,startSlope:0});
   const visibleRuns=[];
   drawRoad(transition.points,width,{highway:'service',surface:'asphalt'},
    false,true,null,visibleRuns,[{nodeId:'museum-port:pad-23',position:near.point.clone(),hostWayId:near.edge.wayId}],
    {widthAt:transition.widthAt,directionAt:(_p,t)=>t});
   roadPaths.push({id:s.routeId,label:'Естественный подъезд на Сатурн',
    points:visibleRuns.flat(),width,source:'museum-model-port',osmWayIds:[near.edge.wayId],
    tags:{highway:'service',surface:'asphalt'}});
   saturnAccessReport={status:'connected',sourceWayId:near.edge.wayId,
    length:transition.length,gate:gate.toArray(),roadGap:transition.points[0].distanceTo(near.point),
    gateGap:transition.points.at(-1).distanceTo(gate),profile:'graded-curve-to-northwest-gate'};
   connections++;
  }
 }

 // Lights are based on arterial paths and connectors; never place thousands
 // of lamps on every city alley or on abandoned service roads.
 roadPaths.osmVehiclePlan=roadPlan;
 const mainRoadPoints=highway.points,westEnd=mainRoadPoints.findIndex(p=>p.distanceTo(highway.position(bridgeDistance))<8);
 const split=Math.max(1,Math.min(mainRoadPoints.length-2,westEnd<0?Math.floor(mainRoadPoints.length/2):westEnd));
 roadPaths.push({id:'r-south-west',points:mainRoadPoints.slice(0,split+1).reverse(),width:highway.width,source:'OpenStreetMap'},
  {id:'r-south-east',points:mainRoadPoints.slice(split),width:highway.width,source:'OpenStreetMap'});
 // Build the train's long route on the real connected railway network.
 const connection=new THREE.CubicBezierCurve3(straight,straight.clone().add(V(-25,0,0)),railStart.position.clone().addScaledVector(railTangent,-25),railStart.position);
 const connectionPoints=[gate,...sampleCurve(connection)],connectionFrame=(p,fallback)=>p.distanceToSquared(railStart.position)<1e-10?railTangent:fallback;
 const connectionRuns=drawRail(connectionPoints,false,true,RAIL_PROFILE.gauge,null,connectionFrame,'start');connections++;
 for(const [i,points]of connectionRuns.entries())railPaths.push({id:'gagarin-source-connection-'+i,points,width:RAIL_PROFILE.ballastWidth,source:'museum-model-port',osmWayIds:[]});
 const gagarinJoinGap=connectionPoints.at(-1).distanceTo(graphTrain.nodes[0].position);
 const trainPoints=conformRailPath([...connectionPoints,...graphRailRoutePoints(graphTrain).slice(1)],RAIL_PROFILE.ballastWidth).map(p=>p.clone().add(V(0,RAIL_PROFILE.headY,0))),train={path:distancePath(trainPoints),gauge:RAIL_PROFILE.gauge,source:'OpenStreetMap',surfaceVersion:railSurface.stats.version,from:'Пл. №1 · Гагаринский старт',to:'Тюратам · город',joins:[{from:'museum-pad1-port',to:'osm-rail-network',gap:gagarinJoinGap,tangentDot:connection.getTangent(1).dot(railTangent)}],sections:[{id:'osm-pad1-to-tyuratam'}],osmWayIds:[...new Set(graphTrain.edges.map(e=>e.wayId))]};
 for(const f of data.railPoints?.features||[]){const tags=tagsFor(f);if(!['station','halt'].includes(tags.railway)||f.geometry.type!=='Point')continue;const [lon,lat]=f.geometry.coordinates;if(lon<BBOX[0]||lon>BBOX[2]||lat<BBOX[1]||lat>BBOX[3])continue;
  const p=geography.project(lon,lat),at=point(...p,RAIL_NETWORK_GROUND_Y),group=new THREE.Group(),anchor=new THREE.Object3D();group.name=f.properties.name;group.position.copy(at);anchor.position.y=3;group.add(anchor);railRoot.add(group);
  // Station platforms are supplied by the shared lightweight model layer.
  stationLabels.push({id:'osm-station-'+f.properties.osmId,name:f.properties.name,anchor,group,osmUrl:f.properties.osmUrl,record:{label:f.properties.name,x:p[0],y:p[1],source:'OpenStreetMap'}});
 }
 // The reference adds yard/block-post names absent from OSM's station-node
 // list. Attach labels to their existing tracks; do not invent surveyed
 // station buildings or silently describe these names as OSM observations.
 for(const station of railScheme.stations){
  const p=geography.project(...station.coordinates),group=new THREE.Group(),anchor=new THREE.Object3D();
  group.name=station.name;group.position.copy(station.position);anchor.position.y=3;group.add(anchor);railRoot.add(group);
  const publicReferences=[RAIL_SCHEME_REFERENCE.url,...station.sourceWayIds.map(id=>'https://www.openstreetmap.org/way/'+id)];
  stationLabels.push({id:station.id,name:station.name,anchor,group,record:{label:station.name,x:p[0],y:p[1],source:'Railway scheme and OpenStreetMap',
   purpose:station.purpose??'Железнодорожная станция',
   note:'Связи с соседними станциями и площадками сверены по схеме подъездного пути Байконура.',
   positionBasis:station.positionBasis,positionConfidence:'scheme-yard-identification',
   geoSource:{kind:'railway-scheme',status:'existing-track-anchor',sourceLonLat:[...station.coordinates],displayLonLat:[...station.coordinates],refs:publicReferences.map(url=>({url})),modelAnchor:'illustrative'},publicReferences}});
 }
 checkpoint('rails');
 const lowerAprons=createInterchangeAprons(roadGraph);
 for(const apron of lowerAprons){
  highwayAsphalt.patch(apron.triangles,apron.mask);
  for(const curb of apron.curbs)shoulder.ribbon(curb,ROAD_STYLE.shoulderExtra,-.055-HIGHWAY_ASPHALT_LIFT);
 }
 checkpoint('aprons');
 batches.forEach(b=>b.flush());
 checkpoint('batches');
 // The short retained return between these source junctions surrounds one
 // tiny flat void. Its bounded fill cannot reach an outer curb or a lane.
 const returnStart=roadGraph.nodes.get('1833467924'),returnEnd=roadGraph.nodes.get('1833467955');
 if(returnStart&&returnEnd)fillEnclosedRoadSurfaceVoid(asphalt.mesh,returnStart.position.clone().lerp(returnEnd.position,.5));
 const interchangeBridge=buildInterchangeBridge({parent:roadRoot,plan:interchangeBridgePlan});
 // The architectural span is the sole pavement owner between its exact
 // seam sections. Its footprint still excludes grade-compatible local-road
 // overlays, while the real bridge triangles supply paint/traffic heights.
 const bridgeOwnership=interchangeBridgePlan?interchangeBridgePlan.samples.slice(1).map((at,i)=>{
  const previous=interchangeBridgePlan.samples[i],corner=(sample,side)=>interchangeBridgePlan.world(sample.p.clone().addScaledVector(sample.normal,side*interchangeBridgePlan.width/2).add(V(0,HIGHWAY_ASPHALT_LIFT,0)));
  return [corner(previous,-1),corner(previous,1),corner(at,1),corner(at,-1)];
 }):[];
 const ordinarySurfaceClip=clipOrdinaryRoadMeshes([asphalt.mesh,shoulder.mesh,unpaved.mesh,paint.mesh],highwayAsphalt.mesh,[...highwayAsphalt.ownershipPolygons,...bridgeOwnership]);
 checkpoint('pavement-owner');
 clipOrdinaryRoadMeshes([shoulder.mesh],asphalt.mesh,[],{onlyProtruding:true});
 checkpoint('shoulder-owner');
 const bridgeAsphalt=interchangeBridge?.root.getObjectByName('Виадук · asphalt');
 const pavementY=pavementHeightSampler([highwayAsphalt.mesh,bridgeAsphalt]);
 checkpoint('highway-index');
 for(const route of roadPlan.routes)route.surfaceHeightAt=p=>pavementY(p)??p.y;
 const markingPavementY=pavementHeightSampler([asphalt.mesh,highwayAsphalt.mesh,bridgeAsphalt]);
 checkpoint('marking-index');
 checkpoint('surface-height');
 const roadMarkingPlan=buildRoadMarkings({roads:markingRoads,graph:roadGraph,surfaceHeightAt:markingPavementY,surfaceTrianglesAt:markingPavementY.trianglesAt,directionAt:highwayDirectionAt,
  extraEdges:lowerAprons.flatMap(apron=>apron.edgeLines.map((edge,i)=>({...edge,id:'apron-'+apron.spec.nodeId+'-'+i,family:'highway',width:HIGHWAY_MARKINGS.edgeWidth}))),
  excludePoint:(p,{kind,road,family})=>lowerAprons.some(apron=>apron.contains(p)&&(apron.spec.connectorWayIds.includes(String(road.wayId))||family==='highway'&&kind==='edge'&&road.tags?.highway?.endsWith('_link')))});
 for(const quad of roadMarkingPlan.quads){
  const target=quad.color==='yellow'?highwayYellow:quad.family==='highway'?highwayWhite:paint;
  target.quad(...quad.vertices);
 }
 markingSegments=roadMarkingPlan.quads.length;
 checkpoint('markings');
 paint.flush();highwayYellow.flush();highwayWhite.flush();batches.push(highwayYellow,highwayWhite);
 // Display scenery continues beyond the source extract. Do not extend OSM
 // topology, traffic routes, geography bounds or the museum's camera bounds.
 const highwayDisplay=buildHighwayDisplay({parent:layers.roads,highway,directionAt:highwayDirectionAt,shoulderColor:ROAD_STYLE.shoulderColor});
 roadPaths.displayHighwayExtensions=highwayDisplay.paths;
 const bridges=roadGraph.ways.filter(w=>w.tags.bridge&&w.tags.bridge!=='no').map(w=>({type:'road',center:w.segments[0].a.position.clone().lerp(w.segments.at(-1).b.position,.5).toArray(),deckTop:(w.segments[0].a.position.y+w.segments.at(-1).b.position.y)/2,clearance:5.8,length:w.segments.reduce((n,e)=>n+e.length,0),width:w.width,osmWayId:w.osmId,...(w.osmId===INTERCHANGE_BRIDGE_WAY?interchangeBridge?.stats():{})}));
 const concrete=material(0x96988f),guard=material(0x8c9899,{roughness:.65,metalness:.3});
 for(const w of roadGraph.ways.filter(w=>w.tags.bridge&&w.tags.bridge!=='no')){
  if(w.osmId===INTERCHANGE_BRIDGE_WAY&&interchangeBridge)continue;
  const a=w.segments[0].a.position,b=w.segments.at(-1).b.position,d=b.clone().sub(a),length=d.length(),group=new THREE.Group();group.name='Мост OSM '+w.osmId;group.position.copy(a).lerp(b,.5);group.rotation.y=Math.atan2(d.x,d.z);roadRoot.add(group);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(w.width+.4,.36,length+.3),concrete);deck.position.y=-.23;group.add(deck);
  for(const side of [-1,1]){const railing=new THREE.Mesh(new THREE.BoxGeometry(.12,.6,length+.4),guard);railing.position.set(side*(w.width/2+.14),.32,0);group.add(railing);
   const height=group.position.y+2.7-.4,pier=new THREE.Mesh(new THREE.BoxGeometry(w.width+.3,height,.42),concrete);pier.position.set(0,-.4-height/2,side*Math.max(.2,length*.42));group.add(pier);
  }
 }
 function connectMik112(root){
  if(!root.userData.mik112Model?.railHeadEntries?.length)return {connected:false};
  const tracks=createMik112RailApproaches(root,mikRailSourcePlan,{headY:RAIL_PROFILE.headY});
  const forward=V(0,0,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  for(const track of tracks){const points=track.points.map(p=>p.clone().add(V(0,-RAIL_PROFILE.headY,0)));
   drawRail(points,false,true,RAIL_PROFILE.gauge,null,(p,fallback)=>p.distanceToSquared(points[0])<1e-10?forward:p.distanceToSquared(points.at(-1))<1e-10?V(...track.sourceTangent):fallback,'start');
  }
  for(const b of [ballast,ties,steel])b.flush();connections+=tracks.length;
  return {connected:true,tracks:tracks.map(({points,...track})=>track),joinGap:Math.max(...tracks.map(track=>track.junctionGap)),version:mikRailSourcePlan.version,
   sourceRoutes:mikRailSourcePlan.gates.map(gate=>'osm-rail-'+gate.sourceWayId),sourceSwitches:mikRailSourcePlan.gates.map(gate=>gate.sourceNodeId),
   destinationRoutes:mikRailSourcePlan.destinationRoutes.map(({edges,points,...route})=>route),replacedSourceEdges:mikRailSourcePlan.replacedEdges.size,displayReplacements:mikRailSourcePlan.displayReplacements,
   railGauge:RAIL_PROFILE.gauge,railProfile:RAIL_PROFILE};
 }
 // A small observation platform at the END of the displayed dead-end AD
 // closest to Donskaya station. Use the actual retained road terminal rather
 // than placing a marker on the station's railway tracks.
 const donskayaFeature=(data.railPoints?.features||[]).find(f=>f.properties?.name==='Донская');
 let donskayaObservation={status:'station-not-found'};
 if(donskayaFeature){
  const station=point(...geography.project(...donskayaFeature.geometry.coordinates),0);
  const candidates=[];
  for(const node of roadGraph.nodes.values()){
   const active=node.edges.filter(edge=>edgeKept(roadGraph,edge));
   if(active.length!==1)continue;
   const edge=active[0],kind=edge.tags.highway;
   if(!['service','track','unclassified','residential','tertiary'].includes(kind)||edge.tags.bridge||edge.tags.tunnel)continue;
   const dist=Math.hypot(node.position.x-station.x,node.position.z-station.z);
   if(dist>470)continue;
   const other=edge.a===node?edge.b:edge.a;
   const heading=node.position.clone().sub(other.position).setY(0).normalize();
   if(heading.lengthSq()<.1)continue;
   const railDistance=Math.min(500,...[...railGraph.nodes.values()].filter(n=>
    Math.abs(n.position.x-node.position.x)<65&&Math.abs(n.position.z-node.position.z)<65)
    .map(n=>Math.hypot(n.position.x-node.position.x,n.position.z-node.position.z)));
   const score=dist+(railDistance<10?120:0)+(kind==='track'?18:0);
   candidates.push({node,edge,heading,dist,railDistance,score});
  }
  candidates.sort((a,b)=>a.score-b.score);
  const tip=candidates[0];
  if(tip){
   const root=new THREE.Group();root.name='НП · станция Донская';
   const pad=tip.node.position.clone().addScaledVector(tip.heading,7);
   root.position.set(pad.x,tip.node.position.y+.05,pad.z);
   root.rotation.y=Math.atan2(tip.heading.x,tip.heading.z);
   root.userData.museumComponent='observation-platform';
   root.userData.source='owner-placement-donskaya-dead-end';
   const deckMaterial=new THREE.MeshStandardMaterial({color:0x555751,roughness:.93});
   const metal=new THREE.MeshStandardMaterial({color:0x3b5654,metalness:.35,roughness:.7});
   const railMat=new THREE.MeshStandardMaterial({color:0xd3c6ad,roughness:.75});
   function part(w,h,d,x,y,z,mat,name){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
   }
   part(12,.35,13,0,.18,0,deckMaterial,'НП · площадка');
   for(const side of [-1,1]){
    part(.14,1.3,13,side*5.87,1.01,0,railMat,'НП · боковое ограждение');
    for(const z of [-5.9,0,5.9])part(.23,1.7,.23,side*5.85,.96,z,metal,'НП · стойка');
   }
   part(12,1.15,.12,0,.95,6.4,railMat,'НП · торцевое ограждение');
   for(const x of [-4,4])part(.2,3.35,.2,x,1.7,-3.2,metal,'НП · опора навеса');
   part(10,.23,5.5,0,3.45,-3.2,metal,'НП · навес');
   if(typeof document!=='undefined'){
   const sign=document.createElement('canvas');sign.width=256;sign.height=128;
   const context=sign.getContext('2d');
   context.fillStyle='#173c38';context.fillRect(0,0,256,128);
   context.fillStyle='#fff3d4';context.font='bold 86px Arial';context.textAlign='center';
   context.textBaseline='middle';context.fillText('НП',128,68);
   const texture=new THREE.CanvasTexture(sign);texture.colorSpace=THREE.SRGBColorSpace;
   const board=new THREE.Mesh(new THREE.PlaneGeometry(3.5,1.75),
    new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
   board.name='НП · обозначение';board.position.set(0,2.25,6.5);root.add(board);
   }
   if(layers.sites)layers.sites.add(root);
   donskayaObservation={status:'placed',sourceWayId:tip.edge.wayId,stationDistance:tip.dist,
    railClearance:tip.railDistance,position:root.position.toArray(),sourceNodeId:tip.node.id};
  }else donskayaObservation={status:'no-nearby-road-dead-end'};
 }
 // Roadside crossing signals also cover museum-only late driveways.
 const crossingIndex=buildRailRoadIndex(markingRoads,{railHalfWidth:RAIL_PROFILE.ballastWidth/2});
 const crossingSigns=buildRailCrossingSignals({crossings:findRailRoadCrossings(railPaths,crossingIndex),parent:roadRoot});
 checkpoint('complete');
 const buildMilliseconds=Date.now()-started;
 return {roadPaths:()=>roadPaths,
  editableRoadPaths:()=>[...editableRoadPaths,...roadPaths.filter(r=>r.source!=='OpenStreetMap'&&r.points?.length>1&&!r.id.startsWith('r-south-'))],
  terrainPaths:()=>({roads:markingRoads,rails:terrainRailPaths}),trainPath:()=>train,stationLabels:()=>stationLabels,connectMik112,roadMarkingPlan,highwayDisplay,
  roadMarkingTarget(nodeId){const node=roadGraph.nodes.get(String(nodeId));return node?{nodeId:node.id,center:node.position.toArray(),sourceWayIds:[...new Set(node.edges.map(edge=>edge.wayId))]}:null;},
  bridgeObjects:()=>interchangeBridge?[interchangeBridge.root]:[],
  setBridgeEvening:value=>interchangeBridge?.setEvening(value),
  isBridgePoleAllowed:(x,z)=>interchangeBridge?.isPoleAllowed(x,z)??true,
  routes:{road:roadPaths.map(r=>({id:r.id,points:r.points.map(p=>[(p.x/3.4)+650,(p.z/3.4)+522.5])})),rail:railPaths},
  stats:()=>({buildPhases:buildPhases.map(p=>({...p})),version:'osm-transport-v1',source:'OpenStreetMap',sourceTimestamp:data.roads.osmBaseTimestamp,confidence:'osm-source-node-topology',roadFeatureCount:data.roads.features.length,railFeatureCount:data.railways.features.length,
   roadRoutes:roadGraph.ways.length,railRoutes:railGraph.ways.length,roadNodes:roadGraph.nodes.size,railNodes:railGraph.nodes.size,roadComponents:roadGraph.components.length,railComponents:railGraph.components.length,
   roadSurface:{version:'osm-batched-upward-terrain-surfaces-v2',junctionCount,markingSegments,roads:renderedRoadWays.size,paintLift:HIGHWAY_MARKINGS.lift-HIGHWAY_ASPHALT_LIFT,sampleStep:1.4,normalDirection:'upward',terrainClearance:.38,
    markings:roadMarkingPlan.stats,local:roadGraph.localRoadSurface,
    highway:{...roadGraph.highwaySurface,displayExtensions:highwayDisplay.stats(),asphaltColor:'#'+HIGHWAY_ASPHALT_COLOR.toString(16),asphaltLift:HIGHWAY_ASPHALT_LIFT,sharedWithBridge:true,clippedOverlapSections:highwayAsphalt.clippedSections,ordinarySurfaceClip,
     lowerJunctionAprons:{version:INTERCHANGE_APRON_VERSION,junctions:lowerAprons.map(apron=>apron.report)},
     markings:{...HIGHWAY_MARKINGS,sourceWayIds:[...highwayMarkedWays],mainRuns:highwayMarkingRuns,rampRuns:rampMarkingRuns,projectionMisses:roadMarkingPlan.stats.projectionMisses,
      yellowTriangles:highwayYellow.triangles,whiteTriangles:highwayWhite.triangles,bridgeBoundary:'exact-profile-seams',lanePolicy:'source-lanes-and-direction',junctionPolicy:roadMarkingPlan.stats.version}},
    continuousThroughRoads:[{sourceWayId:INDUSTRIAL_THROUGH_ROAD,siteIds:[...INDUSTRIAL_THROUGH_SITES],renderedRuns:roadPaths.filter(r=>r.source==='OpenStreetMap'&&r.osmWayIds?.includes(INDUSTRIAL_THROUGH_ROAD)).length}]},junctionCount,markingSegments,railTies,railGauge:RAIL_PROFILE.gauge,
   railProfile:RAIL_PROFILE,branchSimplification:{version:'terminal-branches-v2',road:roadPruning.stats,rail:railPruning.stats},renderedRailWays:renderedRailWays.size,site5HiddenRailWays:[...site5HiddenRailWays],
   railSurface:{...railSurface.stats,groundDatum:RAIL_NETWORK_GROUND_Y,bridgeRise:5.8,trainUsesSharedSurface:true},
   railCrossings:railCrossings.stats,railRoadClearance:{...railRoadClearance,crossings:railRoadClearance.crossings.length,pad5Straightening:pad5RailStraightening},
    railCrossingSignals:{count:crossingSigns.count,crossings:crossingSigns.crossings},
   railBuildingClearance:railSiteClearance.stats(),
   railScheme:{...railScheme.stats,protectedRemovedEdges:[...railScheme.protectedEdges].filter(edge=>railPruning.removed.has(edge)).length,
    displayLimitations:railClearanceReport?.clippedWayIds.length?[{id:'yubileinaya-enlarged-airport',sourceConnectionPreserved:true,
     reason:'The enlarged museum airport covers the source yard; no unverified replacement alignment is drawn across the runway.',sourceWayIds:[...railClearanceReport.clippedWayIds]}]:[]},
   exhibitRoadSimplification:{...exhibitRoadFilter.stats,displayClearance:airportClearanceReport,site41DisplayReplacement:site41Replacement.stats},
   renderedRoadWays:renderedRoadWays.size,roadStyle:ROAD_STYLE,cityRoadSimplification:{sourceBoundary:cityFeature?.id||null,hiddenWays:hiddenCityWays.size,hiddenWayIds:[...hiddenCityWays],preservedTrafficWays:roadGraph.ways.filter(w=>cityMinor(w.tags)&&protectedTrafficWays.has(w.osmId)&&w.segments.some(e=>inCity(e.a.position)||inCity(e.b.position))).length},
   settlementRoadSimplification:settlements.map(region=>({id:region.id,name:region.name,sourceBoundary:region.feature?.id||null,minimalProfile:region.profile,sourceWayCount:region.sourceWays.size,renderedWayCount:region.keptWays.size,hiddenWays:region.hiddenWays.size,keptWayIds:[...region.keptWays],preservedTrafficWayIds:[...region.trafficWays]})),
   stationCount:stationLabels.length,stationNames:stationLabels.map(s=>s.name),railSwitches:(data.railPoints?.features||[]).filter(f=>tagsFor(f).railway==='switch').length,
   abandonedRailWays:railGraph.ways.filter(w=>w.abandoned).length,mergedMeshCount:batches.filter(b=>b.mesh).length,triangles:batches.reduce((n,b)=>n+b.triangles,0),buildMilliseconds,
   modelPortConnections:connections,facilityPorts:accessReports,facilityRailPorts:railPortReports,
   site110RailFan:site110Fan?{...site110Fan.stats,mappedNodes:site110Fan.mappedNodes,declaredJunctions:site110Fan.declaredJunctions,
    joinedLinks:site110Fan.joinedLinks.map(({points,startTangent,endTangent,...link})=>({...link,points:points.map(p=>p.toArray()),startTangent:startTangent.toArray(),endTangent:endTangent.toArray()})),hiddenLinks:site110Fan.hiddenLinks}:null,
   gagarinSite2Road:gagarinRoadReport,
   siteAccess:accessReports.map(r=>r.id.replace('pad-','')),gatePorts:accessReports.map(r=>r.id),
   vehicleRoutes:roadPlan.routes.map(r=>({id:r.id,source:r.source,length:r.length,osmWayCount:r.osmWayIds.length,nodeCount:r.nodeIds.length,vehicleScale:r.vehicleScale})),trainSource:train.source,trainWayCount:train.osmWayIds.length,
   saturnAccess:saturnAccessReport,
   twinSiloConnections,
   twinThroughRepair,
   donskayaObservation,
   interchange:{version:'osm-reference-viaduct-v1',bridges:bridges.map(b=>b.osmWayId===INTERCHANGE_BRIDGE_WAY?{...b,...interchangeBridge?.stats()}:b),ramps:0,source:'OpenStreetMap bridge/layer topology; Bridge Design by 3DtechVN, CC BY 4.0'},gagarinRail:{version:'osm-pad1-port-v1',joinGap:gagarinJoinGap,entryWorld:gate.toArray(),gauge:RAIL_PROFILE.gauge,straightLength:18}})};
}
