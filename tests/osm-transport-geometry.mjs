import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork,buildOsmGraph} from '../src/osm-transport.js';
import {buildRoadVehicleRoutes,roadVehiclePose} from '../src/road-vehicles.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json');
const geography=createMuseumGeography({catalog,matches});
const point=(x,y,h=0)=>new THREE.Vector3((x-650)*3.4,h,(y-522.5)*3.4);
const data={roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson')};
const layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data,legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const stats=transport.stats();
assert.equal(stats.source,'OpenStreetMap');assert.equal(stats.roadFeatureCount,3185);assert.equal(stats.railFeatureCount,543);assert(stats.roadRoutes>2000);assert(stats.railRoutes>400);
assert(stats.junctionCount>100);assert(stats.mergedMeshCount<=10);assert(stats.stationCount>=20);assert.equal(stats.abandonedRailWays,30);
assert(stats.markingSegments>100);assert(stats.railTies>1000);assert(stats.interchange.bridges.length>0);
let meshCount=0,vertices=0;for(const layer of Object.values(layers))layer.traverse(m=>{if(!m.isMesh)return;meshCount++;const p=m.geometry.attributes.position;if(p){vertices+=p.count;for(const v of p.array)assert(Number.isFinite(v),'non-finite mesh vertex');}});
assert(meshCount<100,`Unexpected draw-call growth: ${meshCount}`);
const plan=buildRoadVehicleRoutes(transport.roadPaths());assert.equal(plan.source,'OpenStreetMap');assert.equal(plan.routes.length,4);
for(const route of plan.routes){assert(route.length>500);assert(route.osmWayIds.length>3);assert(route.nodeIds.length>20);for(let t=0;t<1000;t+=7.3){const pose=roadVehiclePose(route,t,{phase:.2,direction:1,speed:12});assert(pose.position.toArray().every(Number.isFinite));assert(Math.abs(pose.tangent.length()-1)<1e-6);}}
const train=transport.trainPath();assert.equal(train.source,'OpenStreetMap');assert(train.path.length>500);assert(train.osmWayIds.length>5);
for(let d=0;d<train.path.length-1;d+=1){const a=train.path.position(d),b=train.path.position(d+1);assert(a.distanceTo(b)<=1.00001,'train path jump');assert(a.toArray().every(Number.isFinite));}
assert(stats.facilityPorts.length>=6);for(const p of stats.facilityPorts)assert(p.roadGap<1e-7);assert(stats.saturnAccess?.gateError<1e-7);
assert(stats.facilityRailPorts.length>=5);for(const p of stats.facilityRailPorts){assert(p.headCenterGap<1e-7);assert(p.networkDatumGap<1e-7);assert(new THREE.Vector3(...p.headCenter).distanceTo(new THREE.Vector3(...p.renderedHeadCenter))<1e-7);}
// A drawn crossing without a common source node must never form a junction.
const fixture=(id,ids,coordinates)=>({id:'way/'+id,properties:{osmId:id,sourceNodeIds:ids,tags:{highway:'secondary'}},geometry:{type:'LineString',coordinates}});
const graph=buildOsmGraph([fixture(1,[1,2],[[63.3,45.9],[63.5,45.9]]),fixture(2,[3,4],[[63.4,45.8],[63.4,46]])],{geography,point});assert.equal(graph.components.length,2);
console.log('OSM_TRANSPORT_GEOMETRY_PASS',JSON.stringify({stats,meshCount,vertices,trainLength:train.path.length,routeLengths:plan.routes.map(r=>r.length)}));
