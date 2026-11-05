import * as THREE from 'three';
import {distancePath} from './traffic-paths.js?v=20261102-site2-photo-v3';

export const TRANSPORT_BAKE_VERSION='transport-geometry-bake-v1';
const fingerprint='road-lod-prebuilt-v1;geometry-v2;owner-road-edits-20261103';
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


// Store the exact final GPU buffers after intersection/clearance clipping. No
// OSM triangulation or shoulder/marking intersections are repeated at boot.
// Flatten to a single layer parent: matrixWorld retains every bridge/ramp and
// rail placement, including instanced sleepers.
function packMaterial(material){
 if(!material)return null;
 return {type:material.type,color:material.color?.getHex()??0xffffff,
  emissive:material.emissive?.getHex()??0,roughness:material.roughness??1,
  metalness:material.metalness??0,opacity:material.opacity??1,
  transparent:material.transparent,side:material.side,depthWrite:material.depthWrite,
  depthTest:material.depthTest,polygonOffset:material.polygonOffset,
  polygonOffsetFactor:material.polygonOffsetFactor,polygonOffsetUnits:material.polygonOffsetUnits,
  vertexColors:material.vertexColors,visible:material.visible,
  name:material.name};
}
function packMesh(mesh){
 const geometry=mesh.geometry;
 if(!geometry?.attributes?.position)return null;
 const attributes={};
 for(const key of ['position','normal','uv','color','uv2']){
  const attr=geometry.getAttribute(key);
  if(attr)attributes[key]={itemSize:attr.itemSize,normalized:attr.normalized,values:Array.from(attr.array)};
 }
 return {name:mesh.name,kind:mesh.isInstancedMesh?'instanced':'mesh',count:mesh.isInstancedMesh?mesh.count:1,
  matrix:mesh.matrixWorld.toArray(),renderOrder:mesh.renderOrder,visible:mesh.visible,
  receiveShadow:mesh.receiveShadow,castShadow:mesh.castShadow,
  userData:{groundSurface:mesh.userData.groundSurface===true,osmSource:mesh.userData.osmSource===true,
   osmRailVolume:mesh.userData.osmRailVolume===true,pickable:false},
  material:Array.isArray(mesh.material)?mesh.material.map(packMaterial):packMaterial(mesh.material),
  geometry:{attributes,index:geometry.index?Array.from(geometry.index.array):null,
   groups:geometry.groups.map(g=>({start:g.start,count:g.count,materialIndex:g.materialIndex})),
   drawRange:{...geometry.drawRange}},
  instanceMatrix:mesh.isInstancedMesh?Array.from(mesh.instanceMatrix.array):null,
  instanceColor:mesh.isInstancedMesh&&mesh.instanceColor?Array.from(mesh.instanceColor.array):null};
}
function packMeshes(layer){
 layer.updateMatrixWorld(true);
 const meshes=[];
 layer.traverse(node=>{if(node.isMesh){
  // Asset instances are loaded and culled independently of road geometry.
  for(let p=node;p;p=p.parent)if(p.userData.excludeTransportBake)return;
  const item=packMesh(node);if(item)meshes.push(item);
 }});
 return meshes;
}
function materialFromPack(record,name){
 if(!record)return new THREE.MeshStandardMaterial();
 const props={color:record.color,side:record.side,transparent:record.transparent,
  opacity:record.opacity,depthWrite:record.depthWrite,depthTest:record.depthTest,
  polygonOffset:record.polygonOffset,polygonOffsetFactor:record.polygonOffsetFactor,
  polygonOffsetUnits:record.polygonOffsetUnits,vertexColors:record.vertexColors};
 let mat;
 if(record.type==='MeshBasicMaterial')mat=new THREE.MeshBasicMaterial(props);
 else if(record.type==='MeshLambertMaterial')mat=new THREE.MeshLambertMaterial({...props,emissive:record.emissive});
 else if(record.type==='MeshPhongMaterial')mat=new THREE.MeshPhongMaterial({...props,emissive:record.emissive});
 else mat=new THREE.MeshStandardMaterial({...props,emissive:record.emissive,
  roughness:record.roughness,metalness:record.metalness});
 mat.name=record.name||name;mat.visible=record.visible!==false;
 return mat;
}
function unpackMesh(record){
 const g=new THREE.BufferGeometry();
 for(const [name,attr]of Object.entries(record.geometry.attributes)){
  // Attribute values in the cache are the exact Float32 values captured by
  // the renderer, rather than resampled points from the original GeoJSON.
  const array=new Float32Array(attr.values);
  g.setAttribute(name,new THREE.BufferAttribute(array,attr.itemSize,attr.normalized));
 }
 if(record.geometry.index)g.setIndex(record.geometry.index);
 for(const group of record.geometry.groups)g.addGroup(group.start,group.count,group.materialIndex);
 if(record.geometry.drawRange)g.setDrawRange(record.geometry.drawRange.start,record.geometry.drawRange.count);
 g.computeBoundingSphere();
 const materials=Array.isArray(record.material)?record.material.map(m=>materialFromPack(m,record.name)):materialFromPack(record.material,record.name);
 const m=record.kind==='instanced'?new THREE.InstancedMesh(g,materials,record.count):new THREE.Mesh(g,materials);
 if(record.kind==='instanced'){
  m.instanceMatrix.array.set(record.instanceMatrix);m.instanceMatrix.needsUpdate=true;
  if(record.instanceColor){m.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(record.instanceColor),3);}
  m.computeBoundingSphere?.();
 }
 m.name=record.name;m.matrix.fromArray(record.matrix);m.matrixAutoUpdate=false;
 m.visible=record.visible!==false;m.renderOrder=record.renderOrder;
 m.castShadow=record.castShadow;m.receiveShadow=record.receiveShadow;
 m.userData={...record.userData,museumComponent:'prebaked-transport'};
 return m;
}
function restoreMeshes(rows,parent){
 let triangles=0;
 for(const row of rows){
  const mesh=unpackMesh(row);parent.add(mesh);
  const count=(mesh.geometry.index?.count||mesh.geometry.getAttribute('position').count)/3;
  triangles+=count*(mesh.isInstancedMesh?mesh.count:1);
 }
 return {meshes:rows.length,triangles};
}

