import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {resolve,join,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {gzipSync,gunzipSync} from 'node:zlib';

// The same CPU geometry constructors used by museum.html, with its pinned
// Three.js import map. No browser, WebGL, DOM replacement or stale route
// transformation is involved. --output-dir makes a complete reviewable pair
// outside the repository; omit it only when intentionally updating both caches.
const root=new URL('../',import.meta.url),rootPath=fileURLToPath(root);
const {values:options}=parseArgs({options:{'output-dir':{type:'string'},report:{type:'string'},'inputs-only':{type:'boolean',default:false}}});
const outputDir=resolve(options['output-dir']??fileURLToPath(new URL('data/osm/',root)));
const reportPath=resolve(options.report??join(outputDir,'transport-cache-build-report.json'));
registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return{url:new URL('src/vendor/three-r160/build/three.module.js',root).href,shortCircuit:true};
 if(specifier.startsWith('three/addons/'))return{url:new URL('src/vendor/three-r160/examples/jsm/'+specifier.slice(13),root).href,shortCircuit:true};
 return next(specifier,context);
}});

const imports=await Promise.all([
 import('three'),import('../src/osm-geography.js'),import('../src/checkpoint7-layout.js'),
 import('../src/checkpoint7-road-grade.js'),import('../src/site113-road-grade.js'),import('../src/site95-road-grade.js'),
 import('../src/site110.js'),import('../src/mik112.js'),import('../src/tua-rails.js'),
 import('../src/osm-transport.js'),import('../src/transport-bake.js'),import('../src/transport-ground-profile.js')
]);
const [THREE,{createMuseumGeography},{checkpoint7Placement},{createCheckpoint7RoadGrade},
 {createSite113RoadGrade},{createSite95RoadGrade},{SITE110_REFERENCE},{MIK112,buildMik112},
 {adaptTuaRails},{buildOsmTransportNetwork},{serializeTransport,transportSourceFingerprint},
 {TRANSPORT_GROUND_VERSION}]=imports;
const inputFiles=['data/catalog.json','data/osm/catalog-matches.json','data/osm/roads.geojson','data/osm/railways.geojson',
 'data/osm/rail-points.geojson','data/osm/facilities.geojson','data/osm/airports.geojson','data/osm/places.geojson',
 'data/transport-network.json','data/road-edits-authoritative-20261103.json'];
const inputBytes=await Promise.all(inputFiles.map(path=>readFile(new URL(path,root))));
const [catalog,matches,roads,railways,railPoints,facilities,airports,places,legacyData,ownerRoadEdits]=inputBytes.map(bytes=>JSON.parse(bytes));
const data={roads,railways,railPoints,facilities,airports,places};
const geography=createMuseumGeography({catalog,matches});
const siteRecords=geography.sites.filter(record=>!record.aliasOf&&record.render!==false);
const checkpointAnchor=checkpoint7Placement({roads,ownerRoadEdits,geography});
const checkpointRoadGrade=createCheckpoint7RoadGrade(checkpointAnchor);
const town113Record=siteRecords.find(record=>record.id==='pad-113');
const site113RoadGrade=createSite113RoadGrade({x:(town113Record.x-650)*3.4,z:(town113Record.y-522.5)*3.4});
const town95Record=siteRecords.find(record=>record.id==='pad-95');
const site95RoadGrade=createSite95RoadGrade({x:(town95Record.x-650)*3.4,z:(town95Record.y-522.5)*3.4});
const displayRoadGrade=site95RoadGrade.compose(site113RoadGrade.withCheckpoint(checkpointRoadGrade));

