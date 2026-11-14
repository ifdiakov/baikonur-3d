import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {TRANSPORT_GROUND_VERSION} from '../src/transport-ground-profile.js';

// These are served application inputs, not a rebuilt CI approximation. The
// existing delivery workflow checks the exact same files on a candidate/main.
export const TRANSPORT_GROUND_PUBLIC_FILES=[
 'data/osm/road-lod-authoritative-v1.json.gz',
 'data/osm/transport-geometry-bake-v1.json.gz',
 'index.html',
 'museum.html',
 'src/archive-models.js',
 'src/checkpoint7-road-grade.js',
 'src/evening-scene.js',
 'src/highway-display.js',
 'src/interchange-bridge.js',
 'src/mik112-rail-plan.js',
 'src/mik112.js',
 'src/museum-terrain.js',
 'src/osm-transport.js',
 'src/river-surface.js',
 'src/road-editor-core.js',
 'src/road-editor-mesh.js',
 'src/road-editor-style.js',
 'src/road-editor.js',
 'src/road-ground-contact.js',
 'src/road-lighting.js',
 'src/road-lod.js',
 'src/road-mask-tiles.js',
 'src/saturn-access.js',
 'src/saturn-ip5.js',
 'src/saturn-structures.js',
 'src/shelter-road-access.js',
 'src/site113-road-grade.js',
 'src/site94-road-grade.js',
 'src/site95-road-grade.js',
 'src/terrain-extent.js',
 'src/transport-bake.js',
 'src/transport-detail-build.js',
 'src/transport-detail-codec.js',
 'src/transport-detail-job.js',
 'src/transport-detail-worker-entry.js',
 'src/transport-detail-worker.bundle.js',
 'src/transport-ground-profile.js',
 'src/transport-ground-support.js',
 'src/transport-network.js',
 'src/transport-terrain-height.js',
 'src/workshop-network-editor.js',
 'src/workshop-panel.js',
 'src/workshop-road-editor.js',
 'src/workshop-state-network.js',
 'src/workshop-state.js',
 'workshop.html',
];

export async function checkTransportGroundCacheVersions(){
 const result={expected:TRANSPORT_GROUND_VERSION,files:{}};
 for(const path of TRANSPORT_GROUND_PUBLIC_FILES.filter(path=>path.endsWith('.json.gz'))){
  const data=JSON.parse(gunzipSync(await readFile(path)));
  assert.equal(data.groundVersion,TRANSPORT_GROUND_VERSION,'Stale transport ground cache: '+path);
  assert.match(data.buildInputsHash??'',/^[0-9a-f]{64}$/,'Missing build-input identity: '+path);
  assert((data.groundSupports?.length??0)>=4,'Missing retained model-rail foundations: '+path);
  assert.equal(data.groundSupports.filter(profile=>profile.siteId==='pad-112'&&profile.kind==='rail-model-approach').length,4,'Missing one of the four MIK model approaches: '+path);
  assert(data.groundSupports.some(profile=>profile.siteId==='pad-251'&&profile.kind==='road-model-approach'),'Missing the grounded Yubileiny road approach: '+path);
  result.files[path]={groundVersion:data.groundVersion,sourceFingerprint:data.sourceFingerprint,displayGradeVersion:data.displayGradeVersion,
   buildInputsHash:data.buildInputsHash,supportIds:data.groundSupports.map(profile=>profile.id)};
 }
 const files=Object.values(result.files);
 assert.equal(files[0].sourceFingerprint,files[1].sourceFingerprint,'Ground caches must represent one source graph');
 assert.equal(files[0].buildInputsHash,files[1].buildInputsHash,'Ground caches were built from different code');
 assert.deepEqual(files[0].supportIds,files[1].supportIds,'Ground caches must carry identical model foundations');
 return result;
}

export async function installTransportGroundProbe(page,{cameraLabels=false}={}){
 // Keep a single document transform. Two route.fulfill handlers would hide
 // either this probe or the existing camera/label probe from the other test.
 await page.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.continue();
  const response=await route.fetch(),html=await response.text(),anchor='window.__BAIKONUR_QA={';
  assert(html.includes(anchor),'Ground-contact scene probe anchor is missing');
  const ground='window.__GROUND_TEST={THREE,scene,camera,ctl,renderer,layers,transport,roadLOD,requestTransportDetail,museumTerrainHeightAt,terrainRelief,sharedSiloHill,saturnHill,ground,satelliteGround,outerTerrain,museumCameraBounds,SCENE_SCALE,objects,siteRecords,point,geography,osmRoads,osmRails,preparedBake,preparedLOD,transportFromBake,roadEditor,getDetailedRoots:()=>detailedTransportRoots};';
  const labels=cameraLabels?'window.__CAMERA_LABEL_TEST={THREE,objects,camera,ctl,renderer,scene,updateLabels,constrainMuseumCamera,museumCameraBounds,flankCameraBounds,krayniyCameraBox,SCENE_SCALE};':'';
  await route.fulfill({response,body:html.replace(anchor,ground+labels+anchor)});
 });
}

