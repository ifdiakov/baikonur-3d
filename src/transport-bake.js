import * as THREE from 'three';
import {clipSingleRailAccess} from './site-single-rail-access.js?v=20261108-single-access-v1';
import {roundRailCorners} from './rail-road-clearance.js?v=20261108-all-rail-curves-v2';
import {distancePath} from './traffic-paths.js?v=20261102-site2-photo-v3';

export const TRANSPORT_BAKE_VERSION='transport-geometry-bake-v1';
const fingerprint='road-lod-prebuilt-v1;geometry-v3;site250a-ukss-passing-road-v1';
export function transportSourceFingerprint({roads,railways,ownerRoadEdits,siteRecords}){
 // Fast deterministic FNV-1a of the EXACT topology and owner-specified
 // display anchors, so changed roads cannot silently use an obsolete bake.
 const content=JSON.stringify({roads:roads?.features,railways:railways?.features,ownerRoadEdits,
  anchors:siteRecords.map(s=>[s.id,s.x,s.y,s.runtimeYaw??null])});
 let value=2166136261;
 for(let i=0;i<content.length;i++)value=Math.imul(value^content.charCodeAt(i),16777619)>>>0;
 return value.toString(16).padStart(8,'0');
}
const quantize=value=>Math.round(value*1000)/1000;
function simplifyPoints(points,deviation){
 if(!deviation||points.length<3)return points;
 const sq=deviation*deviation,keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){
  const [first,last]=stack.pop(),a=points[first],b=points[last];
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],den=dx*dx+dy*dy+dz*dz;
  let best=-1,index=-1;
  for(let i=first+1;i<last;i++){
   const p=points[i],u=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/den)):0;
   const x=p[0]-a[0]-u*dx,y=p[1]-a[1]-u*dy,z=p[2]-a[2]-u*dz;
   const d=x*x+y*y+z*z;if(d>best){best=d;index=i;}
  }
  if(best>sq&&index>first&&index<last){keep.add(index);stack.push([first,index],[index,last]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
const packPath=(path,deviation=0)=>{
 const props={};
 for(const key of ['id','label','width','source','vehicleScale','osmWayIds','nodeIds','bridgeDistance','routeIds','joinGap','rampStart','rampEnd','tags','marked','surface','highway','gauge','sections','joins','from','to']){
  if(path[key]!=null&&typeof path[key]!=='function')props[key]=path[key];
 }
 props.points=simplifyPoints((path.points||[]).map(v=>(v.isVector3?v.toArray():Array.isArray(v)?v:[v.x,v.y,v.z]).map(quantize)),deviation);
 if(path.widthAt&&path.length>0){
  const n=Math.min(128,Math.max(4,Math.ceil(path.length/40)));
  props.widthSamples=Array.from({length:n+1},(_,i)=>path.widthAt(i/n*path.length));
 }
 return props;
};
const packMany=(items,deviation=0)=>(items||[]).map(p=>packPath(p,deviation));

export function serializeTransport({transport,layers,mik112Rail,sourceFingerprint=null,displayGradeVersion=null}){
 const paths=transport.roadPaths(),plan=paths.osmVehiclePlan,train=transport.trainPath();
 if(!plan?.routes?.length)throw Error('No transport graph to bake');
 const scene={
  version:TRANSPORT_BAKE_VERSION,fingerprint,sourceFingerprint,displayGradeVersion,
  cacheKind:'routes-only',
  roads:packMany(paths,.02),
  vehicles:{routes:packMany(plan.routes,.015),highway:plan.highway.id,source:plan.source,joins:plan.joins},
  extensions:packMany(paths.displayHighwayExtensions),
  editable:packMany(transport.editableRoadPaths(),.06),
  terrain:{roads:packMany(transport.terrainPaths().roads,.32),rails:packMany(transport.terrainPaths().rails,.16)},
  train:{...train,path:packPath(train.path,.012)},
  stations:transport.stationLabels().map(s=>({id:s.id,name:s.name,osmUrl:s.osmUrl,record:s.record,
   position:s.group.position.toArray(),anchor:s.anchor.position.toArray()})),
  rail:{road:(transport.routes.road||[]).map(r=>({id:r.id})),rail:(transport.routes.rail||[]).map(r=>({id:r.id}))},
  marking:{count:transport.roadMarkingPlan.quads.length,stats:transport.roadMarkingPlan.stats},
  highwayDisplay:transport.highwayDisplay.stats(),
  bridgeBounds:(()=>{
   const bridge=transport.bridgeObjects()[0];if(!bridge)return null;
   const box=new THREE.Box3().setFromObject(bridge);
   return box.isEmpty()?null:{min:box.min.toArray(),max:box.max.toArray()};
  })(),
  mik112Rail:JSON.parse(JSON.stringify(mik112Rail||{connected:false})),
  stats:transport.stats()
 };
 if(scene.stats.roadFeatureCount<2000)throw Error('Unexpected number of baked road features');
 return scene;
}
function unpackPath(row,roadGrade=null){
 let points=(row.points||[]).map(p=>new THREE.Vector3(...p));
 if(roadGrade)points=roadGrade.conform(points);
 const {widthSamples,...rest}=row;
 const widthScale=roadGrade?.widthScale(row.id)??1;if(rest.width!=null)rest.width*=widthScale;
 if(points.length<2)return {...rest,points};
 const track=distancePath(points),path={...rest,...track};
 path.widthAt=widthSamples?.length?distance=>{
  const at=Math.min(widthSamples.length-1,Math.max(0,distance/(track.length||1)*(widthSamples.length-1)));
  return widthScale*THREE.MathUtils.lerp(widthSamples[Math.floor(at)],widthSamples[Math.min(widthSamples.length-1,Math.floor(at)+1)],at-Math.floor(at));
 }:()=>rest.width||4;
 return path;
}
const unpack=(rows,grade=null)=>rows.map(row=>unpackPath(row,grade));
export function restoreBakedTransport({bake,layers,sourceFingerprint=null,roadGrade=null}){
 if(roadGrade?.isBaked?.(bake))roadGrade=roadGrade.cachedGrade??null;
 if(bake?.version!==TRANSPORT_BAKE_VERSION||bake?.fingerprint!==fingerprint)throw Error('Outdated transport bake');
 if(sourceFingerprint!==null&&bake.sourceFingerprint!==sourceFingerprint)throw Error('Source roads or display anchors changed since transport bake');
 if(bake.cacheKind!=='routes-only')throw Error('Full mesh snapshots are disabled; require compact route metadata');
 const roadRoot=new THREE.Group(),railRoot=new THREE.Group();
 roadRoot.name='OpenStreetMap · автодороги';railRoot.name='OpenStreetMap · железнодорожные пути';
 const stations=bake.stations.map(s=>{
  const group=new THREE.Group();group.name=s.name;group.position.fromArray(s.position);
  const anchor=new THREE.Object3D();anchor.position.fromArray(s.anchor);group.add(anchor);railRoot.add(group);
  return {...s,group,anchor};
 });
 const trimPhantomSpur=path=>{
  if(!/^osm-road-37550553(?:-|$)/.test(String(path.id)))return path;
  const cut=path.points.findIndex((p,i)=>i>0&&p.x/3.4+650>752.45&&p.z/3.4+522.5>458.75);
  return cut>=2?{...path,points:path.points.slice(0,cut)}:path;
 };
 const paths=unpack(bake.roads,roadGrade).map(trimPhantomSpur).filter(path=>path.id!=='r-site23-saturn-access'&&String(path.id)!=='osm-road-37549252'&&!String(path.id).startsWith('osm-road-37549252-')&&String(path.wayId??path.sourceWayId??'')!=='37549252'&&path.id!=='road-105-repaired');
 paths.displayHighwayExtensions=unpack(bake.extensions,roadGrade);
 const routes=unpack(bake.vehicles.routes,roadGrade).filter(path=>path.id!=='r-site23-saturn-access');
 const highway=routes.find(r=>r.id===bake.vehicles.highway);
 if(!highway)throw Error('Cached highway missing');
 paths.osmVehiclePlan={routes,highway,source:bake.vehicles.source,joins:bake.vehicles.joins,extensions:[]};
 const terrain={roads:unpack(bake.terrain.roads,roadGrade).map(trimPhantomSpur).filter(path=>path.id!=='r-site23-saturn-access'&&String(path.id)!=='osm-road-37549252'&&!String(path.id).startsWith('osm-road-37549252-')&&String(path.wayId??path.sourceWayId??'')!=='37549252'&&path.id!=='road-105-repaired'),rails:unpack(bake.terrain.rails).flatMap(path=>clipSingleRailAccess(path.points,path).map((points,i)=>({...path,id:(path.id??'rail')+'-selected-'+i,points:roundRailCorners(points,{radius:15})})))};
 const bakedTrainPath=unpackPath(bake.train.path);
 const train={...bake.train,path:distancePath(roundRailCorners(bakedTrainPath.points,{radius:15}))};
 const bridge=bake.bridgeBounds?(function(){
  const bbox=new THREE.Box3(new THREE.Vector3(...bake.bridgeBounds.min),new THREE.Vector3(...bake.bridgeBounds.max));
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...bbox.getSize(new THREE.Vector3()).toArray()),new THREE.MeshBasicMaterial({visible:false}));
  mesh.name='Кэш · габариты виадука';mesh.position.copy(bbox.getCenter(new THREE.Vector3()));mesh.visible=false;
  roadRoot.add(mesh);return mesh;
 })():null;
 const stats={...bake.stats,baked:true,bakeVersion:TRANSPORT_BAKE_VERSION,sourceBuildMilliseconds:bake.stats.buildMilliseconds,buildMilliseconds:0};
 // Attach only after every required structural object has been validated.
 layers.roads.add(roadRoot);layers.rails.add(railRoot);
 return {roadPaths:()=>paths,editableRoadPaths:()=>unpack(bake.editable,roadGrade),
  terrainPaths:()=>terrain,trainPath:()=>train,stationLabels:()=>stations,
  connectMik112:()=>bake.mik112Rail,roadMarkingPlan:{quads:Array(bake.marking.count),stats:bake.marking.stats},
  highwayDisplay:{stats:()=>bake.highwayDisplay,paths:paths.displayHighwayExtensions},
  roadMarkingTarget:()=>null,bridgeObjects:()=>bridge?[bridge]:[],
  setBridgeEvening:()=>{},isBridgePoleAllowed:()=>true,
  routes:bake.rail,stats:()=>stats};
}
export async function fetchTransportBake(path,{timeoutMs=7000}={}){
 if(typeof DecompressionStream==='undefined')return null;
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
 try{
  const response=await fetch(path,{cache:'default',signal:ctl.signal});
  if(!response.ok)return null;
  const compressed=await response.arrayBuffer();
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
 }finally{clearTimeout(timer);}
}
