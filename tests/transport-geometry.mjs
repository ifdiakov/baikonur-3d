import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildTransportNetwork} from '../src/transport-network.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';
import {GAGARIN_RAIL_PORT} from '../src/gagarin-metric-profile.js';
import {MUSEUM_METRE} from '../src/museum-scale.js';
import {buildMik112,MIK112} from '../src/mik112.js';
import {connectMik112Rails} from '../src/mik112-rail.js';
import {buildUkssPad} from '../src/ukss-pad.js';

const data=JSON.parse(fs.readFileSync('data/transport-network.json','utf8'));
const original=JSON.stringify(data),siteRecords=JSON.parse(fs.readFileSync('data/catalog.json','utf8')).sites;
const point=(x,y,z=0)=>new THREE.Vector3((x-650)*3.4,z,(y-522.5)*3.4);
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const network=buildTransportNetwork({data,siteRecords,point,layers});
assert.equal(JSON.stringify(data),original,'Rendering must not mutate the source plan');
const stats=network.stats(),pad=siteRecords.find(p=>p.id==='pad-1'),scale=MUSEUM_METRE;
assert.equal(stats.roadRoutes,23,'Keep the MIK-112, Site 42 and city roads after retiring the external Saturn approach');assert.equal(stats.railRoutes,14);
assert.ok(stats.kazGateGap<1e-6);assert.ok(Math.abs(RAIL_PROFILE.gauge-1.52*scale)<1e-10);
const root=new THREE.Group();root.position.copy(point(pad.x,pad.y,-2.755));root.rotation.y=-Math.PI/2;root.scale.setScalar(scale);root.updateMatrixWorld(true);
const expected=[-.76,.76].map(x=>root.localToWorld(new THREE.Vector3(x,GAGARIN_RAIL_PORT[1],GAGARIN_RAIL_PORT[2]))).sort((a,b)=>a.z-b.z);
const rails=layers.rails.children.filter(m=>m.userData.railRoute==='t-r7-feeder'&&m.material?.color?.getHex()===0x3f4242);
assert.equal(rails.length,2);
Object.values(layers).forEach(layer=>layer.updateWorldMatrix(true,true));
const actual=rails.map(mesh=>{
 const attribute=mesh.geometry.attributes.position,ps=Array.from({length:attribute.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld));
 const endX=Math.max(...ps.map(p=>p.x)),topY=Math.max(...ps.filter(p=>endX-p.x<.0002).map(p=>p.y)),end=ps.filter(p=>endX-p.x<.0002&&topY-p.y<.0002);
 return end.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(end.length);
}).sort((a,b)=>a.z-b.z);
actual.forEach((p,i)=>assert.ok(p.distanceTo(expected[i])<.0002,'Each physical rail top meets the corresponding Pad 1 rail'));
let headProbes=0;
for(const side of [-1,1])for(const along of [.03,.3,1])for(const across of [-.09,0,.09]){
 const p=root.localToWorld(new THREE.Vector3(side*.76+across,.55,85.5+along));
 const hit=new THREE.Raycaster(p.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),0,2).intersectObjects(rails,false)[0];
 assert(hit&&Math.abs(hit.point.y-p.y)<.002,'Real 20cm rail heads remain aligned and level beside the pad');headProbes++;
}
const feeder=layers.rails.children.filter(m=>m.userData.railRoute==='t-r7-feeder');
for(const mesh of feeder){const box=new THREE.Box3().setFromObject(mesh);assert.ok(box.max.x<point(pad.x,pad.y).x-84*scale,'No feeder mesh may cross the launch structure');}
const decks=[];
for(const layer of Object.values(layers))layer.traverse(o=>{if(o.name==='bridge-deck')decks.push(o);});
assert.equal(decks.length,2);
for(const deck of decks){deck.updateWorldMatrix(true,false);const box=new THREE.Box3().setFromObject(deck);assert.ok(box.min.y-.72>5,'The lower entrance road needs a clear underpass');}
const lower=network.roadPaths().find(r=>r.id==='r-nw-center');
assert.ok(lower.points.every(p=>Math.abs(p.y-.72)<1e-8),'The north-south entrance must remain beneath both bridges');
assert.equal(network.roadPaths().filter(r=>r.id.startsWith('south-interchange-')).length,4);
assert.equal(layers.roads.children.filter(m=>m.name==='road-center-dashes').length,1,'Road paint should use one draw call');
assert.ok(stats.markingSegments>100);

// The inactive/asset-loading renderers must have the same running dimensions;
// a late-loaded detailed model must not visibly replace a different rail gauge.
const fallbackParent=new THREE.Group(),mikRoot=new THREE.Group();mikRoot.scale.setScalar(MIK112.scale);mikRoot.rotation.y=MIK112.yaw;buildMik112(mikRoot);
const fallbackMik=connectMik112Rails(mikRoot,{data,point,parent:fallbackParent});fallbackParent.updateWorldMatrix(true,true);
assert.equal(fallbackMik.tracks.length,4);assert.equal(fallbackMik.railGauge,RAIL_PROFILE.gauge);
const fallbackRails=[];fallbackParent.traverse(o=>{if(o.isMesh&&o.name==='MIK112 rail')fallbackRails.push(o);});
const forward=new THREE.Vector3(0,0,-1).applyQuaternion(mikRoot.quaternion),acrossTrack=new THREE.Vector3(-forward.z,0,forward.x);let fallbackHeadProbes=0;
for(const track of fallbackMik.tracks)for(const side of [-1,1])for(const across of [-.011,0,.011]){
 const p=new THREE.Vector3(...track.start).addScaledVector(forward,.002).addScaledVector(acrossTrack,side*RAIL_PROFILE.gauge/2+across);
 const hits=new THREE.Raycaster(p.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),0,2).intersectObjects(fallbackRails,false);
 assert(hits.some(hit=>Math.abs(hit.point.y-p.y)<.0001),'Fallback MIK running heads meet the actual model tracks');fallbackHeadProbes++;
}
for(const mesh of fallbackRails){const p=mesh.geometry.attributes.position;assert(Math.abs(p.getY(0)-p.getY(2)-RAIL_PROFILE.railHeight)<1e-6,'Fallback rail walls have the shared height');}
const ukss=new THREE.Group();ukss.scale.setScalar(MUSEUM_METRE);buildUkssPad(ukss);ukss.updateWorldMatrix(true,true);
const fallbackUkss=[];ukss.traverse(o=>{if(o.isMesh&&o.material?.name==='museum / rail')fallbackUkss.push(o);});
for(const track of [-18,18])for(const side of [-1,1])for(const across of [-.09,0,.09])for(const z of [100,160,220]){
 const p=ukss.localToWorld(new THREE.Vector3(track+side*.76+across,1.73,z));
 const hits=new THREE.Raycaster(p.clone().add(new THREE.Vector3(0,.5,0)),new THREE.Vector3(0,-1,0),0,1).intersectObjects(fallbackUkss,false);
 assert(hits.some(hit=>Math.abs(hit.point.y-p.y)<1e-6),'Procedural UKSS heads retain the same physical gauge and width');fallbackHeadProbes++;
}
console.log('TRANSPORT GEOMETRY PASS',JSON.stringify({railGauge:stats.railGauge,
 railJoinError:Math.max(...actual.map((p,i)=>p.distanceTo(expected[i]))),kazGateGap:stats.kazGateGap,
 bridges:stats.interchange.bridges.length,roadPaintSegments:stats.markingSegments,headProbes,fallbackHeadProbes}));