// The comparison is between rendered world-space triangles and independent
// ray intersections with real soil. It never accepts the application's own
// ground statistic as proof of contact, or a road as its own ground support.
export async function collectTransportGroundContact(page,{height=100,samplesPerMesh=192,regionSamples=18}={}){
 return page.evaluate(async({height,samplesPerMesh,regionSamples})=>{
  const d=__GROUND_TEST,T=d.THREE,V=(...a)=>new T.Vector3(...a);
  const {createVerticalGroundQuery}=await import(new URL('./src/vertical-ground-query.js',location.href).href);
  const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  d.roadLOD.update(height,d.getDetailedRoots());d.scene.updateMatrixWorld(true);
  const full=d.roadLOD.stats().mode==='full',b=d.museumCameraBounds,stats=d.transport.stats();
  const within=p=>p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ;
  const soil=new Set([d.ground,d.satelliteGround,...d.outerTerrain.planes,d.terrainRelief.mesh,d.sharedSiloHill.mesh,d.saturnHill].filter(Boolean));
  d.scene.traverse(o=>{if(o.isMesh&&(o.userData.bridgeApproachTerrain||o.userData.site94Earth||o.userData.transportGroundSupport||o.userData.roadGroundSupport))soil.add(o);});
  const soilMeshes=[...soil].filter(o=>o.isMesh&&visible(o)),soilQuery=createVerticalGroundQuery(soilMeshes);
  const ray=new T.Raycaster(),down=V(0,-1,0),normalMatrix=new T.Matrix3(),local=V(),aa=V(),bb=V(),cc=V(),bary=V();
  function renderedUpwardHit(hit){
   const mesh=hit.object,material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
   if(!material||material.visible===false||material.opacity<=.001)return false;
   if(hit.face?.normal&&hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(mesh.matrixWorld)).y<=.03)return false;
   // Raycaster does not perform shader alpha tests. Respect real vertex alpha
   // on the DEM/Saturn/silo fade, so an invisible patch cannot mask a gap.
   const color=mesh.geometry?.attributes.color,position=mesh.geometry?.attributes.position;
   if(material.vertexColors&&color?.itemSize===4&&hit.face){
    local.copy(hit.point);mesh.worldToLocal(local);
    aa.fromBufferAttribute(position,hit.face.a);bb.fromBufferAttribute(position,hit.face.b);cc.fromBufferAttribute(position,hit.face.c);
    T.Triangle.getBarycoord(local,aa,bb,cc,bary);
    const alpha=(color.getW(hit.face.a)*bary.x+color.getW(hit.face.b)*bary.y+color.getW(hit.face.c)*bary.z)*(material.opacity??1);
    if(alpha<Math.max(material.alphaTest??0,.001))return false;
   }
   return true;
  }
  const extensionNames=new Set(['Трасса · продолжение · asphalt','Трасса · продолжение · shoulder']);
  const roadNames=new Set(['OSM · единое дорожное полотно','OSM · асфальт трассы','OSM · грунтовые проезды','road-pavement-union','Трасса · продолжение · asphalt',
   'Единое полотно редактора · asphalt','Единое полотно редактора · highway','Единое полотно редактора · ground']);
  const shoulderNames=new Set(['OSM · единые обочины','road-shoulder-union','Единое полотно редактора · shoulder','Трасса · продолжение · shoulder']);
  const targets=[];
  d.scene.traverse(mesh=>{
   if(!mesh.isMesh||!visible(mesh)||!mesh.geometry?.attributes.position||soil.has(mesh))return;
   let kind=null;
   if(mesh.userData.museumComponent==='prebuilt-road-lod'&&['roads','rails'].includes(mesh.userData.roadKind))kind=mesh.userData.roadKind==='rails'?'rail-ballast':'roads';
   else if(roadNames.has(mesh.name))kind='roads';
   else if(shoulderNames.has(mesh.name))kind='road-shoulder';
   else if(mesh.name==='OSM · балласт')kind='rail-ballast';
   else if(mesh.name==='OSM · рельсы')kind='rail-head';
   else if(mesh.name==='OSM · бывшие пути')kind='rail-abandoned';
   if(kind)targets.push({mesh,kind,distantExtension:extensionNames.has(mesh.name)});
  });
  const regions=[['shared-silo-hill-106-109',d.sharedSiloHill.mesh],['saturn-hill',d.saturnHill]].filter(([,mesh])=>mesh&&visible(mesh))
   .map(([id,mesh])=>({id,kind:'roads',box:new T.Box3().setFromObject(mesh)}));
  const ownerRoad31=d.roadEditor?.snapshot?.().added.find(road=>road.id==='road-31');
  if(ownerRoad31?.points.length>1)regions.push({id:'owner-road-31-saturn',kind:'roads',box:new T.Box3().setFromPoints(ownerRoad31.points.map(p=>V(...p))).expandByScalar((ownerRoad31.width??3)/2+.3)});
  // The model connectors are short compared with the complete rail network.
  // Give each real foundation its own deterministic mesh samples instead of
  // relying on a global rail sample to happen to hit these retained grades.
  for(const profile of d.preparedBake?.groundSupports??[]){
   const road=profile.kind==='road-model-approach';
   if(profile.points?.length>1){
    const points=profile.points.map(p=>V(...p)),halfWidth=(profile.width??.448)/2+.1;
    const box=new T.Box3().setFromPoints(points).expandByScalar(halfWidth);
    regions.push({id:(road?'road':'rail')+'-foundation-'+profile.id,kind:road?'roads':'rail-ballast',
    // The existing far level omits small service access roads. Still sample
    // any rendered surface here, but require that port's road at medium/full.
    required:!road||d.roadLOD.stats().mode!=='far',box});
    // A real new rail foundation must not cover an active road underneath.
    // Sample only road triangles in its narrow physical centreline corridor,
    // rather than requiring an unrelated road inside every model's bounds.
    if(!road)regions.push({id:'road-at-rail-foundation-'+profile.id,kind:'roads',required:false,box,
     corridorPoints:points,corridorHalfWidth:halfWidth});
   }
  }

  // An explicit source-bridge corridor is an exception to soil contact.
  // Identify approaches through shared OSM node IDs, limited to the existing
  // 70-unit engineered approach. Never exempt an entire bridge bounding box:
  // the separate ordinary road underneath must still touch its own ground.
  function bridgeWays(features){
   const nodes=new Map(),ways=new Map(),seeds=[];
   for(const f of features){
    if(f.geometry.type!=='LineString'||!f.properties.sourceNodeIds)continue;
    const id=String(f.properties.osmId),tags=f.properties.tags??{},ids=f.properties.sourceNodeIds.map(String);
    const get=(id,i)=>{if(!nodes.has(id))nodes.set(id,{id,p:d.point(...d.geography.project(...f.geometry.coordinates[i])),links:[],distance:Infinity,bridges:new Set()});return nodes.get(id);};
    const ns=ids.map(get);ways.set(id,{id,tags,nodes:ns});
    for(let i=1;i<ns.length;i++){const a=ns[i-1],z=ns[i],length=a.p.distanceTo(z.p);a.links.push({node:z,length});z.links.push({node:a,length});}
    if(tags.bridge&&tags.bridge!=='no')for(const node of ns){node.distance=0;node.bridges.add(id);seeds.push(node);}
   }
   const queue=[...seeds];
   for(let i=0;i<queue.length;i++){
    const node=queue[i];
    for(const link of node.links){const distance=node.distance+link.length;if(distance>70||distance>=link.node.distance-1e-8)continue;
     link.node.distance=distance;link.node.bridges=new Set(node.bridges);queue.push(link.node);
    }
   }
   return new Map([...ways].filter(([,way])=>way.nodes.some(n=>n.distance<=70)).map(([id,way])=>[id,{id,bridge:!!way.tags.bridge&&way.tags.bridge!=='no',
    bridgeIds:[...new Set(way.nodes.flatMap(n=>[...n.bridges]))],
    sourcePoints:way.nodes.map(node=>node.p),
    corridors:way.nodes.slice(1).flatMap((node,i)=>node.distance<=70||way.nodes[i].distance<=70?[[way.nodes[i].p,node.p]]:[])}]));
  }
  const roadBridgeWays=bridgeWays(d.osmRoads.features),railBridgeWays=bridgeWays(d.osmRails.features);
  const toV=p=>p.isVector3?p:V(...p),sourceRoads=d.transport.editableRoadPaths(),sourceRails=d.transport.terrainPaths().rails;
  const wayId=path=>String(path.sourceWayId??path.osmWayIds?.[0]??String(path.id).match(/(?:osm-road|marking-road)-(\d+)/)?.[1]??'');
  const bridgePaths=[...sourceRoads.map(path=>({path,kind:'road',proof:roadBridgeWays.get(wayId(path))})),
   ...sourceRails.map(path=>({path,kind:'rail',proof:railBridgeWays.get(wayId(path))}))].filter(row=>row.proof);
  if(!full&&d.preparedBake&&d.preparedLOD){
   // Cache LOD rows retain exact endpoints but may simplify the plan view.
   // Use their own centreline within a source-certified bridge corridor.
   // This avoids mistaking lateral simplification on a sloped approach for
   // a vertical datum change, while preserving the source bridge identity.
   const pathKey=row=>[row.points[0],row.points.at(-1)].map(p=>[p[0],p[2]].map(v=>v.toFixed(3)).join(':')).join('|');
   for(const [kind,raw,rows,proofs]of [['road',d.preparedBake.editable,d.preparedLOD.levels[d.roadLOD.stats().mode].roads,roadBridgeWays],
    ['rail',d.preparedBake.terrain.rails,d.preparedLOD.levels[d.roadLOD.stats().mode].rails,railBridgeWays]]){
    const originals=new Map(raw.filter(p=>p.points.length>1).map(p=>[pathKey(p),p]));
    for(const row of rows){const original=originals.get(pathKey(row)),proof=original&&proofs.get(wayId(original));
     if(proof)bridgePaths.unshift({kind,proof,path:{...row,sourceWayId:wayId(original),width:row.w},literalSurface:true});
    }
   }
  }
  function nearestPath(point,path,{maxDistance=Infinity,profileLift=null}={}){
   let best=null;
   for(let i=1;i<path.points.length;i++){
    const a=toV(path.points[i-1]),z=toV(path.points[i]),dx=z.x-a.x,dz=z.z-a.z,den=dx*dx+dz*dz;
    if(den<1e-12)continue;
    const t=T.MathUtils.clamp(((point.x-a.x)*dx+(point.z-a.z)*dz)/den,0,1),distance=Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz);
    const y=a.y+t*(z.y-a.y),slope=Math.abs(z.y-a.y)/Math.sqrt(den);
    if(distance>maxDistance||profileLift!==null&&Math.abs(point.y-y-profileLift)>.085+distance*slope)continue;
    if(!best||distance<best.distance)best={distance,y,slope,x:a.x+t*dx,z:a.z+t*dz};
   }
   return best;
  }
  function bridgeAt(point,kind){
   const rail=kind.startsWith('rail'),lift=kind==='rail-head'?.077:kind==='rail-ballast'?.0168:kind==='rail-abandoned'?.01:kind==='road-shoulder'?-.015:0;
   for(const row of bridgePaths){
    if((row.kind==='rail')!==rail)continue;
    const width=!full&&rail?Math.max(2.4,row.path.width??0):(row.path.width??(rail?.448:2));
    const surfaceLift=row.literalSurface?0:lift;
    // At a tight curve several adjacent sections lie under the widened LOD
    // ribbon. Match a section at the actual source grade, not simply the
    // globally closest XZ segment on an unrelated level of the same path.
    const near=nearestPath(point,row.path,{maxDistance:width/2+(rail?.12:.34),profileLift:surfaceLift});
    if(!near)continue;
    // The approved road-clearance solver can move a displayed railway away
    // from its raw OSM centreline. Measure that local displacement on this
    // same source way; do not replace the narrow rendered corridor above
    // with a broad bridge-area exemption. A long way remains restricted to
    // the source segments incident to the 70-unit raised approach nodes.
    const localPlanShift=nearestPath(V(near.x,near.y,near.z),{points:row.proof.sourcePoints})?.distance??0;
    const footprint=row.proof.corridors.map(points=>nearestPath(point,{points},{maxDistance:width/2+1.8+localPlanShift})).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0];
    if(footprint)
     return {type:row.proof.bridge?'source-bridge':'source-bridge-approach',wayId:wayId(row.path),bridgeIds:row.proof.bridgeIds,
      sourceHeight:near.y,sourceDistance:near.distance,sourceFootprintDistance:footprint.distance,sourcePlanDisplacement:localPlanShift};
   }
   return null;
  }
  const facilityPorts=[...(stats.facilityPorts??[]).map(port=>({...port,kind:'road',center:port.gate})),
   ...(stats.facilityRailPorts??[]).map(port=>({...port,kind:'rail',center:port.headCenter})),
   ...(d.preparedBake?.mik112Rail?.tracks??[]).map(track=>({id:'pad-112',portId:track.gateId+'-'+track.trackIndex,kind:'rail',center:track.start,
    headCenterGap:track.modelHeadGap,points:track.curveSamples?.map(p=>[p[0],p[1]-.077,p[2]])}))].filter(port=>Array.isArray(port.center));
  const modelMeshes=new Map();
  function facilitySupportAt(point,kind){
   const rail=kind.startsWith('rail');
   for(const port of facilityPorts){
    if((port.kind==='rail')!==rail)continue;
    const near=port.points?.length>1?nearestPath(point,{points:port.points}):null;
    const lift=kind==='rail-head'?.077:kind==='rail-ballast'?.0168:0;
    const onExactApproach=near&&near.distance<=(rail&&!full?1.2:.35)&&Math.abs(point.y-near.y-lift)<.085+near.distance*near.slope;
    if(Math.hypot(point.x-port.center[0],point.z-port.center[2])>2&&!onExactApproach)continue;
    const object=d.objects.find(o=>o.record.id===port.id);if(!object||!visible(object.g))continue;
    if(!modelMeshes.has(port.id)){const meshes=[];object.g.traverse(o=>{if(o.isMesh&&visible(o)&&!soil.has(o))meshes.push(o);});modelMeshes.set(port.id,meshes);}
    ray.set(V(point.x,point.y+.07,point.z),down);
    const support=ray.intersectObjects(modelMeshes.get(port.id),false).find(hit=>renderedUpwardHit(hit)&&point.y-hit.point.y>=-.02&&point.y-hit.point.y<=.065);
    const seam=rail?port.headCenterGap:port.roadGap;
    if(support&&Number.isFinite(seam)&&seam<.002)return {type:'actual-facility-port-surface',siteId:port.id,portId:port.portId??null,
     groundMesh:support.object.name||support.object.uuid,supportY:support.point.y,gap:point.y-support.point.y,seamGap:seam};
   }
   return null;
  }
  const summaries=[];
  for(const {mesh,kind,distantExtension}of targets){
   const p=mesh.geometry.attributes.position,index=mesh.geometry.index,faces=Math.floor((index?.count??p.count)/3),selected=new Map(),regional=new Map(regions.map(r=>[r.id,[]]));
   // The two explicit highway scenery meshes extend beyond the camera and
   // regional image. A small fixed sample proves their base plane too,
   // without widening the scope of every other road/rail mesh.
   const n=Math.min(faces,distantExtension?48:samplesPerMesh),a=V(),c=V(),e=V(),q=V();let sideFaces=0;
   // LOD strips are deliberately DoubleSide and some retain downward
   // winding. Both faces are the same visible zero-thickness surface. Real
   // solid ballast/rail volumes still sample their top, never their bottom.
   const twoSidedSheet=mesh.material.side===T.DoubleSide&&!mesh.userData.osmRailVolume;
   const select=(face,region)=>{if(!selected.has(face))selected.set(face,new Set());selected.get(face).add(region);};
   for(let j=0;j<n;j++)select(Math.floor((j+.371)*faces/n),'stratified');
   // A uniform map sample alone can miss the small but high 106/109 and
   // Saturn hills. Deterministic reservoir samples explicitly cover both.
   for(let face=0;face<faces;face++){
    const at=k=>index?index.getX(face*3+k):face*3+k;
    q.set((p.getX(at(0))+p.getX(at(1))+p.getX(at(2)))/3,(p.getY(at(0))+p.getY(at(1))+p.getY(at(2)))/3,(p.getZ(at(0))+p.getZ(at(1))+p.getZ(at(2)))/3).applyMatrix4(mesh.matrixWorld);
    const areas=regions.filter(r=>(r.kind==='roads'?!kind.startsWith('rail'):kind.startsWith('rail'))&&q.x>=r.box.min.x&&q.x<=r.box.max.x&&q.z>=r.box.min.z&&q.z<=r.box.max.z&&
     (!r.corridorPoints||nearestPath(q,{points:r.corridorPoints},{maxDistance:r.corridorHalfWidth})));
    if(!areas.length&&!mesh.userData.osmRailVolume)continue;
    a.fromBufferAttribute(p,at(0)).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(p,at(1)).applyMatrix4(mesh.matrixWorld);e.fromBufferAttribute(p,at(2)).applyMatrix4(mesh.matrixWorld);
    const normal=c.clone().sub(a).cross(e.clone().sub(a));
    const length=normal.length(),verticalComponent=twoSidedSheet?Math.abs(normal.y):normal.y;
    if(length<1e-8||verticalComponent<length*.25){if(length>=1e-8&&Math.abs(normal.y)<length*.25)sideFaces++;continue;}
    for(const area of areas){const bucket=regional.get(area.id),rank=(Math.imul(face+1,2654435761)>>>0);
     if(bucket.length<regionSamples){bucket.push({face,rank});bucket.sort((a,b)=>b.rank-a.rank);}
     else if(rank<bucket[0].rank){bucket[0]={face,rank};bucket.sort((a,b)=>b.rank-a.rank);}
    }
   }
   for(const [region,bucket]of regional)for(const row of bucket)select(row.face,region);
   const rows=[];let outside=0,vertical=0;
   for(const [face,sampleRegions]of selected){
    const at=k=>index?index.getX(face*3+k):face*3+k;
    a.fromBufferAttribute(p,at(0)).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(p,at(1)).applyMatrix4(mesh.matrixWorld);e.fromBufferAttribute(p,at(2)).applyMatrix4(mesh.matrixWorld);
    const normal=c.clone().sub(a).cross(e.clone().sub(a));
    const length=normal.length(),verticalComponent=twoSidedSheet?Math.abs(normal.y):normal.y;
    if(length<1e-8||verticalComponent<length*.25){vertical++;continue;}
    q.copy(a).add(c).add(e).multiplyScalar(1/3);if(!within(q)&&!distantExtension){outside++;continue;}
    ray.set(V(q.x,1000,q.z),down);const hit=soilQuery.intersections(ray).find(renderedUpwardHit);
    const ground=hit?.point.y??null,gap=ground===null?null:q.y-ground;
    // Rail heads retain the actual 0.077-unit running height. Ballast is
    // checked separately, including its new real vertical side faces.
    const lower=kind==='rail-head'?.008:-.02;
    const upper=kind==='rail-head'?.12:kind==='road-shoulder'?.055:.065;
    const ordinary=Number.isFinite(gap)&&gap>=lower&&gap<=upper;
    // Historical abandoned-track traces may be covered by real earth from
    // a later embankment. Keep that occluded source record below its soil;
    // this never excuses active track, or an abandoned trace above ground.
    const buriedInactive=kind==='rail-abandoned'&&hit&&gap<lower?{type:'buried-inactive-source-track',
     groundMesh:hit.object.name||hit.object.uuid,coverDepth:-gap}:null;
    const exception=ordinary?null:buriedInactive??bridgeAt(q,kind)??facilitySupportAt(q,kind);
    const region=[...sampleRegions].find(id=>id!=='stratified')??'stratified';
    rows.push({face,region,regions:[...sampleRegions],scope:within(q)?'museum-camera-bounds':'explicit-highway-extension',point:q.toArray(),map:[q.x/3.4+650,q.z/3.4+522.5],ground,gap,numericTerrain:d.museumTerrainHeightAt(q.x,q.z),
     groundMesh:hit?.object.name||null,allowedGap:[lower,upper],status:ordinary?'ground-contact':buriedInactive?'buried-inactive-source-track':exception?'documented-exception':'failure',exception});
   }
   const gaps=rows.filter(r=>r.status==='ground-contact').map(r=>r.gap).sort((a,b)=>a-b);
   summaries.push({name:mesh.name,kind,distantExtension,triangles:faces,samples:rows.length,outside,vertical,sideFaces,solidVolume:!!mesh.userData.osmRailVolume,
    minGap:gaps[0]??null,medianGap:gaps[Math.floor(gaps.length/2)]??null,maxGap:gaps.at(-1)??null,rows});
  }
  const bridgeChecks=[];
  if(full)for(const source of stats.interchange?.bridges??[]){
   const center=V(...source.center);if(!within(center))continue;
   let root=null;d.scene.traverse(o=>{if(o.userData.interchangeBridgeModel?.sourceWayId===source.osmWayId||o.name==='Мост OSM '+source.osmWayId)root=o;});
   const meshes=[];root?.traverse(o=>{if(o.isMesh&&visible(o)&&!o.userData.bridgeLightSpill&&!o.userData.bridgeApproachTerrain)meshes.push(o);});
   ray.set(V(center.x,source.deckTop+.08,center.z),down);
   const hit=ray.intersectObjects(meshes,false).find(renderedUpwardHit);
   bridgeChecks.push({osmWayId:source.osmWayId,actualMesh:hit?.object.name||null,sourceDeckTop:source.deckTop,actualDeckY:hit?.point.y??null,
    gap:hit?source.deckTop-hit.point.y:null,passed:!!hit&&Math.abs(source.deckTop-hit.point.y)<.12});
  }
  const outerBounds=new T.Box3();for(const plane of d.outerTerrain.planes)outerBounds.expandByObject(plane);
  return {height,lod:d.roadLOD.stats().mode,detailReady:__BAIKONUR_QA.stats().transportBake.detailReady,meshes:summaries,bridgeChecks,
   museumCameraBounds:{...b},outerTerrainBounds:{min:outerBounds.min.toArray(),max:outerBounds.max.toArray()},
   terrainPlanes:[d.ground,d.satelliteGround,...d.outerTerrain.planes].filter(Boolean).map(plane=>({name:plane.name,y:plane.position.y,width:plane.geometry.parameters?.width,height:plane.geometry.parameters?.height})),
   regions:regions.map(r=>({id:r.id,kind:r.kind,required:r.required!==false,min:r.box.min.toArray(),max:r.box.max.toArray()})),ownerRoad31:ownerRoad31?{id:ownerRoad31.id,width:ownerRoad31.width,points:ownerRoad31.points}:null,
   groundSources:soilMeshes.map(m=>m.name),query:soilQuery.stats(),
   sourceBridgeWays:{roads:[...roadBridgeWays.values()].filter(w=>w.bridge).map(w=>w.id),rails:[...railBridgeWays.values()].filter(w=>w.bridge).map(w=>w.id)}};
 },{height,samplesPerMesh,regionSamples});
}

