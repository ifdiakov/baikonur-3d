import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {checkpoint7Placement,CHECKPOINT7_VERSION} from '../src/checkpoint7-layout.js';
import {createCheckpoint7RoadGrade} from '../src/checkpoint7-road-grade.js';
import {buildCheckpoint7} from '../src/checkpoint7.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {roadVehiclePose} from '../src/road-vehicles.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json'),geography=createMuseumGeography({catalog,matches});
const roads=read('data/osm/roads.geojson'),ownerRoadEdits=read('data/road-edits-authoritative-20261103.json'),options={roads,ownerRoadEdits,geography};
const before=checkpoint7Placement(options),grade=createCheckpoint7RoadGrade(before),record=geography.sites.find(s=>s.id==='kpp-7');[record.x,record.y]=before.map;
const without=createMuseumGeography({catalog:{...catalog,sites:catalog.sites.filter(s=>s.id!=='kpp-7')},matches});
for(const s of without.sites){const same=geography.sites.find(r=>r.id===s.id);assert.deepEqual([same.x,same.y],[s.x,s.y],'Adding a checkpoint cannot move another site');}
const V=(...v)=>new THREE.Vector3(...v),point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const pad1=geography.sites.find(s=>s.id==='pad-1'),pad2=geography.sites.find(s=>s.id==='pad-2');pad2.x=pad1.x-19;pad2.y=pad1.y+7;
const transport=buildOsmTransportNetwork({data:{roads,railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')},legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false),checkpoint7RoadGrade:grade});
const placement=checkpoint7Placement({...options,roadPaths:transport.roadPaths()});
assert(placement.station>placement.bridgeStation+50&&placement.station<placement.turnoffStation-50,'The checkpoint is between the bridge and Saturn turnoff');
assert(Math.abs(placement.position[0]-before.position[0])<.2);assert(Math.abs(placement.position[2]-before.position[2])<.2);
const root=new THREE.Group();root.position.fromArray(placement.position);root.rotation.y=placement.yaw;root.scale.setScalar(placement.scale);root.userData.checkpoint7Placement=placement;
const built=buildCheckpoint7(root);root.updateWorldMatrix(true,true);layers.roads.updateMatrixWorld(true);
assert.equal(built.checkpoint7.version,CHECKPOINT7_VERSION);assert.equal(built.checkpoint7.references.photos.length,5);
assert(!built.features['checkpoint-ground-transition']&&!built.features['checkpoint-foundation'],'No hill or raised soil remains on the live checkpoint');
assert(Math.abs(root.position.y-(-2.755+.025))<1e-8,'Checkpoint sits on flat ground');
assert(!built.features['gallery-road'],'The live model must not cover or duplicate the existing pavement');assert.equal(built.features['main-gatehouse'],1);
assert(built.meshCount<35,'Static façade details remain batched');assert.equal(built.checkpoint7.throughLanes,2);
assert(root.localToWorld(V(0,0,1)).sub(root.position).normalize().dot(V(...placement.bridge).sub(root.position).setY(0).normalize())>.99,'The facade faces the city/bridge');
let triangles=0;root.traverse(m=>{if(m.isMesh){assert([...m.geometry.attributes.position.array].every(Number.isFinite));if(m.isInstancedMesh)assert([...m.instanceMatrix.array].every(Number.isFinite));triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*(m.count??1);}});assert(triangles<40000);
// Probe both actual car envelopes, not just the road's centreline. Oversized
// museum vehicles still clear every booth, open barrier and central lamp.
const route=transport.roadPaths().osmVehiclePlan.routes.find(r=>r.id==='city-cosmodrome');assert(route);
let nearest=0,best=Infinity;for(let s=0;s<route.length;s+=.5){const p=route.sample(s,1.5).position,d=Math.hypot(p.x-root.position.x,p.z-root.position.z);if(d<best){best=d;nearest=s;}}
assert(best<.6,'The active city/cosmodrome traffic actually passes the checkpoint');
for(const direction of [-1,1])for(let s=nearest-3;s<=nearest+3;s+=.4){
 const pose=roadVehiclePose(route,0,{phase:s/route.length,direction,speed:1,halfWidth:1.05});
 // Body sweep: 0.67 world half width includes the Sprinter in this route.
 for(const dx of [-.68,0,.68]){
  const p=pose.position.clone().add(V(Math.cos(placement.yaw)*dx,0,-Math.sin(placement.yaw)*dx));
  const hits=new THREE.Raycaster(V(p.x,p.y+2.1,p.z),V(0,-1,0),0,2.08).intersectObject(root,true);
  assert.equal(hits.length,0,'A standing checkpoint element intersects a passing vehicle');
 }
}
const ray=new THREE.Raycaster(V(root.position.x,100,root.position.z),V(0,-1,0));
const pavement=ray.intersectObject(layers.roads,true).find(h=>h.object.name.includes('полотно')||h.object.name.includes('асфальт'));
assert(pavement,'The checkpoint is placed on rendered asphalt');assert(Math.abs(pavement.point.y-root.position.y)<.15,'Island and shoulders meet the pavement');
// Check the real pavement and both verges along the lowered approach. There
// must be one asphalt owner, a positive ground gap, and no floating segments.
for(let dz=-25;dz<=25;dz+=.8)for(const dx of [-1.7,-.9,.9,1.7]){
 const p=root.localToWorld(V(dx/placement.scale,0,dz/placement.scale));
 const hits=new THREE.Raycaster(V(p.x,5,p.z),V(0,-1,0)).intersectObject(layers.roads,true).filter(h=>h.object.name.includes('полотно'));
 assert(hits.length>0,'Continuous pavement through the flat checkpoint');
 const surface=hits[0].point.y;assert(surface>grade.baseY+.02&&surface<grade.baseY+.03,'Road follows the flat earth surface');
}
for(const p of [before.bridge,before.turnoff,[0,0,0]])assert.equal(grade.roadAt(p[0],p[2]),null,'Bridge, Saturn turnoff and unrelated roads keep their elevation');
const branchNode=point(...geography.project(63.3188757,45.6875817));
const junctionHits=new THREE.Raycaster(V(branchNode.x,5,branchNode.z),V(0,-1,0)).intersectObject(layers.roads,true).filter(h=>h.object.name.includes('полотно'));
assert(junctionHits.length>0);assert(junctionHits.every(h=>Math.abs(h.point.y+2.73)<.002),'The nearby side-road junction has no old floating disc');
const branch=transport.roadPaths().find(r=>r.osmWayIds?.includes('1469999659'));assert(branch,'The existing side road is preserved');
for(let i=1;i<branch.points.length;i++){
 const a=branch.points[i-1],b=branch.points[i],horizontal=Math.hypot(b.x-a.x,b.z-a.z);
 if(grade.weightAt(a.x,a.z)>0&&horizontal>.001)assert(Math.abs(b.y-a.y)/horizontal<.55,'The existing branch joins with a smooth grade');
}
const tracks=transport.terrainPaths().rails.filter(r=>String(r.sourceWayId)==='37545112');assert(tracks.length);
let checkedRails=0;
for(const r of tracks)for(const p of r.points){const local=root.worldToLocal(p.clone());if(Math.abs(local.z*placement.scale)>15)continue;
 assert(local.x*placement.scale<-3.8,'The parallel track clears both the road and west guard booths');checkedRails++;
}assert(checkedRails>20);
const train=transport.trainPath().path;let trainAt=null,trainDistance=Infinity;
for(let s=0;s<train.length;s+=.2){const p=train.position(s),dz=Math.abs(root.worldToLocal(p.clone()).z);if(dz<trainDistance){trainDistance=dz;trainAt=p;}}
assert(root.worldToLocal(trainAt.clone()).x*placement.scale<-3.8,'The train uses the displayed west-side track, not the road');
console.log(JSON.stringify({passed:true,placement,triangles,meshCount:built.meshCount,pavementY:pavement.point.y,vehicleDistance:best},null,2));
