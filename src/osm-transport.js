import * as THREE from 'three';
import {pruneTerminalBranches} from './transport-pruning.js?v=20261029-transport-cleanup-v2';
import {buildExhibitRoadFilter,EXHIBIT_ACCESS_NODE_IDS,rectangleSegmentInterval,clipRoadOutsideRectangle,airportPerimeterBypass} from './exhibit-road-filter.js?v=20261030-river-roads-signs-v1';
import {SILO_SITE_IDS} from './silo-sites.js?v=20261029-all-silos-v2';
import {RAIL_PROFILE} from './gagarin-rail-approach.js?v=20261028-museum4-osm-live-v2';
import {FACILITY_PORTS,portWorld} from './facility-ports.js?v=20261029-all-silos-v2';
import {distancePath} from './traffic-paths.js?v=20261028-museum4-osm-live-v2';
import {SATURN_ACCESS,saturnTerrainHeight} from './saturn-access.js?v=20261030-river-roads-signs-v1';

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
 return {nodes,edges,ways,components,largest,nearest,route,bridgeSeeds};
}

function geometryBatch(parent,name,material){
 const positions=[],normals=[],indices=[];let mesh=null;
 function tri(a,b,c){
  // The visible side of every road/rail sheet is its top. Float32 rounding
  // happens before the area test, so tiny source segments cannot turn into
  // inverted slivers on the GPU. Winding and lighting normals must agree:
  // DoubleSide otherwise flips an explicitly upward normal downwards.
  let ax=Math.fround(a.x),ay=Math.fround(a.y),az=Math.fround(a.z),bx=Math.fround(b.x),by=Math.fround(b.y),bz=Math.fround(b.z),cx=Math.fround(c.x),cy=Math.fround(c.y),cz=Math.fround(c.z);
  const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  if(Math.abs(ny)<1e-8)return;
  if(ny<0){[bx,cx]=[cx,bx];[by,cy]=[cy,by];[bz,cz]=[cz,bz];nx=-nx;ny=-ny;nz=-nz;}
  const length=Math.hypot(nx,ny,nz),n=positions.length/3;nx/=length;ny/=length;nz/=length;
  positions.push(ax,ay,az,bx,by,bz,cx,cy,cz);normals.push(nx,ny,nz,nx,ny,nz,nx,ny,nz);indices.push(n,n+1,n+2);
 }
 function quad(a,b,c,d){tri(a,c,b);tri(b,c,d);}
 function disc(center,radius,y=0){for(let i=0;i<14;i++){const a=i*Math.PI/7,b=(i+1)*Math.PI/7;tri(V(center.x,center.y+y,center.z),V(center.x+Math.cos(a)*radius,center.y+y,center.z+Math.sin(a)*radius),V(center.x+Math.cos(b)*radius,center.y+y,center.z+Math.sin(b)*radius));}}
 function ribbon(points,width,lift=0,offset=0){
  if(points.length<2)return;const rims=[];
  for(let i=0;i<points.length;i++){
   const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],d=next.clone().sub(prev).setY(0).normalize(),normal=V(-d.z,0,d.x);
   rims.push([-1,1].map(side=>points[i].clone().addScaledVector(normal,offset+side*width/2).add(V(0,lift,0))));
  }
  for(let i=1;i<rims.length;i++)quad(rims[i-1][0],rims[i-1][1],rims[i][0],rims[i][1]);
 }
 function flush(){
  if(mesh){parent.remove(mesh);mesh.geometry.dispose();}if(!positions.length)return null;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices);g.computeBoundingSphere();
  mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.userData.groundSurface=true;mesh.userData.osmSource=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 return {ribbon,disc,quad,flush,get triangles(){return indices.length/3;},get mesh(){return mesh;}};
}

function sampleCurve(curve,step=1.4){const n=Math.max(4,Math.ceil(curve.getLength()/step));return Array.from({length:n+1},(_,i)=>curve.getPointAt(i/n));}
function simplifyPath(points){return points.filter((p,i)=>!i||p.distanceTo(points[i-1])>1e-6).map(p=>p.clone());}
function samplesWithVertices(points,step){const out=[points[0].clone()];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(a.distanceTo(b)/step));for(let j=1;j<=n;j++)out.push(a.clone().lerp(b,j/n));}return out;}