// Keep this initialization in the same order as museum.html: grade anchors
// precede the checkpoint placement; exhibit and runway anchors precede OSM.
const checkpointRecord=siteRecords.find(record=>record.id==='kpp-7');
[checkpointRecord.x,checkpointRecord.y]=checkpointAnchor.map;
checkpointRecord.geoSource={kind:'owner-directed-display',status:'between-named-landmarks',refs:[{type:'way',id:173082916,url:'https://www.openstreetmap.org/way/173082916'}],modelAnchor:'illustrative',reason:checkpointRecord.positionBasis};
const gagarinSiteRecord=siteRecords.find(record=>record.id==='pad-1'),site2Record=siteRecords.find(record=>record.id==='pad-2');
if(gagarinSiteRecord&&site2Record){site2Record.x=gagarinSiteRecord.x-19;site2Record.y=gagarinSiteRecord.y+7;}
const site110Record=siteRecords.find(record=>record.id==='pad-110');
if(site110Record){
 [site110Record.x,site110Record.y]=geography.project(...SITE110_REFERENCE.originLonLat);
 site110Record.geoSource={...site110Record.geoSource,sourceLonLat:[...SITE110_REFERENCE.originLonLat],displayLonLat:[...SITE110_REFERENCE.originLonLat]};
}
for(const [id,wayId] of [['airfield',37591623],['pad-251',24949215]]){
 const site=siteRecords.find(record=>record.id===id),runway=airports.features.find(feature=>feature.properties.osmId===wayId&&feature.geometry.type==='LineString');
 assert(site&&runway,'Missing airport centreline '+id);
 const a=geography.project(runway.geometry.coordinates[0]),b=geography.project(runway.geometry.coordinates.at(-1));
 site.x=(a[0]+b[0])/2;site.y=(a[1]+b[1])/2;
 const sign=b[0]>=a[0]?1:-1;site.runtimeYaw=Math.atan2((b[0]-a[0])*sign,(b[1]-a[1])*sign);
 site.runwaySource={osmId:wayId,url:runway.properties.osmUrl,coordinates:runway.geometry.coordinates};
 const midpoint=geography.inverseProject(site.x,site.y);
 site.geoSource={...site.geoSource,kind:'osm',status:'runway-centerline',sourceLonLat:midpoint,displayLonLat:[...midpoint],refs:[{type:'way',id:wayId,url:runway.properties.osmUrl}]};
 site.positionBasis='Ось ВПП OpenStreetMap: way/'+wayId;
}
const point=(x,y,z=0)=>new THREE.Vector3((x-650)*3.4,z,(y-522.5)*3.4);
const sourceFingerprint=transportSourceFingerprint({roads,railways,ownerRoadEdits,siteRecords});

