import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from '../src/vendor/meshopt_decoder-v1.mjs';
import {buildGagarinPad} from '../src/gagarin-pad.js';
import {buildUkssPad} from '../src/ukss-pad.js';
import {buildSite110} from '../src/site110.js';
import {buildSite31Pad} from '../src/site31-pad.js';
import {protonComplex,zenit45} from '../src/archive-launches.js';
import {mik42Facade} from '../src/archive-buildings.js';
import {buildAirport} from '../src/airport-models.js';
import {buildSaturnIP5} from '../src/saturn-ip5.js';
import {buildMik112} from '../src/mik112.js';
import {registerFacilityFloodlights} from '../src/facility-light-anchors.js';
import {buildFacilityTowerLighting,FACILITY_BEACON_PERIOD} from '../src/facility-tower-lighting.js';

// Only canvas labels need a document in the geometry constructors; no renderer
// or WebGL replacement is used for the real source/instance checks below.
const context=new Proxy({measureText:t=>({width:t.length*15}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]||(()=>{})});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})};
const scene=new THREE.Scene(),objects=[];
function add(siteId,build,scale=.14){
 const g=new THREE.Group(),index=objects.length;g.position.set(100+index*1000,-2.72,200-index*90);g.rotation.y=.31+index*.17;g.scale.setScalar(scale);scene.add(g);build(g);
 objects.push({record:{id:siteId},g});return g;
}
add('pad-1',buildGagarinPad);
const ukss=add('pad-250',()=>{}),bytes=await readFile(new URL('../assets/models/ukss/model-v2.glb',import.meta.url));
const imported=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
ukss.add(imported);ukss.userData.ukssModel={status:'ready'};
add('pad-110',buildSite110);add('pad-31',buildSite31Pad);
add('pad-81',g=>protonComplex(g,'pad-81'));add('pad-200',g=>protonComplex(g,'pad-200'));add('pad-45',zenit45);
add('pad-42',mik42Facade);add('pad-23',buildSaturnIP5,.525);add('pad-112',buildMik112);
add('airfield',g=>buildAirport(g,'krayniy'),.28);add('pad-251',g=>buildAirport(g,'yubileiny'),.28);
add('pad-41',()=>{});
scene.updateMatrixWorld(true);
function sourceFingerprint(){
 const hash=createHash('sha256');let meshes=0,instances=0;
 for(const {g} of objects)g.traverse(m=>{if(!m.isMesh)return;meshes++;hash.update(m.matrixWorld.elements.join(','));
  for(const a of Object.values(m.geometry.attributes))hash.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));
  if(m.geometry.index)hash.update(new Uint8Array(m.geometry.index.array.buffer));
  if(m.isInstancedMesh){instances+=m.count;hash.update(new Uint8Array(m.instanceMatrix.array.buffer));}
 });return {hash:hash.digest('hex'),meshes,instances};
}
const sourceBefore=sourceFingerprint(),lighting=buildFacilityTowerLighting({scene,objects}),records=lighting.records(),stats=lighting.stats();
assert.deepEqual(sourceFingerprint(),sourceBefore,'Lighting does not reshape, duplicate or move any source geometry');
assert.equal(stats.version,'facility-tower-lighting-v1');assert.equal(stats.dynamicLights,0);assert.equal(stats.drawCalls,6);
assert.equal(stats.fixtures,907);assert.equal(stats.boards,26);assert.equal(stats.beacons,77);
assert.equal(stats.rendered.visibilityLeaks,0);assert(stats.rendered.maximumError<.002);
assert.equal(stats.rendered.activeLenses,0);assert.equal(stats.rendered.activeBeacons,0);
assert.equal(stats.importedUkss.lensComponents,735,'All source-preserved UKSS lens components are enabled');
assert.equal(stats.importedUkss.boards,7);assert(stats.importedUkss.lightningTowers>0);assert.equal(stats.importedUkss.source,'preserved-imported-geometry');
assert.equal(stats.importedUkss.serviceTowers,2,'Both the fixed Tower_2 and mobile Telega source service structures are covered');
const counts=new Map(stats.sites.map(s=>[s.siteId,s]));
for(const [id,count] of [['pad-1',32],['pad-250',735],['pad-110',115],['pad-31',20],['pad-42',1],['pad-23',4]])assert.equal(counts.get(id)?.fixtures,count,id+' existing lens count');
for(const id of ['pad-1','pad-250','pad-110','pad-31','pad-81','pad-200','pad-45','pad-42','pad-112','airfield','pad-251'])assert(counts.get(id)?.beacons>0,id+' actual towers receive beacons');
assert.equal(counts.get('pad-23').beacons,0,'No speculative dish-feed beacon is added');
assert(!counts.has('pad-41'),'The unpowered Site41 ruins have no invented mast');