export function serializeTransport({transport,layers,mik112Rail,sourceFingerprint=null}){
 const paths=transport.roadPaths(),plan=paths.osmVehiclePlan,train=transport.trainPath();
 if(!plan?.routes?.length)throw Error('No transport graph to bake');
 const scene={
  version:TRANSPORT_BAKE_VERSION,fingerprint,sourceFingerprint,
  cacheKind:'full-mesh-v1',
  meshes:{roads:packMeshes(layers.roads),rails:packMeshes(layers.rails)},
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
export function restoreBakedTransport({bake,layers,sourceFingerprint=null}){
 if(bake?.version!==TRANSPORT_BAKE_VERSION||bake?.fingerprint!==fingerprint)throw Error('Outdated transport bake');
 if(sourceFingerprint!==null&&bake.sourceFingerprint!==sourceFingerprint)throw Error('Source roads or display anchors changed since transport bake');
 if(bake.cacheKind!=='full-mesh-v1'||!bake.meshes?.roads?.length||!bake.meshes?.rails?.length)
  throw Error('Incomplete compiled road or rail mesh: falling back to live renderer');
 const roadRoot=new THREE.Group(),railRoot=new THREE.Group();
 roadRoot.name='OpenStreetMap · автодороги';railRoot.name='OpenStreetMap · железнодорожные пути';
 const stations=bake.stations.map(s=>{
  const group=new THREE.Group();group.name=s.name;group.position.fromArray(s.position);
  const anchor=new THREE.Object3D();anchor.position.fromArray(s.anchor);group.add(anchor);railRoot.add(group);
  return {...s,group,anchor};
 });
 const paths=unpack(bake.roads);
 paths.displayHighwayExtensions=unpack(bake.extensions);
 const routes=unpack(bake.vehicles.routes);
 const highway=routes.find(r=>r.id===bake.vehicles.highway);
 if(!highway)throw Error('Cached highway missing');
 paths.osmVehiclePlan={routes,highway,source:bake.vehicles.source,joins:bake.vehicles.joins,extensions:[]};
 const terrain={roads:unpack(bake.terrain.roads),rails:unpack(bake.terrain.rails)};
 const train={...bake.train,path:unpackPath(bake.train.path)};
 const bridge=bake.bridgeBounds?(function(){
  const bbox=new THREE.Box3(new THREE.Vector3(...bake.bridgeBounds.min),new THREE.Vector3(...bake.bridgeBounds.max));
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...bbox.getSize(new THREE.Vector3()).toArray()),new THREE.MeshBasicMaterial({visible:false}));
  mesh.name='Кэш · габариты виадука';mesh.position.copy(bbox.getCenter(new THREE.Vector3()));mesh.visible=false;
  roadRoot.add(mesh);return mesh;
 })():null;
 const meshStats={roads:restoreMeshes(bake.meshes.roads,roadRoot),rails:restoreMeshes(bake.meshes.rails,railRoot)};
 const stats={...bake.stats,baked:true,bakeVersion:TRANSPORT_BAKE_VERSION,
  cacheKind:bake.cacheKind,meshStats,sourceBuildMilliseconds:bake.stats.buildMilliseconds,
  buildMilliseconds:0};
 // Attach only after every required structural object has been validated.
 layers.roads.add(roadRoot);layers.rails.add(railRoot);
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
