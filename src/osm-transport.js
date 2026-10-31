import * as THREE from 'three';
import {pruneTerminalBranches} from './transport-pruning.js?v=20261029-transport-cleanup-v2';
import {buildExhibitRoadFilter,EXHIBIT_ACCESS_NODE_IDS,EXHIBIT_ROAD_AREAS,rectangleSegmentInterval,clipRoadOutsideRectangle,airportPerimeterBypass} from './exhibit-road-filter.js?v=20261030-river-roads-signs-v1';
import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
import {RAIL_PROFILE,GAGARIN_RAIL_PORT} from './gagarin-rail-approach.js?v=20261031-facilities-rails-lighting-v1';
import {MUSEUM_METRE} from './museum-scale.js?v=20261031-rocket-exhibits-v1';
import {FACILITY_PORTS,portWorld} from './facility-ports.js?v=20261031-facilities-rails-lighting-v1';
import {distancePath} from './traffic-paths.js?v=20261031-facilities-rails-lighting-v1';
import {SATURN_ACCESS,saturnTerrainHeight} from './saturn-access.js?v=20261030-river-roads-signs-v1';
import {KRAYNIY_AIRPORT_DISPLAY,krayniyTerminalLayout} from './krayniy-terminal.js?v=20261031-facilities-rails-lighting-v1';
import {createInterchangeBridgePlan,buildInterchangeBridge,INTERCHANGE_BRIDGE_WAY} from './interchange-bridge.js?v=20261031-road-markings-v1';
import {createHighwayAsphaltMaterial,createHighwayMarkingMaterial,isHighwayRoad,smoothHighwayGraph,HIGHWAY_ASPHALT_COLOR,HIGHWAY_ASPHALT_LIFT,HIGHWAY_MARKINGS,highwayRunsOutsideBridge} from './highway-surface.js?v=20261031-road-markings-v1';
import {unionRoadSurfacePolygons,clipOrdinaryRoadMeshes} from './road-surface.js?v=20261031-road-markings-v1';
import {createInterchangeAprons,INTERCHANGE_APRON_VERSION} from './interchange-aprons.js?v=20261031-road-markings-v1';
import {buildRoadMarkings} from './road-markings.js?v=20261031-facilities-rails-lighting-v1';
import {smoothLocalRoadGraph,createAccessTransition} from './access-transitions.js?v=20261031-facilities-rails-lighting-v1';
import {createMik112RailSourcePlan,createMik112RailApproaches} from './mik112-rail-plan.js?v=20261031-facilities-rails-lighting-v1';
import {createSite41RoadReplacement} from './site41-road-clearance.js?v=20261031-facilities-rails-lighting-v1';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const BBOX=[62.78,45.57,64.12,46.135];
const MAIN=new Set(['motorway','trunk','primary','secondary','tertiary']);
const CAR_WEIGHTS={motorway:.8,trunk:.8,primary:.85,secondary:.9,tertiary:1,unclassified:1.15,residential:1.5,service:2.1,living_street:2.5,track:5};
const ROAD_STYLE=Object.freeze({asphaltColor:'#adb2b3',shoulderColor:'#c5c1b4',paintWidth:.10,shoulderExtra:.6,
 widths:Object.freeze({motorway:3.6,trunk:3.6,primary:3.6,secondary:3.1,tertiary:3.1,unclassified:2.4,residential:2,living_street:2,service:1.6,track:1.2})});
// This existing through-road passes outside the actual 112/112A/110 buildings.
// Their conservative circular model masks used to cut three gaps into it.
// Preserve its source centreline once, while still hiding internal service webs.
const INDUSTRIAL_THROUGH_ROAD='183464610';
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
  if(!nodes.has(id)){const p=geography.project(...coord);nodes.set(id,{id,coord,position:point(p[0],p[1],rail?.75:.72),edges:[],component:-1,raise:0});}
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
 for(let i=0;i<(index?.count??p.count);i+=3){
  const t=[0,1,2].flatMap(k=>V().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld).toArray());
  const [ax,,az,bx,,bz,cx,,cz]=t,den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-12)continue;t.push(den);
  for(let x=Math.floor(Math.min(ax,bx,cx)/cellSize);x<=Math.floor(Math.max(ax,bx,cx)/cellSize);x++)for(let z=Math.floor(Math.min(az,bz,cz)/cellSize);z<=Math.floor(Math.max(az,bz,cz)/cellSize);z++){
   const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);
  }
 }
 }
 return q=>{
  let top=-Infinity,nearbyTop=-Infinity;
  for(const [ax,ay,az,bx,by,bz,cx,cy,cz,den] of cells.get(Math.floor(q.x/cellSize)+':'+Math.floor(q.z/cellSize))||[]){
   const u=((bz-cz)*(q.x-cx)+(cx-bx)*(q.z-cz))/den,v=((cz-az)*(q.x-cx)+(ax-cx)*(q.z-cz))/den;
   // At far map coordinates Float32 rounds a shared section by up to 0.00025
   // world units. Use a physical edge tolerance, not a fixed barycentric one
   // that rejects perfectly adjoining, very short triangles at way nodes.
   const epsilon=.00035*Math.max(Math.hypot(bx-ax,bz-az),Math.hypot(cx-ax,cz-az),Math.hypot(cx-bx,cz-bz))/Math.abs(den);
   if(u< -epsilon||v< -epsilon||u+v>1+epsilon)continue;
   const y=u*ay+v*by+(1-u-v)*cy;if(Math.abs(y-q.y)<.6){nearbyTop=Math.max(nearbyTop,y);if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)top=Math.max(top,y);}
  }
  return Number.isFinite(top)?top:Number.isFinite(nearbyTop)?nearbyTop:null;
 };
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