async function captureGroundContactView(page,{row,height,name,out}){
 const camera=await page.evaluate(({point,height})=>{
  const d=__GROUND_TEST,q=__BAIKONUR_QA;q.arrival.stopFollowing();q.traffic.stopFollowing();q.mapCameraSmoothing.cancel();q.setLabelsVisible(false);
  document.getElementById('info').style.display='none';
  const [x,surface,z]=point,y=d.museumTerrainHeightAt(x,z);
  d.ctl.enableDamping=false;d.ctl.maxPolarAngle=Math.PI/2;d.ctl.minDistance=.1;
  d.ctl.target.set(x,Math.max(y,surface)+.04,z);
  const views=[[8,11],[-8,11],[8,-11],[-8,-11]].map(([dx,dz])=>({x:x+dx,z:z+dz,ground:d.museumTerrainHeightAt(x+dx,z+dz)})).sort((a,b)=>a.ground-b.ground);
  const eye=views[0];d.camera.position.set(eye.x,Math.max(y+2.5,eye.ground+.9),eye.z);d.ctl.update();d.camera.updateMatrixWorld(true);
  d.roadLOD.update(height,d.getDetailedRoots());d.renderer.render(d.scene,d.camera);
  return {position:d.camera.position.toArray(),target:d.ctl.target.toArray(),lod:d.roadLOD.stats().mode};
 },{point:row.point,height});
 await page.screenshot({path:out+'/'+name+'.png',timeout:60000});
 return {name,point:row.point,map:row.map,camera,manualLODForComparison:true};
}