const ids=new Set(),objectById=new Map(objects.map(o=>[o.record.id,o])),sourceMeshes=new Map();
for(const o of objects){const meshes=[];o.g.traverse(m=>{if(m.isMesh)meshes.push(m)});sourceMeshes.set(o.record.id,meshes);}
const near=(a,b,t=1e-6)=>assert(Math.abs(a-b)<t,`${a} != ${b}`),v=a=>new THREE.Vector3(...a),ray=new THREE.Raycaster();
let alignedFixtures=0,attachedBeacons=0,maxLensSurfaceGap=0,maxBeaconSurfaceGap=0;
for(const r of [...records.floodlights,...records.beacons]){
 assert(!ids.has(r.id),'Every source instance has a unique identifier');ids.add(r.id);
 assert(objectById.has(r.siteId));assert([...r.position,...r.sourcePosition].every(Number.isFinite));
 assert(r.source&&r.powered&&r.visible);
 const p=v(r.position),source=v(r.sourcePosition);
 if(r.normal){
  const normal=v(r.normal);near(normal.length(),1);assert(r.width>0&&r.lensHeight>0);
  assert(p.distanceTo(source.clone().addScaledVector(normal,.012))<1e-8,'Emission stays at the actual transformed lens face');
  // Cast back against the independently rendered source triangles/instances,
  // not against the newly generated light overlay or its metadata.
  ray.set(p.clone().addScaledVector(normal,.02),normal.clone().negate());ray.near=0;ray.far=.15;
  const hit=ray.intersectObjects(sourceMeshes.get(r.siteId),false)[0];
  assert(hit,`${r.id}: no source fixture behind its luminous lens`);
  const gap=hit.point.distanceTo(source);maxLensSurfaceGap=Math.max(maxLensSurfaceGap,gap);
  assert(gap<.025,`${r.id}: source-face mismatch ${gap}`);alignedFixtures++;
 }else{
  near(p.x,source.x);near(p.z,source.z);near(p.y-source.y,.045);
  const local=objectById.get(r.siteId).g.worldToLocal(source.clone());assert(local.y>10,'Beacons sit on existing elevated structures');
  // Open lattice crowns cannot support a beacon in their empty centre.
  // Probe the real tip/cap, allowing tiny inward probes at a source vertex.
  let supportGap=Infinity;
  for(const [dx,dz] of [[0,0],[.004,0],[-.004,0],[0,.004],[0,-.004],[.004,.004],[-.004,.004],[.004,-.004],[-.004,-.004]]){
   ray.set(source.clone().add(new THREE.Vector3(dx,.06,dz)),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=.12;
   const hit=ray.intersectObjects(sourceMeshes.get(r.siteId),false)[0];if(hit){supportGap=Math.min(supportGap,hit.point.distanceTo(source));if(supportGap<.008)break;}
  }
  assert(supportGap<.03,`${r.id}: beacon has no actual source mast/tower support (${supportGap})`);
  maxBeaconSurfaceGap=Math.max(maxBeaconSurfaceGap,supportGap);attachedBeacons++;
 }
}
assert.equal(alignedFixtures,stats.fixtures);
assert.equal(attachedBeacons,stats.beacons);
const batches=lighting.root.children.filter(m=>m.isInstancedMesh),lensBatch=batches.find(m=>m.name==='Мачты · светящиеся линзы'),matrix=new THREE.Matrix4();
assert.equal(lensBatch.count,records.floodlights.length);
records.floodlights.forEach((r,i)=>{lensBatch.getMatrixAt(i,matrix);assert(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(v(r.position))<.002,'Rendered lens instance equals the audited source placement');});
let forbiddenLights=0;lighting.root.traverse(m=>{if(m.isPointLight||m.isSpotLight)forbiddenLights++;});assert.equal(forbiddenLights,0);
assert.equal(lighting.root.visible,false);assert.equal(stats.emissiveIntensity,0);assert.equal(stats.beaconPulse,0);
lighting.setEvening(true);lighting.update(0);const dim=lighting.stats().beaconPulse;lighting.update(FACILITY_BEACON_PERIOD*500);const bright=lighting.stats().beaconPulse;
assert(dim>0&&dim<.4&&bright>.99);assert.equal(lighting.stats().beaconPeriod,3.8,'Slow gentle beacon cycle');
lighting.update(FACILITY_BEACON_PERIOD*1000);near(lighting.stats().beaconPulse,dim);
assert.equal(lighting.root.visible,true);assert(lighting.stats().emissiveIntensity>0);
assert.equal(lighting.stats().rendered.activeLenses,stats.fixtures);assert.equal(lighting.stats().rendered.activeBeacons,stats.beacons);

// Both a hidden source and a hidden district ancestor must remove all their
// luminous pieces. Moving the owning model must move its exact anchors too.
const gagarin=objects[0].g,beforeGagarin=lighting.records().floodlights.filter(r=>r.siteId==='pad-1');
gagarin.visible=false;lighting.sync();assert(lighting.records().floodlights.filter(r=>r.siteId==='pad-1').every(r=>!r.visible));
assert.equal(lighting.stats().rendered.visibilityLeaks,0);
const glow=lighting.root.children.find(o=>o.name==='Мачты · прожекторы').children.find(o=>o.isPoints);
for(const r of beforeGagarin){const i=records.floodlights.findIndex(item=>item.id===r.id);assert.equal(glow.geometry.attributes.enabled.getX(i),0);lensBatch.getMatrixAt(i,matrix);assert.equal(matrix.determinant(),0);}
gagarin.visible=true;gagarin.position.x+=7.25;lighting.sync();
for(const r of lighting.records().floodlights.filter(r=>r.siteId==='pad-1')){const before=beforeGagarin.find(b=>b.id===r.id);near(r.position[0]-before.position[0],7.25);near(r.position[1],before.position[1]);}
scene.visible=false;lighting.sync();assert.equal(lighting.stats().visibleFixtures,0);assert.equal(lighting.stats().visibleBeacons,0);scene.visible=true;lighting.sync();
lighting.setEvening(false);assert.equal(lighting.stats().emissiveIntensity,0);assert.equal(lighting.stats().beaconPulse,0);

// Power filtering is applied to existing fixtures as well as their pool
// targets; the registered structure remains intact while its light is off.
const isolated=new THREE.Scene(),blocked=new THREE.Group();isolated.add(blocked);
registerFacilityFloodlights(blocked,{id:'cutoff-fixture',target:[0,0,5],beacon:[0,12,0],lamps:[{position:[0,10,0],normal:[0,0,1],size:[1,1]}]});
const unpowered=buildFacilityTowerLighting({scene:isolated,objects:[{record:{id:'pad-41'},g:blocked}],isLightPowered:()=>false});unpowered.setEvening(true);
assert.equal(unpowered.stats().poweredFixtures,0);assert.equal(unpowered.stats().poweredBeacons,0);assert(unpowered.records().boards.every(b=>!b.powered));
assert.equal(blocked.visible,true);const blockedPool=unpowered.root.getObjectByName('Мачты · свет на поверхности');assert.equal(blockedPool.geometry.attributes.enabled.getX(0),0);

// The fallback still follows its own source fixtures if the imported UKSS
// cannot load. It must not inherit metre/world positions from the live GLB.
const fallbackScene=new THREE.Scene(),fallback=new THREE.Group();fallback.scale.setScalar(.14);fallback.rotation.y=-.56;fallbackScene.add(fallback);buildUkssPad(fallback);
const fallbackLighting=buildFacilityTowerLighting({scene:fallbackScene,objects:[{record:{id:'pad-250'},g:fallback}]});
assert.equal(fallbackLighting.stats().fixtures,448);assert.equal(fallbackLighting.stats().boards,4);assert.equal(fallbackLighting.stats().importedUkss,null);
console.log('FACILITY_LIGHTING_GEOMETRY_PASS',JSON.stringify({fixtures:stats.fixtures,boards:stats.boards,beacons:stats.beacons,sites:stats.sites,alignedFixtures,attachedBeacons,maxLensSurfaceGap,maxBeaconSurfaceGap,drawCalls:stats.drawCalls,sourceUnchanged:true,importedUkss:stats.importedUkss}));
