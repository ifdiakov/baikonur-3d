import * as THREE from 'three';
import {distancePath} from './traffic-paths.js?v=20261102-site2-photo-v3';

export const TRANSPORT_BAKE_VERSION='transport-geometry-bake-v1';
const fingerprint='road-lod-prebuilt-v1;geometry-v2;owner-road-edits-20261103';
const packPath=path=>{
 const props={};
 for(const key of ['id','label','width','source','vehicleScale','osmWayIds','nodeIds','bridgeDistance','routeIds','joinGap','rampStart','rampEnd','tags','marked','surface','highway','gauge','sections','joins','from','to']){
  if(path[key]!=null&&typeof path[key]!=='function')props[key]=path[key];
 }
 props.points=(path.points||[]).map(v=>v.isVector3?v.toArray():Array.isArray(v)?v:[v.x,v.y,v.z]);
 if(path.widthAt&&path.length>0){
  const n=Math.min(128,Math.max(4,Math.ceil(path.length/40)));
  props.widthSamples=Array.from({length:n+1},(_,i)=>path.widthAt(i/n*path.length));
 }
 return props;
};
const packMany=items=>(items||[]).map(packPath);

export function serializeTransport({transport,layers,mik112Rail}){
 const paths=transport.roadPaths(),plan=paths.osmVehiclePlan,train=transport.trainPath();
 if(!plan?.routes?.length)throw Error('No transport graph to bake');
 const scene={
  version:TRANSPORT_BAKE_VERSION,fingerprint,
  roadMeshes:layers.roads.toJSON(),railMeshes:layers.rails.toJSON(),
  roads:packMany(paths),
  vehicles:{routes:packMany(plan.routes),highway:plan.highway.id,source:plan.source,joins:plan.joins},
  extensions:packMany(paths.displayHighwayExtensions),
  editable:packMany(transport.editableRoadPaths()),
  terrain:{roads:packMany(transport.terrainPaths().roads),rails:packMany(transport.terrainPaths().rails)},
  train:{...train,path:packPath(train.path)},
  stations:transport.stationLabels().map(s=>({id:s.id,name:s.name,osmUrl:s.osmUrl,record:s.record,
   groupUUID:s.group.uuid,anchorUUID:s.anchor.uuid})),
  rail:transport.routes,
  marking:{count:transport.roadMarkingPlan.quads.length,stats:transport.roadMarkingPlan.stats},
  highwayDisplay:transport.highwayDisplay.stats(),
  bridgeUUID:transport.bridgeObjects()[0]?.uuid||null,
  mik112Rail:JSON.parse(JSON.stringify(mik112Rail||{connected:false})),
  stats:transport.stats()
 };
 if(scene.stats.roadFeatureCount<2000)throw Error('Unexpected number of baked road features');
 return scene;
}
function unpackPath(row){
 const points=(row.points||[]).map(p=>new THREE.Vector3(...p));
 const {widthSamples,...rest}=row;
 if(points.length<2)return {...rest,points};
 const track=distancePath(points),path={...rest,...track};
 path.widthAt=widthSamples?.length?distance=>{
  const at=Math.min(widthSamples.length-1,Math.max(0,distance/(track.length||1)*(widthSamples.length-1)));
  return THREE.MathUtils.lerp(widthSamples[Math.floor(at)],widthSamples[Math.min(widthSamples.length-1,Math.floor(at)+1)],at-Math.floor(at));
 }:()=>row.width||4;
 return path;
}
const unpack=rows=>rows.map(unpackPath);
export function restoreBakedTransport({bake,layers}){
 if(bake?.version!==TRANSPORT_BAKE_VERSION||bake?.fingerprint!==fingerprint)throw Error('Outdated transport bake');
 const loader=new THREE.ObjectLoader();
 const roads=loader.parse(bake.roadMeshes),rails=loader.parse(bake.railMeshes);
 const osmRoad=roads.getObjectByName('OpenStreetMap · автодороги');
 const osmRail=rails.getObjectByName('OpenStreetMap · железнодорожные пути');
 if(!osmRoad||!osmRail)throw Error('Cached road meshes incomplete');
 const stations=bake.stations.map(s=>({...s,
  group:rails.getObjectByProperty('uuid',s.groupUUID),
  anchor:rails.getObjectByProperty('uuid',s.anchorUUID)}));
 if(stations.some(s=>!s.group||!s.anchor))throw Error('Cached station anchors missing');
 const paths=unpack(bake.roads);
 paths.displayHighwayExtensions=unpack(bake.extensions);
 const routes=unpack(bake.vehicles.routes);
 const highway=routes.find(r=>r.id===bake.vehicles.highway);
 if(!highway)throw Error('Cached highway missing');
 paths.osmVehiclePlan={routes,highway,source:bake.vehicles.source,joins:bake.vehicles.joins,extensions:[]};
 const terrain={roads:unpack(bake.terrain.roads),rails:unpack(bake.terrain.rails)};
 const train={...bake.train,path:unpackPath(bake.train.path)};
 const bridge=bake.bridgeUUID?roads.getObjectByProperty('uuid',bake.bridgeUUID):null;
 const stats={...bake.stats,baked:true,bakeVersion:TRANSPORT_BAKE_VERSION,sourceBuildMilliseconds:bake.stats.buildMilliseconds,buildMilliseconds:0};
 // Attach only after every required structural object has been validated.
 for(const obj of [...roads.children])layers.roads.add(obj);
 for(const obj of [...rails.children])layers.rails.add(obj);
 return {roadPaths:()=>paths,editableRoadPaths:()=>unpack(bake.editable),
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