export async function checkTransportGroundContact(page,{mode,out}={}){
 const geometryStarted=performance.now();
 const result={passed:false,mode,groundVersion:TRANSPORT_GROUND_VERSION,
  coverage:'Actual sampled road/rail triangles against real soil within production camera bounds; explicit 106/109 and Saturn regions; bounded sampling of the two named distant highway meshes beyond those bounds; far/medium/full, software WebGL. Source bridges and actual model-port support are documented separately. Not an exhaustive collision proof or physical-phone/FPS test.',phases:[],shots:[]};
 try{
  result.cache=await page.evaluate(()=>{const d=__GROUND_TEST;return {enabled:d.transportFromBake,bake:d.preparedBake?.groundVersion,lod:d.preparedLOD?.groundVersion,
   sourceFingerprint:d.preparedBake?.sourceFingerprint,lodFingerprint:d.preparedLOD?.sourceFingerprint,editor:d.roadEditor.snapshot().groundVersion,
   bakeInputs:d.preparedBake?.buildInputsHash,lodInputs:d.preparedLOD?.buildInputsHash,
   road:d.transport.stats().roadSurface?.groundVersion,rail:d.transport.stats().railSurface?.groundVersion};});
  assert(result.cache.enabled,'Expected the production route/LOD cache path');
  for(const key of ['bake','lod','editor','road','rail'])assert.equal(result.cache[key],TRANSPORT_GROUND_VERSION,'Runtime stale ground version: '+key);
  assert.equal(result.cache.sourceFingerprint,result.cache.lodFingerprint,'Runtime cache pair mismatch');
  assert.match(result.cache.bakeInputs??'',/^[0-9a-f]{64}$/,'Runtime bake input identity missing');
  assert.equal(result.cache.bakeInputs,result.cache.lodInputs,'Runtime ground caches were built from different code');
  const samplesPerMesh=mode==='desktop'?256:96,regionSamples=mode==='desktop'?24:10;
  for(const height of [1200,500]){
   result.phases.push(await collectTransportGroundContact(page,{height,samplesPerMesh,regionSamples}));
   await writeFile(out+'/transport-ground-contact.json',JSON.stringify(result,null,2));
  }
  await page.evaluate(()=>__GROUND_TEST.requestTransportDetail());
  await page.waitForFunction(()=>__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:180000,polling:250});
  result.phases.push(await collectTransportGroundContact(page,{height:100,samplesPerMesh,regionSamples}));
  // Exercise the return to a cache level after the worker installed new roots.
  result.phases.push(await collectTransportGroundContact(page,{height:500,samplesPerMesh:48,regionSamples:6}));
  const full=result.phases[2],all=result.phases.flatMap(phase=>phase.meshes.flatMap(mesh=>mesh.rows.map(row=>({...row,lod:phase.lod,mesh:mesh.name,kind:mesh.kind}))));
  result.failures=all.filter(row=>row.status==='failure');result.exceptions=all.filter(row=>row.exception);
  result.counts={samples:all.length,contact:all.filter(row=>row.status==='ground-contact').length,exceptions:result.exceptions.length,failures:result.failures.length};
  for(const phase of result.phases){
   assert(phase.meshes.some(m=>m.kind==='roads'&&m.samples>=12),'No meaningful actual road sample: '+phase.lod);
   assert(phase.meshes.some(m=>m.kind==='rail-ballast'&&m.samples>=12),'No meaningful actual ballast sample: '+phase.lod);
   for(const region of phase.regions)if(region.required)assert(phase.meshes.some(m=>m.kind===region.kind&&m.rows.some(r=>r.regions.includes(region.id))),'Missing '+region.kind+' check on '+region.id+' / '+phase.lod);
   const ballast=phase.meshes.filter(m=>m.kind==='rail-ballast'&&m.samples>=12).sort((a,b)=>b.triangles-a.triangles)[0];
   assert(Math.abs(ballast.medianGap-.0168)<.007,'Ballast median must retain its physical profile without an extra LOD lift: '+phase.lod+' / '+ballast.medianGap);
  }
  assert(full.detailReady,'Full worker meshes did not install');
  assert(full.meshes.some(m=>m.kind==='rail-ballast'&&m.solidVolume&&m.sideFaces>0),'Ballast has no actual sides down to its base');
  assert(full.meshes.some(m=>m.kind==='rail-head'&&m.samples>=12),'Actual physical rail heads missing');
  for(const kind of ['roads','road-shoulder']){
   const extension=full.meshes.find(mesh=>mesh.distantExtension&&mesh.kind===kind);
   assert(extension?.samples>=12,'Missing bounded actual highway extension sample: '+kind);
   for(const side of ['west','east'])assert(extension.rows.some(row=>row.scope==='explicit-highway-extension'&&
    (side==='west'?row.point[0]<full.outerTerrainBounds.min[0]:row.point[0]>full.outerTerrainBounds.max[0])),
    'Missing '+side+' highway extension beyond the real regional terrain: '+kind);
  }
  assert(full.ownerRoad31&&full.meshes.some(m=>m.kind==='roads'&&m.name.startsWith('Единое полотно редактора')&&m.rows.some(r=>r.regions.includes('owner-road-31-saturn'))),'Missing actual editor road-31 triangles on the Saturn transition');
  assert(full.bridgeChecks.length>0&&full.bridgeChecks.every(b=>b.passed),'Source road bridges lack their real supporting deck: '+JSON.stringify(full.bridgeChecks));
  assert.equal(result.failures.length,0,'Transport floating/buried relative to actual soil: '+JSON.stringify(result.failures.slice(0,12)));
  result.geometryPassed=true;
  result.geometryMs=Math.round(performance.now()-geometryStarted);
  assert(result.geometryMs<360000,'Ground numerical acceptance exceeded 360s');
  await writeFile(out+'/transport-ground-contact.json',JSON.stringify(result,null,2));
  console.log('GROUND_GEOMETRY_PASS',JSON.stringify({counts:result.counts,elapsedMs:result.geometryMs}));
  if(mode==='desktop'){
   const rows=full.meshes.flatMap(mesh=>mesh.rows.map(row=>({...row,kind:mesh.kind}))),views=[];
   for(const kind of ['roads','rail-ballast']){
    const candidates=rows.filter(r=>r.kind===kind&&r.status==='ground-contact'&&r.region==='stratified');
    const outer=kind==='roads'?candidates.filter(r=>r.point[0]>2210&&r.scope==='museum-camera-bounds'):[];
    const row=(outer.length?outer:candidates).sort((a,b)=>Math.abs(a.gap-.025)-Math.abs(b.gap-.025))[0];
    if(row)views.push({name:kind,row});
   }
   const hill=rows.filter(r=>r.kind==='roads'&&r.regions.includes('shared-silo-hill-106-109')).sort((a,b)=>Math.abs(b.gap??999)-Math.abs(a.gap??999))[0];
   if(hill)views.push({name:'silo-hill',row:hill});
   const saturn=rows.filter(r=>r.kind==='roads'&&r.regions.includes('owner-road-31-saturn')).sort((a,b)=>Math.abs(b.gap??999)-Math.abs(a.gap??999))[0];
   if(saturn)views.push({name:'saturn-transition',row:saturn});
   const modelRail=rows.filter(r=>r.kind==='rail-ballast'&&r.regions.some(region=>region.startsWith('rail-foundation-mik112'))).sort((a,b)=>b.point[1]-a.point[1])[0];
   if(modelRail)views.push({name:'model-rail-approach',row:modelRail});
   if(result.failures.length)views.push({name:'worst-gap',row:[...result.failures].sort((a,b)=>Math.abs(b.gap??999)-Math.abs(a.gap??999))[0]});
   const screenshotStart=performance.now();
   for(const view of views)for(const height of [1200,100]){
    assert(performance.now()-screenshotStart<480000,'Ground screenshot phase exceeded its separate 480s budget');
    const name='ground-'+view.name+'-'+(height===100?'full':'far'),started=performance.now();
    result.pendingShot=name;console.log('GROUND_SHOT_START',name);
    await writeFile(out+'/transport-ground-contact.json',JSON.stringify(result,null,2));
    const shot=await captureGroundContactView(page,{row:view.row,height,name,out});
    shot.elapsedMs=Math.round(performance.now()-started);result.shots.push(shot);result.pendingShot=null;
    console.log('GROUND_SHOT_COMPLETE',name,shot.elapsedMs);
    await writeFile(out+'/transport-ground-contact.json',JSON.stringify(result,null,2));
   }
   result.screenshotsMs=Math.round(performance.now()-screenshotStart);
  }
  result.passed=true;
  // Keep the smoke log readable; the companion artifact preserves every
  // sampled coordinate, measured gap, source proof and failure verbatim.
  return {...result,sampleReport:'transport-ground-contact.json',phases:result.phases.map(phase=>({...phase,
   meshes:phase.meshes.map(({rows,...mesh})=>({...mesh,contact:rows.filter(r=>r.status==='ground-contact').length,
    documentedExceptions:rows.filter(r=>r.exception).length,failures:rows.filter(r=>r.status==='failure').length}))}))};
 }catch(error){result.error=error.stack;throw error;}
 finally{await writeFile(out+'/transport-ground-contact.json',JSON.stringify(result,null,2));}
}

