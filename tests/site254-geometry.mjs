import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildSite254} from '../src/site254.js';
import {SITE254_ACCESS as access,SITE254_RAIL,SITE254_HALL} from '../src/site254-layout.js';
import {ARCHIVE_MAP} from '../src/archive-manifest.js';
import {createMuseumGeography} from '../src/osm-geography.js';
import {buildOsmTransportNetwork} from '../src/osm-transport.js';
import {portWorld} from '../src/facility-ports.js';

const V=(...p)=>new THREE.Vector3(...p),near=(a,b,t=.001)=>assert(Math.abs(a-b)<t,`${a} differs from ${b}`);
const root=new THREE.Group(),built=buildSite254(root);root.updateMatrixWorld(true);
const down=(x,z)=>new THREE.Raycaster(V(x,100,z),V(0,-1,0)).intersectObject(root,true);
// Probe actual geometry, rather than accepting the metadata as evidence.
near(down(0,73)[0].point.y,37.555,.1);
const endwall=new THREE.Raycaster(V(20,34,250),V(0,0,-1)).intersectObject(root,true)[0];near(endwall.point.z,185.61,.15);
const sidewall=new THREE.Raycaster(V(100,34,100),V(-1,0,0)).intersectObject(root,true)[0];near(sidewall.point.x,60.61,.15);
assert(down(access.road[0]+.1,access.road[2]).some(h=>Math.abs(h.point.y-access.road[1])<.001),'The road port lands on the rendered pavement');
for(const side of [-1,1]){
 const h=down(SITE254_RAIL.end[0]-.1,SITE254_RAIL.end[2]+side*SITE254_RAIL.gauge/2);
 assert(h.some(h=>Math.abs(h.point.y-SITE254_RAIL.end[1])<.001),'Both physical rail heads meet the port at the shared gauge and height');
}
assert.equal(built.features['site254-blue-stair-core'],4);assert.equal(built.features['site254-roof-monitor'],2);
let triangles=0;root.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position;assert([...p.array].every(Number.isFinite));triangles+=(m.geometry.index?.count??p.count)/3*(m.isInstancedMesh?m.count:1);});
assert(built.meshCount<=25&&triangles<65000,'Site 254 stays within its static rendering budget');assert.doesNotThrow(()=>JSON.stringify(built));
assert.deepEqual(SITE254_HALL.size,[121,37,225]);
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const catalog=read('data/catalog.json'),matches=read('data/osm/catalog-matches.json'),source=JSON.stringify(catalog),geography=createMuseumGeography({catalog,matches});
const site=geography.sites.find(s=>s.id==='pad-254'),spec=ARCHIVE_MAP.find(s=>s.id==='pad-254');
assert.equal(spec.kind,'site254');assert.equal(spec.scale,.14);assert.equal(spec.yaw,access.yaw);
assert.deepEqual(site.geoSource.sourceLonLat,matches.matches.find(m=>m.siteId==='pad-254').representativeLonLat);
// Match the museum's existing owner relocation before constructing all approaches.
const pad1=geography.sites.find(s=>s.id==='pad-1'),pad2=geography.sites.find(s=>s.id==='pad-2');pad2.x=pad1.x-19;pad2.y=pad1.y+7;
const point=(x,y,h=0)=>V((x-650)*3.4,h,(y-522.5)*3.4),layers={roads:new THREE.Group(),rails:new THREE.Group()};
const transport=buildOsmTransportNetwork({data:{roads:read('data/osm/roads.geojson'),railways:read('data/osm/railways.geojson'),railPoints:read('data/osm/rail-points.geojson'),places:read('data/osm/places.geojson')},legacyData:read('data/transport-network.json'),geography,point,layers,siteRecords:geography.sites.filter(s=>!s.aliasOf&&s.render!==false)});
const stats=transport.stats(),road=stats.facilityPorts.find(p=>p.id==='pad-254'),rail=stats.facilityRailPorts.find(p=>p.id==='pad-254');
assert(road&&rail,'Both approaches must exist in the complete transport network');near(road.roadGap,0);near(rail.headCenterGap,0);near(rail.networkDatumGap,0);
assert.equal(rail.sourceWayId,'172571298');near(rail.portGauge,1.52*.14);near(rail.networkGauge,rail.portGauge);
assert.deepEqual(rail.headCenter,portWorld(access,SITE254_RAIL.end,site,point).toArray());
const origin=point(site.x,site.y,access.elevation);
for(const p of rail.points){const local=V(...p).sub(origin).applyAxisAngle(V(0,1,0),-access.yaw).divideScalar(access.scale);assert(local.x < -135 || local.x > 75 || local.z < -69 || local.z > 205,'The exterior rail approach must skirt the hall and annexes');}
assert.equal(JSON.stringify(catalog),source,'The catalogue and geographic anchor remain unchanged');
console.log('SITE254_GEOMETRY_PASS',JSON.stringify({drawCalls:built.meshCount,triangles,primitives:built.primitiveCount,roadGap:road.roadGap,railGap:rail.headCenterGap,railGauge:rail.physicalGaugeMetres}));
