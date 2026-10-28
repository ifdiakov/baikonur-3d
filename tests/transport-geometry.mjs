import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildTransportNetwork} from '../src/transport-network.js';
import {RAIL_PROFILE} from '../src/gagarin-rail-approach.js';

const data=JSON.parse(fs.readFileSync('data/transport-network.json','utf8'));
const original=JSON.stringify(data),siteRecords=JSON.parse(fs.readFileSync('data/catalog.json','utf8')).sites;
const point=(x,y,z=0)=>new THREE.Vector3((x-650)*3.4,z,(y-522.5)*3.4);
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const network=buildTransportNetwork({data,siteRecords,point,layers});
assert.equal(JSON.stringify(data),original,'Rendering must not mutate the source plan');
const stats=network.stats(),pad=siteRecords.find(p=>p.id==='pad-1'),scale=.43*.28/1.5;
assert.equal(stats.roadRoutes,22,'Include the existing MIK-112 access road');assert.equal(stats.railRoutes,14);
assert.ok(stats.kazGateGap<1e-6);assert.ok(Math.abs(RAIL_PROFILE.gauge-7.3*scale)<1e-10);
const root=new THREE.Group();root.position.copy(point(pad.x,pad.y));root.rotation.y=-Math.PI/2;root.scale.setScalar(scale);root.updateMatrixWorld(true);
const expected=[-3.65,3.65].map(x=>root.localToWorld(new THREE.Vector3(x,1.3,171))).sort((a,b)=>a.z-b.z);
const rails=layers.rails.children.filter(m=>m.userData.railRoute==='t-r7-feeder'&&m.geometry?.type==='TubeGeometry');
assert.equal(rails.length,2);
const actual=rails.map(m=>m.geometry.parameters.path.getPoint(1)).sort((a,b)=>a.z-b.z);
actual.forEach((p,i)=>assert.ok(p.distanceTo(expected[i])<1e-6,'Each network rail must meet the corresponding Pad 1 rail'));
for(const rail of rails)assert.ok(rail.geometry.parameters.path.getTangent(1).dot(new THREE.Vector3(1,0,0))>.999,'The final approach must be straight');
const feeder=layers.rails.children.filter(m=>m.userData.railRoute==='t-r7-feeder');
for(const mesh of feeder){const box=new THREE.Box3().setFromObject(mesh);assert.ok(box.max.x<point(pad.x,pad.y).x-168*scale,'No feeder mesh may cross the launch structure');}
const decks=[];
for(const layer of Object.values(layers))layer.traverse(o=>{if(o.name==='bridge-deck')decks.push(o);});
assert.equal(decks.length,2);
for(const deck of decks){deck.updateWorldMatrix(true,false);const box=new THREE.Box3().setFromObject(deck);assert.ok(box.min.y-.72>5,'The lower entrance road needs a clear underpass');}
const lower=network.roadPaths().find(r=>r.id==='r-nw-center');
assert.ok(lower.points.every(p=>Math.abs(p.y-.72)<1e-8),'The north-south entrance must remain beneath both bridges');
assert.equal(network.roadPaths().filter(r=>r.id.startsWith('south-interchange-ramp')).length,2);
assert.equal(layers.roads.children.filter(m=>m.name==='road-center-dashes').length,1,'Road paint should use one draw call');
assert.ok(stats.markingSegments>100);
console.log('TRANSPORT GEOMETRY PASS',JSON.stringify({railGauge:stats.railGauge,
 railJoinError:Math.max(...actual.map((p,i)=>p.distanceTo(expected[i]))),kazGateGap:stats.kazGateGap,
 bridges:stats.interchange.bridges.length,roadPaintSegments:stats.markingSegments}));