function makeVehicleRoute(id,label,graphRoute,conform=points=>points){
 const original=graphRoute.nodes.map(n=>n.position.clone()),points=[original[0].clone()];
 for(let i=1;i<original.length-1;i++){
  const p=original[i],incoming=p.clone().sub(original[i-1]),outgoing=original[i+1].clone().sub(p),lengthA=incoming.length(),lengthB=outgoing.length();
  incoming.normalize();outgoing.normalize();const width=Math.min(graphRoute.edges[i-1].width,graphRoute.edges[i].width),reach=Math.min(lengthA*.28,lengthB*.28,width*.3,3);
  if(reach<.03||incoming.dot(outgoing)>.9995){points.push(p.clone());continue;}
  const entry=p.clone().addScaledVector(incoming,-reach),exit=p.clone().addScaledVector(outgoing,reach);points.push(entry);
  const turn=new THREE.QuadraticBezierCurve3(entry,p,exit);for(let j=1;j<=6;j++)points.push(turn.getPoint(j/6));
 }
 points.push(original.at(-1).clone());const path=distancePath(conform(points,Math.max(...graphRoute.edges.map(e=>e.width)))),boundaries=[];let at=0;
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
 const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0,side:THREE.DoubleSide,...extra});
 const mat={shoulder:material(ROAD_STYLE.shoulderColor),asphalt:material(ROAD_STYLE.asphaltColor),track:material(0xb2a58d),paint:material(0xf2f0e4,{polygonOffset:true,polygonOffsetFactor:-1}),ballast:material(0x988b78),ties:material(0x766c5c),steel:material(0x707773,{metalness:.62,roughness:.51}),abandoned:material(0x786f5e)};
 const roadRoot=new THREE.Group(),railRoot=new THREE.Group();roadRoot.name='OpenStreetMap · автодороги';railRoot.name='OpenStreetMap · железнодорожные пути';layers.roads.add(roadRoot);layers.rails.add(railRoot);
 const shoulder=geometryBatch(roadRoot,'OSM · единые обочины',mat.shoulder),asphalt=geometryBatch(roadRoot,'OSM · единое дорожное полотно',mat.asphalt),unpaved=geometryBatch(roadRoot,'OSM · грунтовые проезды',mat.track),paint=geometryBatch(roadRoot,'OSM · разметка',mat.paint);
 const ballast=geometryBatch(railRoot,'OSM · балласт',mat.ballast),ties=geometryBatch(railRoot,'OSM · шпалы',mat.ties),steel=geometryBatch(railRoot,'OSM · рельсы',mat.steel),abandoned=geometryBatch(railRoot,'OSM · бывшие пути',mat.abandoned);
 const batches=[shoulder,asphalt,unpaved,paint,ballast,ties,steel,abandoned],roadPaths=[],railPaths=[],stationLabels=[];
 let markingSegments=0,railTies=0,connections=0;const accessReports=[],railPortReports=[],renderedRoadWays=new Set(),renderedRailWays=new Set(),hiddenCityWays=new Set();
 let roadPruning=null,railPruning=null,exhibitRoadFilter=null;
 const edgeKept=(graph,e)=>!(graph===roadGraph?roadPruning:railPruning)?.removed.has(e)&&!(graph===roadGraph&&exhibitRoadFilter?.removed.has(e));
 // The enlarged Yubileiny exhibit occupies more land than the source runway.
 // Clear its displayed runway, taxiway, apron and terminal as one road-only
 // envelope. A single synthetic perimeter route reconnects through roads.
 const yubileinySite=siteRecords.find(s=>s.id==='pad-251');
 const airportClearance=yubileinySite?{
  id:'yubileiny',siteId:'pad-251',origin:point(yubileinySite.x,yubileinySite.y,0),
  yaw:yubileinySite.runtimeYaw??1.948,scale:.28,
  rectangle:{minX:-475,maxX:95,minZ:-1265,maxZ:1265},cuts:[],sourceWays:new Set(),hiddenServiceWays:new Set(),
 }:null;
 const airportLocal=p=>p.clone().sub(airportClearance.origin).applyAxisAngle(V(0,1,0),-airportClearance.yaw).divideScalar(airportClearance.scale).toArray();
 const airportWorld=p=>V(...p).multiplyScalar(airportClearance.scale).applyAxisAngle(V(0,1,0),airportClearance.yaw).add(airportClearance.origin);
 const inAirportClearance=p=>{if(!airportClearance)return false;const [x,,z]=airportLocal(p),r=airportClearance.rectangle;return x>r.minX+1e-6&&x<r.maxX-1e-6&&z>r.minZ+1e-6&&z<r.maxZ-1e-6;};
 const airportPortSourceAllowed=(id,e)=>id!=='pad-251'||!airportClearance||
  [e.a,e.b].every(n=>airportLocal(n.position)[0]<airportClearance.rectangle.minX-1);
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
 const junctionCells=new Map();
 function nearJunction(p,width){const x=Math.floor(p.x/20),z=Math.floor(p.z/20);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const q of junctionCells.get((x+dx)+':'+(z+dz))||[])if(Math.hypot(p.x-q.x,p.z-q.z)<width+2)return true;return false;}
 const masks=new Map();
 for(const [id,radius] of Object.entries({'pad-110':72,'pad-250':43,'pad-31':60,'pad-45':35,'pad-42':22,'pad-112':35,'pad-112a':40,'pad-92':25,'pad-1':16})){
  const s=siteRecords.find(s=>s.id===id);if(s)masks.set(id,{center:point(s.x,s.y,0),radius});
 }
 const hotelSite=siteRecords.find(s=>s.id==='pad-75');if(hotelSite)masks.set('pad-75',{center:point(hotelSite.x,hotelSite.y,0),rectangle:{halfX:10.8,minZ:-3.4,maxZ:12.4}});
 // Reserve the same compact museum footprint as each detailed shaft model.
 for(const id of SILO_SITE_IDS){const site=siteRecords.find(s=>s.id===id);if(site)masks.set(id,{center:point(site.x,site.y,0),radius:10.5});}
 function masked(p,tags,margin=0,sourceWayId=null){for(const [id,m] of masks){if(sourceWayId===INDUSTRIAL_THROUGH_ROAD&&INDUSTRIAL_THROUGH_SITES.has(id))continue;const x=p.x-m.center.x,z=p.z-m.center.z;if(m.rectangle){if(['trunk','primary','secondary','tertiary','unclassified'].includes(tags.highway?.replace('_link','')))continue;const r=m.rectangle;if(Math.abs(x)<r.halfX+margin&&z>r.minZ-margin&&z<r.maxZ+margin)return true;}else if(x*x+z*z<(m.radius+margin)**2)return true;}return false;}
 function drawRoad(points,width,tags={},marked=false,force=false,wayId=null,renderedRuns=null){
  if(points.length<2)return false;const samples=conformPath(points,width),path=distancePath(samples);if(path.length<.001)return false;
  const dirt=tags.highway==='track'||['unpaved','ground','dirt','sand'].includes(tags.surface),pavement=dirt?unpaved:asphalt;
  let run=[],rendered=false;
  const flush=()=>{if(run.length>1){shoulder.ribbon(run,width+ROAD_STYLE.shoulderExtra,-.055);pavement.ribbon(run,width,0);rendered=true;if(renderedRuns)renderedRuns.push(run.map(p=>p.clone()));}run=[];};
  const hidden=p=>!force&&(masked(p,tags,width/2+ROAD_STYLE.shoulderExtra/2,wayId)||settlementHidden(p,tags,wayId));
  for(const p of samples){if(hidden(p)){flush();continue;}run.push(p);}flush();
  if(marked&&!dirt){
   for(let d=5;d<path.length-5;d+=13){const end=Math.min(path.length-5,d+4.7),dash=Array.from({length:8},(_,i)=>path.position(d+(end-d)*i/7));if(dash.some(p=>nearJunction(p,width)||hidden(p)))continue;
    paint.ribbon(dash,ROAD_STYLE.paintWidth,.052);markingSegments++;
   }
  }
  return rendered;
 }
 const sitePoint=id=>{const s=siteRecords.find(s=>s.id===id);return point(s.x,s.y,.72);};
 const majorNode=n=>n.edges.some(e=>MAIN.has(e.tags.highway?.replace('_link','')));
 const trunkNodes=[...roadGraph.nodes.values()].filter(n=>n.component===roadGraph.largest&&n.edges.some(e=>['trunk','primary'].includes(e.tags.highway))&&n.coord[1]<45.83);
 if(!trunkNodes.length)throw Error('No OSM highway in the Baikonur region');
 const west=trunkNodes.reduce((a,b)=>a.position.x<b.position.x?a:b),east=trunkNodes.reduce((a,b)=>a.position.x>b.position.x?a:b),city=roadGraph.nearest(sitePoint('city'),{filter:majorNode}),northwest=roadGraph.nearest(sitePoint('pad-81'),{filter:majorNode});
 const highway=makeVehicleRoute('highway','Трасса Аральск — Кызылорда',roadGraph.route(west,east),conformPath);
 const cityRoute=makeVehicleRoute('city-cosmodrome','Байконур ↔ космодром',roadGraph.route(city,northwest),conformPath);
 let bridgeDistance=0,best=Infinity,along=0;const crossing=geography.project(63.322,45.679),crossPoint=point(...crossing,.72);
 for(let i=1;i<highway.points.length;i++){const a=highway.points[i-1],b=highway.points[i],near=new THREE.Line3(a,b).closestPointToPoint(crossPoint,true,V()),d=near.distanceToSquared(crossPoint);if(d<best){best=d;bridgeDistance=along+a.distanceTo(near);}along+=a.distanceTo(b);}
 highway.bridgeDistance=bridgeDistance;highway.routeIds=['osm-e38'];highway.joinGap=0;
 const westCity=makeVehicleRoute('highway-city--1','Аральск ↔ Байконур',roadGraph.route(west,city),conformPath),eastCity=makeVehicleRoute('highway-city-1','Кызылорда ↔ Байконур',roadGraph.route(east,city),conformPath);
 for(const r of [westCity,eastCity]){r.rampStart=r.length*.7;r.rampEnd=r.length*.75;}
 const roadPlan={routes:[highway,cityRoute,westCity,eastCity],highway,joins:[],extensions:[],source:'OpenStreetMap'};
 const protectedTrafficWays=new Set(roadPlan.routes.flatMap(r=>r.osmWayIds));
 const gagarin=siteRecords.find(s=>s.id==='pad-1'),padCenter=point(gagarin.x,gagarin.y,0),gate=padCenter.clone().add(V(-171*RAIL_PROFILE.scale,-2.755,0));
 const railStart=railGraph.nearest(gate.clone().add(V(-60,0,0))),stationFeature=data.railPoints?.features.find(f=>f.properties.osmId===4031286685),stationCoord=stationFeature?.geometry.coordinates||[63.3161095,45.651523],stationMap=geography.project(...stationCoord),railEnd=railGraph.nearest(point(...stationMap,.75));
 const graphTrain=railGraph.route(railStart,railEnd),railTangent=graphTrain.nodes[1].position.clone().sub(railStart.position).normalize(),straight=gate.clone().add(V(-18,0,0));
 // Keep physical destinations and the exact attachment edges of model ports.
 // Named roads, bridges, parking/driveways and operational station sidings
 // have a purpose even when their endpoint is not a catalogue marker.
 const roadProtected=new Set(roadGraph.edges.filter(e=>protectedTrafficWays.has(e.wayId)));
 const railProtected=new Set(graphTrain.edges);
 for(const [id,spec] of Object.entries(FACILITY_PORTS)){
  const site=siteRecords.find(s=>s.id===id);if(!site)continue;
  const effective={...spec,yaw:site.runtimeYaw??spec.yaw},gate=portWorld(effective,spec.road,site,point),out=V(...(spec.roadOutward||[0,0,1])).applyAxisAngle(V(0,1,0),effective.yaw);
  const near=nearestSegment(roadGraph,gate.clone().addScaledVector(out,30),e=>e.tags.highway!=='track'&&airportPortSourceAllowed(id,e)&&!masked(e.a.position.clone().lerp(e.b.position,.5),e.tags));
  if(near&&near.distance<=300**2)roadProtected.add(near.edge);
  for(const local of spec.rail||[]){const end=portWorld(effective,local,site,point).add(V(0,-RAIL_PROFILE.headY,0)),rr=nearestSegment(railGraph,end.addScaledVector(out,35),e=>!masked(e.a.position.clone().lerp(e.b.position,.5),{}));if(rr&&rr.distance<=250**2)railProtected.add(rr.edge);}
 }
 const destinations=siteRecords.map(s=>({position:point(s.x,s.y,0),radius:Math.max(25,(masks.get(s.id)?.radius||0)+12)}));
 for(const f of data.railPoints?.features||[])if(['station','halt'].includes(tagsFor(f).railway)&&f.geometry.type==='Point')destinations.push({position:point(...geography.project(...f.geometry.coordinates),0),radius:45});
 const protectedNode=n=>n.id.startsWith('clip:')||destinations.some(d=>Math.hypot(n.position.x-d.position.x,n.position.z-d.position.z)<d.radius);
 const inCosmodrome=e=>[e.a,e.b].every(n=>n.coord[1]>=45.70&&!settlements.some(region=>region.contains(n.position)));
 const infrastructure=e=>e.tags.name||e.tags.ref||e.tags.destination||e.tags.bridge&&e.tags.bridge!=='no'||e.tags.tunnel&&e.tags.tunnel!=='no';
 roadPruning=pruneTerminalBranches(roadGraph,{maxLength:80,protectedEdges:roadProtected,protectedNode:n=>protectedNode(n)||EXHIBIT_ACCESS_NODE_IDS.includes(n.id),
  eligible:e=>inCosmodrome(e)&&!infrastructure(e)&&!MAIN.has(e.tags.highway?.replace('_link',''))&&!['driveway','parking_aisle'].includes(e.tags.service)});
 railPruning=pruneTerminalBranches(railGraph,{maxLength:55,protectedEdges:railProtected,protectedNode,
  eligible:e=>inCosmodrome(e)&&!infrastructure(e)&&e.tags.usage!=='main'&&!['yard','siding','crossover'].includes(e.tags.service)});
 // Simplify the displayed road webs only. The immutable source-node graph
 // continues to define vehicle routes; rail masks and rail routing are untouched.
 const excludedAirportEdges=new Set();
 let krayniyClearanceReport=null;
 const krayniySite=siteRecords.find(s=>s.id==='airfield');
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
 exhibitRoadFilter=buildExhibitRoadFilter(roadGraph,{protectedEdges:roadProtected,protectedTrafficWays,
  available:e=>!roadPruning.removed.has(e),excludedEdges:excludedAirportEdges,geography,point});
 // The enlarged runway can extend beyond the source airport cleanup box.
 for(const edge of excludedAirportEdges)exhibitRoadFilter.removed.add(edge);
 exhibitRoadFilter.stats.removedEdgeCount=exhibitRoadFilter.removed.size;
 // Junction paint gaps and discs must follow the retained edges as well.
 for(const n of roadGraph.nodes.values())if(n.edges.filter(e=>edgeKept(roadGraph,e)&&!settlementHidden(n.position,e.tags,e.wayId)).length>2){const k=Math.floor(n.position.x/20)+':'+Math.floor(n.position.z/20);if(!junctionCells.has(k))junctionCells.set(k,[]);junctionCells.get(k).push(n.position);}
 const junctionWidths=new Map();
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
   for(const run of runs)if(drawRoad(run,way.width,way.tags,major,false,way.osmId,visibleRuns))renderedRoadWays.add(way.osmId);
  };
  for(const e of way.segments){
   if(!edgeKept(roadGraph,e)){render();points.length=0;continue;}
   if(points.length&&points.at(-1).distanceTo(e.a.position)>1e-5){render();points.length=0;}
   if(!points.length)points.push(e.a.position);points.push(e.b.position);
   for(const n of [e.a,e.b])junctionWidths.set(n.id,Math.max(junctionWidths.get(n.id)||0,way.width));
  }
  render();
  if(major)visibleRuns.forEach((run,i)=>roadPaths.push({id:'osm-road-'+way.osmId+(i?'-'+i:''),label:'Автодорога',width:way.width,points:run,osmWayIds:[way.osmId],source:'OpenStreetMap'}));
 }
 let junctionCount=0;
 for(const n of roadGraph.nodes.values())if(n.edges.filter(e=>edgeKept(roadGraph,e)&&renderedRoadWays.has(e.wayId)&&!settlementHidden(n.position,e.tags,e.wayId)).length>2){const width=junctionWidths.get(n.id)||1.6;if(masked(n.position,{},width/2+.3)||inAirportClearance(n.position)&&!n.edges.some(e=>protectedTrafficWays.has(e.wayId)))continue;shoulder.disc(n.position,width/2+.3,-.055);asphalt.disc(n.position,width*.51);junctionCount++;}
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
   drawRoad(rounded,2.4,{},false,true);
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
 function drawRail(points,isAbandoned=false,force=false){
  if(points.length<2)return;const samples=conformPath(points,RAIL_PROFILE.ballastWidth),path=distancePath(samples);if(path.length<.01)return;
  const runs=[];let run=[];for(const p of samples){if(!force&&masked(p,{})){if(run.length>1)runs.push(run);run=[];}else run.push(p);}if(run.length>1)runs.push(run);
  for(const ps of runs){
   if(isAbandoned){abandoned.ribbon(ps,.8,.01);continue;}
   ballast.ribbon(ps,RAIL_PROFILE.ballastWidth,.01);
   for(const side of [-1,1])steel.ribbon(ps,RAIL_PROFILE.bodyWidth,RAIL_PROFILE.headY+RAIL_PROFILE.headRadius,side*RAIL_PROFILE.gauge/2);
  }
  if(isAbandoned)return;
  for(let d=.4;d<path.length;d+=1.45){const at=path.sample(d,.3);if(!force&&masked(at.position,{}))continue;const normal=V(-at.tangent.z,0,at.tangent.x).normalize(),a=at.position.clone().addScaledVector(normal,-RAIL_PROFILE.sleeperLength/2),b=at.position.clone().addScaledVector(normal,RAIL_PROFILE.sleeperLength/2);ties.ribbon([a,b],RAIL_PROFILE.sleeperWidth,RAIL_PROFILE.sleeperY);railTies++;}
 }
 for(const way of railGraph.ways){
  const points=[];let run=0;
  const render=()=>{if(points.length<2)return;drawRail(points,way.abandoned);renderedRailWays.add(way.osmId);railPaths.push({id:'osm-rail-'+way.osmId+(run?'-'+run:''),points:[...points],width:RAIL_PROFILE.ballastWidth});run++;};
  for(const e of way.segments){
   if(!edgeKept(railGraph,e)){render();points.length=0;continue;}
   if(points.length&&points.at(-1).distanceTo(e.a.position)>1e-5){render();points.length=0;}
   if(!points.length)points.push(e.a.position);points.push(e.b.position);
  }render();
 }
 // Nearest physical segment, used only for the short museum-scale apron
 // transition. Every long-distance route remains a path of shared OSM nodes.
 function nearestSegment(graph,target,filter=()=>true){
  let best=null;for(const e of graph.edges){if(e.abandoned||!edgeKept(graph,e)||!filter(e))continue;const line=new THREE.Line3(e.a.position,e.b.position),p=line.closestPointToPoint(target,true,V());if(masked(p,{},e.width/2+.3)||graph===roadGraph&&inAirportClearance(p))continue;p.y=terrainDatum(p,e.width);const distance=p.distanceToSquared(target);if(!best||distance<best.distance)best={edge:e,point:p,distance};}return best;
 }
 for(const [id,baseSpec] of Object.entries(FACILITY_PORTS)){
  const site=siteRecords.find(s=>s.id===id);if(!site)continue;const spec={...baseSpec,yaw:site.runtimeYaw??baseSpec.yaw},gate=portWorld(spec,spec.road,site,point),out=V(...(spec.roadOutward||[0,0,1])).applyAxisAngle(V(0,1,0),spec.yaw),target=gate.clone().addScaledVector(out,30);
  const near=nearestSegment(roadGraph,target,e=>e.tags.highway!=='track'&&airportPortSourceAllowed(id,e)&&!masked(e.a.position.clone().lerp(e.b.position,.5),e.tags));if(!near||near.distance>300**2)continue;
  const tangent=near.edge.b.position.clone().sub(near.edge.a.position).normalize();if(tangent.dot(gate.clone().sub(near.point))<0)tangent.negate();const reach=Math.min(30,near.point.distanceTo(gate)*.35);
  const curve=new THREE.CubicBezierCurve3(near.point,near.point.clone().addScaledVector(tangent,reach),gate.clone().addScaledVector(out,Math.min(20,reach)),gate);let points=sampleCurve(curve);
  if(id==='pad-251'&&airportClearance){
   const start=airportLocal(near.point),end=airportLocal(gate),laneX=airportClearance.rectangle.minX;
   const local=[start,[Math.min(start[0],laneX),start[1],end[2]],[laneX,end[1],end[2]],end];
   const anchors=simplifyPath(local.map(airportWorld)),smooth=[anchors[0]];
   for(let i=1;i<anchors.length-1;i++){
    const a=anchors[i-1],b=anchors[i],c=anchors[i+1],incoming=b.clone().sub(a).normalize(),outgoing=c.clone().sub(b).normalize();
    if(incoming.dot(outgoing)>.999){smooth.push(b);continue;}
    const reach=Math.min(7,a.distanceTo(b)*.24,b.distanceTo(c)*.24),entry=b.clone().addScaledVector(incoming,-reach),exit=b.clone().addScaledVector(outgoing,reach),turn=new THREE.QuadraticBezierCurve3(entry,b,exit);
    for(let j=0;j<=10;j++)smooth.push(turn.getPoint(j/10));
   }
   smooth.push(anchors.at(-1));points=samplesWithVertices(simplifyPath(smooth),1.4);
   const horizontal=distancePath(points);let at=0;
   points.forEach((p,j)=>{if(j)at+=p.clone().setY(0).distanceTo(points[j-1].clone().setY(0));const t=clamp(at/horizontal.length,0,1);p.y=THREE.MathUtils.lerp(near.point.y,gate.y,t*t*(3-2*t));});points.at(-1).copy(gate);
   airportClearanceReport.gateAccess={sourceWayId:near.edge.wayId,sourcePoint:near.point.toArray(),gatePoint:gate.toArray(),
    profile:'landside-terminal-access',sampleCount:points.length,sourceGap:points[0].distanceTo(near.point),gateGap:points.at(-1).distanceTo(gate),
    airsideHits:points.filter(p=>{const [x,,z]=airportLocal(p);return x>-380&&x<65&&Math.abs(z)<1185;}).length};
  }
  if(spec.silo){
   // Keep the entry outside the fence, then descend smoothly to its front gate.
   const center=point(site.x,site.y,0),radius=13,angle=Math.atan2(near.point.x-center.x,near.point.z-center.z),endAngle=Math.atan2(out.x,out.z);let sweep=endAngle-angle;
   while(sweep>Math.PI)sweep-=Math.PI*2;while(sweep<-Math.PI)sweep+=Math.PI*2;
   const via=[near.point.clone()];for(let j=0;j<=12;j++){const a=angle+sweep*j/12;via.push(V(center.x+Math.sin(a)*radius,near.point.y,center.z+Math.cos(a)*radius));}
   via.push(gate.clone().addScaledVector(out,2.5),gate);points=sampleCurve(new THREE.CatmullRomCurve3(via,false,'centripetal'));
   const path=distancePath(points);let length=0;points.forEach((p,j)=>{if(j)length+=p.clone().setY(0).distanceTo(points[j-1].clone().setY(0));const t=THREE.MathUtils.clamp(length/path.length,0,1);p.y=THREE.MathUtils.lerp(near.point.y,gate.y,t*t*(3-2*t));});points.at(-1).copy(gate);
  }
  drawRoad(points,1.8,{},false,true);roadPaths.push({id:'osm-access-'+id,label:site.titleShort||site.name,points,width:1.8,source:'museum-model-port',osmWayIds:[near.edge.wayId]});accessReports.push({id,sourceWayId:near.edge.wayId,roadGap:points.at(-1).distanceTo(gate),gate:gate.toArray()});connections++;
  for(const local of spec.rail||[]){
   const headCenter=portWorld(spec,local,site,point),end=headCenter.clone().add(V(0,-RAIL_PROFILE.headY,0)),rr=nearestSegment(railGraph,end.clone().addScaledVector(out,35),e=>!masked(e.a.position.clone().lerp(e.b.position,.5),{}));if(!rr||rr.distance>250**2)continue;
   const tangent=rr.edge.b.position.clone().sub(rr.edge.a.position).normalize();if(tangent.dot(end.clone().sub(rr.point))<0)tangent.negate();const reach=Math.min(25,rr.point.distanceTo(end)*.35),c=new THREE.CubicBezierCurve3(rr.point,rr.point.clone().addScaledVector(tangent,reach),end.clone().addScaledVector(out,Math.min(18,reach)),end),points=sampleCurve(c);drawRail(points,false,true);connections++;
   const renderedHeadCenter=points.at(-1).clone().add(V(0,RAIL_PROFILE.headY,0));railPortReports.push({id,sourceWayId:rr.edge.wayId,headCenter:headCenter.toArray(),renderedHeadCenter:renderedHeadCenter.toArray(),headCenterGap:renderedHeadCenter.distanceTo(headCenter),networkDatumGap:points[0].distanceTo(rr.point)});
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
 const trainPoints=conformPath(simplifyPath([...connectionPoints,...graphTrain.nodes.map(n=>n.position)]),RAIL_PROFILE.ballastWidth).map(p=>p.clone().add(V(0,RAIL_PROFILE.headY+RAIL_PROFILE.headRadius,0))),train={path:distancePath(trainPoints),gauge:RAIL_PROFILE.gauge,source:'OpenStreetMap',from:'Пл. №1 · Гагаринский старт',to:'Тюратам · город',joins:[{from:'museum-pad1-port',to:'osm-rail-network',gap:gagarinJoinGap,tangentDot:connection.getTangent(1).dot(railTangent)}],sections:[{id:'osm-pad1-to-tyuratam'}],osmWayIds:[...new Set(graphTrain.edges.map(e=>e.wayId))]};
 for(const f of data.railPoints?.features||[]){const tags=tagsFor(f);if(!['station','halt'].includes(tags.railway)||f.geometry.type!=='Point')continue;const [lon,lat]=f.geometry.coordinates;if(lon<BBOX[0]||lon>BBOX[2]||lat<BBOX[1]||lat>BBOX[3])continue;
  const p=geography.project(lon,lat),at=point(...p,.9),group=new THREE.Group(),anchor=new THREE.Object3D();group.name=f.properties.name;group.position.copy(at);anchor.position.y=3;group.add(anchor);railRoot.add(group);
  const building=new THREE.Mesh(new THREE.BoxGeometry(5.4,3.8,9),material(0x999992));building.position.set(4,1.9,0);group.add(building);const roof=new THREE.Mesh(new THREE.BoxGeometry(6,.45,9.6),material(0x6f8b8a));roof.position.set(4,3.9,0);group.add(roof);
  stationLabels.push({id:'osm-station-'+f.properties.osmId,name:f.properties.name,anchor,group,osmUrl:f.properties.osmUrl,record:{label:f.properties.name,x:p[0],y:p[1],source:'OpenStreetMap'}});
 }
 batches.forEach(b=>b.flush());
 const bridges=roadGraph.ways.filter(w=>w.tags.bridge&&w.tags.bridge!=='no').map(w=>({type:'road',center:w.segments[0].a.position.clone().lerp(w.segments.at(-1).b.position,.5).toArray(),deckTop:(w.segments[0].a.position.y+w.segments.at(-1).b.position.y)/2,clearance:5.8,length:w.segments.reduce((n,e)=>n+e.length,0),width:w.width,osmWayId:w.osmId}));
 const concrete=material(0x96988f),guard=material(0x8c9899,{roughness:.65,metalness:.3});
 for(const w of roadGraph.ways.filter(w=>w.tags.bridge&&w.tags.bridge!=='no')){
  const a=w.segments[0].a.position,b=w.segments.at(-1).b.position,d=b.clone().sub(a),length=d.length(),group=new THREE.Group();group.name='Мост OSM '+w.osmId;group.position.copy(a).lerp(b,.5);group.rotation.y=Math.atan2(d.x,d.z);roadRoot.add(group);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(w.width+.4,.36,length+.3),concrete);deck.position.y=-.23;group.add(deck);
  for(const side of [-1,1]){const railing=new THREE.Mesh(new THREE.BoxGeometry(.12,.6,length+.4),guard);railing.position.set(side*(w.width/2+.14),.32,0);group.add(railing);
   const height=group.position.y+2.7-.4,pier=new THREE.Mesh(new THREE.BoxGeometry(w.width+.3,height,.42),concrete);pier.position.set(0,-.4-height/2,side*Math.max(.2,length*.42));group.add(pier);
  }
 }
 function connectMik112(root){
  root.updateWorldMatrix(true,true);const entries=root.userData.mik112Model?.railEntries||[],tracks=[];if(!entries.length)return {connected:false};
  const forward=V(0,0,-1).applyQuaternion(root.quaternion),throat=root.localToWorld(V(-45,4.17,-340)),near=nearestSegment(railGraph,throat.clone().addScaledVector(forward,30),e=>!masked(e.a.position.clone().lerp(e.b.position,.5),{}));if(!near)return {connected:false};
  const headJoin=near.point.clone().add(V(0,RAIL_PROFILE.headY,0)),tangent=near.edge.b.position.clone().sub(near.edge.a.position).normalize(),reach=Math.min(30,throat.distanceTo(headJoin)*.35),stem=new THREE.CubicBezierCurve3(throat,throat.clone().addScaledVector(forward,reach),headJoin.clone().addScaledVector(tangent,-reach),headJoin),stemPoints=sampleCurve(stem);
  const toDatum=pts=>pts.map(p=>p.clone().add(V(0,-RAIL_PROFILE.headY,0)));
  for(const entry of entries){const start=root.localToWorld(V(...entry)),curve=new THREE.CubicBezierCurve3(start,start.clone().addScaledVector(forward,10),throat.clone().addScaledVector(forward,-9),throat),points=sampleCurve(curve);drawRail(toDatum(points),false,true);tracks.push({start:start.toArray(),end:headJoin.toArray(),throat:throat.toArray(),localEntry:entry,localStart:root.worldToLocal(start.clone()).toArray(),junctionGap:points.at(-1).distanceTo(stemPoints[0]),modelHeadGap:toDatum(points)[0].clone().add(V(0,RAIL_PROFILE.headY,0)).distanceTo(start)});}
  drawRail(toDatum(stemPoints),false,true);for(const b of [ballast,ties,steel])b.flush();connections+=entries.length+1;
  return {connected:true,sourceRoute:'osm-rail-'+near.edge.wayId,tracks,stemSamples:stemPoints.map(p=>p.toArray()),joinGap:0,version:'osm-mik112-port-v1',railGauge:RAIL_PROFILE.gauge};
 }
 const buildMilliseconds=Date.now()-started;
 return {roadPaths:()=>roadPaths,trainPath:()=>train,stationLabels:()=>stationLabels,connectMik112,
  routes:{road:roadPaths.map(r=>({id:r.id,points:r.points.map(p=>[(p.x/3.4)+650,(p.z/3.4)+522.5])})),rail:railPaths},
  stats:()=>({version:'osm-transport-v1',source:'OpenStreetMap',sourceTimestamp:data.roads.osmBaseTimestamp,confidence:'osm-source-node-topology',roadFeatureCount:data.roads.features.length,railFeatureCount:data.railways.features.length,
   roadRoutes:roadGraph.ways.length,railRoutes:railGraph.ways.length,roadNodes:roadGraph.nodes.size,railNodes:railGraph.nodes.size,roadComponents:roadGraph.components.length,railComponents:railGraph.components.length,
   roadSurface:{version:'osm-batched-upward-terrain-surfaces-v2',junctionCount,markingSegments,roads:renderedRoadWays.size,paintLift:.052,sampleStep:1.4,normalDirection:'upward',terrainClearance:.38,
    continuousThroughRoads:[{sourceWayId:INDUSTRIAL_THROUGH_ROAD,siteIds:[...INDUSTRIAL_THROUGH_SITES],renderedRuns:roadPaths.filter(r=>r.source==='OpenStreetMap'&&r.osmWayIds?.includes(INDUSTRIAL_THROUGH_ROAD)).length}]},junctionCount,markingSegments,railTies,railGauge:RAIL_PROFILE.gauge,
   branchSimplification:{version:'terminal-branches-v2',road:roadPruning.stats,rail:railPruning.stats},renderedRailWays:renderedRailWays.size,
   exhibitRoadSimplification:{...exhibitRoadFilter.stats,displayClearance:airportClearanceReport},
   renderedRoadWays:renderedRoadWays.size,roadStyle:ROAD_STYLE,cityRoadSimplification:{sourceBoundary:cityFeature?.id||null,hiddenWays:hiddenCityWays.size,hiddenWayIds:[...hiddenCityWays],preservedTrafficWays:roadGraph.ways.filter(w=>cityMinor(w.tags)&&protectedTrafficWays.has(w.osmId)&&w.segments.some(e=>inCity(e.a.position)||inCity(e.b.position))).length},
   settlementRoadSimplification:settlements.map(region=>({id:region.id,name:region.name,sourceBoundary:region.feature?.id||null,minimalProfile:region.profile,sourceWayCount:region.sourceWays.size,renderedWayCount:region.keptWays.size,hiddenWays:region.hiddenWays.size,keptWayIds:[...region.keptWays],preservedTrafficWayIds:[...region.trafficWays]})),
   stationCount:stationLabels.length,stationNames:stationLabels.map(s=>s.name),railSwitches:(data.railPoints?.features||[]).filter(f=>tagsFor(f).railway==='switch').length,
   abandonedRailWays:railGraph.ways.filter(w=>w.abandoned).length,mergedMeshCount:batches.filter(b=>b.mesh).length,triangles:batches.reduce((n,b)=>n+b.triangles,0),buildMilliseconds,
   modelPortConnections:connections,facilityPorts:accessReports,facilityRailPorts:railPortReports,siteAccess:accessReports.map(r=>r.id.replace('pad-','')),gatePorts:accessReports.map(r=>r.id),
   vehicleRoutes:roadPlan.routes.map(r=>({id:r.id,source:r.source,length:r.length,osmWayCount:r.osmWayIds.length,nodeCount:r.nodeIds.length,vehicleScale:r.vehicleScale})),trainSource:train.source,trainWayCount:train.osmWayIds.length,
   saturnAccess:null,
   interchange:{version:'osm-bridge-approaches-v1',bridges,ramps:0,source:'OpenStreetMap bridge/layer topology'},gagarinRail:{version:'osm-pad1-port-v1',joinGap:gagarinJoinGap,entryWorld:gate.toArray(),gauge:RAIL_PROFILE.gauge,straightLength:18}})};
}