export function buildOsmTransportNetwork({data,legacyData,geography,point,layers,siteRecords}){
 const started=Date.now(),roadGraph=buildOsmGraph(data.roads.features,{geography,point}),railGraph=buildOsmGraph(data.railways.features,{geography,point,rail:true});
 const saturnSite=siteRecords.find(s=>s.id==='pad-23'),saturnCenter=saturnSite?point(saturnSite.x,saturnSite.y,0):null;
 function terrainAt(x,z){
  if(!saturnCenter)return -Infinity;
  const localX=(x-saturnCenter.x)/SATURN_ACCESS.scale,localZ=(z-saturnCenter.z)/SATURN_ACCESS.scale;
  return Math.abs(localX)<480&&Math.abs(localZ)<510?SATURN_ACCESS.elevation+SATURN_ACCESS.scale*saturnTerrainHeight(localX,localZ):-Infinity;
 }
 function terrainDatum(p,width){
  if(!saturnCenter||Math.abs(p.x-saturnCenter.x)>250||Math.abs(p.z-saturnCenter.z)>270)return p.y;
  const r=width/2+ROAD_STYLE.shoulderExtra/2;let top=terrainAt(p.x,p.z);
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
 for(const graph of [roadGraph,railGraph])for(const n of graph.nodes.values()){
  const width=Math.max(1,...n.edges.map(e=>e.width));
  n.position.y=terrainDatum(n.position.clone().add(V(0,-n.raise,0)),width)+n.raise;
 }
 smoothHighwayGraph(roadGraph);
 smoothLocalRoadGraph(roadGraph);
 function conformRoadPath(points,width){
  const samples=conformPath(points,width);
  for(const p of samples)p.y=roadGraph.highwaySurfaceHeight(p,width);
  return samples;
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
 const batches=[shoulder,asphalt,highwayAsphalt,unpaved,paint,ballast,ties,steel,abandoned],roadPaths=[],railPaths=[],stationLabels=[];
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
 for(const [id,radius] of Object.entries({'pad-110':72,'pad-250':43,'pad-31':60,'pad-45':35,'pad-42':22,'pad-112':35,'pad-112a':40,'pad-92':25,'pad-1':16})){
  const s=siteRecords.find(s=>s.id===id);if(s)masks.set(id,{center:point(s.x,s.y,0),radius});
 }
 const hotelSite=siteRecords.find(s=>s.id==='pad-75');if(hotelSite)masks.set('pad-75',{center:point(hotelSite.x,hotelSite.y,0),rectangle:{halfX:10.8,minZ:-3.4,maxZ:12.4}});
 const site41=siteRecords.find(s=>s.id==='pad-41');if(site41){const s=FACILITY_PORTS['pad-41'],[minX,maxX,minZ,maxZ]=s.modelBoundsMetres;
  masks.set('pad-41',{center:point(site41.x,site41.y,0),rectangle:{halfX:Math.max(Math.abs(minX),Math.abs(maxX))*s.scale,minZ:minZ*s.scale,maxZ:maxZ*s.scale}});
 }
 const site41Replacement=createSite41RoadReplacement(roadGraph);
 // Reserve the same compact museum footprint as each detailed shaft model.
 for(const id of SILO_SITE_IDS){const site=siteRecords.find(s=>s.id===id);if(site)masks.set(id,{center:point(site.x,site.y,0),radius:10.5});}
 function masked(p,tags,margin=0,sourceWayId=null){for(const [id,m] of masks){if(sourceWayId===INDUSTRIAL_THROUGH_ROAD&&INDUSTRIAL_THROUGH_SITES.has(id))continue;const x=p.x-m.center.x,z=p.z-m.center.z;if(m.rectangle){if(['trunk','primary','secondary','tertiary','unclassified'].includes(tags.highway?.replace('_link','')))continue;const r=m.rectangle;if(Math.abs(x)<r.halfX+margin&&z>r.minZ-margin&&z<r.maxZ+margin)return true;}else if(x*x+z*z<(m.radius+margin)**2)return true;}return false;}
 function drawRoad(points,width,tags={},marked=false,force=false,wayId=null,renderedRuns=null,connections=[],surface={}){
  if(points.length<2)return false;const samples=conformRoadPath(points,width),path=distancePath(samples);if(path.length<.001)return false;
  const dirt=tags.highway==='track'||['unpaved','ground','dirt','sand'].includes(tags.surface),pavement=dirt?unpaved:isHighwayRoad(tags)?highwayAsphalt:asphalt;
  let run=[],rendered=false;
  const flush=()=>{if(run.length>1){
   const highway=isHighwayRoad(tags),directions=surface.directionAt??(wayId?roadDirectionAt(wayId,highway):highwayDirectionAt),widthAt=surface.widthAt??width;
   const pavingRuns=highway?highwayRunsOutsideBridge(run,interchangeBridgePlan,wayId):[run];
   for(const ps of pavingRuns){
    if(highway)for(const side of [-1,1])shoulder.ribbon(ps,ROAD_STYLE.shoulderExtra/2,-.055,side*(width/2+ROAD_STYLE.shoulderExtra/4),0,directions);
    else shoulder.ribbon(ps,typeof widthAt==='function'?p=>widthAt(p)+ROAD_STYLE.shoulderExtra:width+ROAD_STYLE.shoulderExtra,-.055,0,0,directions);
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
  const hidden=p=>!force&&(masked(p,tags,width/2+ROAD_STYLE.shoulderExtra/2,wayId)||settlementHidden(p,tags,wayId));
  for(const p of samples){if(hidden(p)){flush();continue;}run.push(p);}flush();
  return rendered;
 }
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
 const graphTrain=railGraph.route(railStart,railEnd),railTangent=graphTrain.nodes[1].position.clone().sub(railStart.position).normalize(),straight=gate.clone().add(V(-18,0,0));
 // Keep physical destinations and the exact attachment edges of model ports.
 // Named roads, bridges, parking/driveways and operational station sidings
 // have a purpose even when their endpoint is not a catalogue marker.
 const roadProtected=new Set([...roadGraph.edges.filter(e=>protectedTrafficWays.has(e.wayId)),...site41Replacement.protectedEdges]);
 const mikRailSourcePlan=createMik112RailSourcePlan(railGraph);
 const railProtected=new Set([...graphTrain.edges,...mikRailSourcePlan.protectedEdges]);
 for(const [id,spec] of Object.entries(FACILITY_PORTS)){
  const site=siteRecords.find(s=>s.id===id);if(!site)continue;
  const effective={...spec,yaw:site.runtimeYaw??spec.yaw},gate=portWorld(effective,spec.road,site,point),out=V(...(spec.roadOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),effective.yaw);
  const near=nearestSegment(roadGraph,gate.clone().addScaledVector(out,30),e=>e.tags.highway!=='track'&&airportPortSourceAllowed(id,e)&&!masked(e.a.position.clone().lerp(e.b.position,.5),e.tags));
  if(near&&near.distance<=300**2)roadProtected.add(near.edge);
  const railOut=V(...(spec.railOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),effective.yaw);
  for(const local of spec.rail||[]){const end=portWorld(effective,local,site,point).add(V(0,-RAIL_PROFILE.headY,0)),rr=nearestSegment(railGraph,end.addScaledVector(railOut,35),e=>!masked(e.a.position.clone().lerp(e.b.position,.5),{}));if(rr&&rr.distance<=250**2)railProtected.add(rr.edge);}
 }
 const destinations=siteRecords.map(s=>({position:point(s.x,s.y,0),radius:Math.max(25,(masks.get(s.id)?.radius||0)+12)}));
 for(const f of data.railPoints?.features||[])if(['station','halt'].includes(tagsFor(f).railway)&&f.geometry.type==='Point')destinations.push({position:point(...geography.project(...f.geometry.coordinates),0),radius:45});
 const protectedNode=n=>n.id.startsWith('clip:')||destinations.some(d=>Math.hypot(n.position.x-d.position.x,n.position.z-d.position.z)<d.radius);
 const inCosmodrome=e=>[e.a,e.b].every(n=>n.coord[1]>=45.70&&!settlements.some(region=>region.contains(n.position)));
 const infrastructure=e=>e.tags.name||e.tags.ref||e.tags.destination||e.tags.bridge&&e.tags.bridge!=='no'||e.tags.tunnel&&e.tags.tunnel!=='no';
 roadPruning=pruneTerminalBranches(roadGraph,{maxLength:80,protectedEdges:roadProtected,protectedNode:n=>protectedNode(n)||EXHIBIT_ACCESS_NODE_IDS.includes(n.id)||krayniyClearance&&n.id===krayniyLayout.access.sourceNodeId,
  eligible:e=>inCosmodrome(e)&&!infrastructure(e)&&!MAIN.has(e.tags.highway?.replace('_link',''))&&!['driveway','parking_aisle'].includes(e.tags.service)});
 railPruning=pruneTerminalBranches(railGraph,{maxLength:55,protectedEdges:railProtected,protectedNode,
  eligible:e=>inCosmodrome(e)&&!infrastructure(e)&&e.tags.usage!=='main'&&!['yard','siding','crossover'].includes(e.tags.service)});
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
 exhibitRoadFilter=buildExhibitRoadFilter(roadGraph,{protectedEdges:roadProtected,protectedTrafficWays,areas:exhibitAreas,
  available:e=>!roadPruning.removed.has(e),excludedEdges:excludedAirportEdges,geography,point});
 // The enlarged runway can extend beyond the source airport cleanup box.
 for(const edge of excludedAirportEdges)exhibitRoadFilter.removed.add(edge);
 for(const edge of site41Replacement.removed)exhibitRoadFilter.removed.add(edge);
 exhibitRoadFilter.stats.removedEdgeCount=exhibitRoadFilter.removed.size;
 // Junction surfaces follow only retained source roads. Paint is planned
 // after all paving is assembled, using the same retained road corridors.
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
 for(const way of roadGraph.ways){
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
  if(major)visibleRuns.forEach((run,i)=>roadPaths.push({id:'osm-road-'+way.osmId+(i?'-'+i:''),label:'Автодорога',width:way.width,points:run,osmWayIds:[way.osmId],source:'OpenStreetMap',highway:isHighwayRoad(way.tags)}));
 }
 let junctionCount=0;
 for(const n of roadGraph.nodes.values())if(n.edges.filter(e=>edgeKept(roadGraph,e)&&renderedRoadWays.has(e.wayId)&&!settlementHidden(n.position,e.tags,e.wayId)).length>2){
  const width=junctionWidths.get(n.id)||1.6;
  if(masked(n.position,{},width/2+.3)||inAirportClearance(n.position)&&!n.edges.some(e=>protectedTrafficWays.has(e.wayId))||inKrayniyClearance(n.position)&&!n.edges.some(e=>protectedTrafficWays.has(e.wayId)||roadProtected.has(e)))continue;
  // Highway strips already share an exact centre and a common merge tangent.
  // A horizontal junction disc would protrude through their graded approaches.
  if(!n.edges.some(e=>isHighwayRoad(e.tags))){shoulder.disc(n.position,width/2+.3,-.055);asphalt.disc(n.position,width*.51);}
  junctionCount++;
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
 function drawRail(points,isAbandoned=false,force=false,endGauge=RAIL_PROFILE.gauge,wayId=null,directionAt=null){
  if(points.length<2)return [];
  const displayed=clipAirportRails(points,wayId,RAIL_PROFILE.gauge),renderedRuns=[];
  for(const visible of displayed){
   const samples=conformPath(visible,RAIL_PROFILE.ballastWidth),path=distancePath(samples);if(path.length<.01)continue;
   const runs=[];let run=[];
   const isVisible=p=>force||!masked(p,{}),flush=()=>{if(run.length>1)runs.push(run);run=[];};
   for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i],va=isVisible(a),vb=isVisible(b);
    if(va&&!run.length)run.push(a);
    if(va!==vb){let lo=0,hi=1;for(let j=0;j<30;j++){const mid=(lo+hi)/2;if(isVisible(a.clone().lerp(b,mid))===va)lo=mid;else hi=mid;}
     const cut=a.clone().lerp(b,(lo+hi)/2);if(va){run.push(cut);flush();}else run.push(cut);
    }
    if(vb)run.push(b);else flush();
   }flush();renderedRuns.push(...runs);
   for(const ps of runs){
    if(isAbandoned){abandoned.ribbon(ps,.8,.01);continue;}
    ballast.ribbon(ps,RAIL_PROFILE.ballastWidth,RAIL_PROFILE.ballastY,0,0,directionAt);
    for(const side of [-1,1])steel.ribbon(ps,RAIL_PROFILE.headWidth,RAIL_PROFILE.headY,side*RAIL_PROFILE.gauge/2,0,directionAt,null,RAIL_PROFILE.railHeight);
   }
   if(isAbandoned)continue;
   for(let d=.4;d<path.length;d+=1.45){const at=path.sample(d,.3);if(!force&&masked(at.position,{}))continue;const normal=V(-at.tangent.z,0,at.tangent.x).normalize(),half=RAIL_PROFILE.sleeperLength/2,a=at.position.clone().addScaledVector(normal,-half),b=at.position.clone().addScaledVector(normal,half);ties.ribbon([a,b],RAIL_PROFILE.sleeperWidth,RAIL_PROFILE.sleeperY+RAIL_PROFILE.sleeperHeight/2,0,0,null,null,RAIL_PROFILE.sleeperHeight);railTies++;}
  }
  return renderedRuns;
 }
 for(const way of railGraph.ways){
  const points=[];let run=0;
  const render=()=>{if(points.length<2)return;for(const visible of drawRail(points,way.abandoned,false,RAIL_PROFILE.gauge,way.osmId)){
   renderedRailWays.add(way.osmId);railPaths.push({id:'osm-rail-'+way.osmId+(run?'-'+run:''),points:[...visible],width:RAIL_PROFILE.ballastWidth,source:'OpenStreetMap',osmWayIds:[way.osmId]});run++;
  }};
  for(const e of way.segments){
   if(!edgeKept(railGraph,e)||mikRailSourcePlan.replacedEdges.has(e)){render();points.length=0;continue;}
   if(points.length&&points.at(-1).distanceTo(e.a.position)>1e-5){render();points.length=0;}
   if(!points.length)points.push(e.a.position);points.push(e.b.position);
  }render();
 }
 // Nearest physical segment, used only for the short museum-scale apron
 // transition. Every long-distance route remains a path of shared OSM nodes.
 function nearestSegment(graph,target,filter=()=>true){
  let best=null;
  for(const e of graph.edges){
   if(e.abandoned||!edgeKept(graph,e)||!filter(e))continue;
   const samples=e.surfacePoints??[e.a.position,e.b.position];
   const bounds=e.approachBounds??=(samples.reduce((box,p)=>[Math.min(box[0],p.x),Math.max(box[1],p.x),Math.min(box[2],p.z),Math.max(box[3],p.z)],[Infinity,-Infinity,Infinity,-Infinity]));
   const dx=Math.max(bounds[0]-target.x,0,target.x-bounds[1]),dz=Math.max(bounds[2]-target.z,0,target.z-bounds[3]);
   if(best&&dx*dx+dz*dz>best.distance)continue;
   for(let i=1;i<samples.length;i++){
    const p=new THREE.Line3(samples[i-1],samples[i]).closestPointToPoint(target,true,V());
    if(masked(p,{},e.width/2+.3)||graph===roadGraph&&inAirportClearance(p))continue;
    p.y=terrainDatum(p,e.width);
    if(graph===roadGraph)p.y=roadGraph.highwaySurfaceHeight(p,e.width)+(isHighwayRoad(e.tags)?HIGHWAY_ASPHALT_LIFT:0);
    const distance=p.distanceToSquared(target);
    if(!best||distance<best.distance)best={edge:e,point:p,distance,tangent:samples[i].clone().sub(samples[i-1]).normalize()};
   }
  }
  return best;
 }
 function assignedRailJoin(port){
  const route=mikRailSourcePlan.destinationRoutes.find(route=>route.id===port.sourceRouteId);if(!route)return null;
  for(let i=route.points.length-1;i>0;i--){
   const a=route.points[i-1],b=route.points[i],va=!masked(a,{}),vb=!masked(b,{});
   if(!va)continue;
   let p=b.clone();
   if(!vb){let lo=0,hi=1;for(let j=0;j<36;j++){const mid=(lo+hi)/2;if(masked(a.clone().lerp(b,mid),{}))hi=mid;else lo=mid;}p=a.clone().lerp(b,(lo+hi)/2);}
   return {edge:route.edges[i-1],point:p,tangent:b.clone().sub(a).normalize(),distance:0,sourceRouteId:route.id,sourceNodeId:port.sourceNodeId};
  }
  return null;
 }
 for(const [id,baseSpec] of Object.entries(FACILITY_PORTS)){
  const site=siteRecords.find(s=>s.id===id);if(!site)continue;const spec={...baseSpec,yaw:site.runtimeYaw??baseSpec.yaw},gate=portWorld(spec,spec.road,site,point),out=V(...(spec.roadOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),spec.yaw),target=gate.clone().addScaledVector(out,30);
  const near=id==='pad-41'&&site41Replacement.attachmentEdge?{
   edge:site41Replacement.attachmentEdge,point:site41Replacement.attachmentEdge.b.position.clone(),distance:0,
   tangent:(site41Replacement.attachmentEdge.surfaceTangents?.[1]??site41Replacement.attachmentEdge.b.position.clone().sub(site41Replacement.attachmentEdge.a.position).normalize()).clone()
  }:nearestSegment(roadGraph,target,e=>e.tags.highway!=='track'&&airportPortSourceAllowed(id,e)&&!masked(e.a.position.clone().lerp(e.b.position,.5),e.tags));if(!near||near.distance>300**2)continue;
  const tangent=near.tangent.clone();if(tangent.dot(gate.clone().sub(near.point))<0)tangent.negate();
  let anchors=[];
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
  accessReports.push({id,sourceWayId:near.edge.wayId,roadGap:points.at(-1).distanceTo(gate),gate:gate.toArray(),sourcePoint:near.point.toArray(),sourceTangent:tangent.toArray(),gateInward:out.clone().negate().toArray(),...transition.stats});connections++;
  if(id==='pad-251'&&airportClearanceReport)airportClearanceReport.gateAccess={sourceWayId:near.edge.wayId,sourcePoint:near.point.toArray(),gatePoint:gate.toArray(),
   profile:'landside-terminal-access',sampleCount:points.length,sourceGap:points[0].distanceTo(near.point),gateGap:points.at(-1).distanceTo(gate),
   airsideHits:points.filter(p=>{const [x,,z]=airportLocal(p);return x>-36&&x<36&&Math.abs(z)<1250;}).length};
  const railPorts=spec.railConnections??(spec.rail||[]).map((position,i)=>({id:id+'-rail-'+i,position,outward:spec.railOutward??[0,0,1]}));
  for(const port of railPorts){
   const railOut=V(...(port.outward||spec.railOutward||[0,0,1])).normalize().applyAxisAngle(V(0,1,0),spec.yaw);
   const headCenter=portWorld(spec,port.position,site,point),end=headCenter.clone().add(V(0,-RAIL_PROFILE.headY,0)),rr=port.sourceRouteId?assignedRailJoin(port):nearestSegment(railGraph,end.clone().addScaledVector(railOut,35),e=>!masked(e.a.position.clone().lerp(e.b.position,.5),{}));if(!rr||rr.distance>250**2)continue;
   const tangent=rr.tangent.clone();if(tangent.dot(end.clone().sub(rr.point))<0)tangent.negate();
   const transition=createAccessTransition({start:rr.point,end,startTangent:tangent,endTangent:railOut.clone().negate(),startWidth:RAIL_PROFILE.ballastWidth,endWidth:RAIL_PROFILE.ballastWidth,sampleStep:.4}),points=transition.points,endGauge=RAIL_PROFILE.gauge;
   const frame=(p,fallback)=>p.distanceToSquared(end)<1e-10?railOut.clone().negate():p.distanceToSquared(rr.point)<1e-10?tangent:fallback;
   drawRail(points,false,true,endGauge,null,frame);connections++;
   const renderedHeadCenter=points.at(-1).clone().add(V(0,RAIL_PROFILE.headY,0));railPortReports.push({id,portId:port.id,sourceWayId:rr.edge.wayId,sourceNodeId:port.sourceNodeId??null,sourceRouteId:port.sourceRouteId??null,sourcePoint:rr.point.toArray(),sourceTangent:tangent.toArray(),gateInward:railOut.clone().negate().toArray(),points:points.map(p=>p.toArray()),headCenter:headCenter.toArray(),renderedHeadCenter:renderedHeadCenter.toArray(),headCenterGap:renderedHeadCenter.distanceTo(headCenter),networkDatumGap:points[0].distanceTo(rr.point),networkGauge:RAIL_PROFILE.gauge,portGauge:endGauge,physicalGaugeMetres:spec.physicalRailGauge??null});
  }
 }
 // The owner removed the reconstructed external Saturn approach. Its road,
 // embankment and lighting path are absent; the OSM roads and hill stay intact.
 // Lights are based on arterial paths and connectors; never place thousands
 // of lamps on every city alley or on abandoned service roads.
 roadPaths.osmVehiclePlan=roadPlan;
 const mainRoadPoints=highway.points,westEnd=mainRoadPoints.findIndex(p=>p.distanceTo(highway.position(bridgeDistance))<8);
 const split=Math.max(1,Math.min(mainRoadPoints.length-2,westEnd<0?Math.floor(mainRoadPoints.length/2):westEnd));
 roadPaths.push({id:'r-south-west',points:mainRoadPoints.slice(0,split+1).reverse(),width:highway.width,source:'OpenStreetMap'},
  {id:'r-south-east',points:mainRoadPoints.slice(split),width:highway.width,source:'OpenStreetMap'});
 // Build the train's long route on the real connected railway network.
 const connection=new THREE.CubicBezierCurve3(straight,straight.clone().add(V(-25,0,0)),railStart.position.clone().addScaledVector(railTangent,-25),railStart.position);
 const connectionPoints=[gate,...sampleCurve(connection)];drawRail(connectionPoints,false,true);connections++;
 const gagarinJoinGap=connectionPoints.at(-1).distanceTo(graphTrain.nodes[0].position);
 const trainPoints=conformPath(simplifyPath([...connectionPoints,...graphTrain.nodes.map(n=>n.position)]),RAIL_PROFILE.ballastWidth).map(p=>p.clone().add(V(0,RAIL_PROFILE.headY,0))),train={path:distancePath(trainPoints),gauge:RAIL_PROFILE.gauge,source:'OpenStreetMap',from:'Пл. №1 · Гагаринский старт',to:'Тюратам · город',joins:[{from:'museum-pad1-port',to:'osm-rail-network',gap:gagarinJoinGap,tangentDot:connection.getTangent(1).dot(railTangent)}],sections:[{id:'osm-pad1-to-tyuratam'}],osmWayIds:[...new Set(graphTrain.edges.map(e=>e.wayId))]};
 for(const f of data.railPoints?.features||[]){const tags=tagsFor(f);if(!['station','halt'].includes(tags.railway)||f.geometry.type!=='Point')continue;const [lon,lat]=f.geometry.coordinates;if(lon<BBOX[0]||lon>BBOX[2]||lat<BBOX[1]||lat>BBOX[3])continue;
  const p=geography.project(lon,lat),at=point(...p,.9),group=new THREE.Group(),anchor=new THREE.Object3D();group.name=f.properties.name;group.position.copy(at);anchor.position.y=3;group.add(anchor);railRoot.add(group);
  const building=new THREE.Mesh(new THREE.BoxGeometry(5.4,3.8,9),material(0x999992));building.position.set(4,1.9,0);group.add(building);const roof=new THREE.Mesh(new THREE.BoxGeometry(6,.45,9.6),material(0x6f8b8a));roof.position.set(4,3.9,0);group.add(roof);
  stationLabels.push({id:'osm-station-'+f.properties.osmId,name:f.properties.name,anchor,group,osmUrl:f.properties.osmUrl,record:{label:f.properties.name,x:p[0],y:p[1],source:'OpenStreetMap'}});
 }
 const lowerAprons=createInterchangeAprons(roadGraph);
 for(const apron of lowerAprons){
  highwayAsphalt.patch(apron.triangles,apron.mask);
  for(const curb of apron.curbs)shoulder.ribbon(curb,ROAD_STYLE.shoulderExtra,-.055-HIGHWAY_ASPHALT_LIFT);
 }
 batches.forEach(b=>b.flush());
 const interchangeBridge=buildInterchangeBridge({parent:roadRoot,plan:interchangeBridgePlan});
 // The architectural span is the sole pavement owner between its exact
 // seam sections. Its footprint still excludes grade-compatible local-road
 // overlays, while the real bridge triangles supply paint/traffic heights.
 const bridgeOwnership=interchangeBridgePlan?interchangeBridgePlan.samples.slice(1).map((at,i)=>{
  const previous=interchangeBridgePlan.samples[i],corner=(sample,side)=>interchangeBridgePlan.world(sample.p.clone().addScaledVector(sample.normal,side*interchangeBridgePlan.width/2).add(V(0,HIGHWAY_ASPHALT_LIFT,0)));
  return [corner(previous,-1),corner(previous,1),corner(at,1),corner(at,-1)];
 }):[];
 const ordinarySurfaceClip=clipOrdinaryRoadMeshes([asphalt.mesh,shoulder.mesh,unpaved.mesh,paint.mesh],highwayAsphalt.mesh,[...highwayAsphalt.ownershipPolygons,...bridgeOwnership]);
 const bridgeAsphalt=interchangeBridge?.root.getObjectByName('Виадук · asphalt');
 const pavementY=pavementHeightSampler([highwayAsphalt.mesh,bridgeAsphalt]);
 for(const route of roadPlan.routes)route.surfaceHeightAt=p=>pavementY(p)??p.y;
 const markingPavementY=pavementHeightSampler([asphalt.mesh,highwayAsphalt.mesh,bridgeAsphalt]);
 const roadMarkingPlan=buildRoadMarkings({roads:markingRoads,graph:roadGraph,surfaceHeightAt:markingPavementY,directionAt:highwayDirectionAt,
  extraEdges:lowerAprons.flatMap(apron=>apron.edgeLines.map((edge,i)=>({...edge,id:'apron-'+apron.spec.nodeId+'-'+i,family:'highway',width:HIGHWAY_MARKINGS.edgeWidth}))),
  excludePoint:(p,{kind,road,family})=>lowerAprons.some(apron=>apron.contains(p)&&(apron.spec.connectorWayIds.includes(String(road.wayId))||family==='highway'&&kind==='edge'&&road.tags?.highway?.endsWith('_link')))});
 for(const quad of roadMarkingPlan.quads){
  const target=quad.color==='yellow'?highwayYellow:quad.family==='highway'?highwayWhite:paint;
  target.quad(...quad.vertices);
 }
 markingSegments=roadMarkingPlan.quads.length;
 paint.flush();highwayYellow.flush();highwayWhite.flush();batches.push(highwayYellow,highwayWhite);
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
   drawRail(points,false,true,RAIL_PROFILE.gauge,null,(p,fallback)=>p.distanceToSquared(points[0])<1e-10?forward:p.distanceToSquared(points.at(-1))<1e-10?V(...track.sourceTangent):fallback);
  }
  for(const b of [ballast,ties,steel])b.flush();connections+=tracks.length;
  return {connected:true,tracks:tracks.map(({points,...track})=>track),joinGap:Math.max(...tracks.map(track=>track.junctionGap)),version:mikRailSourcePlan.version,
   sourceRoutes:mikRailSourcePlan.gates.map(gate=>'osm-rail-'+gate.sourceWayId),sourceSwitches:mikRailSourcePlan.gates.map(gate=>gate.sourceNodeId),
   destinationRoutes:mikRailSourcePlan.destinationRoutes.map(({edges,points,...route})=>route),replacedSourceEdges:mikRailSourcePlan.replacedEdges.size,
   railGauge:RAIL_PROFILE.gauge,railProfile:RAIL_PROFILE};
 }
 const buildMilliseconds=Date.now()-started;
 return {roadPaths:()=>roadPaths,trainPath:()=>train,stationLabels:()=>stationLabels,connectMik112,roadMarkingPlan,
  roadMarkingTarget(nodeId){const node=roadGraph.nodes.get(String(nodeId));return node?{nodeId:node.id,center:node.position.toArray(),sourceWayIds:[...new Set(node.edges.map(edge=>edge.wayId))]}:null;},
  bridgeObjects:()=>interchangeBridge?[interchangeBridge.root]:[],
  setBridgeEvening:value=>interchangeBridge?.setEvening(value),
  isBridgePoleAllowed:(x,z)=>interchangeBridge?.isPoleAllowed(x,z)??true,
  routes:{road:roadPaths.map(r=>({id:r.id,points:r.points.map(p=>[(p.x/3.4)+650,(p.z/3.4)+522.5])})),rail:railPaths},
  stats:()=>({version:'osm-transport-v1',source:'OpenStreetMap',sourceTimestamp:data.roads.osmBaseTimestamp,confidence:'osm-source-node-topology',roadFeatureCount:data.roads.features.length,railFeatureCount:data.railways.features.length,
   roadRoutes:roadGraph.ways.length,railRoutes:railGraph.ways.length,roadNodes:roadGraph.nodes.size,railNodes:railGraph.nodes.size,roadComponents:roadGraph.components.length,railComponents:railGraph.components.length,
   roadSurface:{version:'osm-batched-upward-terrain-surfaces-v2',junctionCount,markingSegments,roads:renderedRoadWays.size,paintLift:HIGHWAY_MARKINGS.lift-HIGHWAY_ASPHALT_LIFT,sampleStep:1.4,normalDirection:'upward',terrainClearance:.38,
    markings:roadMarkingPlan.stats,local:roadGraph.localRoadSurface,
    highway:{...roadGraph.highwaySurface,asphaltColor:'#'+HIGHWAY_ASPHALT_COLOR.toString(16),asphaltLift:HIGHWAY_ASPHALT_LIFT,sharedWithBridge:true,clippedOverlapSections:highwayAsphalt.clippedSections,ordinarySurfaceClip,
     lowerJunctionAprons:{version:INTERCHANGE_APRON_VERSION,junctions:lowerAprons.map(apron=>apron.report)},
     markings:{...HIGHWAY_MARKINGS,sourceWayIds:[...highwayMarkedWays],mainRuns:highwayMarkingRuns,rampRuns:rampMarkingRuns,projectionMisses:roadMarkingPlan.stats.projectionMisses,
      yellowTriangles:highwayYellow.triangles,whiteTriangles:highwayWhite.triangles,bridgeBoundary:'exact-profile-seams',lanePolicy:'source-lanes-and-direction',junctionPolicy:roadMarkingPlan.stats.version}},
    continuousThroughRoads:[{sourceWayId:INDUSTRIAL_THROUGH_ROAD,siteIds:[...INDUSTRIAL_THROUGH_SITES],renderedRuns:roadPaths.filter(r=>r.source==='OpenStreetMap'&&r.osmWayIds?.includes(INDUSTRIAL_THROUGH_ROAD)).length}]},junctionCount,markingSegments,railTies,railGauge:RAIL_PROFILE.gauge,
   railProfile:RAIL_PROFILE,branchSimplification:{version:'terminal-branches-v2',road:roadPruning.stats,rail:railPruning.stats},renderedRailWays:renderedRailWays.size,
   exhibitRoadSimplification:{...exhibitRoadFilter.stats,displayClearance:airportClearanceReport,site41DisplayReplacement:site41Replacement.stats},
   renderedRoadWays:renderedRoadWays.size,roadStyle:ROAD_STYLE,cityRoadSimplification:{sourceBoundary:cityFeature?.id||null,hiddenWays:hiddenCityWays.size,hiddenWayIds:[...hiddenCityWays],preservedTrafficWays:roadGraph.ways.filter(w=>cityMinor(w.tags)&&protectedTrafficWays.has(w.osmId)&&w.segments.some(e=>inCity(e.a.position)||inCity(e.b.position))).length},
   settlementRoadSimplification:settlements.map(region=>({id:region.id,name:region.name,sourceBoundary:region.feature?.id||null,minimalProfile:region.profile,sourceWayCount:region.sourceWays.size,renderedWayCount:region.keptWays.size,hiddenWays:region.hiddenWays.size,keptWayIds:[...region.keptWays],preservedTrafficWayIds:[...region.trafficWays]})),
   stationCount:stationLabels.length,stationNames:stationLabels.map(s=>s.name),railSwitches:(data.railPoints?.features||[]).filter(f=>tagsFor(f).railway==='switch').length,
   abandonedRailWays:railGraph.ways.filter(w=>w.abandoned).length,mergedMeshCount:batches.filter(b=>b.mesh).length,triangles:batches.reduce((n,b)=>n+b.triangles,0),buildMilliseconds,
   modelPortConnections:connections,facilityPorts:accessReports,facilityRailPorts:railPortReports,siteAccess:accessReports.map(r=>r.id.replace('pad-','')),gatePorts:accessReports.map(r=>r.id),
   vehicleRoutes:roadPlan.routes.map(r=>({id:r.id,source:r.source,length:r.length,osmWayCount:r.osmWayIds.length,nodeCount:r.nodeIds.length,vehicleScale:r.vehicleScale})),trainSource:train.source,trainWayCount:train.osmWayIds.length,
   saturnAccess:null,
   interchange:{version:'osm-reference-viaduct-v1',bridges:bridges.map(b=>b.osmWayId===INTERCHANGE_BRIDGE_WAY?{...b,...interchangeBridge?.stats()}:b),ramps:0,source:'OpenStreetMap bridge/layer topology; Bridge Design by 3DtechVN, CC BY 4.0'},gagarinRail:{version:'osm-pad1-port-v1',joinGap:gagarinJoinGap,entryWorld:gate.toArray(),gauge:RAIL_PROFILE.gauge,straightLength:18}})};
}