// Record the transitive source graph, including every composed grade module,
// so a geometry-only change is visible even when source OSM is unchanged.
const sourceHashes=new Map(inputFiles.map((path,i)=>[path,createHash('sha256').update(inputBytes[i]).digest('hex')]));
async function recordModule(path){
 path=path.split('?')[0];
 if(sourceHashes.has(path))return;
 const source=await readFile(new URL(path,root),'utf8');
 sourceHashes.set(path,createHash('sha256').update(source).digest('hex'));
 const references=[...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map(match=>match[1]);
 for(const specifier of references){
  let dependency;
  if(specifier==='three')dependency='src/vendor/three-r160/build/three.module.js';
  else if(specifier.startsWith('three/addons/'))dependency='src/vendor/three-r160/examples/jsm/'+specifier.slice(13);
  else if(specifier.startsWith('.'))dependency=relative(rootPath,resolve(rootPath,dirname(path),specifier.split('?')[0]));
  if(dependency)await recordModule(dependency);
 }
}
await recordModule('scripts/build-grounded-transport-cache.mjs');
await recordModule('scripts/build-authoritative-road-lod.mjs');
await recordModule('scripts/build-owner19-caches.mjs');
// Preserve the manual browser exporter's existing skip contract. Read its
// declared file list instead of maintaining a second list that can drift.
const ownerCacheScript=await readFile(new URL('scripts/build-owner19-caches.mjs',root),'utf8');
const ownerFileList=ownerCacheScript.match(/const files=\[([^\]]+)\];/);
assert(ownerFileList,'Cannot find the manual owner-cache input list');
const ownerFiles=[...ownerFileList[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
assert(ownerFiles.includes('src/transport-ground-profile.js'),'Owner-cache digest must include the ground profile');
const ownerDigest=createHash('sha256');
for(const path of ownerFiles){const bytes=await readFile(new URL(path,root));ownerDigest.update(path).update(bytes);sourceHashes.set(path,createHash('sha256').update(bytes).digest('hex'));}
const ownerSourceHash=ownerDigest.digest('hex');
const hashes=Object.fromEntries([...sourceHashes].sort(([a],[b])=>a.localeCompare(b)));
const buildInputsHash=createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
const anchors=siteRecords.map(({id,x,y,runtimeYaw})=>({id,x,y,runtimeYaw:runtimeYaw??null}));
const report={version:'transport-cache-node-build-v1',groundVersion:TRANSPORT_GROUND_VERSION,sourceFingerprint,buildInputsHash,ownerSourceHash,
 inputs:hashes,anchors,checkpointAnchor,displayGradeVersion:displayRoadGrade.version,outputDir};
if(options['inputs-only']){
 await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log('TRANSPORT_CACHE_INPUTS_PASS',JSON.stringify({sourceFingerprint,buildInputsHash,siteRecords:siteRecords.length,reportPath}));
}else{
 const baselinePath=new URL('data/osm/transport-geometry-bake-v1.json.gz',root);
 const baseline=JSON.parse(gunzipSync(await readFile(baselinePath)));
 const layers={roads:new THREE.Group(),rails:new THREE.Group()};
 const mikRecord=siteRecords.find(record=>record.id==='pad-112');assert(mikRecord,'Missing MIK112 transport anchor');
 const mikRoot=new THREE.Group();mikRoot.position.copy(point(mikRecord.x,mikRecord.y));
 mikRoot.scale.setScalar(MIK112.scale);mikRoot.rotation.y=MIK112.yaw;
 const mikExhibit=buildMik112(mikRoot,{year:2026});mikRoot.userData.mik112Model.suppressedFallbackGeometry=[];
 adaptTuaRails(mikExhibit);mikRoot.updateWorldMatrix(true,true);
 const started=performance.now();
 const transport=buildOsmTransportNetwork({data,legacyData,geography,point,layers,siteRecords,ownerRoadEdits,checkpoint7RoadGrade:displayRoadGrade});
 const mik112Rail=transport.connectMik112(mikRoot);
 assert(mik112Rail.connected&&mik112Rail.tracks.length===4,'All four MIK112 ports must be connected');
 assert(mik112Rail.joinGap<1e-6,'MIK112 source switches must remain continuous');
 const baked=serializeTransport({transport,layers,mik112Rail,sourceFingerprint,displayGradeVersion:displayRoadGrade.version});
 assert(!baked.groundVersion||baked.groundVersion===TRANSPORT_GROUND_VERSION,'Cache ground profile differs from the builder');
 baked.groundVersion=TRANSPORT_GROUND_VERSION;baked.buildInputsHash=buildInputsHash;baked.ownerSourceHash=ownerSourceHash;
 const rowSets=cache=>({roads:cache.roads,editable:cache.editable,terrainRoads:cache.terrain.roads,terrainRails:cache.terrain.rails,
  vehicleRoutes:cache.vehicles.routes,extensions:cache.extensions,train:[cache.train.path]});
 const beforeRows=rowSets(baseline),afterRows=rowSets(baked);
 const rowId=(row,index)=>String(row.id??row.sourceWayId??'anonymous-'+index);
 const describe=rows=>{
  const ids=rows.map(rowId).sort();let points=0,minY=Infinity,maxY=-Infinity;
  for(const row of rows)for(const p of row.points){assert(p.length===3&&p.every(Number.isFinite),'Nonfinite cached route '+row.id);points++;minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
  return {rows:rows.length,points,uniqueIds:new Set(ids).size,idHash:createHash('sha256').update(ids.join('\n')).digest('hex'),minY,maxY};
 };
 report.comparison=Object.fromEntries(Object.keys(afterRows).map(key=>{
  const before=beforeRows[key],after=afterRows[key],beforeIds=new Set(before.map(rowId)),afterIds=new Set(after.map(rowId));
  return [key,{before:describe(before),after:describe(after),removedIds:[...beforeIds].filter(id=>!afterIds.has(id)),addedIds:[...afterIds].filter(id=>!beforeIds.has(id))}];
 }));
 const ports=cache=>(cache.mik112Rail?.tracks??[]).map(({gateId,trackIndex,localEntry,start,end,modelHeadGap,junctionGap,sourceNodeId})=>({gateId,trackIndex,localEntry,start,end,modelHeadGap,junctionGap,sourceNodeId}));
 report.mik112={before:ports(baseline),after:ports(baked),modelMatrix:mikRoot.matrixWorld.toArray(),headEntries:mikRoot.userData.mik112Model.railHeadEntries};
 const authoredEnds=cache=>cache.roads.filter(row=>!String(row.id).startsWith('osm-road-')).map(row=>({id:row.id,points:row.points.length,
  start:row.points[0],end:row.points.at(-1),source:row.source??null}));
 report.modelApproaches={before:authoredEnds(baseline),after:authoredEnds(baked),train:{before:{start:baseline.train.path.points[0],end:baseline.train.path.points.at(-1)},
  after:{start:baked.train.path.points[0],end:baked.train.path.points.at(-1)}}};
 report.stats=baked.stats;report.buildMilliseconds=performance.now()-started;
 const stage=await mkdtemp(join(tmpdir(),'museum-transport-cache-'));
 try{
  const bakeName='transport-geometry-bake-v1.json.gz',lodName='road-lod-authoritative-v1.json.gz';
  const bakePath=join(stage,bakeName),lodPath=join(stage,lodName);
  const compressed=gzipSync(Buffer.from(JSON.stringify(baked)),{level:9});await writeFile(bakePath,compressed);
  const lodResult=spawnSync(process.execPath,[fileURLToPath(new URL('scripts/build-authoritative-road-lod.mjs',root)),'--bake',bakePath,'--output',lodPath],{encoding:'utf8'});
  if(lodResult.stdout)process.stdout.write(lodResult.stdout);
  if(lodResult.stderr)process.stderr.write(lodResult.stderr);
  if(lodResult.error)throw lodResult.error;
  assert.equal(lodResult.status,0,'Authoritative road LOD generation failed');
  const lodBytes=await readFile(lodPath),lod=JSON.parse(gunzipSync(lodBytes));
  assert.equal(lod.sourceFingerprint,baked.sourceFingerprint);assert.equal(lod.groundVersion,baked.groundVersion);
  assert.equal(lod.buildInputsHash,baked.buildInputsHash);
  report.outputs={bake:{bytes:compressed.length,sha256:createHash('sha256').update(compressed).digest('hex')},
   lod:{bytes:lodBytes.length,sha256:createHash('sha256').update(lodBytes).digest('hex'),
    levels:Object.fromEntries(Object.entries(lod.levels).map(([key,value])=>[key,{roads:describe(value.roads),rails:describe(value.rails)}]))}};
  for(const [path,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(new URL(path,root))).digest('hex'),hash,'Source changed during transport cache build: '+path);
  // Publish the pair only after both assets have been created and checked.
  await mkdir(outputDir,{recursive:true});await mkdir(dirname(reportPath),{recursive:true});
  await copyFile(bakePath,join(outputDir,bakeName));await copyFile(lodPath,join(outputDir,lodName));
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('GROUNDED_TRANSPORT_CACHE_PASS',JSON.stringify({sourceFingerprint,groundVersion:baked.groundVersion,buildInputsHash,
   bakeBytes:compressed.length,lodBytes:lodBytes.length,buildMilliseconds:Math.round(report.buildMilliseconds),reportPath}));
 }finally{await rm(stage,{recursive:true,force:true});}
}
